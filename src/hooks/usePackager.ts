import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import { minifyMarkdown, reduceWhitespace, stripComments } from "@/lib/utils";
import type { FileTreeNode, PackOptions, PackResponse } from "@/types";

export function usePackager(
  selectedFiles: FileTreeNode[],
  fileContents: Map<string, string>,
  llmProfileId: string
) {
  const [packResult, setPackResult] = useState<PackResponse | null>(null);
  const [isPacking, setIsPacking] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);

  const pack = useCallback(
    async (options: PackOptions) => {
      if (selectedFiles.length === 0) return;

      setIsPacking(true);
      setPackError(null);

      try {
        const files = selectedFiles
          .filter((f) => !f.isDir)
          .map((file) => {
            const rawContent = fileContents.get(file.path) ?? "";
            let content = rawContent;

            if (options.stripComments) {
              content = stripComments(content, file.extension);
            }
            if (options.reduceWhitespace) {
              content = reduceWhitespace(content);
            }
            if (options.minifyMarkdown && file.extension === "md") {
              content = minifyMarkdown(
                content,
                options.stripMarkdownHeadings,
                options.stripMarkdownBlockquotes
              );
            }

            return { path: file.relativePath, content };
          });

        const result = await invoke<PackResponse>("pack_files", {
          request: {
            files,
            numPacks: options.numPacks,
            outputFormat: options.outputFormat,
            llmProfileId,
          },
        });

        setPackResult(result);
      } catch (err) {
        setPackError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsPacking(false);
      }
    },
    [selectedFiles, fileContents, llmProfileId]
  );

  const clearResult = useCallback(() => {
    setPackResult(null);
    setPackError(null);
  }, []);

  return { packResult, isPacking, packError, pack, clearResult };
}
