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
  tokenMap?: Map<string, number>,
  onLog?: (level: "error" | "info" | "debug", message: string) => void,
) {
  const [packResult, setPackResult] = useState<PackResponse | null>(null);
  const [isPacking, setIsPacking] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [packWarnings, setPackWarnings] = useState<string[]>([]);

  const pack = async (options: PackOptions) => {
    if (selectedFiles.length === 0) {
      return;
    }

    setIsPacking(true);
    setPackError(null);
    setPackWarnings([]);
    onLog?.(
      "info",
      `pack start selected=${selectedFiles.filter((f) => !f.isDir).length} llm=${llmProfileId} numPacks=${options.numPacks} format=${options.outputFormat} ast=${options.astDeadCode && !!options.entryPoint}`,
    );

    try {
      const rawContentMap = new Map<string, string>();
      for (const file of selectedFiles) {
        if (file.isDir) {
          continue;
        }
        const rawContent = fileContents.get(file.path) ?? "";
        rawContentMap.set(file.path, rawContent);
      }

      const astProcessedContentMap =
        options.astDeadCode && options.entryPoint
          ? await applyAstDeadCode(selectedFiles, rawContentMap, options.entryPoint)
          : rawContentMap;
      if (options.astDeadCode && options.entryPoint) {
        let changedFiles = 0;
        let charDelta = 0;
        for (const [path, raw] of rawContentMap) {
          const processed = astProcessedContentMap.get(path) ?? "";
          if (processed !== raw) {
            changedFiles += 1;
            charDelta += processed.length - raw.length;
          }
        }
        onLog?.(
          "info",
          `pack ast processed files=${rawContentMap.size} changed=${changedFiles} charDelta=${charDelta}`,
        );
      }

      const contentMap = new Map<string, string>();
      for (const file of selectedFiles) {
        if (file.isDir) {
          continue;
        }
        const baseContent = astProcessedContentMap.get(file.path) ?? "";
        let content = baseContent;
        const ext = file.extension.toLowerCase();

        if (options.stripComments) {
          content = stripComments(content, ext);
        }
        if (options.reduceWhitespace) {
          content = reduceWhitespace(content, ext, file.relativePath);
        }
        if (options.minifyMarkdown && (ext === "md" || ext === "mdx")) {
          content = minifyMarkdown(
            content,
            options.stripMarkdownHeadings,
            options.stripMarkdownBlockquotes,
          );
        }
        contentMap.set(file.path, content);
      }

      const files = selectedFiles
        .filter((f) => !f.isDir)
        .map((file) => ({
          content: contentMap.get(file.path) ?? "",
          path: file.relativePath,
          tokenCount: tokenMap?.get(file.path),
        }));

      const advisoryMaxTokensPerFile = resolveAdvisoryMaxTokensPerFile(
        options.maxTokensPerPackFile,
        contextWindowTokens,
      );
      const balanced = splitOversizedFilesForPacking(files, advisoryMaxTokensPerFile);
      setPackWarnings(balanced.warnings);
      if (balanced.warnings.length > 0) {
        onLog?.("info", `pack warnings count=${balanced.warnings.length}`);
      }
      onLog?.(
        "debug",
        `pack balancing filesIn=${files.length} filesOut=${balanced.files.length} splitFiles=${balanced.splitFileCount} generatedParts=${balanced.generatedPartCount}`,
      );

      const result = await invoke<PackResponse>("pack_files", {
        request: {
          files: balanced.files,
          llmProfileId,
          numPacks: options.numPacks,
          outputFormat: options.outputFormat,
        },
      });

      setPackResult(result);
      onLog?.(
        "info",
        `pack success packs=${result.packs.length} totalTokens=${result.totalTokens}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPackError(message);
      onLog?.("error", `pack failed err=${message}`);
    } finally {
      setIsPacking(false);
    }
  };

  const clearResult = () => {
    setPackResult(null);
    setPackError(null);
    setPackWarnings([]);
  };

  return { clearResult, isPacking, pack, packError, packResult, packWarnings };
}
