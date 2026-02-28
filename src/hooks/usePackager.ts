import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { applyAstDeadCode } from "@/lib/ast-reachability";
import {
  resolveAdvisoryMaxTokensPerFile,
  splitOversizedFilesForPacking,
} from "@/lib/pack-strategy";
import { minifyMarkdown, reduceWhitespace, stripComments } from "@/lib/utils";
import type { FileTreeNode, PackOptions, PackResponse } from "@/types";

export function usePackager(
  selectedFiles: FileTreeNode[],
  fileContents: Map<string, string>,
  llmProfileId: string,
  contextWindowTokens: number,
  tokenMap?: Map<string, number>
) {
  const [packResult, setPackResult] = useState<PackResponse | null>(null);
  const [isPacking, setIsPacking] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [packWarnings, setPackWarnings] = useState<string[]>([]);

  const pack = async (options: PackOptions) => {
    if (selectedFiles.length === 0) return;

    setIsPacking(true);
    setPackError(null);
    setPackWarnings([]);

    try {
      const rawContentMap = new Map<string, string>();
      for (const file of selectedFiles) {
        if (file.isDir) continue;
        const rawContent = fileContents.get(file.path) ?? "";
        rawContentMap.set(file.path, rawContent);
      }

      const astProcessedContentMap =
        options.astDeadCode && options.entryPoint
          ? await applyAstDeadCode(selectedFiles, rawContentMap, options.entryPoint)
          : rawContentMap;

      const contentMap = new Map<string, string>();
      for (const file of selectedFiles) {
        if (file.isDir) continue;
        const baseContent = astProcessedContentMap.get(file.path) ?? "";
        let content = baseContent;

        if (options.stripComments) {
          content = stripComments(content, file.extension);
        }
        if (options.reduceWhitespace) {
          content = reduceWhitespace(content, file.extension);
        }
        if (options.minifyMarkdown && file.extension === "md") {
          content = minifyMarkdown(
            content,
            options.stripMarkdownHeadings,
            options.stripMarkdownBlockquotes
          );
        }
        contentMap.set(file.path, content);
      }

      const files = selectedFiles
        .filter((f) => !f.isDir)
        .map((file) => ({
          path: file.relativePath,
          content: contentMap.get(file.path) ?? "",
          tokenCount: tokenMap?.get(file.path),
        }));

      const advisoryMaxTokensPerFile = resolveAdvisoryMaxTokensPerFile(
        options.maxTokensPerPackFile,
        contextWindowTokens
      );
      const balanced = splitOversizedFilesForPacking(files, advisoryMaxTokensPerFile);
      setPackWarnings(balanced.warnings);

      const result = await invoke<PackResponse>("pack_files", {
        request: {
          files: balanced.files,
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
  };

  const clearResult = () => {
    setPackResult(null);
    setPackError(null);
    setPackWarnings([]);
  };

  return { packResult, isPacking, packError, packWarnings, pack, clearResult };
}
