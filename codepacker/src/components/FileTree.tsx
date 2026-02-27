import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Search,
  Square,
} from "lucide-react";
import { useCallback, useRef } from "react";
import { TokenBadge } from "@/components/TokenBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { FlatTreeItem } from "@/types";

interface FileTreeProps {
  flatItems: FlatTreeItem[];
  tokenMap: Map<string, number>;
  searchQuery: string;
  highlightedPath: string | null;
  onToggleCheck: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onSearchChange: (q: string) => void;
  onSelectAll: (selected: boolean) => void;
  totalSelected: number;
  totalFiles: number;
}

function getFileColorIntensity(tokens: number, maxTokens: number): string {
  if (maxTokens === 0 || tokens === 0) return "";
  const ratio = tokens / maxTokens;
  if (ratio > 0.8) return "bg-red-500/10";
  if (ratio > 0.5) return "bg-orange-500/8";
  if (ratio > 0.2) return "bg-yellow-500/5";
  return "";
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
      <FolderOpen className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
    ) : (
      <Folder className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
    );
  }

  const colorMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-cyan-400",
    js: "text-yellow-300",
    jsx: "text-cyan-300",
    rs: "text-orange-500",
    py: "text-yellow-400",
    go: "text-cyan-500",
    md: "text-slate-300",
    json: "text-green-400",
    css: "text-purple-400",
    html: "text-orange-400",
    toml: "text-pink-400",
    yaml: "text-green-300",
    yml: "text-green-300",
  };

  return (
    <File
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        colorMap[extension.toLowerCase()] ?? "text-muted-foreground"
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
}: {
  item: FlatTreeItem;
  tokenMap: Map<string, number>;
  maxTokens: number;
  isHighlighted: boolean;
  onToggleCheck: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const { node, depth, hasChildren } = item;
  const tokens = tokenMap.get(node.path) ?? node.tokenCount;
  const intensityClass = !node.isDir ? getFileColorIntensity(tokens, maxTokens) : "";

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-sm group hover:bg-muted/50 transition-colors min-h-[26px]",
        isHighlighted && "ring-1 ring-primary/50 bg-primary/5",
        intensityClass
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {/* Expand/collapse button */}
      {hasChildren ? (
        <button
          type="button"
          onClick={() => onToggleExpand(node.id)}
          className="flex items-center justify-center h-4 w-4 shrink-0 hover:text-foreground text-muted-foreground"
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

      {/* Checkbox */}
      <Checkbox
        checked={node.checkState === "checked"}
        indeterminate={node.checkState === "indeterminate"}
        onCheckedChange={() => onToggleCheck(node.id)}
        className="h-3.5 w-3.5 shrink-0"
        aria-label={`Select ${node.name}`}
      />

      {/* File icon + name */}
      <button
        type="button"
        className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer text-left"
        onClick={() => {
          if (hasChildren) {
            onToggleExpand(node.id);
          } else {
            onToggleCheck(node.id);
          }
        }}
      >
        <FileIcon extension={node.extension} isDir={node.isDir} isExpanded={node.isExpanded} />
        <span className="text-xs font-mono truncate text-foreground/90 group-hover:text-foreground">
          {node.name}
        </span>
      </button>

      {/* Token count badge */}
      {!node.isDir && tokens > 0 && (
        <TokenBadge
          tokens={tokens}
          maxTokens={maxTokens}
          className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
        />
      )}
    </div>
  );
}

export function FileTree({
  flatItems,
  tokenMap,
  searchQuery,
  highlightedPath,
  onToggleCheck,
  onToggleExpand,
  onSearchChange,
  onSelectAll,
  totalSelected,
  totalFiles,
}: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 26,
    overscan: 10,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, item: FlatTreeItem) => {
      if (e.key === " ") {
        e.preventDefault();
        onToggleCheck(item.node.id);
      } else if (e.key === "ArrowRight" && item.hasChildren && !item.node.isExpanded) {
        onToggleExpand(item.node.id);
      } else if (e.key === "ArrowLeft" && item.node.isExpanded) {
        onToggleExpand(item.node.id);
      }
    },
    [onToggleCheck, onToggleExpand]
  );

  const maxFileTokens = Math.max(...Array.from(tokenMap.values()), 1);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-2 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter files..."
            className="w-full text-xs bg-muted/50 border border-border rounded-md pl-7 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <span className="text-xs text-muted-foreground">
            {totalSelected}/{totalFiles} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectAll(true)}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              <CheckSquare className="h-3 w-3" />
              All
            </button>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              className="text-xs text-muted-foreground hover:underline flex items-center gap-0.5"
            >
              <Square className="h-3 w-3" />
              None
            </button>
          </div>
        </div>
      </div>

      {/* Virtualized tree */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {flatItems.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            No files match the filter
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
