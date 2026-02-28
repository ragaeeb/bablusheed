export interface PackStrategyFile {
  path: string;
  content: string;
  tokenCount?: number;
}

export interface OversizedFileInfo {
  path: string;
  tokenCount: number;
}

export interface PackStrategyResult {
  files: PackStrategyFile[];
  oversizedFiles: OversizedFileInfo[];
  warnings: string[];
  advisoryMaxTokensPerFile: number;
  splitFileCount: number;
  generatedPartCount: number;
}

export interface PerPackAdvisoryStatus {
  avgTokensPerPack: number;
  advisoryMaxTokensPerFile: number;
  utilization: number;
  level: "ok" | "warn" | "danger";
  message: string;
}

const MIN_ADVISORY_TOKENS_PER_FILE = 4_000;
const MAX_ADVISORY_TOKENS_PER_FILE = 20_000;
const ADVISORY_WINDOW_RATIO = 0.08;
const APPROX_CHARS_PER_TOKEN = 4;
const MIN_BREAK_SCAN_RATIO = 0.35;
const ADVISORY_WARN_RATIO = 0.85;

function formatCompactTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toString();
}

export function estimateTokens(content: string): number {
  if (content.length === 0) return 0;
  return Math.max(Math.ceil(content.length / APPROX_CHARS_PER_TOKEN), 1);
}

export function deriveAdvisoryMaxTokensPerFile(contextWindowTokens: number): number {
  const scaled = Math.round(contextWindowTokens * ADVISORY_WINDOW_RATIO);
  return Math.min(MAX_ADVISORY_TOKENS_PER_FILE, Math.max(MIN_ADVISORY_TOKENS_PER_FILE, scaled));
}

export function resolveAdvisoryMaxTokensPerFile(
  configuredValue: number | null | undefined,
  contextWindowTokens: number
): number {
  if (configuredValue === null || configuredValue === undefined || configuredValue <= 0) {
    return deriveAdvisoryMaxTokensPerFile(contextWindowTokens);
  }
  return Math.max(1, Math.round(configuredValue));
}

export function getEffectiveTokenCount(file: PackStrategyFile): number {
  if (file.tokenCount !== undefined) return Math.max(0, file.tokenCount);
  return estimateTokens(file.content);
}

function getExpectedPartCount(file: PackStrategyFile, maxTokensPerFile: number): number {
  const tokens = getEffectiveTokenCount(file);
  if (tokens <= maxTokensPerFile) return 1;
  return Math.max(2, Math.ceil(tokens / Math.max(1, maxTokensPerFile)));
}

export function findOversizedFiles(
  files: PackStrategyFile[],
  maxTokensPerFile: number
): OversizedFileInfo[] {
  if (maxTokensPerFile <= 0) return [];
  return files
    .map((file) => ({
      path: file.path,
      tokenCount: getEffectiveTokenCount(file),
    }))
    .filter((entry) => entry.tokenCount > maxTokensPerFile);
}

export function splitContentByTokenBudget(content: string, maxTokensPerFile: number): string[] {
  if (maxTokensPerFile <= 0) return [content];
  const maxCharsPerChunk = Math.max(1, maxTokensPerFile * APPROX_CHARS_PER_TOKEN);
  if (content.length <= maxCharsPerChunk) return [content];

  const minBreakOffset = Math.floor(maxCharsPerChunk * MIN_BREAK_SCAN_RATIO);
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    let splitAt = Math.min(cursor + maxCharsPerChunk, content.length);

    if (splitAt < content.length) {
      const lastParagraphBreak = content.lastIndexOf("\n\n", splitAt);
      const lastLineBreak = content.lastIndexOf("\n", splitAt);

      if (lastParagraphBreak >= cursor + minBreakOffset) {
        splitAt = lastParagraphBreak + 2;
      } else if (lastLineBreak >= cursor + minBreakOffset) {
        splitAt = lastLineBreak + 1;
      }
    }

    chunks.push(content.slice(cursor, splitAt));
    cursor = splitAt;
  }

  return chunks;
}

function toPartPath(path: string, partIndex: number, partCount: number): string {
  const slashIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const dir = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;

  const dotIndex = fileName.lastIndexOf(".");
  const suffix = `.part-${partIndex + 1}-of-${partCount}`;
  if (dotIndex <= 0) {
    return `${dir}${fileName}${suffix}`;
  }
  return `${dir}${fileName.slice(0, dotIndex)}${suffix}${fileName.slice(dotIndex)}`;
}

export function buildOversizedFilesWarning(
  oversizedFiles: OversizedFileInfo[],
  maxTokensPerFile: number
): string | null {
  if (oversizedFiles.length === 0) return null;
  const examples = oversizedFiles
    .slice(0, 3)
    .map((f) => `${f.path} (~${formatCompactTokenCount(f.tokenCount)})`)
    .join(", ");
  const more = oversizedFiles.length > 3 ? ` +${oversizedFiles.length - 3} more` : "";
  return (
    `Some files exceed the advisory per-file limit of ${formatCompactTokenCount(maxTokensPerFile)} tokens. ` +
    `Large single files can reduce LLM reliability and increase hallucination risk. ` +
    `Consider selecting fewer files. ` +
    `Oversized: ${examples}${more}.`
  );
}

export function splitOversizedFilesForPacking(
  files: PackStrategyFile[],
  maxTokensPerFile: number
): PackStrategyResult {
  const advisoryMaxTokensPerFile = Math.max(1, maxTokensPerFile);
  const oversizedFiles = findOversizedFiles(files, advisoryMaxTokensPerFile);

  if (oversizedFiles.length === 0) {
    return {
      files,
      oversizedFiles,
      warnings: [],
      advisoryMaxTokensPerFile,
      splitFileCount: 0,
      generatedPartCount: 0,
    };
  }

  const oversizedByPath = new Map(oversizedFiles.map((f) => [f.path, f.tokenCount]));
  const transformedFiles: PackStrategyFile[] = [];
  let splitFileCount = 0;
  let generatedPartCount = 0;

  for (const file of files) {
    const tokenCount = oversizedByPath.get(file.path);
    if (tokenCount === undefined) {
      transformedFiles.push(file);
      continue;
    }

    const chunks = splitContentByTokenBudget(file.content, advisoryMaxTokensPerFile);
    if (chunks.length <= 1) {
      transformedFiles.push(file);
      continue;
    }

    splitFileCount += 1;
    generatedPartCount += chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      transformedFiles.push({
        path: toPartPath(file.path, i, chunks.length),
        content: chunks[i],
      });
    }
  }

  const warnings: string[] = [];
  const oversizedWarning = buildOversizedFilesWarning(oversizedFiles, advisoryMaxTokensPerFile);
  if (oversizedWarning) warnings.push(oversizedWarning);
  if (splitFileCount > 0) {
    warnings.push(
      `Auto-balance enabled: split ${splitFileCount} oversized file(s) into ${generatedPartCount} part(s) to better balance pack sizes.`
    );
  }

  return {
    files: transformedFiles,
    oversizedFiles,
    warnings,
    advisoryMaxTokensPerFile,
    splitFileCount,
    generatedPartCount,
  };
}

export function forecastSplitPartCounts(
  files: PackStrategyFile[],
  maxTokensPerFile: number
): Map<string, number> {
  const partCounts = new Map<string, number>();
  if (maxTokensPerFile <= 0) return partCounts;

  for (const file of files) {
    const expected = getExpectedPartCount(file, maxTokensPerFile);
    if (expected > 1) {
      partCounts.set(file.path, expected);
    }
  }

  return partCounts;
}

export function evaluatePerPackAdvisory(
  totalTokens: number,
  numPacks: number,
  advisoryMaxTokensPerFile: number
): PerPackAdvisoryStatus {
  const safePacks = Math.max(1, numPacks);
  const safeAdvisoryMax = Math.max(1, advisoryMaxTokensPerFile);
  const avgTokensPerPack = totalTokens / safePacks;
  const utilization = avgTokensPerPack / safeAdvisoryMax;

  let level: PerPackAdvisoryStatus["level"] = "ok";
  if (utilization >= 1) level = "danger";
  else if (utilization >= ADVISORY_WARN_RATIO) level = "warn";

  const message =
    level === "danger"
      ? "Advisory exceeded: average tokens per pack are above the recommended per-file budget. Increase packs or select fewer files."
      : level === "warn"
        ? "Approaching advisory limit: average tokens per pack are close to the recommended per-file budget."
        : "Within advisory: average tokens per pack are under the recommended per-file budget.";

  return {
    avgTokensPerPack,
    advisoryMaxTokensPerFile: safeAdvisoryMax,
    utilization,
    level,
    message,
  };
}
