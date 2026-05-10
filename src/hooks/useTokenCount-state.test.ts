import { describe, expect, it } from 'bun:test';
import { commitQueuedContentHashes, diffPendingTokenContent } from '@/hooks/useTokenCount-state';

describe('diffPendingTokenContent', () => {
    it('should keep files pending across reruns until the worker queue is committed', () => {
        const countedContents = new Map([
            ['/project/src/a.ts', 'export const a = 1;\n'],
            ['/project/src/b.ts', 'export const b = 2;\n'],
        ]);

        const initialHashes = new Map<string, string>();
        const firstPending = diffPendingTokenContent(initialHashes, countedContents);

        expect(firstPending).not.toBe(countedContents);
        expect(firstPending).toEqual(countedContents);
        expect(countedContents.size).toBe(2);
        expect(initialHashes.size).toBe(0);

        const rerunPending = diffPendingTokenContent(initialHashes, countedContents);
        expect(rerunPending).toEqual(countedContents);

        const committedHashes = commitQueuedContentHashes(initialHashes, firstPending);
        const afterCommitPending = diffPendingTokenContent(committedHashes, countedContents);
        expect(afterCommitPending).toEqual(new Map());
    });

    it('should re-queue changed content after a commit', () => {
        const countedContents = new Map([['/project/src/a.ts', 'export const a = 1;\n']]);
        const committedHashes = commitQueuedContentHashes(new Map(), countedContents);

        const rerunPending = diffPendingTokenContent(
            committedHashes,
            new Map([['/project/src/a.ts', 'export const a = 2;\n']]),
        );

        expect(rerunPending).toEqual(new Map([['/project/src/a.ts', 'export const a = 2;\n']]));
    });
});
