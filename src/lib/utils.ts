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
 * Count the number of consecutive backslashes immediately before position `pos` in `line`.
 */
function countPrecedingBackslashes(line: string, pos: number): number {
  let count = 0;
  let i = pos - 1;
  while (i >= 0 && line[i] === "\\") {
    count++;
    i--;
  }
  return count;
}

/**
 * Find the index of a # comment start in a line, ignoring # inside string literals.
 * Correctly handles escaped quotes (e.g. \") by checking the number of preceding backslashes.
 * Returns -1 if no comment found.
 */
function findCommentStart(line: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    // A quote is escaped when preceded by an odd number of backslashes
    const isEscaped = countPrecedingBackslashes(line, i) % 2 === 1;
    if (c === "'" && !inDouble && !isEscaped) inSingle = !inSingle;
    else if (c === '"' && !inSingle && !isEscaped) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) return i;
  }
  return -1;
}

function findDashCommentStart(line: string): number {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    const next = line[i + 1];
    const isEscaped = countPrecedingBackslashes(line, i) % 2 === 1;

    if (c === "'" && !inDouble && !isEscaped) {
      // SQL-style escaped single quote: '' inside string
      if (inSingle && next === "'") {
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      continue;
    }

    if (c === '"' && !inSingle && !isEscaped) {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && c === "-" && next === "-") {
      return i;
    }
  }

  return -1;
}

function stripCStyleComments(content: string): string {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inBlockComment = false;
  let i = 0;

  while (i < content.length) {
    const c = content[i];
    const next = i + 1 < content.length ? content[i + 1] : "";
    const isEscaped = countPrecedingBackslashes(content, i) % 2 === 1;

    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      if (c === "\n") {
        out += "\n";
      }
      i += 1;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate && c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate && c === "/" && next === "/") {
      i += 2;
      while (i < content.length && content[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    out += c;

    if (c === "'" && !inDouble && !inTemplate && !isEscaped) {
      inSingle = !inSingle;
    } else if (c === '"' && !inSingle && !inTemplate && !isEscaped) {
      inDouble = !inDouble;
    } else if (c === "`" && !inSingle && !inDouble && !isEscaped) {
      inTemplate = !inTemplate;
    }

    i += 1;
  }

  return out;
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
    return stripCStyleComments(content);
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

    // Also strip Python docstrings if ext === "py".
    // Only remove triple-quoted strings that appear at module level (start of file, possibly
    // after leading whitespace/comments) or immediately after a def/class header line
    // (the line ending with `:` optionally followed by whitespace).
    // This preserves legitimate multiline string assignments like `SQL = """..."""`.
    if (ext === "py") {
      // Module-level docstring: triple-quoted string at the very start of the file
      result = result.replace(/^(\s*)("""[\s\S]*?"""|'''[\s\S]*?''')/, "$1");
      // def/class docstrings: triple-quoted string on the line(s) after a def/class colon
      result = result.replace(
        /((?:^|\n)[ \t]*(?:def|class)\b[^\n]*:\s*\n[ \t]*)("""[\s\S]*?"""|'''[\s\S]*?''')/g,
        "$1"
      );
    }

    return result;
  }

  if (dashCommentLanguages.includes(ext)) {
    return content
      .split("\n")
      .map((line) => {
        const commentStart = findDashCommentStart(line);
        return commentStart === -1 ? line : line.slice(0, commentStart).trimEnd();
      })
      .join("\n");
  }

  return content;
}

const WHITESPACE_SENSITIVE_EXTENSIONS = new Set(["py", "yaml", "yml", "mk"]);
const WHITESPACE_SENSITIVE_FILENAMES = new Set(["makefile", "gnumakefile"]);

export function reduceWhitespace(content: string, extension?: string, filePath?: string): string {
  // Collapse multiple blank lines into one
  let result = content.replace(/\n{3,}/g, "\n\n");
  // Trim trailing whitespace from each line
  const ext = extension?.toLowerCase();
  const fileName = filePath?.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
  const preserveIndentation =
    (ext ? WHITESPACE_SENSITIVE_EXTENSIONS.has(ext) : false) ||
    (fileName ? WHITESPACE_SENSITIVE_FILENAMES.has(fileName) : false);
  result = result
    .split("\n")
    .map((line) => {
      const trimmed = line.trimEnd();
      if (preserveIndentation) return trimmed;
      // Fully left-align in whitespace-insensitive formats to maximize token savings.
      return trimmed.trimStart();
    })
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
