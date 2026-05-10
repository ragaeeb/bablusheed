import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Check, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyOptimizationPipeline, cn, FILE_EXTENSION_COLOR_MAP, formatTokenCount } from '@/lib/utils';
import type { FileTreeNode, PackOptions } from '@/types';

type FilePreviewProps = {
    file: FileTreeNode | null;
    fileContents: Map<string, string>;
    tokenMap: Map<string, number>;
    packOptions: Pick<
        PackOptions,
        'stripComments' | 'reduceWhitespace' | 'minifyMarkdown' | 'stripMarkdownHeadings' | 'stripMarkdownBlockquotes'
    >;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
    onLoadContent?: (path: string) => Promise<void>;
    debugLogging?: boolean;
    onDebugLog?: (line: string) => void;
    onClose: () => void;
};

export function FilePreview({
    file,
    fileContents,
    tokenMap,
    packOptions,
    isSelected,
    onToggleSelect,
    onLoadContent,
    debugLogging = false,
    onDebugLog,
    onClose,
}: FilePreviewProps) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const [showOptimized, setShowOptimized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const cachedPathsRef = useRef(new Set<string>());

    const logDebug = useCallback(
        (message: string) => {
            if (!debugLogging || !onDebugLog) {
                return;
            }
            onDebugLog(`[preview] ${message}`);
        },
        [debugLogging, onDebugLog],
    );

    useEffect(() => {
        cachedPathsRef.current = new Set(fileContents.keys());
    }, [fileContents]);

    // Load content on demand if not yet cached
    // Depend on file?.path (not the whole fileContents Map) so this re-runs when the file changes,
    // not on every Map mutation.
    const filePath = file?.path;
    useEffect(() => {
        if (!filePath) {
            return;
        }
        if (cachedPathsRef.current.has(filePath)) {
            setIsLoading(false);
            logDebug(`cache-hit path=${filePath}`);
            return;
        }
        if (!onLoadContent) {
            setIsLoading(false);
            return;
        }

        const startedAt = Date.now();
        let alive = true;
        setIsLoading(true);
        logDebug(`load-start path=${filePath}`);
        onLoadContent(filePath)
            .catch((err) => {
                console.error('Failed to load preview content:', err);
                logDebug(`load-error path=${filePath} err=${String(err)}`);
            })
            .finally(() => {
                if (alive) {
                    setIsLoading(false);
                    logDebug(`load-done path=${filePath} ms=${Date.now() - startedAt}`);
                }
            });
        return () => {
            alive = false;
        };
    }, [filePath, onLoadContent, logDebug]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    if (!file) {
        return null;
    }

    const rawContent = fileContents.get(file.path) ?? '';
    const tokens = tokenMap.get(file.path) ?? 0;
    const ext = file.extension.toLowerCase();
    const iconColor = FILE_EXTENSION_COLOR_MAP[ext] ?? 'text-muted-foreground/60';

    const optimizedContent = applyOptimizationPipeline(rawContent, file.extension, file.relativePath, packOptions);

    const hasOptimizations =
        packOptions.stripComments ||
        packOptions.reduceWhitespace ||
        (packOptions.minifyMarkdown && (ext === 'md' || ext === 'mdx'));
    const displayContent = showOptimized ? optimizedContent : rawContent;

    const handleCopy = async () => {
        try {
            await writeText(displayContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
            setCopyError(true);
            setTimeout(() => setCopyError(false), 2000);
        }
    };

    // Split path into breadcrumb parts
    const parts = file.relativePath.replace(/\\/g, '/').split('/');

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="shrink-0 border-border border-b bg-card/50 px-3 py-2">
                {/* Breadcrumb */}
                <div className="mb-1.5 flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted-foreground/70">
                    {parts.map((part, i) => (
                        <span key={`breadcrumb-${i.toString()}-${part}`} className="flex items-center gap-1">
                            {i > 0 && <span className="text-muted-foreground/40">/</span>}
                            <span
                                className={cn(
                                    i === parts.length - 1 ? `font-semibold ${iconColor}` : 'text-muted-foreground/60',
                                )}
                            >
                                {part}
                            </span>
                        </span>
                    ))}
                </div>

                {/* Actions row */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {/* Token badge */}
                    {tokens > 0 && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            ~{formatTokenCount(tokens)} tokens
                        </span>
                    )}

                    <div className="flex-1" />

                    {/* Toggle optimized view */}
                    {hasOptimizations && rawContent !== optimizedContent && (
                        <button
                            type="button"
                            onClick={() => setShowOptimized((v) => !v)}
                            className={cn(
                                'inline-flex h-6 items-center gap-1 rounded border px-2 font-medium text-[11px] transition-colors',
                                showOptimized
                                    ? 'border-primary/30 bg-primary/10 text-primary'
                                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                            )}
                            title={showOptimized ? 'Show raw content' : 'Show optimized content'}
                        >
                            {showOptimized ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {showOptimized ? 'Raw' : 'Optimized'}
                        </button>
                    )}

                    {/* Copy button */}
                    <button
                        type="button"
                        onClick={handleCopy}
                        className={cn(
                            'inline-flex h-6 items-center gap-1 rounded border px-2 font-medium text-[11px] transition-colors',
                            copied
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                                : copyError
                                  ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                    >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied ? 'Copied' : copyError ? 'Failed' : 'Copy'}
                    </button>

                    {/* Select/Deselect button */}
                    <button
                        type="button"
                        onClick={() => onToggleSelect(file.id)}
                        className={cn(
                            'inline-flex h-6 items-center gap-1 rounded border px-2 font-medium text-[11px] transition-colors',
                            isSelected
                                ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                    >
                        {isSelected ? 'Deselect' : 'Select'}
                    </button>

                    {/* Close button */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 font-medium text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs">Loading...</span>
                    </div>
                ) : rawContent === '' && !fileContents.has(file.path) ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground/60 text-xs">
                        No content available
                    </div>
                ) : (
                    <div className="h-full overflow-auto">
                        <pre className="min-h-full overflow-x-auto whitespace-pre p-3 font-mono text-[11px] text-foreground/80 leading-relaxed">
                            {displayContent || <span className="text-muted-foreground/40 italic">Empty file</span>}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
