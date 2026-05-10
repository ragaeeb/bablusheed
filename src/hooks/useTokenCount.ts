import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runTokenCount } from '@/hooks/useTokenCount-runner';
import { createWorkerMessageHandler } from '@/hooks/useTokenCount-worker';
import type { LLMProfile } from '@/lib/llm-profiles';
import type { FileTreeNode } from '@/types';

type PackOptions = {
    stripComments: boolean;
    reduceWhitespace: boolean;
    minifyMarkdown: boolean;
    stripMarkdownHeadings: boolean;
    stripMarkdownBlockquotes: boolean;
    astDeadCode: boolean;
    entryPoint: string | null;
};

type RequestMeta = {
    sentAtMs: number;
    fileCount: number;
    rawChars: number;
    optimizedChars: number;
    prevTokens: Map<string, number>;
};

type AstCache = {
    entryPoint: string;
    selectedIdentityKey: string;
    rawContents: Map<string, string>;
    result: Map<string, string>;
};

export function useTokenCount(
    selectedFiles: FileTreeNode[],
    fileContents: Map<string, string>,
    llmProfile: LLMProfile,
    packOptions: PackOptions,
    debugEnabled = false,
    onDebugLog?: (line: string) => void,
    onDebugMetric?: (name: 'astRecompute' | 'astCacheHit' | 'workerQueued' | 'workerResult') => void,
    onEventLog?: (level: 'error' | 'info' | 'debug', message: string) => void,
) {
    const [tokenMap, setTokenMap] = useState<Map<string, number>>(new Map());
    const [isCalculating, setIsCalculating] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const contentHashMapRef = useRef<Map<string, string>>(new Map());
    const lastTokenizerRef = useRef<string>(llmProfile.tokenizer);
    const lastOptimizationKeyRef = useRef<string>('');

    const requestCounterRef = useRef(0);
    const latestRequestIdRef = useRef(0);
    const requestMetaRef = useRef<Map<number, RequestMeta>>(new Map());
    const tokenMapRef = useRef<Map<string, number>>(new Map());
    const astCacheRef = useRef<AstCache | null>(null);

    const debugEnabledRef = useRef(debugEnabled);
    const debugLogRef = useRef<((line: string) => void) | null>(onDebugLog ?? null);
    const onDebugMetricRef = useRef(onDebugMetric);
    const onEventLogRef = useRef(onEventLog);

    useEffect(() => {
        tokenMapRef.current = tokenMap;
    }, [tokenMap]);

    useEffect(() => {
        debugEnabledRef.current = debugEnabled;
    }, [debugEnabled]);

    useEffect(() => {
        debugLogRef.current = onDebugLog ?? null;
    }, [onDebugLog]);

    useEffect(() => {
        onDebugMetricRef.current = onDebugMetric;
    }, [onDebugMetric]);

    useEffect(() => {
        onEventLogRef.current = onEventLog;
    }, [onEventLog]);

    const logDebug = useCallback((message: string) => {
        if (!debugEnabledRef.current) {
            return;
        }
        debugLogRef.current?.(`[${new Date().toISOString()}] ${message}`);
    }, []);

    const selectedIdentityKey = useMemo(
        () => selectedFiles.map((file) => `${file.path}\u0000${file.extension}`).join('\u0001'),
        [selectedFiles],
    );
    const packOptionsSnapshot = useMemo<PackOptions>(
        () => ({
            astDeadCode: packOptions.astDeadCode,
            entryPoint: packOptions.entryPoint,
            minifyMarkdown: packOptions.minifyMarkdown,
            reduceWhitespace: packOptions.reduceWhitespace,
            stripComments: packOptions.stripComments,
            stripMarkdownBlockquotes: packOptions.stripMarkdownBlockquotes,
            stripMarkdownHeadings: packOptions.stripMarkdownHeadings,
        }),
        [
            packOptions.astDeadCode,
            packOptions.entryPoint,
            packOptions.minifyMarkdown,
            packOptions.reduceWhitespace,
            packOptions.stripComments,
            packOptions.stripMarkdownBlockquotes,
            packOptions.stripMarkdownHeadings,
        ],
    );
    const selectedFilesRef = useRef(selectedFiles);

    useEffect(() => {
        selectedFilesRef.current = selectedFiles;
    }, [selectedFiles]);

    useEffect(() => {
        workerRef.current = new Worker(new URL('../workers/tokenizer.worker.ts', import.meta.url), {
            type: 'module',
        });

        workerRef.current.onerror = (event) => {
            const message = event.message || 'unknown worker error';
            onEventLogRef.current?.('error', `token-count worker error err=${message}`);
            setIsCalculating(false);
        };

        workerRef.current.onmessage = createWorkerMessageHandler(
            latestRequestIdRef,
            requestMetaRef,
            selectedFilesRef,
            tokenMapRef,
            setTokenMap,
            setIsCalculating,
            logDebug,
            onDebugMetricRef.current,
        );

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
            workerRef.current?.terminate();
        };
    }, [logDebug]);

    useEffect(() => {
        let cancelled = false;

        const runCount = async () => {
            try {
                await runTokenCount(
                    {
                        astCacheRef,
                        contentHashMapRef,
                        debounceRef,
                        fileContents,
                        lastOptimizationKeyRef,
                        lastTokenizerRef,
                        latestRequestIdRef,
                        llmProfileTokenizer: llmProfile.tokenizer,
                        logDebug,
                        onDebugMetric: onDebugMetricRef.current,
                        packOptions: packOptionsSnapshot,
                        requestCounterRef,
                        requestMetaRef,
                        selectedFilesRef,
                        selectedIdentityKey,
                        setIsCalculating,
                        setTokenMap,
                        tokenMapRef,
                        workerRef,
                    },
                    cancelled,
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                onEventLogRef.current?.('error', `token-count run failed err=${message}`);
                setIsCalculating(false);
            }
        };

        void runCount();

        return () => {
            cancelled = true;
        };
    }, [
        // Intentionally key on selectedIdentityKey instead of selectedFiles:
        // selectedIdentityKey is derived from selectedFiles (path + extension) and changes whenever
        // the selected file set changes, while avoiding unnecessary reruns from array identity churn.
        selectedIdentityKey,
        fileContents,
        llmProfile.tokenizer,
        logDebug,
        packOptionsSnapshot,
    ]);

    const selectedTokens = selectedFiles.reduce((sum, f) => sum + (tokenMap.get(f.path) ?? 0), 0);

    return { isCalculating, tokenMap, totalTokens: selectedTokens };
}
