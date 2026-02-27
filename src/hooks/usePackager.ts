import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import { minifyMarkdown, reduceWhitespace, stripComments } from "@/lib/utils";
import type { FileTreeNode, PackOptions, PackResponse, ReachabilityResult } from "@/types";

const AST_SUPPORTED_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "py", "rs", "go"]);

/**
 * Maximum content size (in characters) for which regex-based stripping is safe.
 * Files larger than this are returned unmodified to avoid catastrophic backtracking.
 * TODO: Replace regex-based stripping in stripUnreachableSymbols with AST-based stripping
 *       via the analyze_reachability entry point once Tree-sitter integration is complete.
 */
const MAX_STRIP_SIZE = 200_000;

/**
 * Strip unreachable top-level declarations from a file's content.
 * Uses regex-based approach for TS/JS/Python/Rust/Go.
 */
function stripUnreachableSymbols(content: string, symbols: string[], ext: string): string {
  if (symbols.length === 0) return content;

  // Safety guard: skip regex stripping on large files to prevent catastrophic backtracking.
  if (content.length > MAX_STRIP_SIZE) {
    console.warn(
      `stripUnreachableSymbols: skipping ${ext} file (${content.length} chars > MAX_STRIP_SIZE ${MAX_STRIP_SIZE})`
    );
    return content;
  }

  let result = content;
  for (const sym of symbols) {
    // Escape special regex chars in symbol name
    const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
      // Match: export function foo(...), function foo(...), export const foo =, const foo =, export class Foo, class Foo
      result = result.replace(
        new RegExp(
          `(export\\s+)?(async\\s+)?function\\s+${escaped}\\s*[(<][\\s\\S]*?(?=\\n(?:export|function|const|let|var|class|interface|type|enum|//|/\\*|$))`,
          "g"
        ),
        ""
      );
      result = result.replace(
        new RegExp(
          `(export\\s+)?const\\s+${escaped}\\s*=[\\s\\S]*?(?=\\n(?:export|function|const|let|var|class|interface|type|enum|//|/\\*|$))`,
          "g"
        ),
        ""
      );
      result = result.replace(
        new RegExp(
          `(export\\s+)?class\\s+${escaped}[\\s\\S]*?(?=\\n(?:export|function|const|let|var|class|interface|type|enum|//|/\\*|$))`,
          "g"
        ),
        ""
      );
    } else if (ext === "py") {
      // Match: def foo(, class Foo:
      result = result.replace(
        new RegExp(`def\\s+${escaped}\\s*\\([\\s\\S]*?(?=\\ndef\\s|\\nclass\\s|$)`, "g"),
        ""
      );
      result = result.replace(
        new RegExp(`class\\s+${escaped}[\\s\\S]*?(?=\\ndef\\s|\\nclass\\s|$)`, "g"),
        ""
      );
    } else if (ext === "rs") {
      // Match: fn foo(, pub fn foo(, struct Foo, pub struct Foo, impl Foo
      result = result.replace(
        new RegExp(
          `(pub\\s+)?(async\\s+)?fn\\s+${escaped}[\\s\\S]*?(?=\\n(?:pub|fn|struct|impl|enum|trait|use|mod|//|/\\*|$))`,
          "g"
        ),
        ""
      );
    } else if (ext === "go") {
      // Match: func Foo(, func (r *Receiver) Foo(
      result = result.replace(
        new RegExp(`func\\s+(?:\\([^)]+\\)\\s+)?${escaped}\\s*\\([\\s\\S]*?^}`, "gm"),
        ""
      );
    }
  }

  return result;
}

export function usePackager(
  selectedFiles: FileTreeNode[],
  fileContents: Map<string, string>,
  llmProfileId: string,
  tokenMap?: Map<string, number>
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
        // Build initial content map with optimizations applied
        const contentMap = new Map<string, string>();
        for (const file of selectedFiles) {
          if (file.isDir) continue;
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
          contentMap.set(file.path, content);
        }

        // 3b: Wire up AST reachability when enabled and entry point is set
        if (options.astDeadCode && options.entryPoint) {
          try {
            const astFiles = selectedFiles
              .filter((f) => !f.isDir && AST_SUPPORTED_EXTENSIONS.has(f.extension.toLowerCase()))
              .map((f) => ({
                path: f.path,
                content: contentMap.get(f.path) ?? "",
              }));

            const reachability = await invoke<ReachabilityResult>("analyze_reachability", {
              entryPoint: options.entryPoint,
              files: astFiles,
            });

            // Strip unreachable symbols from each file
            for (const file of selectedFiles) {
              if (file.isDir) continue;
              const unreachable = reachability.unreachable_symbols[file.path];
              if (unreachable && unreachable.length > 0) {
                const current = contentMap.get(file.path) ?? "";
                contentMap.set(
                  file.path,
                  stripUnreachableSymbols(current, unreachable, file.extension.toLowerCase())
                );
              }
            }
          } catch (astErr) {
            console.warn("AST reachability analysis failed:", astErr);
            // Continue without AST stripping
          }
        }

        const files = selectedFiles
          .filter((f) => !f.isDir)
          .map((file) => ({
            path: file.relativePath,
            content: contentMap.get(file.path) ?? "",
            tokenCount: tokenMap?.get(file.path),
          }));

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
    [selectedFiles, fileContents, llmProfileId, tokenMap]
  );

  const clearResult = useCallback(() => {
    setPackResult(null);
    setPackError(null);
  }, []);

  return { packResult, isPacking, packError, pack, clearResult };
}
