/**
 * Worker message handling for useTokenCount hook.
 * Extracted to reduce cognitive complexity.
 */

import type { FileTreeNode, WorkerResult } from '@/types';
import { calculateTokenDeltas } from './useTokenCount-helpers';

type RequestMeta = {
    sentAtMs: number;
    fileCount: number;
    rawChars: number;
    optimizedChars: number;
    prevTokens: Map<string, number>;
};

export function createWorkerMessageHandler(
    latestRequestIdRef: React.MutableRefObject<number>,
    requestMetaRef: React.MutableRefObject<Map<number, RequestMeta>>,
    selectedFilesRef: React.MutableRefObject<FileTreeNode[]>,
    tokenMapRef: React.MutableRefObject<Map<string, number>>,
    setTokenMap: React.Dispatch<React.SetStateAction<Map<string, number>>>,
    setIsCalculating: React.Dispatch<React.SetStateAction<boolean>>,
    logDebug: (message: string) => void,
    onDebugMetric?: (name: 'astRecompute' | 'astCacheHit' | 'workerQueued' | 'workerResult') => void,
) {
    return (event: MessageEvent<WorkerResult>) => {
        if (event.data.type !== 'result') {
            return;
        }

        const { requestId, results } = event.data;
        const latestRequestId = latestRequestIdRef.current;
        const meta = requestMetaRef.current.get(requestId);
        requestMetaRef.current.delete(requestId);

        // Ignore stale results
        if (requestId < latestRequestId) {
            logDebug(`token-count stale result ignored request=${requestId} latest=${latestRequestId}`);
            return;
        }

        // Filter results to only selected files
        const selectedPathSet = new Set(
            selectedFilesRef.current.filter((file) => !file.isDir).map((file) => file.path),
        );
        const filteredResults = results.filter(({ path }) => selectedPathSet.has(path));

        if (filteredResults.length === 0) {
            setIsCalculating(false);
            logDebug(`token-count result ignored request=${requestId} files=0 reason=selection-mismatch`);
            return;
        }

        // Calculate deltas
        const prevTokens = meta?.prevTokens ?? tokenMapRef.current;
        const { increased, decreased, unchanged, deltaTotal } = calculateTokenDeltas(filteredResults, prevTokens);

        // Update token map
        setTokenMap((prev) => {
            const next = new Map(prev);
            for (const { path, tokens } of filteredResults) {
                next.set(path, tokens);
            }
            tokenMapRef.current = next;
            return next;
        });
        setIsCalculating(false);

        // Log results
        const elapsedMs = meta ? Date.now() - meta.sentAtMs : 0;
        const charDelta = meta ? meta.optimizedChars - meta.rawChars : 0;
        logDebug(
            `token-count result request=${requestId} files=${filteredResults.length} ` +
                `deltaTokens=${deltaTotal} increased=${increased} decreased=${decreased} unchanged=${unchanged} ` +
                `charDelta=${charDelta} elapsedMs=${elapsedMs}`,
        );
        onDebugMetric?.('workerResult');
    };
}
