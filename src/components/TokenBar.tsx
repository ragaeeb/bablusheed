import { evaluatePerPackAdvisory } from '@/lib/pack-strategy';
import { cn, formatTokenCount } from '@/lib/utils';
import type { PackOptions } from '@/types';

type TokenBarProps = {
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
};

type TokenSuggestion = {
    label: string;
    action: () => void;
};

function getUsageState(usedTokens: number, maxTokens: number) {
    const percentage = maxTokens > 0 ? Math.min((usedTokens / maxTokens) * 100, 100) : 0;
    const isWarning = percentage >= 85;
    const isError = percentage >= 100;
    return { isError, isWarning, percentage };
}

function getBarColor(percentage: number, isWarning: boolean, isError: boolean) {
    if (isError) {
        return 'bg-red-500';
    }
    if (isWarning) {
        return 'bg-amber-500';
    }
    return percentage >= 60 ? 'bg-yellow-400' : 'bg-emerald-500';
}

function getTextColor(isWarning: boolean, isError: boolean) {
    if (isError) {
        return 'text-red-600 dark:text-red-400';
    }
    if (isWarning) {
        return 'text-amber-600 dark:text-amber-400';
    }
    return 'text-foreground';
}

function getStripCommentsSuggestion(
    packOptions: PackOptions | undefined,
    usedTokens: number,
    onApplyOptimization?: (partial: Partial<PackOptions>) => void,
): TokenSuggestion | null {
    if (!packOptions || !onApplyOptimization || packOptions.stripComments) {
        return null;
    }
    const savings = Math.round(usedTokens * 0.15);
    return {
        action: () => onApplyOptimization({ stripComments: true }),
        label: `Strip Comments saves ~${formatTokenCount(savings)}`,
    };
}

function getMinifyMarkdownSuggestion(
    packOptions: PackOptions | undefined,
    tokenMap: Map<string, number> | undefined,
    selectedFilePaths: string[] | undefined,
    onApplyOptimization?: (partial: Partial<PackOptions>) => void,
): TokenSuggestion | null {
    if (!packOptions || !tokenMap || !selectedFilePaths || !onApplyOptimization || packOptions.minifyMarkdown) {
        return null;
    }
    const mdTokens = selectedFilePaths
        .filter((path) => path.endsWith('.md') || path.endsWith('.mdx'))
        .reduce((sum, path) => sum + (tokenMap.get(path) ?? 0), 0);
    if (mdTokens <= 0) {
        return null;
    }
    const savings = Math.round(mdTokens * 0.3);
    return {
        action: () => onApplyOptimization({ minifyMarkdown: true }),
        label: `Minify Markdown saves ~${formatTokenCount(savings)}`,
    };
}

function getDeselectHeaviestSuggestion(
    tokenMap: Map<string, number> | undefined,
    selectedFilePaths: string[] | undefined,
    onDeselectHeaviest?: (count: number) => void,
): TokenSuggestion | null {
    if (!tokenMap || !selectedFilePaths || !onDeselectHeaviest || selectedFilePaths.length < 2) {
        return null;
    }
    const sortedPaths = [...selectedFilePaths].sort((a, b) => (tokenMap.get(b) ?? 0) - (tokenMap.get(a) ?? 0));
    const topTwoTokens = (tokenMap.get(sortedPaths[0]) ?? 0) + (tokenMap.get(sortedPaths[1]) ?? 0);
    if (topTwoTokens <= 0) {
        return null;
    }
    return {
        action: () => onDeselectHeaviest(2),
        label: `Deselect 2 heaviest files saves ~${formatTokenCount(topTwoTokens)}`,
    };
}

function buildSuggestions(args: {
    isWarning: boolean;
    usedTokens: number;
    packOptions?: PackOptions;
    tokenMap?: Map<string, number>;
    selectedFilePaths?: string[];
    onApplyOptimization?: (partial: Partial<PackOptions>) => void;
    onDeselectHeaviest?: (count: number) => void;
}): TokenSuggestion[] {
    if (!args.isWarning) {
        return [];
    }
    return [
        getStripCommentsSuggestion(args.packOptions, args.usedTokens, args.onApplyOptimization),
        getMinifyMarkdownSuggestion(args.packOptions, args.tokenMap, args.selectedFilePaths, args.onApplyOptimization),
        getDeselectHeaviestSuggestion(args.tokenMap, args.selectedFilePaths, args.onDeselectHeaviest),
    ].filter((suggestion): suggestion is TokenSuggestion => suggestion !== null);
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
    const { isError, isWarning, percentage } = getUsageState(usedTokens, maxTokens);
    const barColor = getBarColor(percentage, isWarning, isError);
    const textColor = getTextColor(isWarning, isError);
    const perPackStatus =
        advisoryMaxTokensPerFile && selectedFileCount > 0
            ? evaluatePerPackAdvisory(usedTokens, numPacks, advisoryMaxTokensPerFile)
            : null;
    const suggestions = buildSuggestions({
        isWarning,
        onApplyOptimization,
        onDeselectHeaviest,
        packOptions,
        selectedFilePaths,
        tokenMap,
        usedTokens,
    });

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <span className={cn('font-medium font-mono text-xs tabular-nums', textColor)}>
                        {formatTokenCount(usedTokens)}
                        <span className="font-normal text-muted-foreground"> / {formatTokenCount(maxTokens)}</span>
                    </span>
                    <span
                        className={cn(
                            'rounded px-1 py-0.5 font-mono text-[10px]',
                            isError
                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                : isWarning
                                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-muted text-muted-foreground',
                        )}
                    >
                        {percentage.toFixed(0)}%
                    </span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                    {selectedFileCount} files · {numPacks} packs
                </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={cn(
                        'h-full rounded-full transition-all duration-300',
                        barColor,
                        percentage >= 60 && 'bg-linear-to-r from-emerald-500 via-yellow-400 to-red-500',
                    )}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {perPackStatus && (
                <div
                    className={cn(
                        'rounded border px-2 py-1.5 font-mono text-[10px]',
                        perPackStatus.level === 'danger'
                            ? 'border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300'
                            : perPackStatus.level === 'warn'
                              ? 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span>Avg/pack {formatTokenCount(Math.round(perPackStatus.avgTokensPerPack))}</span>
                        <span>
                            Advisory {formatTokenCount(perPackStatus.advisoryMaxTokensPerFile)} (
                            {(perPackStatus.utilization * 100).toFixed(0)}%)
                        </span>
                    </div>
                    {(perPackStatus.level === 'warn' || perPackStatus.level === 'danger') && (
                        <p className="mt-1">{perPackStatus.message}</p>
                    )}
                </div>
            )}

            {/* 2e: Actionable suggestions when over threshold */}
            {isWarning && suggestions.length > 0 && (
                <div className="space-y-1">
                    <p className="font-medium text-[10px] text-amber-600 dark:text-amber-400">
                        {percentage.toFixed(0)}% used — {suggestions.length} suggestion
                        {suggestions.length !== 1 ? 's' : ''} to reduce:
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {suggestions.map((s) => (
                            <button
                                key={s.label}
                                type="button"
                                onClick={s.action}
                                className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
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
