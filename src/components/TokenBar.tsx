import { evaluatePerPackAdvisory } from "@/lib/pack-strategy";
import { cn, formatTokenCount } from "@/lib/utils";
import type { PackOptions } from "@/types";

interface TokenBarProps {
  usedTokens: number;
  maxTokens: number;
  selectedFileCount: number;
  numPacks: number;
  packOptions?: PackOptions;
  tokenMap?: Map<string, number>;
  selectedFilePaths?: string[];
  onApplyOptimization?: (partial: Partial<PackOptions>) => void;
  onDeselectHeaviest?: (count: number) => void;
  advisoryMaxTokensPerFile?: number;
}

export function TokenBar({
  usedTokens,
  maxTokens,
  selectedFileCount,
  numPacks,
  packOptions,
  tokenMap,
  selectedFilePaths,
  onApplyOptimization,
  onDeselectHeaviest,
  advisoryMaxTokensPerFile,
}: TokenBarProps) {
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

  // 2e: Compute actionable suggestions when over threshold
  const suggestions: Array<{ label: string; action: () => void }> = [];
  const perPackStatus =
    advisoryMaxTokensPerFile && selectedFileCount > 0
      ? evaluatePerPackAdvisory(usedTokens, numPacks, advisoryMaxTokensPerFile)
      : null;

  if (isWarning && packOptions && tokenMap && selectedFilePaths && onApplyOptimization) {
    // Suggestion: Strip Comments
    if (!packOptions.stripComments) {
      // Rough estimate: comments are ~15% of code
      const savings = Math.round(usedTokens * 0.15);
      suggestions.push({
        label: `Strip Comments saves ~${formatTokenCount(savings)}`,
        action: () => onApplyOptimization({ stripComments: true }),
      });
    }

    // Suggestion: Minify Markdown
    if (!packOptions.minifyMarkdown) {
      const mdTokens = selectedFilePaths
        .filter((p) => p.endsWith(".md") || p.endsWith(".mdx"))
        .reduce((sum, p) => sum + (tokenMap.get(p) ?? 0), 0);
      if (mdTokens > 0) {
        const savings = Math.round(mdTokens * 0.3);
        suggestions.push({
          label: `Minify Markdown saves ~${formatTokenCount(savings)}`,
          action: () => onApplyOptimization({ minifyMarkdown: true }),
        });
      }
    }

    // Suggestion: Deselect 2 heaviest files
    if (onDeselectHeaviest && selectedFilePaths.length >= 2) {
      const sorted = [...selectedFilePaths].sort(
        (a, b) => (tokenMap.get(b) ?? 0) - (tokenMap.get(a) ?? 0)
      );
      const top2Tokens = (tokenMap.get(sorted[0]) ?? 0) + (tokenMap.get(sorted[1]) ?? 0);
      if (top2Tokens > 0) {
        suggestions.push({
          label: `Deselect 2 heaviest files saves ~${formatTokenCount(top2Tokens)}`,
          action: () => onDeselectHeaviest(2),
        });
      }
    }
  }

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
          {selectedFileCount} files · {numPacks} packs
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            barColor,
            percentage >= 60 && "bg-linear-to-r from-emerald-500 via-yellow-400 to-red-500"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {perPackStatus && (
        <div
          className={cn(
            "text-[10px] rounded border px-2 py-1.5 font-mono",
            perPackStatus.level === "danger"
              ? "border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300"
              : perPackStatus.level === "warn"
                ? "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span>Avg/pack {formatTokenCount(Math.round(perPackStatus.avgTokensPerPack))}</span>
            <span>
              Advisory {formatTokenCount(perPackStatus.advisoryMaxTokensPerFile)} (
              {(perPackStatus.utilization * 100).toFixed(0)}%)
            </span>
          </div>
          {(perPackStatus.level === "warn" || perPackStatus.level === "danger") && (
            <p className="mt-1">{perPackStatus.message}</p>
          )}
        </div>
      )}

      {/* 2e: Actionable suggestions when over threshold */}
      {isWarning && suggestions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            {percentage.toFixed(0)}% used — {suggestions.length} suggestion
            {suggestions.length !== 1 ? "s" : ""} to reduce:
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={s.action}
                className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors font-medium"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isError && (
        <p className="text-[10px] text-red-500 dark:text-red-400">
          Exceeds context window — deselect files or enable optimizations
        </p>
      )}
    </div>
  );
}
