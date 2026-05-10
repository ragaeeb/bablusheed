/**
 * AST processing logic for useTokenCount hook.
 * Extracted to reduce cognitive complexity.
 */

import { applyAstDeadCode } from '@/lib/ast-reachability';
import type { FileTreeNode } from '@/types';
import { type ContentMap, isAstCacheValid } from './useTokenCount-helpers';

type AstCache = {
    entryPoint: string;
    selectedIdentityKey: string;
    rawContents: ContentMap;
    result: ContentMap;
};

/**
 * Process contents with AST dead code elimination if enabled.
 * Uses cache when possible to avoid recomputation.
 */
export async function processWithAst(
    astEnabled: boolean,
    entryPoint: string | null,
    selectedFiles: FileTreeNode[],
    rawContents: ContentMap,
    selectedIdentityKey: string,
    astCache: AstCache | null,
    logDebug: (message: string) => void,
    onDebugMetric?: (name: 'astRecompute' | 'astCacheHit') => void,
): Promise<{
    processedContents: ContentMap;
    updatedCache: AstCache | null;
}> {
    if (!astEnabled || !entryPoint) {
        return {
            processedContents: rawContents,
            updatedCache: null,
        };
    }

    // Check cache
    if (isAstCacheValid(astCache, entryPoint, selectedIdentityKey, rawContents)) {
        logDebug(`token-count ast cache hit files=${rawContents.size}`);
        onDebugMetric?.('astCacheHit');
        return {
            processedContents: astCache!.result,
            updatedCache: astCache,
        };
    }

    // Recompute AST
    const processedContents = await applyAstDeadCode(selectedFiles, rawContents, entryPoint);
    const updatedCache: AstCache = {
        entryPoint,
        rawContents: new Map(rawContents),
        result: new Map(processedContents),
        selectedIdentityKey,
    };

    logDebug(`token-count ast recompute files=${rawContents.size}`);
    onDebugMetric?.('astRecompute');

    return {
        processedContents,
        updatedCache,
    };
}
