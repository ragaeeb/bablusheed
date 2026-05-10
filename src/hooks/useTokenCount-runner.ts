/**
 * Main token counting logic for useTokenCount hook.
 * Extracted to reduce cognitive complexity of the runCount function.
 */

import {
    commitQueuedContentHashes,
    diffPendingTokenContent,
    pruneQueuedContentHashes,
} from '@/hooks/useTokenCount-state';
import type { LLMProfile } from '@/lib/llm-profiles';
import { getTokenizerEncoding } from '@/lib/llm-profiles';
import { applyOptimizationPipeline } from '@/lib/utils';
import type { FileTreeNode, WorkerMessage } from '@/types';
import { processWithAst } from './useTokenCount-ast';
import {
    applyOptimizationsToFiles,
    buildOptimizationKey,
    buildRawContentMap,
    type ContentMap,
    calculateCharCounts,
    pruneOldRequests,
} from './useTokenCount-helpers';

type PackOptions = {
    stripComments: boolean;
    reduceWhitespace: boolean;
    minifyMarkdown: boolean;
    stripMarkdownHeadings: boolean;
    stripMarkdownBlockquotes: boolean;
    astDeadCode: boolean;
    entryPoint: string | null;
};

type AstCache = {
    entryPoint: string;
    selectedIdentityKey: string;
    rawContents: ContentMap;
    result: ContentMap;
};

type RequestMeta = {
    sentAtMs: number;
    fileCount: number;
    rawChars: number;
    optimizedChars: number;
    prevTokens: Map<string, number>;
};

type RunCountContext = {
    selectedFilesRef: React.MutableRefObject<FileTreeNode[]>;
    fileContents: Map<string, string>;
    packOptions: PackOptions;
    selectedIdentityKey: string;
    llmProfileTokenizer: LLMProfile['tokenizer'];
    debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    latestRequestIdRef: React.MutableRefObject<number>;
    contentHashMapRef: React.MutableRefObject<Map<string, string>>;
    requestMetaRef: React.MutableRefObject<Map<number, RequestMeta>>;
    astCacheRef: React.MutableRefObject<AstCache | null>;
    requestCounterRef: React.MutableRefObject<number>;
    lastTokenizerRef: React.MutableRefObject<string>;
    lastOptimizationKeyRef: React.MutableRefObject<string>;
    tokenMapRef: React.MutableRefObject<Map<string, number>>;
    workerRef: React.MutableRefObject<Worker | null>;
    setIsCalculating: React.Dispatch<React.SetStateAction<boolean>>;
    setTokenMap: React.Dispatch<React.SetStateAction<Map<string, number>>>;
    logDebug: (message: string) => void;
    onDebugMetric?: (name: 'astRecompute' | 'astCacheHit' | 'workerQueued' | 'workerResult') => void;
};

/**
 * Handle empty selection case - reset all state.
 */
function handleEmptySelection(ctx: RunCountContext): void {
    if (ctx.debounceRef.current) {
        clearTimeout(ctx.debounceRef.current);
        ctx.debounceRef.current = null;
    }
    ctx.latestRequestIdRef.current = ctx.requestCounterRef.current + 1;
    ctx.contentHashMapRef.current.clear();
    ctx.requestMetaRef.current.clear();
    ctx.astCacheRef.current = null;
    ctx.setIsCalculating(false);
    ctx.setTokenMap((prev) => {
        if (prev.size === 0) {
            return prev;
        }
        const next = new Map<string, number>();
        ctx.tokenMapRef.current = next;
        return next;
    });
    ctx.logDebug('token-count reset: empty selection');
}

/**
 * Update token map to remove deselected files.
 */
function pruneDeselectedFiles(
    countedContents: ContentMap,
    setTokenMap: React.Dispatch<React.SetStateAction<Map<string, number>>>,
    tokenMapRef: React.MutableRefObject<Map<string, number>>,
): void {
    const selectedPathSet = new Set(countedContents.keys());
    setTokenMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const path of next.keys()) {
            if (!selectedPathSet.has(path)) {
                next.delete(path);
                changed = true;
            }
        }
        if (!changed) {
            return prev;
        }
        tokenMapRef.current = next;
        return next;
    });
}

/**
 * Queue worker request for token counting.
 */
function queueWorkerRequest(newPending: ContentMap, ctx: RunCountContext, cancelled: boolean): void {
    if (ctx.debounceRef.current) {
        clearTimeout(ctx.debounceRef.current);
    }

    ctx.debounceRef.current = setTimeout(() => {
        if (cancelled) {
            return;
        }

        const files = Array.from(newPending.entries()).map(([path, content]) => ({
            content,
            path,
        }));

        if (files.length === 0) {
            return;
        }

        ctx.contentHashMapRef.current = commitQueuedContentHashes(ctx.contentHashMapRef.current, newPending);

        const requestId = ++ctx.requestCounterRef.current;
        ctx.latestRequestIdRef.current = requestId;

        const { rawChars, optimizedChars } = calculateCharCounts(newPending, ctx.fileContents);
        const prevTokens = new Map<string, number>();
        for (const [path] of newPending) {
            prevTokens.set(path, ctx.tokenMapRef.current.get(path) ?? 0);
        }

        ctx.requestMetaRef.current.set(requestId, {
            fileCount: files.length,
            optimizedChars,
            prevTokens,
            rawChars,
            sentAtMs: Date.now(),
        });

        pruneOldRequests(ctx.requestMetaRef.current, requestId, 20);

        ctx.setIsCalculating(true);
        const strategy = getTokenizerEncoding(ctx.llmProfileTokenizer);
        const message: WorkerMessage = { files, requestId, strategy, type: 'count' };
        ctx.workerRef.current?.postMessage(message);
        ctx.onDebugMetric?.('workerQueued');

        ctx.logDebug(
            `token-count queued request=${requestId} files=${files.length} ` +
                `rawChars=${rawChars} optimizedChars=${optimizedChars} charDelta=${optimizedChars - rawChars} ` +
                `tokenizer=${ctx.llmProfileTokenizer}`,
        );
    }, 150);
}

/**
 * Main token counting logic.
 */
export async function runTokenCount(ctx: RunCountContext, cancelled: boolean): Promise<void> {
    ctx.logDebug(
        `token-count run start selected=${ctx.selectedFilesRef.current.length} tokenizer=${ctx.llmProfileTokenizer} ast=${ctx.packOptions.astDeadCode && !!ctx.packOptions.entryPoint}`,
    );

    // Handle empty selection
    if (ctx.selectedFilesRef.current.length === 0) {
        handleEmptySelection(ctx);
        return;
    }

    // Build raw content map
    const rawContents = buildRawContentMap(ctx.selectedFilesRef.current, ctx.fileContents);

    // Process with AST if enabled
    const { processedContents: astProcessedContents, updatedCache } = await processWithAst(
        ctx.packOptions.astDeadCode,
        ctx.packOptions.entryPoint,
        ctx.selectedFilesRef.current,
        rawContents,
        ctx.selectedIdentityKey,
        ctx.astCacheRef.current,
        ctx.logDebug,
        ctx.onDebugMetric,
    );

    if (updatedCache) {
        ctx.astCacheRef.current = updatedCache;
    } else if (!ctx.packOptions.astDeadCode || !ctx.packOptions.entryPoint) {
        ctx.astCacheRef.current = null;
    }

    if (cancelled) {
        return;
    }

    // Apply optimizations
    const countedContents = applyOptimizationsToFiles(
        ctx.selectedFilesRef.current,
        astProcessedContents,
        ctx.packOptions,
        applyOptimizationPipeline,
    );

    // Check if settings changed
    const optimizationKey = buildOptimizationKey(ctx.packOptions);
    const tokenizerChanged = ctx.lastTokenizerRef.current !== ctx.llmProfileTokenizer;
    const optimizationChanged = ctx.lastOptimizationKeyRef.current !== optimizationKey;

    if (tokenizerChanged || optimizationChanged) {
        ctx.contentHashMapRef.current.clear();
        ctx.lastTokenizerRef.current = ctx.llmProfileTokenizer;
        ctx.lastOptimizationKeyRef.current = optimizationKey;
    }

    // Diff and queue new content
    const newPending = diffPendingTokenContent(ctx.contentHashMapRef.current, countedContents);
    ctx.contentHashMapRef.current = pruneQueuedContentHashes(ctx.contentHashMapRef.current, countedContents);

    // Prune deselected files from token map
    pruneDeselectedFiles(countedContents, ctx.setTokenMap, ctx.tokenMapRef);

    if (newPending.size === 0) {
        return;
    }

    // Queue worker request
    queueWorkerRequest(newPending, ctx, cancelled);
}
