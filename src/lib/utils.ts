import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toString();
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function getFileIcon(extension: string): string {
  const iconMap: Record<string, string> = {
    ts: "typescript",
    tsx: "react",
    js: "javascript",
    jsx: "react",
    rs: "rust",
    py: "python",
    go: "go",
    md: "markdown",
    json: "json",
    css: "css",
    html: "html",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    bash: "shell",
    txt: "text",
  };
  return iconMap[extension.toLowerCase()] ?? "file";
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Find the index of a # comment start in a line, ignoring # inside string literals.
 * Returns -1 if no comment found.
 */
function findCommentStart(line: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) return i;
  }
  return -1;
}

export function stripComments(content: string, extension: string): string {
  const ext = extension.toLowerCase();

  // Languages with // single-line and /* */ multi-line comments
  const cStyleLanguages = ["ts", "tsx", "js", "jsx", "rs", "go", "c", "cpp", "h", "cs", "java"];
  // Languages with # single-line comments
  const hashCommentLanguages = ["py", "rb", "sh", "bash", "yaml", "yml", "toml", "r"];
  // Languages with -- single-line comments
  const dashCommentLanguages = ["sql", "lua"];

  if (cStyleLanguages.includes(ext)) {
    // Remove multi-line comments /* ... */
    let result = content.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove single-line comments // ...
    result = result.replace(/\/\/[^\n]*/g, "");
    return result;
  }

  if (hashCommentLanguages.includes(ext)) {
    // Line-by-line approach with string literal detection
    let result = content
      .split("\n")
      .map((line, index) => {
        // Preserve shebang on first line
        if (index === 0 && line.startsWith("#!")) return line;
        const commentStart = findCommentStart(line);
        return commentStart === -1 ? line : line.slice(0, commentStart).trimEnd();
      })
      .join("\n");

    // Also strip Python docstrings if ext === "py"
    if (ext === "py") {
      result = result.replace(/"""[\s\S]*?"""/g, "").replace(/'''[\s\S]*?'''/g, "");
    }

    return result;
  }

  if (dashCommentLanguages.includes(ext)) {
    return content.replace(/--[^\n]*/g, "");
  }

  return content;
}

export function reduceWhitespace(content: string): string {
  // Collapse multiple blank lines into one
  let result = content.replace(/\n{3,}/g, "\n\n");
  // Trim trailing whitespace from each line
  result = result
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  // Trim leading/trailing whitespace from the whole content
  return result.trim();
}

export function minifyMarkdown(
  content: string,
  stripHeadings: boolean,
  stripBlockquotes: boolean
): string {
  let result = content;

  // Strip badge image links: [![...](...)](...)
  result = result.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, "");

  // Strip HTML comment blocks <!-- ... -->
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // Strip block HTML tags and their content (handles nested tags better than balanced matching)
  result = result.replace(
    /<(div|details|summary|table|thead|tbody|tr|td|th)[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  // Strip void/self-closing tags
  result = result.replace(/<(img|br|hr)[^>]*\/?>/gi, "");
  // Strip any remaining HTML tags (opening or closing, no content matching)
  result = result.replace(/<[^>]+>/g, "");

  // Collapse multiple blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  if (stripHeadings) {
    result = result.replace(/^#{1,6}\s+.*$/gm, "");
  }

  if (stripBlockquotes) {
    result = result.replace(/^>\s?.*$/gm, "");
  }

  return result.trim();
}
