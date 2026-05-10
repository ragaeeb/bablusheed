/**
 * Helper functions for useTokenCount hook to reduce cognitive complexity.
 * Extracted from useTokenCount.ts to improve maintainability.
 */

import type { FileTreeNode } from '@/types';

export type ContentMap = Map<string, string>;

/**
 * Build a map of raw file contents from selected files.
 */
export function buildRawContentMap(selectedFiles: FileTreeNode[], fileContents: Map<string, string>): ContentMap {
    const rawContents = new Map<string, string>();
    for (const file of selectedFiles) {
        const rawContent = fileContents.get(file.path);
        if (rawContent === undefined || rawContent === null) {
            continue;
        }
        rawContents.set(file.path, rawContent);
    }
    return rawContents;
}

/**
 * Check if AST cache is valid for the current selection and entry point.
 */
export function isAstCacheValid(
    cached: {
        entryPoint: string;
        selectedIdentityKey: string;
        rawContents: ContentMap;
        result: ContentMap;
    } | null,
    entryPoint: string,
    selectedIdentityKey: string,
    rawContents: ContentMap,
): boolean {
    if (!cached) {
        return false;
    }
    if (cached.entryPoint !== entryPoint) {
        return false;
    }
    if (cached.selectedIdentityKey !== selectedIdentityKey) {
        return false;
    }
    return areStringMapsEqual(cached.rawContents, rawContents);
}

function areStringMapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const [key, value] of a) {
        if (b.get(key) !== value) {
            return false;
        }
    }
    return true;
}

/**
 * Apply optimization pipeline to all selected files.
 */
export function applyOptimizationsToFiles(
    selectedFiles: FileTreeNode[],
    astProcessedContents: ContentMap,
    options: {
        minifyMarkdown: boolean;
        reduceWhitespace: boolean;
        stripComments: boolean;
        stripMarkdownBlockquotes: boolean;
        stripMarkdownHeadings: boolean;
    },
    applyOptimizationPipeline: (
        content: string,
        extension: string,
        relativePath: string,
        options: {
            minifyMarkdown: boolean;
            reduceWhitespace: boolean;
            stripComments: boolean;
            stripMarkdownBlockquotes: boolean;
            stripMarkdownHeadings: boolean;
        },
    ) => string,
): ContentMap {
    const countedContents = new Map<string, string>();
    for (const file of selectedFiles) {
        const baseContent = astProcessedContents.get(file.path);
        if (baseContent === undefined || baseContent === null) {
            continue;
        }
        const content = applyOptimizationPipeline(baseContent, file.extension, file.relativePath, options);
        countedContents.set(file.path, content);
    }
    return countedContents;
}

/**
 * Check if tokenizer or optimization settings have changed.
 */
export function hasSettingsChanged(
    lastTokenizer: string,
    currentTokenizer: string,
    lastOptimizationKey: string,
    currentOptimizationKey: string,
): { tokenizerChanged: boolean; optimizationChanged: boolean } {
    return {
        optimizationChanged: lastOptimizationKey !== currentOptimizationKey,
        tokenizerChanged: lastTokenizer !== currentTokenizer,
    };
}

/**
 * Build optimization key from pack options for change detection.
 */
export function buildOptimizationKey(options: {
    stripComments: boolean;
    reduceWhitespace: boolean;
    minifyMarkdown: boolean;
    stripMarkdownHeadings: boolean;
    stripMarkdownBlockquotes: boolean;
    astDeadCode: boolean;
    entryPoint: string | null;
}): string {
    return [
        options.stripComments,
        options.reduceWhitespace,
        options.minifyMarkdown,
        options.stripMarkdownHeadings,
        options.stripMarkdownBlockquotes,
        options.astDeadCode,
        options.entryPoint ?? '',
    ].join('|');
}

/**
 * Calculate token deltas for logging.
 */
export function calculateTokenDeltas(
    results: Array<{ path: string; tokens: number }>,
    prevTokens: Map<string, number>,
): {
    increased: number;
    decreased: number;
    unchanged: number;
    deltaTotal: number;
} {
    let increased = 0;
    let decreased = 0;
    let unchanged = 0;
    let deltaTotal = 0;

    for (const { path, tokens } of results) {
        const before = prevTokens.get(path) ?? 0;
        const delta = tokens - before;
        deltaTotal += delta;
        if (delta > 0) {
            increased += 1;
        } else if (delta < 0) {
            decreased += 1;
        } else {
            unchanged += 1;
        }
    }

    return { decreased, deltaTotal, increased, unchanged };
}

/**
 * Calculate character counts for request metadata.
 */
export function calculateCharCounts(
    newPending: Map<string, string>,
    fileContents: Map<string, string>,
): {
    rawChars: number;
    optimizedChars: number;
} {
    let rawChars = 0;
    let optimizedChars = 0;

    for (const [path, content] of newPending) {
        const raw = fileContents.get(path) ?? '';
        rawChars += raw.length;
        optimizedChars += content.length;
    }

    return { optimizedChars, rawChars };
}

/**
 * Prune old request metadata to keep memory bounded.
 */
export function pruneOldRequests<T>(requestMeta: Map<number, T>, currentRequestId: number, keepCount: number): void {
    const pruneBefore = currentRequestId - keepCount;
    for (const key of requestMeta.keys()) {
        if (key < pruneBefore) {
            requestMeta.delete(key);
        }
    }
}
