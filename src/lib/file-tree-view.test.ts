import { describe, expect, it } from 'bun:test';
import { getFileTreeProjectKey } from '@/lib/file-tree-view';

describe('getFileTreeProjectKey', () => {
    it('should return the same key for the same project path within the same load', () => {
        expect(getFileTreeProjectKey('/workspace/bablusheed', 1)).toBe(
            getFileTreeProjectKey('/workspace/bablusheed', 1),
        );
    });

    it('should return a different key when the project path changes', () => {
        expect(getFileTreeProjectKey('/workspace/bablusheed', 1)).not.toBe(
            getFileTreeProjectKey('/workspace/ushman-equiv', 1),
        );
    });

    it('should return a different key when the same project is reopened', () => {
        expect(getFileTreeProjectKey('/workspace/bablusheed', 1)).not.toBe(
            getFileTreeProjectKey('/workspace/bablusheed', 2),
        );
    });

    it('should return a stable empty-project key when no project is open', () => {
        expect(getFileTreeProjectKey(null, 0)).toBe('file-tree:no-project');
    });
});
