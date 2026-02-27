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
      ? "bg-amber-500"
      : percentage >= 60
        ? "bg-yellow-400"
        : "bg-emerald-500";

  const textColor = isError
    ? "text-red-600 dark:text-red-400"
    : isWarning
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-xs font-mono font-medium tabular-nums", textColor)}>
            {formatTokenCount(usedTokens)}
            <span className="text-muted-foreground font-normal">
              {" "}
              / {formatTokenCount(maxTokens)}
            </span>
          </span>
          <span
            className={cn(
              "text-[10px] font-mono px-1 py-0.5 rounded",
              isError
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : isWarning
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {percentage.toFixed(0)}%
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {selectedFileCount} files · {numPacks}×
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {isError && (
        <p className="text-[10px] text-red-500 dark:text-red-400">
          Exceeds context window — deselect files or enable optimizations
        </p>
      )}
    </div>
  );
}
