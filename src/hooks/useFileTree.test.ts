import { describe, expect, it } from 'bun:test';
import { applyTokenMapToTree, buildTreeNodes, quickSelectInTree } from '@/hooks/useFileTree';
import type { FileNode, FileTreeNode } from '@/types';

describe('buildTreeNodes', () => {
    it('should keep top-level directories collapsed on initial load', () => {
        const nodes: FileNode[] = [
            {
                children: [
                    {
                        extension: 'ts',
                        id: 'src-file',
                        isDir: false,
                        name: 'index.ts',
                        path: '/project/src/index.ts',
                        relativePath: 'src/index.ts',
                        size: 12,
                    },
                ],
                extension: '',
                id: 'src',
                isDir: true,
                name: 'src',
                path: '/project/src',
                relativePath: 'src',
                size: 0,
            },
            {
                children: [
                    {
                        extension: 'toml',
                        id: 'src-tauri-file',
                        isDir: false,
                        name: 'Cargo.toml',
                        path: '/project/src-tauri/Cargo.toml',
                        relativePath: 'src-tauri/Cargo.toml',
                        size: 24,
                    },
                ],
                extension: '',
                id: 'src-tauri',
                isDir: true,
                name: 'src-tauri',
                path: '/project/src-tauri',
                relativePath: 'src-tauri',
                size: 0,
            },
        ];

        const tree = buildTreeNodes(nodes, 0);

        expect(tree.map((node) => node.name)).toEqual(['src', 'src-tauri']);
        expect(tree.every((node) => node.isExpanded === false)).toBe(true);
    });
});

describe('applyTokenMapToTree', () => {
    it('should update matching file tokens recursively', () => {
        const tree: FileTreeNode[] = [
            {
                checkState: 'unchecked',
                children: [
                    {
                        checkState: 'checked',
                        depth: 1,
                        extension: 'ts',
                        id: 'file-a',
                        isDir: false,
                        isExpanded: false,
                        name: 'a.ts',
                        path: '/project/src/a.ts',
                        relativePath: 'src/a.ts',
                        size: 10,
                        tokenCount: 12,
                    },
                ],
                depth: 0,
                extension: '',
                id: 'root',
                isDir: true,
                isExpanded: true,
                name: 'src',
                path: '/project/src',
                relativePath: 'src',
                size: 0,
                tokenCount: 0,
            },
        ];

        const updated = applyTokenMapToTree(tree, new Map([['/project/src/a.ts', 42]]));

        expect(updated[0].children?.[0].tokenCount).toBe(42);
    });

    it('should clear stale token counts for files missing from the token map', () => {
        const tree: FileTreeNode[] = [
            {
                checkState: 'checked',
                depth: 0,
                extension: 'ts',
                id: 'file-a',
                isDir: false,
                isExpanded: false,
                name: 'a.ts',
                path: '/project/src/a.ts',
                relativePath: 'src/a.ts',
                size: 10,
                tokenCount: 99,
            },
        ];

        const updated = applyTokenMapToTree(tree, new Map());

        expect(updated[0].tokenCount).toBe(0);
    });

    it('should return the existing tree when token counts are already up to date', () => {
        const tree: FileTreeNode[] = [
            {
                checkState: 'unchecked',
                children: [
                    {
                        checkState: 'checked',
                        depth: 1,
                        extension: 'ts',
                        id: 'file-a',
                        isDir: false,
                        isExpanded: false,
                        name: 'a.ts',
                        path: '/project/src/a.ts',
                        relativePath: 'src/a.ts',
                        size: 10,
                        tokenCount: 42,
                    },
                ],
                depth: 0,
                extension: '',
                id: 'root',
                isDir: true,
                isExpanded: true,
                name: 'src',
                path: '/project/src',
                relativePath: 'src',
                size: 0,
                tokenCount: 0,
            },
        ];

        const updated = applyTokenMapToTree(tree, new Map([['/project/src/a.ts', 42]]));

        expect(updated).toBe(tree);
        expect(updated[0].children).toBe(tree[0].children);
    });
});

describe('quickSelectInTree', () => {
    it('should replace previous selections with the matching quick-filter set', () => {
        const tree: FileTreeNode[] = [
            {
                checkState: 'checked',
                depth: 0,
                extension: 'ts',
                id: 'source-file',
                isDir: false,
                isExpanded: false,
                name: 'a.ts',
                path: '/project/src/a.ts',
                relativePath: 'src/a.ts',
                size: 10,
                tokenCount: 0,
            },
            {
                checkState: 'unchecked',
                depth: 0,
                extension: 'ts',
                id: 'test-file',
                isDir: false,
                isExpanded: false,
                name: 'a.test.ts',
                path: '/project/src/a.test.ts',
                relativePath: 'src/a.test.ts',
                size: 10,
                tokenCount: 0,
            },
        ];

        const updated = quickSelectInTree(tree, 'tests');

        expect(updated[0].checkState).toBe('unchecked');
        expect(updated[1].checkState).toBe('checked');
    });
});
