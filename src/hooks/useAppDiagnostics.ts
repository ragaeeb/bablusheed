import { useCallback, useEffect, useRef, useState } from 'react';

export type DebugLiveMetrics = {
    appRendersPerMin: number;
    fileTreeRendersPerMin: number;
    outputPreviewRendersPerMin: number;
    astRecomputeCount: number;
    astCacheHitCount: number;
    workerQueuedCount: number;
    workerResultCount: number;
};

export type LogLevel = 'off' | 'error' | 'info' | 'debug';

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 3,
    error: 1,
    info: 2,
    off: 0,
};

const EMPTY_DEBUG_METRICS: DebugLiveMetrics = {
    appRendersPerMin: 0,
    astCacheHitCount: 0,
    astRecomputeCount: 0,
    fileTreeRendersPerMin: 0,
    outputPreviewRendersPerMin: 0,
    workerQueuedCount: 0,
    workerResultCount: 0,
};

function shouldCaptureLog(level: LogLevel, incoming: 'error' | 'info' | 'debug'): boolean {
    return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[incoming];
}

export function isLogLevel(value: unknown): value is LogLevel {
    return value === 'off' || value === 'error' || value === 'info' || value === 'debug';
}

export function useAppDiagnostics() {
    const [logLevel, setLogLevel] = useState<LogLevel>('error');
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [debugLiveMetrics, setDebugLiveMetrics] = useState<DebugLiveMetrics>(EMPTY_DEBUG_METRICS);

    const logLevelRef = useRef<LogLevel>('error');
    const renderSamplesRef = useRef<Record<string, number[]>>({
        App: [],
        FileTree: [],
        OutputPreview: [],
    });
    const debugMetricCountsRef = useRef({
        astCacheHit: 0,
        astRecompute: 0,
        workerQueued: 0,
        workerResult: 0,
    });

    const debugLogging = logLevel === 'debug';

    const appendLog = useCallback((level: 'error' | 'info' | 'debug', message: string) => {
        if (!shouldCaptureLog(logLevelRef.current, level)) {
            return;
        }
        const line = `[${new Date().toISOString()}] [${level}] ${message}`;
        setDebugLogs((prev) => {
            const next = [...prev, line];
            return next.length > 5000 ? next.slice(next.length - 5000) : next;
        });
    }, []);

    const appendDebugLog = useCallback((line: string) => {
        if (!shouldCaptureLog(logLevelRef.current, 'debug')) {
            return;
        }
        const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
        const normalized = match
            ? `[${match[1]}] [debug] ${match[2]}`
            : `[${new Date().toISOString()}] [debug] ${line}`;
        setDebugLogs((prev) => {
            const next = [...prev, normalized];
            return next.length > 5000 ? next.slice(next.length - 5000) : next;
        });
    }, []);

    const appendRenderSample = useCallback(
        (component: string, timestampMs: number) => {
            if (!debugLogging) {
                return;
            }
            const bucket = renderSamplesRef.current[component] ?? [];
            bucket.push(timestampMs);
            renderSamplesRef.current[component] = bucket;
        },
        [debugLogging],
    );

    const incrementDebugMetric = useCallback(
        (name: 'astRecompute' | 'astCacheHit' | 'workerQueued' | 'workerResult') => {
            if (!debugLogging) {
                return;
            }
            debugMetricCountsRef.current[name] += 1;
        },
        [debugLogging],
    );

    useEffect(() => {
        logLevelRef.current = logLevel;
    }, [logLevel]);

    useEffect(() => {
        if (!debugLogging) {
            renderSamplesRef.current = { App: [], FileTree: [], OutputPreview: [] };
            debugMetricCountsRef.current = {
                astCacheHit: 0,
                astRecompute: 0,
                workerQueued: 0,
                workerResult: 0,
            };
            setDebugLiveMetrics(EMPTY_DEBUG_METRICS);
            return;
        }

        const timer = setInterval(() => {
            const cutoff = Date.now() - 60_000;
            const appSamples = renderSamplesRef.current.App.filter((timestamp) => timestamp >= cutoff);
            const treeSamples = renderSamplesRef.current.FileTree.filter((timestamp) => timestamp >= cutoff);
            const previewSamples = renderSamplesRef.current.OutputPreview.filter((timestamp) => timestamp >= cutoff);
            renderSamplesRef.current.App = appSamples;
            renderSamplesRef.current.FileTree = treeSamples;
            renderSamplesRef.current.OutputPreview = previewSamples;

            setDebugLiveMetrics({
                appRendersPerMin: appSamples.length,
                astCacheHitCount: debugMetricCountsRef.current.astCacheHit,
                astRecomputeCount: debugMetricCountsRef.current.astRecompute,
                fileTreeRendersPerMin: treeSamples.length,
                outputPreviewRendersPerMin: previewSamples.length,
                workerQueuedCount: debugMetricCountsRef.current.workerQueued,
                workerResultCount: debugMetricCountsRef.current.workerResult,
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [debugLogging]);

    return {
        appendDebugLog,
        appendLog,
        appendRenderSample,
        debugLiveMetrics,
        debugLogging,
        debugLogs,
        incrementDebugMetric,
        logLevel,
        setDebugLogs,
        setLogLevel,
    };
}
