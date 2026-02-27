import { useCallback, useEffect, useRef, useState } from "react";
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
    }, 150);
  }, [llmProfile.tokenizer]);

  useEffect(() => {
    const filesToCount: Array<{ path: string; content: string }> = [];

    for (const file of selectedFiles) {
      const rawContent = fileContents.get(file.path);
      if (!rawContent) continue;

      let content = rawContent;

      // Apply optimizations
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

      filesToCount.push({ path: file.path, content });
    }

    pendingRef.current = new Map(filesToCount.map((f) => [f.path, f.content]));
    scheduleCount();
  }, [selectedFiles, fileContents, packOptions, scheduleCount]);

  // Only sum tokens for currently selected files
  const selectedTokens = selectedFiles.reduce((sum, f) => sum + (tokenMap.get(f.path) ?? 0), 0);

  return { tokenMap, totalTokens: selectedTokens, isCalculating };
}
