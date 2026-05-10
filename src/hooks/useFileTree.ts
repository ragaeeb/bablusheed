import { useCallback, useMemo, useState } from 'react';
import type { CheckState, FileNode, FileTreeNode, FlatTreeItem } from '@/types';

export function buildTreeNodes(nodes: FileNode[], depth: number): FileTreeNode[] {
    return nodes.map((node) => ({
        ...node,
        checkState: 'unchecked' as CheckState,
        children: node.children ? buildTreeNodes(node.children, depth + 1) : undefined,
        depth,
        isExpanded: false,
        tokenCount: 0,
    }));
}

function updateCheckStateInTree(
    nodes: FileTreeNode[],
    targetId: string,
    newState: 'checked' | 'unchecked',
): FileTreeNode[] {
    return nodes.map((node) => {
        if (node.id === targetId) {
            return {
                ...node,
                checkState: newState,
                children: node.children ? setAllChildren(node.children, newState) : undefined,
            };
        }
        if (node.children) {
            const updatedChildren = updateCheckStateInTree(node.children, targetId, newState);
            const childState = computeParentState(updatedChildren);
            return { ...node, checkState: childState, children: updatedChildren };
        }
        return node;
    });
}

function setAllChildren(nodes: FileTreeNode[], state: 'checked' | 'unchecked'): FileTreeNode[] {
    return nodes.map((node) => ({
        ...node,
        checkState: state,
        children: node.children ? setAllChildren(node.children, state) : undefined,
    }));
}

function computeParentState(children: FileTreeNode[]): CheckState {
    if (children.length === 0) {
        return 'unchecked';
    }
    const allChecked = children.every((c) => c.checkState === 'checked');
    const noneChecked = children.every((c) => c.checkState === 'unchecked');
    if (allChecked) {
        return 'checked';
    }
    if (noneChecked) {
        return 'unchecked';
    }
    return 'indeterminate';
}

function toggleExpanded(nodes: FileTreeNode[], targetId: string): FileTreeNode[] {
    return nodes.map((node) => {
        if (node.id === targetId) {
            return { ...node, isExpanded: !node.isExpanded };
        }
        if (node.children) {
            return { ...node, children: toggleExpanded(node.children, targetId) };
        }
        return node;
    });
}

function flattenTree(nodes: FileTreeNode[]): FlatTreeItem[] {
    const result: FlatTreeItem[] = [];
    for (const node of nodes) {
        result.push({
            depth: node.depth,
            hasChildren: Boolean(node.children && node.children.length > 0),
            node,
        });
        if (node.isExpanded && node.children) {
            result.push(...flattenTree(node.children));
        }
    }
    return result;
}

function getSelectedFiles(nodes: FileTreeNode[]): FileTreeNode[] {
    const result: FileTreeNode[] = [];
    for (const node of nodes) {
        if (!node.isDir && node.checkState === 'checked') {
            result.push(node);
        }
        if (node.children) {
            result.push(...getSelectedFiles(node.children));
        }
    }
    return result;
}

export function applyTokenMapToTree(nodes: FileTreeNode[], tokenMap: Map<string, number>): FileTreeNode[] {
    let changed = false;

    const nextNodes = nodes.map((node) => {
        const nextChildren = node.children ? applyTokenMapToTree(node.children, tokenMap) : undefined;
        const nextTokenCount = tokenMap.get(node.path) ?? 0;
        const nodeChanged = nextChildren !== node.children || nextTokenCount !== node.tokenCount;

        if (!nodeChanged) {
            return node;
        }

        changed = true;
        return {
            ...node,
            children: nextChildren,
            tokenCount: nextTokenCount,
        };
    });

    return changed ? nextNodes : nodes;
}

function selectAllInTree(nodes: FileTreeNode[], selected: boolean, filteredPaths?: Set<string>): FileTreeNode[] {
    const state: 'checked' | 'unchecked' = selected ? 'checked' : 'unchecked';
    return nodes.map((node) => {
        if (filteredPaths) {
            if (!node.isDir && filteredPaths.has(node.path)) {
                return {
                    ...node,
                    checkState: state,
                    children: node.children ? selectAllInTree(node.children, selected, filteredPaths) : undefined,
                };
            }
            if (node.children) {
                const updatedChildren = selectAllInTree(node.children, selected, filteredPaths);
                const childState = computeParentState(updatedChildren);
                return { ...node, checkState: childState, children: updatedChildren };
            }
            return node;
        }
        return {
            ...node,
            checkState: state,
            children: node.children ? selectAllInTree(node.children, selected) : undefined,
        };
    });
}

export type QuickFilter = 'source' | 'tests' | 'config' | 'docs' | 'clear';

const SOURCE_EXTENSIONS = new Set([
    'ts',
    'tsx',
    'js',
    'jsx',
    'rs',
    'py',
    'go',
    'c',
    'cpp',
    'h',
    'cs',
    'java',
    'rb',
    'swift',
    'kt',
    'scala',
    'php',
    'lua',
    'r',
    'sh',
    'bash',
]);

const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', '_test.', '_spec.'];
const CONFIG_EXTENSIONS = new Set(['json', 'toml', 'yaml', 'yml', 'env', 'ini', 'cfg']);
const CONFIG_NAMES = new Set([
    'makefile',
    'dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    '.env',
    '.env.local',
    '.env.example',
    'vite.config.ts',
    'vite.config.js',
    'webpack.config.js',
    'rollup.config.js',
    'tsconfig.json',
    'biome.json',
    'eslint.config.js',
    '.eslintrc',
    '.prettierrc',
    'cargo.toml',
    'package.json',
]);
const DOC_EXTENSIONS = new Set(['md', 'mdx', 'rst', 'txt']);

function isTestFile(node: FileTreeNode): boolean {
    const lower = node.name.toLowerCase();
    const relLower = node.relativePath.toLowerCase();
    return TEST_PATTERNS.some((p) => lower.includes(p) || relLower.includes(p));
}

function isSourceFile(node: FileTreeNode): boolean {
    if (isTestFile(node)) {
        return false;
    }
    if (CONFIG_EXTENSIONS.has(node.extension.toLowerCase())) {
        return false;
    }
    if (CONFIG_NAMES.has(node.name.toLowerCase())) {
        return false;
    }
    if (DOC_EXTENSIONS.has(node.extension.toLowerCase())) {
        return false;
    }
    return SOURCE_EXTENSIONS.has(node.extension.toLowerCase());
}

function isConfigFile(node: FileTreeNode): boolean {
    const lower = node.name.toLowerCase();
    return CONFIG_EXTENSIONS.has(node.extension.toLowerCase()) || CONFIG_NAMES.has(lower);
}

function isDocFile(node: FileTreeNode): boolean {
    return DOC_EXTENSIONS.has(node.extension.toLowerCase());
}

function getQuickFilterMatch(node: FileTreeNode, filter: QuickFilter): boolean {
    switch (filter) {
        case 'source':
            return isSourceFile(node);
        case 'tests':
            return isTestFile(node);
        case 'config':
            return isConfigFile(node);
        case 'docs':
            return isDocFile(node);
        default:
            return false;
    }
}

function getDirectoryCheckStateForFilter(
    node: FileTreeNode,
    filter: QuickFilter,
    updatedChildren?: FileTreeNode[],
): CheckState {
    if (updatedChildren) {
        return computeParentState(updatedChildren);
    }
    return filter === 'clear' ? 'unchecked' : node.checkState;
}

export function quickSelectInTree(nodes: FileTreeNode[], filter: QuickFilter): FileTreeNode[] {
    return nodes.map((node) => {
        if (node.isDir) {
            const updatedChildren = node.children ? quickSelectInTree(node.children, filter) : undefined;
            return {
                ...node,
                checkState: getDirectoryCheckStateForFilter(node, filter, updatedChildren),
                children: updatedChildren,
            };
        }

        if (filter === 'clear') {
            return { ...node, checkState: 'unchecked' };
        }
        return { ...node, checkState: getQuickFilterMatch(node, filter) ? 'checked' : 'unchecked' };
    });
}

function findNodeById(nodes: FileTreeNode[], nodeId: string): FileTreeNode | undefined {
    for (const node of nodes) {
        if (node.id === nodeId) {
            return node;
        }
        if (node.children) {
            const found = findNodeById(node.children, nodeId);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

function filterNodesByQuery(nodes: FileTreeNode[], query: string): FileTreeNode[] {
    const result: FileTreeNode[] = [];
    for (const node of nodes) {
        if (node.name.toLowerCase().includes(query) || node.relativePath.toLowerCase().includes(query)) {
            result.push({ ...node, isExpanded: true });
        } else if (node.children) {
            const filteredChildren = filterNodesByQuery(node.children, query);
            if (filteredChildren.length > 0) {
                result.push({ ...node, children: filteredChildren, isExpanded: true });
            }
        }
    }
    return result;
}

export function useFileTree() {
    const [rootNodes, setRootNodes] = useState<FileTreeNode[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedPath, setHighlightedPath] = useState<string | null>(null);

    const loadTree = useCallback((nodes: FileNode[]) => {
        setRootNodes(buildTreeNodes(nodes, 0));
    }, []);

    const toggleCheck = useCallback((nodeId: string) => {
        setRootNodes((prev) => {
            const node = findNodeById(prev, nodeId);
            const newState = node?.checkState === 'checked' ? 'unchecked' : 'checked';
            return updateCheckStateInTree(prev, nodeId, newState);
        });
    }, []);

    const toggleExpand = useCallback((nodeId: string) => {
        setRootNodes((prev) => toggleExpanded(prev, nodeId));
    }, []);

    const updateTokens = useCallback((tokenMap: Map<string, number>) => {
        setRootNodes((prev) => applyTokenMapToTree(prev, tokenMap));
    }, []);

    const selectAll = useCallback((selected: boolean, filteredPaths?: Set<string>) => {
        setRootNodes((prev) => selectAllInTree(prev, selected, filteredPaths));
    }, []);

    const quickSelect = useCallback((filter: QuickFilter) => {
        setRootNodes((prev) => quickSelectInTree(prev, filter));
    }, []);

    const filteredNodes = useMemo(
        () => (searchQuery ? filterNodesByQuery(rootNodes, searchQuery.toLowerCase()) : rootNodes),
        [rootNodes, searchQuery],
    );
    const flatItems = useMemo(() => flattenTree(filteredNodes), [filteredNodes]);
    const selectedFiles = useMemo(() => getSelectedFiles(rootNodes), [rootNodes]);

    const visibleFilePaths = useMemo(() => {
        const paths = new Set<string>();
        for (const item of flatItems) {
            if (!item.node.isDir) {
                paths.add(item.node.path);
            }
        }
        return paths;
    }, [flatItems]);

    return {
        flatItems,
        highlightedPath,
        loadTree,
        quickSelect,
        rootNodes,
        searchQuery,
        selectAll,
        selectedFiles,
        setHighlightedPath,
        setSearchQuery,
        toggleCheck,
        toggleExpand,
        updateTokens,
        visibleFilePaths,
    };
}
