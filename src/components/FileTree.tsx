import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Search } from "lucide-react";
import { useRef } from "react";
import { TokenBadge } from "@/components/TokenBadge";
import type { QuickFilter } from "@/hooks/useFileTree";
import { useRenderDiagnostics } from "@/lib/render-diagnostics";
import { cn } from "@/lib/utils";
import type { FlatTreeItem } from "@/types";

interface FileTreeProps {
  flatItems: FlatTreeItem[];
  tokenMap: Map<string, number>;
  searchQuery: string;
  highlightedPath: string | null;
  visibleFilePaths: Set<string>;
  onToggleCheck: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onSearchChange: (q: string) => void;
  onSelectAll: (selected: boolean, filteredPaths?: Set<string>) => void;
  onQuickSelect: (filter: QuickFilter) => void;
  onFilePreview: (path: string) => void;
  totalSelected: number;
  totalFiles: number;
  splitPartCountByPath?: Map<string, number>;
  debugLogging?: boolean;
  onDebugLog?: (line: string) => void;
  onRenderSample?: (component: string, timestampMs: number) => void;
}

function FileIcon({
  extension,
  isDir,
  isExpanded,
}: {
  extension: string;
  isDir: boolean;
  isExpanded: boolean;
}) {
  if (isDir) {
    return isExpanded ? (
      <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
    ) : (
      <Folder className="h-3.5 w-3.5 text-amber-500/80 shrink-0" />
    );
  }

  const colorMap: Record<string, string> = {
    ts: "text-blue-500",
    tsx: "text-cyan-500",
    js: "text-yellow-500",
    jsx: "text-cyan-400",
    rs: "text-orange-500",
    py: "text-blue-400",
    go: "text-cyan-600",
    md: "text-slate-400",
    json: "text-green-500",
    css: "text-purple-500",
    html: "text-orange-400",
    toml: "text-pink-500",
    yaml: "text-green-400",
    yml: "text-green-400",
    svg: "text-pink-400",
    sh: "text-emerald-500",
    lock: "text-slate-400",
  };

  return (
    <File
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        colorMap[extension.toLowerCase()] ?? "text-muted-foreground/60"
      )}
    />
  );
}

function TreeRow({
  item,
  tokenMap,
  maxTokens,
  isHighlighted,
  onToggleCheck,
  onToggleExpand,
  onFilePreview,
  splitPartCountByPath,
}: {
  item: FlatTreeItem;
  tokenMap: Map<string, number>;
  maxTokens: number;
  isHighlighted: boolean;
  onToggleCheck: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onFilePreview: (path: string) => void;
  splitPartCountByPath?: Map<string, number>;
}) {
  const { node, depth, hasChildren } = item;
  const tokens = tokenMap.get(node.path) ?? node.tokenCount;
  const isChecked = node.checkState === "checked";
  const isIndeterminate = node.checkState === "indeterminate";
  const splitPartCount = splitPartCountByPath?.get(node.path) ?? 1;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-1 rounded-sm group cursor-pointer min-h-[22px] text-[12px]",
        isHighlighted ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/70",
        isChecked && !node.isDir && "bg-primary/5"
      )}
      style={{ paddingLeft: `${depth * 10 + 4}px` }}
    >
      {/* Expand/collapse button */}
      {hasChildren ? (
        <button
          type="button"
          onClick={() => onToggleExpand(node.id)}
          className="flex items-center justify-center h-4 w-4 shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
          aria-label={node.isExpanded ? "Collapse" : "Expand"}
        >
          {node.isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}

      {/* Custom checkbox — clicking only toggles check, does NOT preview */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(node.id);
        }}
        className="flex items-center justify-center h-3.5 w-3.5 shrink-0 rounded-sm border transition-colors"
        style={{
          borderColor: isChecked || isIndeterminate ? "hsl(var(--primary))" : "hsl(var(--border))",
          backgroundColor: isChecked
            ? "hsl(var(--primary))"
            : isIndeterminate
              ? "hsl(var(--primary) / 0.3)"
              : "transparent",
        }}
        aria-label={`Select ${node.name}`}
      >
        {isChecked && (
          <svg className="h-2 w-2 text-white" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path
              d="M1 4l2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {isIndeterminate && <div className="h-0.5 w-2 bg-primary rounded-full" />}
      </button>

      {/* File icon + name — clicking a file shows preview; clicking a dir toggles expand */}
      <button
        type="button"
        className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer text-left pl-1"
        onClick={() => {
          if (hasChildren) {
            onToggleExpand(node.id);
          } else {
            onFilePreview(node.path);
          }
        }}
      >
        <FileIcon extension={node.extension} isDir={node.isDir} isExpanded={node.isExpanded} />
        <span
          className={cn(
            "font-mono truncate leading-none",
            node.isDir
              ? "text-foreground/80 font-medium"
              : isChecked
                ? "text-foreground"
                : "text-foreground/70 group-hover:text-foreground/90"
          )}
        >
          {node.name}
        </span>
      </button>

      {/* Token count badge */}
      {!node.isDir && tokens > 0 && (
        <TokenBadge
          tokens={tokens}
          maxTokens={maxTokens}
          className="shrink-0 opacity-50 group-hover:opacity-80 transition-opacity"
        />
      )}
      {!node.isDir && isChecked && splitPartCount > 1 && (
        <span
          className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded border border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          title={`Will be split into ${splitPartCount} parts when packing`}
        >
          {splitPartCount} parts
        </span>
      )}
    </div>
  );
}

const QUICK_FILTER_LABELS: Array<{ filter: QuickFilter; label: string; title: string }> = [
  { filter: "source", label: "Source", title: "Select source files (ts, js, rs, py, go, etc.)" },
  { filter: "tests", label: "Tests", title: "Select test files (*.test.*, *.spec.*)" },
  { filter: "config", label: "Config", title: "Select config files (json, toml, yaml, etc.)" },
  { filter: "docs", label: "Docs", title: "Select documentation files (md, mdx, rst)" },
  { filter: "clear", label: "Clear", title: "Deselect all files" },
];

export function FileTree({
  flatItems,
  tokenMap,
  searchQuery,
  highlightedPath,
  visibleFilePaths,
  onToggleCheck,
  onToggleExpand,
  onSearchChange,
  onSelectAll,
  onQuickSelect,
  onFilePreview,
  totalSelected,
  totalFiles,
  splitPartCountByPath,
  debugLogging = false,
  onDebugLog,
  onRenderSample,
}: FileTreeProps) {
  useRenderDiagnostics({
    component: "FileTree",
    enabled: debugLogging,
    onLog: onDebugLog,
    onRenderSample,
    threshold: 120,
    windowMs: 3000,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 22,
    overscan: 10,
  });

  // 3r: keyboard Enter handling
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>, item: FlatTreeItem) => {
    if (e.key === " ") {
      e.preventDefault();
      onToggleCheck(item.node.id);
    } else if (e.key === "ArrowRight" && item.hasChildren && !item.node.isExpanded) {
      onToggleExpand(item.node.id);
    } else if (e.key === "ArrowLeft" && item.node.isExpanded) {
      onToggleExpand(item.node.id);
    } else if (e.key === "Enter") {
      if (item.hasChildren) {
        onToggleExpand(item.node.id);
      } else {
        // Enter on a file opens the preview only; use Space to toggle selection
        onFilePreview(item.node.path);
      }
    }
  };

  const maxFileTokens = Math.max(...Array.from(tokenMap.values()), 1);

  // 3q: pass visibleFilePaths when search is active
  const handleSelectAll = (selected: boolean) => {
    if (searchQuery) {
      onSelectAll(selected, visibleFilePaths);
    } else {
      onSelectAll(selected);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter files..."
            className="w-full text-xs bg-muted/40 border border-border rounded pl-6 pr-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background placeholder:text-muted-foreground/50 font-mono"
          />
        </div>
        <div className="flex items-center justify-between mt-1 px-0.5">
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            {totalSelected}/{totalFiles}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="text-[10px] text-primary hover:text-primary/80 font-medium"
            >
              all
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              none
            </button>
          </div>
        </div>

        {/* 2c: Quick-select chips */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {QUICK_FILTER_LABELS.map(({ filter, label, title }) => (
            <button
              key={filter}
              type="button"
              title={title}
              onClick={() => onQuickSelect(filter)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border font-medium transition-colors",
                filter === "clear"
                  ? "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  : "border-primary/30 text-primary/70 hover:text-primary hover:border-primary bg-primary/5 hover:bg-primary/10"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Virtualized tree */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {flatItems.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/60">
            No files match
          </div>
        ) : (
          <div
            role="tree"
            aria-label="File tree"
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = flatItems[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  role="treeitem"
                  aria-selected={item.node.checkState === "checked"}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => handleKeyDown(e, item)}
                >
                  <TreeRow
                    item={item}
                    tokenMap={tokenMap}
                    maxTokens={maxFileTokens}
                    isHighlighted={highlightedPath === item.node.path}
                    onToggleCheck={onToggleCheck}
                    onToggleExpand={onToggleExpand}
                    onFilePreview={onFilePreview}
                    splitPartCountByPath={splitPartCountByPath}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
