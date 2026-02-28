import { useEffect, useRef, useState } from "react";
import { applyAstDeadCode } from "@/lib/ast-reachability";
import type { LLMProfile } from "@/lib/llm-profiles";
import { getTokenizerEncoding } from "@/lib/llm-profiles";
import { minifyMarkdown, reduceWhitespace, stripComments } from "@/lib/utils";
import type { FileTreeNode, WorkerMessage, WorkerResult } from "@/types";

interface PackOptions {
  stripComments: boolean;
  reduceWhitespace: boolean;
  minifyMarkdown: boolean;
  stripMarkdownHeadings: boolean;
  stripMarkdownBlockquotes: boolean;
  astDeadCode: boolean;
  entryPoint: string | null;
}

interface RequestMeta {
  sentAtMs: number;
  fileCount: number;
  rawChars: number;
  optimizedChars: number;
  prevTokens: Map<string, number>;
}

interface AstCache {
  entryPoint: string;
  selectedIdentityKey: string;
  rawContents: Map<string, string>;
  result: Map<string, string>;
}

function areStringMapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

export function useTokenCount(
  selectedFiles: FileTreeNode[],
  fileContents: Map<string, string>,
  llmProfile: LLMProfile,
  packOptions: PackOptions,
  debugEnabled = false,
  onDebugLog?: (line: string) => void,
  onDebugMetric?: (name: "astRecompute" | "astCacheHit" | "workerQueued" | "workerResult") => void
) {
  const [tokenMap, setTokenMap] = useState<Map<string, number>>(new Map());
  const [isCalculating, setIsCalculating] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentHashMapRef = useRef<Map<string, string>>(new Map());
  const lastTokenizerRef = useRef<string>(llmProfile.tokenizer);
  const lastOptimizationKeyRef = useRef<string>("");

  const requestCounterRef = useRef(0);
  const latestRequestIdRef = useRef(0);
  const requestMetaRef = useRef<Map<number, RequestMeta>>(new Map());
  const tokenMapRef = useRef<Map<string, number>>(new Map());
  const astCacheRef = useRef<AstCache | null>(null);

  const debugEnabledRef = useRef(debugEnabled);
  const debugLogRef = useRef<((line: string) => void) | null>(onDebugLog ?? null);

  useEffect(() => {
    tokenMapRef.current = tokenMap;
  }, [tokenMap]);

  useEffect(() => {
    debugEnabledRef.current = debugEnabled;
  }, [debugEnabled]);

  useEffect(() => {
    debugLogRef.current = onDebugLog ?? null;
  }, [onDebugLog]);

  const logDebug = (message: string) => {
    if (!debugEnabledRef.current) return;
    debugLogRef.current?.(`[${new Date().toISOString()}] ${message}`);
  };

  const selectedIdentityKey = selectedFiles
    .map((file) => `${file.path}\u0000${file.extension}`)
    .join("\u0001");

  useEffect(() => {
    workerRef.current = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url), {
      type: "module",
    });

    workerRef.current.onmessage = (event: MessageEvent<WorkerResult>) => {
      if (event.data.type !== "result") return;

      const { requestId, results } = event.data;
      const latestRequestId = latestRequestIdRef.current;
      const meta = requestMetaRef.current.get(requestId);
      requestMetaRef.current.delete(requestId);

      if (requestId < latestRequestId) {
        logDebug(`token-count stale result ignored request=${requestId} latest=${latestRequestId}`);
        return;
      }

      const prevTokens = meta?.prevTokens ?? tokenMapRef.current;
      let increased = 0;
      let decreased = 0;
      let unchanged = 0;
      let deltaTotal = 0;

      for (const { path, tokens } of results) {
        const before = prevTokens.get(path) ?? 0;
        const delta = tokens - before;
        deltaTotal += delta;
        if (delta > 0) increased += 1;
        else if (delta < 0) decreased += 1;
        else unchanged += 1;
      }

      setTokenMap((prev) => {
        const next = new Map(prev);
        for (const { path, tokens } of results) {
          next.set(path, tokens);
        }
        tokenMapRef.current = next;
        return next;
      });
      setIsCalculating(false);

      const elapsedMs = meta ? Date.now() - meta.sentAtMs : 0;
      const charDelta = meta ? meta.optimizedChars - meta.rawChars : 0;
      logDebug(
        `token-count result request=${requestId} files=${results.length} ` +
          `deltaTokens=${deltaTotal} increased=${increased} decreased=${decreased} unchanged=${unchanged} ` +
          `charDelta=${charDelta} elapsedMs=${elapsedMs}`
      );
      onDebugMetric?.("workerResult");
    };

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const runCount = async () => {
      logDebug(
        `token-count run start selected=${selectedFiles.length} tokenizer=${llmProfile.tokenizer} ast=${packOptions.astDeadCode && !!packOptions.entryPoint}`
      );

      const rawContents = new Map<string, string>();
      for (const file of selectedFiles) {
        const rawContent = fileContents.get(file.path);
        if (rawContent === undefined || rawContent === null) continue;
        rawContents.set(file.path, rawContent);
      }

      let astProcessedContents = rawContents;
      if (packOptions.astDeadCode && packOptions.entryPoint) {
        const cached = astCacheRef.current;
        if (
          cached &&
          cached.entryPoint === packOptions.entryPoint &&
          cached.selectedIdentityKey === selectedIdentityKey &&
          areStringMapsEqual(cached.rawContents, rawContents)
        ) {
          astProcessedContents = cached.result;
          logDebug(`token-count ast cache hit files=${rawContents.size}`);
          onDebugMetric?.("astCacheHit");
        } else {
          astProcessedContents = await applyAstDeadCode(
            selectedFiles,
            rawContents,
            packOptions.entryPoint
          );
          if (cancelled) return;
          astCacheRef.current = {
            entryPoint: packOptions.entryPoint,
            selectedIdentityKey,
            rawContents: new Map(rawContents),
            result: new Map(astProcessedContents),
          };
          logDebug(`token-count ast recompute files=${rawContents.size}`);
          onDebugMetric?.("astRecompute");
        }
      } else if (astCacheRef.current) {
        astCacheRef.current = null;
      }

      if (cancelled) return;

      const countedContents = new Map<string, string>();
      for (const file of selectedFiles) {
        const baseContent = astProcessedContents.get(file.path);
        if (baseContent === undefined || baseContent === null) continue;

        let content = baseContent;
        if (packOptions.stripComments) {
          content = stripComments(content, file.extension);
        }
        if (packOptions.reduceWhitespace) {
          content = reduceWhitespace(content, file.extension);
        }
        if (packOptions.minifyMarkdown && file.extension === "md") {
          content = minifyMarkdown(
            content,
            packOptions.stripMarkdownHeadings,
            packOptions.stripMarkdownBlockquotes
          );
        }
        countedContents.set(file.path, content);
      }

      const tokenizerChanged = lastTokenizerRef.current !== llmProfile.tokenizer;
      const optimizationKey = [
        packOptions.stripComments,
        packOptions.reduceWhitespace,
        packOptions.minifyMarkdown,
        packOptions.stripMarkdownHeadings,
        packOptions.stripMarkdownBlockquotes,
        packOptions.astDeadCode,
        packOptions.entryPoint ?? "",
      ].join("|");
      const optimizationChanged = lastOptimizationKeyRef.current !== optimizationKey;

      if (tokenizerChanged || optimizationChanged) {
        contentHashMapRef.current.clear();
        lastTokenizerRef.current = llmProfile.tokenizer;
        lastOptimizationKeyRef.current = optimizationKey;
      }

      const newPending = new Map<string, string>();
      for (const [path, content] of countedContents) {
        const lastContent = contentHashMapRef.current.get(path);
        if (lastContent !== content) {
          newPending.set(path, content);
          contentHashMapRef.current.set(path, content);
        }
      }

      for (const key of contentHashMapRef.current.keys()) {
        if (!countedContents.has(key)) {
          contentHashMapRef.current.delete(key);
        }
      }

      if (newPending.size === 0) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (cancelled) return;
        const files = Array.from(newPending.entries()).map(([path, content]) => ({
          path,
          content,
        }));
        if (files.length === 0) return;

        const requestId = ++requestCounterRef.current;
        latestRequestIdRef.current = requestId;

        let rawChars = 0;
        let optimizedChars = 0;
        const prevTokens = new Map<string, number>();

        for (const [path, content] of newPending) {
          const raw = fileContents.get(path) ?? "";
          rawChars += raw.length;
          optimizedChars += content.length;
          prevTokens.set(path, tokenMapRef.current.get(path) ?? 0);
        }

        requestMetaRef.current.set(requestId, {
          sentAtMs: Date.now(),
          fileCount: files.length,
          rawChars,
          optimizedChars,
          prevTokens,
        });

        // Keep request metadata map bounded.
        const pruneBefore = requestId - 20;
        for (const key of requestMetaRef.current.keys()) {
          if (key < pruneBefore) {
            requestMetaRef.current.delete(key);
          }
        }

        setIsCalculating(true);
        const strategy = getTokenizerEncoding(llmProfile.tokenizer);
        const message: WorkerMessage = { type: "count", requestId, files, strategy };
        workerRef.current?.postMessage(message);
        onDebugMetric?.("workerQueued");

        logDebug(
          `token-count queued request=${requestId} files=${files.length} ` +
            `rawChars=${rawChars} optimizedChars=${optimizedChars} charDelta=${optimizedChars - rawChars} ` +
            `tokenizer=${llmProfile.tokenizer}`
        );
      }, 150);
    };

    void runCount();

    return () => {
      cancelled = true;
    };
  }, [
    selectedIdentityKey,
    fileContents,
    llmProfile.tokenizer,
    packOptions.stripComments,
    packOptions.reduceWhitespace,
    packOptions.minifyMarkdown,
    packOptions.stripMarkdownHeadings,
    packOptions.stripMarkdownBlockquotes,
    packOptions.astDeadCode,
    packOptions.entryPoint,
  ]);

  const selectedTokens = selectedFiles.reduce((sum, f) => sum + (tokenMap.get(f.path) ?? 0), 0);

  return { tokenMap, totalTokens: selectedTokens, isCalculating };
}
