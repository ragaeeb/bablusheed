import type { PackOptions } from "@/types";

export const DEFAULT_CUSTOM_IGNORE_PATTERNS = ["**/__mocks__/**"];
export const LEGACY_DEFAULT_TEST_IGNORE_PATTERNS = ["**/*.test.ts", "**/*.spec.*"];

export const DEFAULT_CUSTOM_IGNORE_PATTERNS_TEXT = DEFAULT_CUSTOM_IGNORE_PATTERNS.join("\n");

function toPatternLines(patternText: string): string[] {
  return patternText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function migrateCustomIgnorePatterns(patternText: string): string {
  const lines = toPatternLines(patternText);
  const hasLegacyDefaultTestPatterns = LEGACY_DEFAULT_TEST_IGNORE_PATTERNS.every((pattern) =>
    lines.includes(pattern),
  );

  if (!hasLegacyDefaultTestPatterns) {
    return lines.join("\n");
  }

  return lines
    .filter((line) => !LEGACY_DEFAULT_TEST_IGNORE_PATTERNS.includes(line))
    .join("\n");
}

export function normalizeSavedPackOptions(
  savedPackOptions: PackOptions | null | undefined,
  defaults: PackOptions,
): PackOptions {
  const merged = { ...defaults, ...savedPackOptions };
  merged.customIgnorePatterns = migrateCustomIgnorePatterns(merged.customIgnorePatterns);

  if (merged.outputFormat !== "markdown" && merged.outputFormat !== "plaintext") {
    merged.outputFormat = "markdown";
  }

  return merged;
}
