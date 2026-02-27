import { useCallback, useMemo, useState } from "react";
import type { CheckState, FileNode, FileTreeNode, FlatTreeItem } from "@/types";

function buildTreeNodes(
  nodes: FileNode[],
  depth: number,
  tokenMap: Map<string, number>
): FileTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    checkState: "unchecked" as CheckState,
    tokenCount: tokenMap.get(node.path) ?? 0,
    depth,
    isExpanded: depth < 2,
    children: node.children ? buildTreeNodes(node.children, depth + 1, tokenMap) : undefined,
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

function selectAllInTree(nodes: FileTreeNode[], selected: boolean): FileTreeNode[] {
  const state: "checked" | "unchecked" = selected ? "checked" : "unchecked";
  return nodes.map((node) => ({
    ...node,
    checkState: state,
    children: node.children ? selectAllInTree(node.children, selected) : undefined,
  }));
}

export function useFileTree() {
  const [rootNodes, setRootNodes] = useState<FileTreeNode[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);

  const loadTree = useCallback((nodes: FileNode[], tokenMap: Map<string, number> = new Map()) => {
    setRootNodes(buildTreeNodes(nodes, 0, tokenMap));
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

  const selectAll = useCallback((selected: boolean) => {
    setRootNodes((prev) => selectAllInTree(prev, selected));
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

  return {
    rootNodes,
    flatItems,
    selectedFiles,
    searchQuery,
    highlightedPath,
    loadTree,
    toggleCheck,
    toggleExpand,
    updateTokens,
    selectAll,
    setSearchQuery,
    setHighlightedPath,
  };
}
