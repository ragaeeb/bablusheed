import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn, formatTokenCount } from '@/lib/utils';
import type { FileTreeNode } from '@/types';

type TopHeavyFilesProps = {
    selectedFiles: FileTreeNode[];
    tokenMap: Map<string, number>;
    onFileClick: (path: string) => void;
};

export function TopHeavyFiles({ selectedFiles, tokenMap, onFileClick }: TopHeavyFilesProps) {
    const [isOpen, setIsOpen] = useState(true);

    const filesWithTokens = selectedFiles
        .filter((f) => !f.isDir)
        .map((f) => ({ ...f, tokens: tokenMap.get(f.path) ?? 0 }))
        .sort((a, b) => b.tokens - a.tokens);

    const maxTokens = filesWithTokens[0]?.tokens ?? 1;

    if (filesWithTokens.length === 0) {
        return null;
    }

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="w-full rounded transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
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
                <div className="max-h-40 space-y-0 overflow-y-auto px-1 pb-1">
                    {filesWithTokens.map((file, index) => {
                        const barWidth = maxTokens > 0 ? (file.tokens / maxTokens) * 100 : 0;
                        const ratio = index / filesWithTokens.length;
                        const barColor =
                            ratio < 0.2 ? 'bg-red-400' : ratio < 0.5 ? 'bg-amber-400' : 'bg-muted-foreground/30';
                        const textColor =
                            ratio < 0.2
                                ? 'text-red-500 dark:text-red-400'
                                : ratio < 0.5
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-muted-foreground';

                        return (
                            <button
                                key={file.path}
                                type="button"
                                className="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-0.5 text-left hover:bg-muted/60"
                                onClick={() => onFileClick(file.path)}
                            >
                                <span
                                    className={cn(
                                        'flex-1 truncate font-mono text-[11px] transition-colors group-hover:text-foreground',
                                        textColor,
                                    )}
                                    title={file.relativePath}
                                >
                                    {file.name}
                                </span>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={cn('h-full rounded-full transition-all', barColor)}
                                            style={{ width: `${barWidth}%` }}
                                        />
                                    </div>
                                    <span
                                        className={cn('w-10 text-right font-mono text-[10px] tabular-nums', textColor)}
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
