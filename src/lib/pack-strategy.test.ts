import { describe, expect, it } from "bun:test";
import {
  buildOversizedFilesWarning,
  deriveAdvisoryMaxTokensPerFile,
  estimateTokens,
  evaluatePerPackAdvisory,
  findOversizedFiles,
  forecastSplitPartCounts,
  getEffectiveTokenCount,
  type PackStrategyFile,
  resolveAdvisoryMaxTokensPerFile,
  splitContentByTokenBudget,
  splitOversizedFilesForPacking,
} from "./pack-strategy";

describe("estimateTokens", () => {
  it("should return zero for empty content", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should estimate tokens from content length", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});

describe("deriveAdvisoryMaxTokensPerFile", () => {
  it("should clamp to the minimum advisory limit for small windows", () => {
    expect(deriveAdvisoryMaxTokensPerFile(10_000)).toBe(4_000);
  });

  it("should use proportional scaling in the middle range", () => {
    expect(deriveAdvisoryMaxTokensPerFile(100_000)).toBe(8_000);
  });

  it("should clamp to the maximum advisory limit for large windows", () => {
    expect(deriveAdvisoryMaxTokensPerFile(1_000_000)).toBe(20_000);
  });
});

describe("resolveAdvisoryMaxTokensPerFile", () => {
  it("should fall back to derived value for nullish or non-positive config", () => {
    expect(resolveAdvisoryMaxTokensPerFile(undefined, 100_000)).toBe(8_000);
    expect(resolveAdvisoryMaxTokensPerFile(null, 100_000)).toBe(8_000);
    expect(resolveAdvisoryMaxTokensPerFile(0, 100_000)).toBe(8_000);
    expect(resolveAdvisoryMaxTokensPerFile(-4, 100_000)).toBe(8_000);
  });

  it("should round configured values to the nearest integer", () => {
    expect(resolveAdvisoryMaxTokensPerFile(1234.4, 100_000)).toBe(1234);
    expect(resolveAdvisoryMaxTokensPerFile(1234.6, 100_000)).toBe(1235);
  });
});

describe("getEffectiveTokenCount", () => {
  it("should prefer explicit token count and clamp negatives to zero", () => {
    expect(getEffectiveTokenCount({ path: "a.ts", content: "long", tokenCount: 10 })).toBe(10);
    expect(getEffectiveTokenCount({ path: "a.ts", content: "long", tokenCount: -1 })).toBe(0);
  });

  it("should estimate when token count is missing", () => {
    expect(getEffectiveTokenCount({ path: "a.ts", content: "abcd" })).toBe(1);
  });
});

describe("findOversizedFiles", () => {
  const files: PackStrategyFile[] = [
    { path: "a.ts", content: "a".repeat(400) }, // ~100 tokens
    { path: "b.ts", content: "b".repeat(40), tokenCount: 30 },
    { path: "c.ts", content: "c".repeat(20), tokenCount: 3 },
  ];

  it("should return empty when max is non-positive", () => {
    expect(findOversizedFiles(files, 0)).toEqual([]);
  });

  it("should return only files above the advisory max", () => {
    expect(findOversizedFiles(files, 20)).toEqual([
      { path: "a.ts", tokenCount: 100 },
      { path: "b.ts", tokenCount: 30 },
    ]);
  });
});

describe("splitContentByTokenBudget", () => {
  it("should return original content when budget is non-positive", () => {
    expect(splitContentByTokenBudget("hello", 0)).toEqual(["hello"]);
  });

  it("should return original content when no split is needed", () => {
    expect(splitContentByTokenBudget("hello", 10)).toEqual(["hello"]);
  });

  it("should split at paragraph boundaries when possible", () => {
    const content = `${"a".repeat(60)}\n\n${"b".repeat(60)}`;
    const chunks = splitContentByTokenBudget(content, 20); // ~80 chars
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(content);
    expect(chunks[0].endsWith("\n\n")).toBe(true);
  });

  it("should split at line boundaries when paragraph boundaries are unavailable", () => {
    const content = `${"a".repeat(50)}\n${"b".repeat(50)}\n${"c".repeat(50)}`;
    const chunks = splitContentByTokenBudget(content, 20); // ~80 chars
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(content);
    expect(chunks.some((c) => c.endsWith("\n"))).toBe(true);
  });

  it("should hard-split long single-line content when no newline exists", () => {
    const content = "x".repeat(150);
    const chunks = splitContentByTokenBudget(content, 20); // ~80 chars
    expect(chunks.length).toBe(2);
    expect(chunks.join("")).toBe(content);
  });
});

describe("buildOversizedFilesWarning", () => {
  it("should return null when there are no oversized files", () => {
    expect(buildOversizedFilesWarning([], 10_000)).toBeNull();
  });

  it("should include examples and overflow count in warning text", () => {
    const warning = buildOversizedFilesWarning(
      [
        { path: "a.ts", tokenCount: 30_000 },
        { path: "b.ts", tokenCount: 25_000 },
        { path: "c.ts", tokenCount: 24_000 },
        { path: "d.ts", tokenCount: 23_000 },
      ],
      20_000
    );
    expect(warning).toContain("advisory per-file limit");
    expect(warning).toContain("a.ts");
    expect(warning).toContain("+1 more");
  });
});

describe("splitOversizedFilesForPacking", () => {
  it("should return unchanged files and no warnings when nothing is oversized", () => {
    const files: PackStrategyFile[] = [{ path: "ok.ts", content: "x".repeat(100), tokenCount: 20 }];
    const result = splitOversizedFilesForPacking(files, 200);
    expect(result.files).toEqual(files);
    expect(result.oversizedFiles).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.splitFileCount).toBe(0);
    expect(result.generatedPartCount).toBe(0);
  });

  it("should split oversized files into part paths and emit warnings", () => {
    const files: PackStrategyFile[] = [
      { path: "big.ts", content: "x".repeat(500), tokenCount: 200 },
      { path: "small.ts", content: "ok", tokenCount: 1 },
    ];
    const result = splitOversizedFilesForPacking(files, 60);
    expect(result.oversizedFiles).toEqual([{ path: "big.ts", tokenCount: 200 }]);
    expect(result.splitFileCount).toBe(1);
    expect(result.generatedPartCount).toBeGreaterThan(1);
    expect(result.files.some((f) => f.path.startsWith("big.ts (part "))).toBe(true);
    expect(result.files.some((f) => f.path === "small.ts")).toBe(true);
    expect(result.warnings.length).toBe(2);
  });

  it("should keep file unchanged when tokenCount is oversized but content cannot split", () => {
    const files: PackStrategyFile[] = [{ path: "weird.ts", content: "tiny", tokenCount: 999 }];
    const result = splitOversizedFilesForPacking(files, 100);
    expect(result.oversizedFiles).toEqual([{ path: "weird.ts", tokenCount: 999 }]);
    expect(result.files).toEqual(files);
    expect(result.splitFileCount).toBe(0);
    expect(result.generatedPartCount).toBe(0);
    expect(result.warnings.length).toBe(1);
  });
});

describe("forecastSplitPartCounts", () => {
  it("should return empty map when max is non-positive", () => {
    const counts = forecastSplitPartCounts([{ path: "a.ts", content: "x".repeat(100) }], 0);
    expect(counts.size).toBe(0);
  });

  it("should include only files expected to split", () => {
    const counts = forecastSplitPartCounts(
      [
        { path: "small.ts", content: "x".repeat(100), tokenCount: 20 },
        { path: "big.ts", content: "x".repeat(100), tokenCount: 205 },
      ],
      100
    );
    expect(counts.get("small.ts")).toBeUndefined();
    expect(counts.get("big.ts")).toBe(3);
  });
});

describe("evaluatePerPackAdvisory", () => {
  it("should compute ok level when well below advisory", () => {
    const status = evaluatePerPackAdvisory(8_000, 2, 10_000);
    expect(status.level).toBe("ok");
    expect(status.utilization).toBe(0.4);
    expect(status.message).toContain("Within advisory");
  });

  it("should compute warn level when near advisory", () => {
    const status = evaluatePerPackAdvisory(17_000, 2, 10_000);
    expect(status.level).toBe("warn");
    expect(status.utilization).toBe(0.85);
    expect(status.message).toContain("Approaching advisory");
  });

  it("should compute danger level when above advisory", () => {
    const status = evaluatePerPackAdvisory(24_100, 1, 10_240);
    expect(status.level).toBe("danger");
    expect(status.utilization).toBeGreaterThan(1);
    expect(status.message).toContain("Advisory exceeded");
  });

  it("should clamp invalid packs and advisory inputs to safe minimums", () => {
    const status = evaluatePerPackAdvisory(10, 0, 0);
    expect(status.advisoryMaxTokensPerFile).toBe(1);
    expect(status.avgTokensPerPack).toBe(10);
  });
});
