import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
}

export function useTokenCount(
  selectedFiles: FileTreeNode[],
  fileContents: Map<string, string>,
  llmProfile: LLMProfile,
  packOptions: PackOptions
) {
  const [tokenMap, setTokenMap] = useState<Map<string, number>>(new Map());
  const [isCalculating, setIsCalculating] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, string>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last-counted optimized content per file to avoid recounting unchanged files
  const contentHashMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    workerRef.current = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url), {
      type: "module",
    });

    workerRef.current.onmessage = (event: MessageEvent<WorkerResult>) => {
      if (event.data.type === "result") {
        setTokenMap((prev) => {
          const next = new Map(prev);
          for (const { path, tokens } of event.data.results) {
            next.set(path, tokens);
          }
          return next;
        });
        setIsCalculating(false);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const scheduleCount = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const files = Array.from(pendingRef.current.entries()).map(([path, content]) => ({
        path,
        content,
      }));

      if (files.length === 0) return;

      setIsCalculating(true);
      const encoding = getTokenizerEncoding(llmProfile.tokenizer);
      const message: WorkerMessage = { type: "count", files, encoding };
      workerRef.current?.postMessage(message);
      pendingRef.current = new Map();
    }, 150);
  }, [llmProfile.tokenizer]);

  // Pre-compute optimized content strings with useMemo so React can skip re-running
  // expensive optimizations when only unrelated state changes
  const optimizedContents = useMemo(() => {
    const result = new Map<string, string>();
    for (const file of selectedFiles) {
      const rawContent = fileContents.get(file.path);
      if (!rawContent) continue;

      let content = rawContent;
      if (packOptions.stripComments) {
        content = stripComments(content, file.extension);
      }
      if (packOptions.reduceWhitespace) {
        content = reduceWhitespace(content);
      }
      if (packOptions.minifyMarkdown && file.extension === "md") {
        content = minifyMarkdown(
          content,
          packOptions.stripMarkdownHeadings,
          packOptions.stripMarkdownBlockquotes
        );
      }
      result.set(file.path, content);
    }
    return result;
  }, [selectedFiles, fileContents, packOptions]);

  useEffect(() => {
    const newPending = new Map<string, string>();

    for (const [path, content] of optimizedContents) {
      const lastContent = contentHashMapRef.current.get(path);
      // Only recount if content has changed since last count
      if (lastContent !== content) {
        newPending.set(path, content);
        contentHashMapRef.current.set(path, content);
      }
    }

    // Remove entries for files that are no longer selected
    for (const key of contentHashMapRef.current.keys()) {
      if (!optimizedContents.has(key)) {
        contentHashMapRef.current.delete(key);
      }
    }

    if (newPending.size > 0) {
      pendingRef.current = newPending;
      scheduleCount();
    }
  }, [optimizedContents, scheduleCount]);

  // Only sum tokens for currently selected files
  const selectedTokens = selectedFiles.reduce((sum, f) => sum + (tokenMap.get(f.path) ?? 0), 0);

  return { tokenMap, totalTokens: selectedTokens, isCalculating };
}
