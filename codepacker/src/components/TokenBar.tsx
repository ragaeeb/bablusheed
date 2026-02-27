import { AlertCircle, AlertTriangle } from "lucide-react";
import { cn, formatTokenCount } from "@/lib/utils";

interface TokenBarProps {
  usedTokens: number;
  maxTokens: number;
  selectedFileCount: number;
  numPacks: number;
}

export function TokenBar({ usedTokens, maxTokens, selectedFileCount, numPacks }: TokenBarProps) {
  const percentage = maxTokens > 0 ? Math.min((usedTokens / maxTokens) * 100, 100) : 0;
  const isWarning = percentage >= 85;
  const isError = percentage >= 100;

  const barColor = isError
    ? "bg-red-500"
    : isWarning
      ? "bg-orange-500"
      : percentage >= 60
        ? "bg-yellow-500"
        : "bg-emerald-500";

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isError && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
          {isWarning && !isError && <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />}
          <span className={cn("text-sm font-medium tabular-nums", isError && "text-red-400")}>
            {formatTokenCount(usedTokens)} / {formatTokenCount(maxTokens)} tokens
          </span>
          <span className="text-xs text-muted-foreground">({percentage.toFixed(0)}%)</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {selectedFileCount} files · {numPacks} {numPacks === 1 ? "pack" : "packs"}
        </div>
      </div>

      <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {isError && (
        <p className="text-xs text-red-400">
          Exceeds context window — deselect files or enable more optimizations
        </p>
      )}
    </div>
  );
}
