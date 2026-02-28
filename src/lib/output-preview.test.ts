import { describe, expect, it } from "bun:test";
import { buildPackFileTokenMap } from "./output-preview";

describe("buildPackFileTokenMap", () => {
  it("should use exact provided token values when keys match output file paths", () => {
    const packs = [
      {
        index: 0,
        content: "",
        estimatedTokens: 5300,
        fileCount: 6,
        filePaths: ["app.json", "a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
      },
    ];

    const real = new Map<string, number>([
      ["app.json", 879],
      ["a.ts", 500],
      ["b.ts", 900],
      ["c.ts", 1000],
      ["d.ts", 1200],
      ["e.ts", 821],
    ]);

    const out = buildPackFileTokenMap(packs, real);
    expect(out.get("app.json")).toBe(879);
    expect(out.get("a.ts")).toBe(500);
    expect(out.get("b.ts")).toBe(900);
    expect(out.get("c.ts")).toBe(1000);
    expect(out.get("d.ts")).toBe(1200);
    expect(out.get("e.ts")).toBe(821);
  });

  it("should distribute remaining tokens only for unknown files", () => {
    const packs = [
      {
        index: 0,
        content: "",
        estimatedTokens: 100,
        fileCount: 4,
        filePaths: ["a.ts", "b.ts", "c.ts", "d.ts"],
      },
    ];
    const real = new Map<string, number>([
      ["a.ts", 10],
      ["b.ts", 20],
    ]);

    const out = buildPackFileTokenMap(packs, real);
    expect(out.get("a.ts")).toBe(10);
    expect(out.get("b.ts")).toBe(20);
    expect(out.get("c.ts")).toBe(35);
    expect(out.get("d.ts")).toBe(35);
  });

  it("should assign equal fallback when no per-file token map is provided", () => {
    const packs = [
      {
        index: 0,
        content: "",
        estimatedTokens: 90,
        fileCount: 3,
        filePaths: ["a.ts", "b.ts", "c.ts"],
      },
    ];

    const out = buildPackFileTokenMap(packs);
    expect(out.get("a.ts")).toBe(30);
    expect(out.get("b.ts")).toBe(30);
    expect(out.get("c.ts")).toBe(30);
  });

  it("should clamp unknown distribution to zero when known total exceeds pack estimate", () => {
    const packs = [
      {
        index: 0,
        content: "",
        estimatedTokens: 10,
        fileCount: 2,
        filePaths: ["a.ts", "b.ts"],
      },
    ];
    const real = new Map<string, number>([["a.ts", 20]]);

    const out = buildPackFileTokenMap(packs, real);
    expect(out.get("a.ts")).toBe(20);
    expect(out.get("b.ts")).toBe(0);
  });
});
