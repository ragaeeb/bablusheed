/**
 * Returns the subset of current content that still needs token work because it is new or changed
 * relative to the last committed content hashes.
 */
export function diffPendingTokenContent(
    previousHashes: Map<string, string>,
    countedContents: Map<string, string>,
): Map<string, string> {
    const pending = new Map<string, string>();

    for (const [path, content] of countedContents) {
        if (previousHashes.get(path) !== content) {
            pending.set(path, content);
        }
    }

    return pending;
}

/**
 * Drops committed hash entries for paths that are no longer part of the current counted content
 * while preserving the existing committed values for paths that are still present.
 */
export function pruneQueuedContentHashes(
    previousHashes: Map<string, string>,
    countedContents: Map<string, string>,
): Map<string, string> {
    const next = new Map<string, string>();

    for (const [path, content] of previousHashes) {
        if (countedContents.has(path)) {
            next.set(path, content);
        }
    }

    return next;
}

/**
 * Commits the queued content that was actually posted to the tokenizer worker. This distinction is
 * intentional: `queuedContents` may be only a subset of the full `countedContents` map.
 */
export function commitQueuedContentHashes(
    previousHashes: Map<string, string>,
    queuedContents: Map<string, string>,
): Map<string, string> {
    const next = new Map(previousHashes);

    for (const [path, content] of queuedContents) {
        next.set(path, content);
    }

    return next;
}
