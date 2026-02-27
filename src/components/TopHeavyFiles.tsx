import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn, formatTokenCount } from "@/lib/utils";
import type { FileTreeNode } from "@/types";

interface TopHeavyFilesProps {
  selectedFiles: FileTreeNode[];
  tokenMap: Map<string, number>;
  onFileClick: (path: string) => void;
}

export function TopHeavyFiles({ selectedFiles, tokenMap, onFileClick }: TopHeavyFilesProps) {
  const [isOpen, setIsOpen] = useState(true);

  const filesWithTokens = selectedFiles
    .filter((f) => !f.isDir)
    .map((f) => ({ ...f, tokens: tokenMap.get(f.path) ?? 0 }))
    .sort((a, b) => b.tokens - a.tokens);

  const maxTokens = filesWithTokens[0]?.tokens ?? 1;

  const getColorClass = (index: number, total: number): string => {
    const pct = index / total;
    if (pct < 0.2) return "text-red-400";
    if (pct < 0.5) return "text-orange-400";
    return "text-muted-foreground";
  };

  if (filesWithTokens.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 rounded-md transition-colors">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Heaviest Files ({filesWithTokens.length})
        </span>
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-1 pb-2 space-y-0.5 max-h-48 overflow-y-auto">
          {filesWithTokens.map((file, index) => {
            const barWidth = maxTokens > 0 ? (file.tokens / maxTokens) * 100 : 0;
            const colorClass = getColorClass(index, filesWithTokens.length);

            return (
              <button
                key={file.path}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-0.5 rounded hover:bg-muted/50 cursor-pointer group text-left"
                onClick={() => onFileClick(file.path)}
              >
                <span
                  className={cn(
                    "text-xs font-mono truncate flex-1 group-hover:text-foreground transition-colors",
                    colorClass
                  )}
                  title={file.relativePath}
                >
                  {file.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        index / filesWithTokens.length < 0.2
                          ? "bg-red-500"
                          : index / filesWithTokens.length < 0.5
                            ? "bg-orange-500"
                            : "bg-muted-foreground/50"
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className={cn("text-xs font-mono tabular-nums", colorClass)}>
                    {formatTokenCount(file.tokens)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
