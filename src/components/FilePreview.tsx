import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn, formatTokenCount, minifyMarkdown, reduceWhitespace, stripComments } from "@/lib/utils";
import type { FileTreeNode, PackOptions } from "@/types";

const colorMap: Record<string, string> = {
  css: "text-purple-500",
  go: "text-cyan-600",
  html: "text-orange-400",
  js: "text-yellow-500",
  json: "text-green-500",
  jsx: "text-cyan-400",
  lock: "text-slate-400",
  md: "text-slate-400",
  py: "text-blue-400",
  rs: "text-orange-500",
  sh: "text-emerald-500",
  svg: "text-pink-400",
  toml: "text-pink-500",
  ts: "text-blue-500",
  tsx: "text-cyan-500",
  yaml: "text-green-400",
  yml: "text-green-400",
};

interface FilePreviewProps {
  file: FileTreeNode | null;
  fileContents: Map<string, string>;
  tokenMap: Map<string, number>;
  packOptions: Pick<
    PackOptions,
    | "stripComments"
    | "reduceWhitespace"
    | "minifyMarkdown"
    | "stripMarkdownHeadings"
    | "stripMarkdownBlockquotes"
  >;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onLoadContent?: (path: string) => Promise<void>;
  debugLogging?: boolean;
  onDebugLog?: (line: string) => void;
  onClose: () => void;
}

export function FilePreview({
  file,
  fileContents,
  tokenMap,
  packOptions,
  isSelected,
  onToggleSelect,
  onLoadContent,
  debugLogging = false,
  onDebugLog,
  onClose,
}: FilePreviewProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [showOptimized, setShowOptimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const cachedPathsRef = useRef(new Set<string>());

  const logDebug = useCallback(
    (message: string) => {
      if (!debugLogging || !onDebugLog) {
        return;
      }
      onDebugLog(`[preview] ${message}`);
    },
    [debugLogging, onDebugLog],
  );

  useEffect(() => {
    cachedPathsRef.current = new Set(fileContents.keys());
  }, [fileContents]);

  // Load content on demand if not yet cached
  // Depend on file?.path (not the whole fileContents Map) so this re-runs when the file changes,
  // not on every Map mutation.
  const filePath = file?.path;
  useEffect(() => {
    if (!filePath) {
      return;
    }
    if (cachedPathsRef.current.has(filePath)) {
      setIsLoading(false);
      logDebug(`cache-hit path=${filePath}`);
      return;
    }
    if (!onLoadContent) {
      setIsLoading(false);
      return;
    }

    const startedAt = Date.now();
    let alive = true;
    setIsLoading(true);
    logDebug(`load-start path=${filePath}`);
    onLoadContent(filePath)
      .catch((err) => {
        console.error("Failed to load preview content:", err);
        logDebug(`load-error path=${filePath} err=${String(err)}`);
      })
      .finally(() => {
        if (alive) {
          setIsLoading(false);
          logDebug(`load-done path=${filePath} ms=${Date.now() - startedAt}`);
        }
      });
    return () => {
      alive = false;
    };
  }, [filePath, onLoadContent, logDebug]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!file) {
    return null;
  }

  const rawContent = fileContents.get(file.path) ?? "";
  const tokens = tokenMap.get(file.path) ?? 0;
  const ext = file.extension.toLowerCase();
  const iconColor = colorMap[ext] ?? "text-muted-foreground/60";

  // Compute optimized content
  let optimizedContent = rawContent;
  if (packOptions.stripComments) {
    optimizedContent = stripComments(optimizedContent, file.extension);
  }
  if (packOptions.reduceWhitespace) {
    optimizedContent = reduceWhitespace(optimizedContent, file.extension, file.relativePath);
  }
  if (packOptions.minifyMarkdown && (ext === "md" || ext === "mdx")) {
    optimizedContent = minifyMarkdown(
      optimizedContent,
      packOptions.stripMarkdownHeadings,
      packOptions.stripMarkdownBlockquotes,
    );
  }

  const hasOptimizations =
    packOptions.stripComments ||
    packOptions.reduceWhitespace ||
    (packOptions.minifyMarkdown && (ext === "md" || ext === "mdx"));
  const displayContent = showOptimized ? optimizedContent : rawContent;

  const handleCopy = async () => {
    try {
      await writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2000);
    }
  };

  // Split path into breadcrumb parts
  const parts = file.relativePath.replace(/\\/g, "/").split("/");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border bg-card/50">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70 mb-1.5 flex-wrap">
          {parts.map((part, i) => (
            <span key={`breadcrumb-${i.toString()}-${part}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/40">/</span>}
              <span
                className={cn(
                  i === parts.length - 1
                    ? `font-semibold ${iconColor}`
                    : "text-muted-foreground/60",
                )}
              >
                {part}
              </span>
            </span>
          ))}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Token badge */}
          {tokens > 0 && (
            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              ~{formatTokenCount(tokens)} tokens
            </span>
          )}

          <div className="flex-1" />

          {/* Toggle optimized view */}
          {hasOptimizations && rawContent !== optimizedContent && (
            <button
              type="button"
              onClick={() => setShowOptimized((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border transition-colors",
                showOptimized
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50",
              )}
              title={showOptimized ? "Show raw content" : "Show optimized content"}
            >
              {showOptimized ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showOptimized ? "Raw" : "Optimized"}
            </button>
          )}

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border transition-colors",
              copied
                ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400"
                : copyError
                  ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50",
            )}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : copyError ? "Failed" : "Copy"}
          </button>

          {/* Select/Deselect button */}
          <button
            type="button"
            onClick={() => onToggleSelect(file.id)}
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50",
            )}
          >
            {isSelected ? "Deselect" : "Select"}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        ) : rawContent === "" && !fileContents.has(file.path) ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground/60">
            No content available
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <pre className="text-[11px] font-mono leading-relaxed p-3 text-foreground/80 whitespace-pre overflow-x-auto min-h-full">
              {displayContent || (
                <span className="text-muted-foreground/40 italic">Empty file</span>
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
