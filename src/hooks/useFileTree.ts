import { useCallback, useMemo, useState } from "react";
import type { CheckState, FileNode, FileTreeNode, FlatTreeItem } from "@/types";

function buildTreeNodes(nodes: FileNode[], depth: number): FileTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    checkState: "unchecked" as CheckState,
    tokenCount: 0,
    depth,
    isExpanded: depth < 2,
    children: node.children ? buildTreeNodes(node.children, depth + 1) : undefined,
  }));
}

function updateCheckStateInTree(
  nodes: FileTreeNode[],
  targetId: string,
  newState: "checked" | "unchecked"
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
      return { ...node, children: updatedChildren, checkState: childState };
    }
    return node;
  });
}

function setAllChildren(nodes: FileTreeNode[], state: "checked" | "unchecked"): FileTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    checkState: state,
    children: node.children ? setAllChildren(node.children, state) : undefined,
  }));
}

function computeParentState(children: FileTreeNode[]): CheckState {
  if (children.length === 0) return "unchecked";
  const allChecked = children.every((c) => c.checkState === "checked");
  const noneChecked = children.every((c) => c.checkState === "unchecked");
  if (allChecked) return "checked";
  if (noneChecked) return "unchecked";
  return "indeterminate";
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
      node,
      depth: node.depth,
      hasChildren: Boolean(node.children && node.children.length > 0),
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
    if (!node.isDir && node.checkState === "checked") {
      result.push(node);
    }
    if (node.children) {
      result.push(...getSelectedFiles(node.children));
    }
  }
  return result;
}

function updateTokensInTree(nodes: FileTreeNode[], tokenMap: Map<string, number>): FileTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    tokenCount: tokenMap.get(node.path) ?? node.tokenCount,
    children: node.children ? updateTokensInTree(node.children, tokenMap) : undefined,
  }));
}

function selectAllInTree(
  nodes: FileTreeNode[],
  selected: boolean,
  filteredPaths?: Set<string>
): FileTreeNode[] {
  const state: "checked" | "unchecked" = selected ? "checked" : "unchecked";
  return nodes.map((node) => {
    if (filteredPaths) {
      // Only toggle files whose paths are in the filtered set
      if (!node.isDir && filteredPaths.has(node.path)) {
        return {
          ...node,
          checkState: state,
          children: node.children
            ? selectAllInTree(node.children, selected, filteredPaths)
            : undefined,
        };
      }
      if (node.children) {
        const updatedChildren = selectAllInTree(node.children, selected, filteredPaths);
        const childState = computeParentState(updatedChildren);
        return { ...node, children: updatedChildren, checkState: childState };
      }
      return node;
    }
    // No filter: select all
    return {
      ...node,
      checkState: state,
      children: node.children ? selectAllInTree(node.children, selected) : undefined,
    };
  });
}

/** Quick-select filter types */
export type QuickFilter = "source" | "tests" | "config" | "docs" | "clear";

const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "rs",
  "py",
  "go",
  "c",
  "cpp",
  "h",
  "cs",
  "java",
  "rb",
  "swift",
  "kt",
  "scala",
  "php",
  "lua",
  "r",
  "sh",
  "bash",
]);

const TEST_PATTERNS = [".test.", ".spec.", "__tests__", "_test.", "_spec."];
const CONFIG_EXTENSIONS = new Set(["json", "toml", "yaml", "yml", "env", "ini", "cfg"]);
const CONFIG_NAMES = new Set([
  "makefile",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".env",
  ".env.local",
  ".env.example",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "rollup.config.js",
  "tsconfig.json",
  "biome.json",
  "eslint.config.js",
  ".eslintrc",
  ".prettierrc",
  "cargo.toml",
  "package.json",
]);
const DOC_EXTENSIONS = new Set(["md", "mdx", "rst", "txt"]);

function isTestFile(node: FileTreeNode): boolean {
  const lower = node.name.toLowerCase();
  const relLower = node.relativePath.toLowerCase();
  return TEST_PATTERNS.some((p) => lower.includes(p) || relLower.includes(p));
}

function isSourceFile(node: FileTreeNode): boolean {
  if (isTestFile(node)) return false;
  if (CONFIG_EXTENSIONS.has(node.extension.toLowerCase())) return false;
  if (CONFIG_NAMES.has(node.name.toLowerCase())) return false;
  if (DOC_EXTENSIONS.has(node.extension.toLowerCase())) return false;
  return SOURCE_EXTENSIONS.has(node.extension.toLowerCase());
}

function isConfigFile(node: FileTreeNode): boolean {
  const lower = node.name.toLowerCase();
  return CONFIG_EXTENSIONS.has(node.extension.toLowerCase()) || CONFIG_NAMES.has(lower);
}

function isDocFile(node: FileTreeNode): boolean {
  return DOC_EXTENSIONS.has(node.extension.toLowerCase());
}

function quickSelectInTree(nodes: FileTreeNode[], filter: QuickFilter): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.isDir) {
      const updatedChildren = node.children ? quickSelectInTree(node.children, filter) : undefined;
      const childState = updatedChildren ? computeParentState(updatedChildren) : node.checkState;
      return { ...node, children: updatedChildren, checkState: childState };
    }

    let shouldSelect = false;
    if (filter === "clear") {
      shouldSelect = false;
    } else if (filter === "source") {
      shouldSelect = isSourceFile(node);
    } else if (filter === "tests") {
      shouldSelect = isTestFile(node);
    } else if (filter === "config") {
      shouldSelect = isConfigFile(node);
    } else if (filter === "docs") {
      shouldSelect = isDocFile(node);
    }

    if (filter === "clear") {
      return { ...node, checkState: "unchecked" };
    }

    // Additive: only select, don't deselect already-selected files
    if (shouldSelect) {
      return { ...node, checkState: "checked" };
    }
    return node;
  });
}

export function useFileTree() {
  const [rootNodes, setRootNodes] = useState<FileTreeNode[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);

  // 3f: removed tokenMap parameter — tokens are set via updateTokens
  const loadTree = useCallback((nodes: FileNode[]) => {
    setRootNodes(buildTreeNodes(nodes, 0));
  }, []);

  const toggleCheck = useCallback((nodeId: string) => {
    setRootNodes((prev) => {
      const findNode = (nodes: FileTreeNode[]): FileTreeNode | undefined => {
        for (const n of nodes) {
          if (n.id === nodeId) return n;
          if (n.children) {
            const found = findNode(n.children);
            if (found) return found;
          }
        }
        return undefined;
      };
      const node = findNode(prev);
      const newState = node?.checkState === "checked" ? "unchecked" : "checked";
      return updateCheckStateInTree(prev, nodeId, newState);
    });
  }, []);

  const toggleExpand = useCallback((nodeId: string) => {
    setRootNodes((prev) => toggleExpanded(prev, nodeId));
  }, []);

  const updateTokens = useCallback((tokenMap: Map<string, number>) => {
    setRootNodes((prev) => updateTokensInTree(prev, tokenMap));
  }, []);

  // 3q: selectAll accepts optional filteredPaths to only toggle visible items
  const selectAll = useCallback((selected: boolean, filteredPaths?: Set<string>) => {
    setRootNodes((prev) => selectAllInTree(prev, selected, filteredPaths));
  }, []);

  const quickSelect = useCallback((filter: QuickFilter) => {
    setRootNodes((prev) => quickSelectInTree(prev, filter));
  }, []);

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return rootNodes;

    const query = searchQuery.toLowerCase();

    function filterNodes(nodes: FileTreeNode[]): FileTreeNode[] {
      const result: FileTreeNode[] = [];
      for (const node of nodes) {
        if (
          node.name.toLowerCase().includes(query) ||
          node.relativePath.toLowerCase().includes(query)
        ) {
          result.push({ ...node, isExpanded: true });
        } else if (node.children) {
          const filteredChildren = filterNodes(node.children);
          if (filteredChildren.length > 0) {
            result.push({ ...node, children: filteredChildren, isExpanded: true });
          }
        }
      }
      return result;
    }

    return filterNodes(rootNodes);
  }, [rootNodes, searchQuery]);

  const flatItems = useMemo(() => flattenTree(filteredNodes), [filteredNodes]);
  const selectedFiles = useMemo(() => getSelectedFiles(rootNodes), [rootNodes]);

  // Compute set of visible file paths for filtered selectAll
  const visibleFilePaths = useMemo(() => {
    const paths = new Set<string>();
    function collectPaths(items: FlatTreeItem[]) {
      for (const item of items) {
        if (!item.node.isDir) {
          paths.add(item.node.path);
        }
      }
    }
    collectPaths(flatItems);
    return paths;
  }, [flatItems]);

  return {
    rootNodes,
    flatItems,
    selectedFiles,
    searchQuery,
    highlightedPath,
    visibleFilePaths,
    loadTree,
    toggleCheck,
    toggleExpand,
    updateTokens,
    selectAll,
    quickSelect,
    setSearchQuery,
    setHighlightedPath,
  };
}
