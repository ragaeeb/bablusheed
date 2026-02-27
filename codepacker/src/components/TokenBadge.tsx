import { cn, formatTokenCount } from "@/lib/utils";

interface TokenBadgeProps {
  tokens: number;
  maxTokens?: number;
  className?: string;
}

export function TokenBadge({ tokens, maxTokens, className }: TokenBadgeProps) {
  const intensity = maxTokens ? Math.min(tokens / maxTokens, 1) : 0;

  const colorClass =
    intensity > 0.8
      ? "text-red-400"
      : intensity > 0.5
        ? "text-orange-400"
        : intensity > 0.2
          ? "text-yellow-400"
          : "text-muted-foreground";

  return (
    <span className={cn("text-xs font-mono tabular-nums", colorClass, className)}>
      ~{formatTokenCount(tokens)}
    </span>
  );
}
