import { describe, expect, it } from "bun:test";
import { applyTokenMapToTree } from "@/hooks/useFileTree";
import type { FileTreeNode } from "@/types";

describe("applyTokenMapToTree", () => {
  it("should update matching file tokens recursively", () => {
    const tree: FileTreeNode[] = [
      {
        id: "root",
        path: "/project/src",
        relativePath: "src",
        name: "src",
        extension: "",
        size: 0,
        isDir: true,
        depth: 0,
        isExpanded: true,
        checkState: "unchecked",
        tokenCount: 0,
        children: [
          {
            id: "file-a",
            path: "/project/src/a.ts",
            relativePath: "src/a.ts",
            name: "a.ts",
            extension: "ts",
            size: 10,
            isDir: false,
            depth: 1,
            isExpanded: false,
            checkState: "checked",
            tokenCount: 12,
          },
        ],
      },
    ];

    const updated = applyTokenMapToTree(tree, new Map([["/project/src/a.ts", 42]]));

    expect(updated[0].children?.[0].tokenCount).toBe(42);
  });

  it("should clear stale token counts for files missing from the token map", () => {
    const tree: FileTreeNode[] = [
      {
        id: "file-a",
        path: "/project/src/a.ts",
        relativePath: "src/a.ts",
        name: "a.ts",
        extension: "ts",
        size: 10,
        isDir: false,
        depth: 0,
        isExpanded: false,
        checkState: "checked",
        tokenCount: 99,
      },
    ];

    const updated = applyTokenMapToTree(tree, new Map());

    expect(updated[0].tokenCount).toBe(0);
  });
});
