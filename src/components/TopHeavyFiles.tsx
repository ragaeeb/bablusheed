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

  if (filesWithTokens.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full hover:bg-muted/50 rounded transition-colors">
        <div className="flex items-center justify-between py-1.5 px-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Heaviest ({filesWithTokens.length})
          </span>
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-1 pb-1 space-y-0 max-h-40 overflow-y-auto">
          {filesWithTokens.map((file, index) => {
            const barWidth = maxTokens > 0 ? (file.tokens / maxTokens) * 100 : 0;
            const ratio = index / filesWithTokens.length;
            const barColor =
              ratio < 0.2 ? "bg-red-400" : ratio < 0.5 ? "bg-amber-400" : "bg-muted-foreground/30";
            const textColor =
              ratio < 0.2
                ? "text-red-500 dark:text-red-400"
                : ratio < 0.5
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground";

            return (
              <button
                key={file.path}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-0.5 rounded hover:bg-muted/60 cursor-pointer group text-left"
                onClick={() => onFileClick(file.path)}
              >
                <span
                  className={cn(
                    "text-[11px] font-mono truncate flex-1 group-hover:text-foreground transition-colors",
                    textColor
                  )}
                  title={file.relativePath}
                >
                  {file.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", barColor)}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span
                    className={cn("text-[10px] font-mono tabular-nums w-10 text-right", textColor)}
                  >
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
