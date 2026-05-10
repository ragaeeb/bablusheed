import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronDown, ChevronRight, FileText, Package, X } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildPackFileTokenMap, getPackExportFileExtension, getPackExportFilename } from '@/lib/output-preview';
import { useRenderDiagnostics } from '@/lib/render-diagnostics';
import { formatTokenCount } from '@/lib/utils';
import type { PackResponse } from '@/types';

type OutputPreviewProps = {
    packResult: PackResponse;
    /** Optional real per-file token counts from the tokenizer; used to show accurate per-file estimates */
    tokenMap?: Map<string, number>;
    debugLogging?: boolean;
    onDebugLog?: (line: string) => void;
    onEventLog?: (level: 'error' | 'info' | 'debug', message: string) => void;
    onRenderSample?: (component: string, timestampMs: number) => void;
    onClose: () => void;
};

function PackManifest({
    filePaths,
    tokenMap,
    totalTokens,
}: {
    filePaths: string[];
    tokenMap: Map<string, number>;
    totalTokens: number;
}) {
    return (
        <div className="mb-2 space-y-0.5 rounded border border-border bg-muted/30 p-2 font-mono text-[10px]">
            {filePaths.map((p) => {
                const t = tokenMap.get(p);
                return (
                    <div key={p} className="flex items-center gap-2">
                        <span className="text-muted-foreground">📄</span>
                        <span className="flex-1 truncate text-foreground/70">{p}</span>
                        {t !== undefined && (
                            <span className="shrink-0 text-muted-foreground">~{formatTokenCount(t)}</span>
                        )}
                    </div>
                );
            })}
            <div className="mt-1 border-border/60 border-t pt-1 text-muted-foreground">
                Total: {filePaths.length} files · ~{formatTokenCount(totalTokens)} tokens
            </div>
        </div>
    );
}

function PackContent({
    content,
    filePaths,
    tokenMap,
    packTokens,
}: {
    content: string;
    filePaths: string[];
    tokenMap: Map<string, number>;
    packTokens: number;
}) {
    return (
        <div className="relative flex h-full flex-col">
            {/* Pack manifest */}
            <PackManifest filePaths={filePaths} tokenMap={tokenMap} totalTokens={packTokens} />
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-muted/30 p-3 font-mono text-[11px] text-foreground/80 leading-relaxed">
                {content}
            </pre>
        </div>
    );
}

export function OutputPreview({
    packResult,
    tokenMap,
    debugLogging = false,
    onDebugLog,
    onEventLog,
    onRenderSample,
    onClose,
}: OutputPreviewProps) {
    useRenderDiagnostics({
        component: 'OutputPreview',
        enabled: debugLogging,
        onLog: onDebugLog,
        onRenderSample,
        threshold: 80,
        windowMs: 3000,
    });

    const [showHowTo, setShowHowTo] = useState(false);
    const [exportingAll, setExportingAll] = useState(false);

    const fileTokenMap = buildPackFileTokenMap(packResult.packs, tokenMap);
    const exportExtension = getPackExportFileExtension(packResult.outputFormat);

    const handleExportAll = async () => {
        setExportingAll(true);
        onEventLog?.('info', `export-all start packs=${packResult.packs.length}`);
        try {
            const folder = await open({
                directory: true,
                multiple: false,
                title: 'Select folder for exported packs',
            });
            if (!folder || typeof folder !== 'string') {
                onEventLog?.('info', 'export-all cancelled');
                return;
            }
            await invoke('authorize_export_directory', { path: folder });

            for (const pack of packResult.packs) {
                const filename = getPackExportFilename(pack.index, packResult.packs.length, packResult.outputFormat);
                const path = await join(folder, filename);
                onEventLog?.('debug', `export-all write start path=${path}`);
                await invoke('write_file_content', { content: pack.content, path });
                onEventLog?.('debug', `export-all write success path=${path}`);
            }
            onEventLog?.('info', `export-all success packs=${packResult.packs.length} dir=${folder}`);
        } catch (err) {
            console.error('Export all failed:', err);
            onEventLog?.('error', `export-all failed err=${String(err)}`);
        } finally {
            setExportingAll(false);
        }
    };

    return (
        <div className="flex h-full flex-col bg-background">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-border border-b px-3 py-2">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-xs">Output</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {formatTokenCount(packResult.totalTokens)} tokens
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={handleExportAll}
                        disabled={exportingAll}
                        className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 font-medium text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                        title={
                            packResult.packs.length > 1
                                ? `Export all packs as .${exportExtension} files`
                                : `Export pack as a .${exportExtension} file`
                        }
                    >
                        <Package className="h-3 w-3" />
                        {exportingAll ? 'Exporting...' : packResult.packs.length > 1 ? 'Export All' : 'Export'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden p-3">
                <Tabs defaultValue="0" className="flex h-full flex-col">
                    <TabsList className="mb-2 h-auto w-full shrink-0 flex-wrap justify-start gap-1 bg-transparent p-0">
                        {packResult.packs.map((pack) => (
                            <TabsTrigger
                                key={pack.index}
                                value={String(pack.index)}
                                className="h-6 rounded border border-border bg-background px-2 font-medium text-[11px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                <FileText className="mr-1 h-3 w-3" />
                                Pack {pack.index + 1}
                                <span className="ml-1 font-mono opacity-60">
                                    ~{formatTokenCount(pack.estimatedTokens)}
                                </span>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {packResult.packs.map((pack) => (
                        <TabsContent
                            key={pack.index}
                            value={String(pack.index)}
                            className="mt-0 flex flex-1 flex-col overflow-hidden"
                        >
                            <div className="flex flex-1 flex-col overflow-hidden">
                                <PackContent
                                    content={pack.content}
                                    filePaths={pack.filePaths}
                                    tokenMap={fileTokenMap}
                                    packTokens={pack.estimatedTokens}
                                />
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            </div>

            {/* How-to hint (collapsible) */}
            <div className="shrink-0 border-border border-t px-3 py-2">
                <button
                    type="button"
                    onClick={() => setShowHowTo((v) => !v)}
                    className="flex w-full items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                >
                    {showHowTo ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    How to use these files
                </button>
                {showHowTo && (
                    <ol className="mt-1.5 list-inside list-decimal space-y-0.5 text-[10px] text-muted-foreground/70">
                        <li>Go to claude.ai or chatgpt.com and start a new conversation.</li>
                        <li>Attach Pack 1 as a file (drag the exported file or use the paperclip icon).</li>
                        <li>If you have multiple packs, attach them all before sending.</li>
                        <li>Paste your prompt and send.</li>
                    </ol>
                )}
            </div>
        </div>
    );
}
