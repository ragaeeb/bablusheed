import { invoke } from "@tauri-apps/api/core";
import type { FileTreeNode, ReachabilityResult } from "@/types";

export const AST_SUPPORTED_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "py", "rs", "go"]);

/**
 * Maximum content size (in characters) for which regex-based stripping is safe.
 * Files larger than this are returned unmodified to avoid catastrophic backtracking.
 */
const MAX_STRIP_SIZE = 200_000;

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLikelyExportedSymbol(content: string, symbol: string, ext: string): boolean {
  const escaped = escapeRegExp(symbol);

  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    const patterns = [
      new RegExp(`^\\s*export\\s+(?:default\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`, "m"),
      new RegExp(`^\\s*export\\s+(?:const|let|var)\\s+${escaped}\\b`, "m"),
      new RegExp(`^\\s*export\\s+class\\s+${escaped}\\b`, "m"),
      new RegExp(`^\\s*export\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`, "m"),
    ];
    return patterns.some((pattern) => pattern.test(content));
  }

  if (ext === "rs") {
    const patterns = [
      new RegExp(`^\\s*pub\\s+(?:async\\s+)?fn\\s+${escaped}\\b`, "m"),
      new RegExp(`^\\s*pub\\s+struct\\s+${escaped}\\b`, "m"),
      new RegExp(`^\\s*pub\\s+enum\\s+${escaped}\\b`, "m"),
      new RegExp(`^\\s*pub\\s+trait\\s+${escaped}\\b`, "m"),
      new RegExp(`^\\s*pub\\s+type\\s+${escaped}\\b`, "m"),
    ];
    return patterns.some((pattern) => pattern.test(content));
  }

  if (ext === "go") {
    const first = symbol.charAt(0);
    return first === first.toUpperCase() && first !== first.toLowerCase();
  }

  return false;
}

/**
 * Strip unreachable top-level declarations from a file's content.
 * Uses regex-based approach for TS/JS/Python/Rust/Go.
 */
export function stripUnreachableSymbols(content: string, symbols: string[], ext: string): string {
  if (symbols.length === 0) return content;

  // Skip regex stripping on large files to avoid pathological regex behavior.
  if (content.length > MAX_STRIP_SIZE) {
    console.warn(
      `stripUnreachableSymbols: skipping ${ext} file (${content.length} chars > MAX_STRIP_SIZE ${MAX_STRIP_SIZE})`
    );
    return content;
  }

  let result = content;
  for (const sym of symbols) {
    if (isLikelyExportedSymbol(result, sym, ext)) {
      continue;
    }

    const escaped = escapeRegExp(sym);

    if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
      result = result.replace(
        new RegExp(
          `(^|\\n)(?![ \\t])(?:async\\s+)?function\\s+${escaped}\\s*[(<][\\s\\S]*?(?=\\n(?![ \\t])(?:export|async\\s+function|function|const|let|var|class|interface|type|enum|//|/\\*|$)|$)`,
          "g"
        ),
        "$1"
      );
      result = result.replace(
        new RegExp(
          `(^|\\n)(?![ \\t])(?:const|let|var)\\s+${escaped}\\s*=[\\s\\S]*?(?=\\n(?![ \\t])(?:export|async\\s+function|function|const|let|var|class|interface|type|enum|//|/\\*|$)|$)`,
          "g"
        ),
        "$1"
      );
      result = result.replace(
        new RegExp(
          `(^|\\n)(?![ \\t])class\\s+${escaped}[\\s\\S]*?(?=\\n(?![ \\t])(?:export|async\\s+function|function|const|let|var|class|interface|type|enum|//|/\\*|$)|$)`,
          "g"
        ),
        "$1"
      );
    } else if (ext === "py") {
      result = result.replace(
        new RegExp(
          `(^|\\n)(?![ \\t])def\\s+${escaped}\\s*\\([\\s\\S]*?(?=\\n(?![ \\t])(?:def\\s|class\\s)|$)`,
          "g"
        ),
        "$1"
      );
      result = result.replace(
        new RegExp(
          `(^|\\n)(?![ \\t])class\\s+${escaped}[\\s\\S]*?(?=\\n(?![ \\t])(?:def\\s|class\\s)|$)`,
          "g"
        ),
        "$1"
      );
    } else if (ext === "rs") {
      result = result.replace(
        new RegExp(
          `(^|\\n)(?![ \\t])(?:async\\s+)?fn\\s+${escaped}[\\s\\S]*?(?=\\n(?![ \\t])(?:pub|fn|struct|impl|enum|trait|use|mod|//|/\\*|$)|$)`,
          "g"
        ),
        "$1"
      );
    } else if (ext === "go") {
      result = result.replace(
        new RegExp(
          `(^|\\n)(?![ \\t])func\\s+(?:\\([^)]+\\)\\s+)?${escaped}\\s*\\([^)]*\\)[\\s\\S]*?(?=\\n(?![ \\t])(?:func\\s|type\\s|var\\s|const\\s|import\\s|package\\s)|$)`,
          "g"
        ),
        "$1"
      );
    }
  }

  return result;
}

export async function applyAstDeadCode(
  selectedFiles: FileTreeNode[],
  contentMap: Map<string, string>,
  entryPoint: string | null
): Promise<Map<string, string>> {
  if (!entryPoint) return contentMap;

  const astFiles = selectedFiles
    .filter((f) => !f.isDir && AST_SUPPORTED_EXTENSIONS.has(f.extension.toLowerCase()))
    .map((f) => ({
      path: f.path,
      content: contentMap.get(f.path) ?? "",
    }));

  if (astFiles.length === 0) return contentMap;

  try {
    const reachability = await invoke<ReachabilityResult>("analyze_reachability", {
      entryPoint,
      files: astFiles,
    });

    const next = new Map(contentMap);
    for (const file of selectedFiles) {
      if (file.isDir) continue;
      const unreachable = reachability.unreachable_symbols[file.path];
      if (!unreachable || unreachable.length === 0) continue;

      const current = next.get(file.path) ?? "";
      next.set(
        file.path,
        stripUnreachableSymbols(current, unreachable, file.extension.toLowerCase())
      );
    }

    return next;
  } catch (err) {
    console.warn("AST reachability analysis failed:", err);
    return contentMap;
  }
}
