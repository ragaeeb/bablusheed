import { describe, expect, it } from "bun:test";
import type { PackOptions } from "@/types";
import {
  DEFAULT_CUSTOM_IGNORE_PATTERNS,
  migrateCustomIgnorePatterns,
  normalizeSavedPackOptions,
} from "@/lib/pack-options";

describe("DEFAULT_CUSTOM_IGNORE_PATTERNS", () => {
  it("should not exclude colocated test files by default", () => {
    expect(DEFAULT_CUSTOM_IGNORE_PATTERNS).not.toContain("**/*.test.ts");
    expect(DEFAULT_CUSTOM_IGNORE_PATTERNS).not.toContain("**/*.spec.*");
  });

  it("should still exclude mock directories by default", () => {
    expect(DEFAULT_CUSTOM_IGNORE_PATTERNS).toContain("**/__mocks__/**");
  });
});

describe("migrateCustomIgnorePatterns", () => {
  it("should remove legacy default test ignore patterns from saved settings", () => {
    expect(
      migrateCustomIgnorePatterns("**/*.test.ts\n**/*.spec.*\n**/__mocks__/**"),
    ).toBe("**/__mocks__/**");
  });

  it("should preserve custom ignore patterns while removing legacy default test patterns", () => {
    expect(
      migrateCustomIgnorePatterns("**/*.test.ts\n dist/** \n**/*.spec.*\n**/__mocks__/**"),
    ).toBe("dist/**\n**/__mocks__/**");
  });

  it("should preserve a custom test ignore rule when the full legacy pair is not present", () => {
    expect(migrateCustomIgnorePatterns("**/*.test.ts\ncoverage/**")).toBe(
      "**/*.test.ts\ncoverage/**",
    );
  });
});

describe("normalizeSavedPackOptions", () => {
  it("should migrate legacy saved ignore defaults during settings load", () => {
    const defaults: PackOptions = {
      astDeadCode: false,
      customIgnorePatterns: "**/__mocks__/**",
      entryPoint: null,
      maxTokensPerPackFile: 0,
      minifyMarkdown: true,
      numPacks: 3,
      outputFormat: "markdown",
      reduceWhitespace: true,
      respectGitignore: true,
      stripComments: true,
      stripMarkdownBlockquotes: false,
      stripMarkdownHeadings: false,
    };

    const saved: PackOptions = {
      ...defaults,
      customIgnorePatterns: "**/*.test.ts\n**/*.spec.*\n**/__mocks__/**",
    };

    expect(normalizeSavedPackOptions(saved, defaults).customIgnorePatterns).toBe("**/__mocks__/**");
  });
});
