import type { PackItem } from "@/types";

export function buildPackFileTokenMap(
  packs: PackItem[],
  tokenMap?: Map<string, number>
): Map<string, number> {
  const fileTokenMap = new Map<string, number>();

  for (const pack of packs) {
    const knownEntries: Array<{ fp: string; tokens: number }> = [];
    const unknownPaths: string[] = [];

    for (const fp of pack.filePaths) {
      const real = tokenMap?.get(fp);
      if (real !== undefined) {
        knownEntries.push({ fp, tokens: real });
        fileTokenMap.set(fp, real);
      } else {
        unknownPaths.push(fp);
      }
    }

    if (unknownPaths.length > 0) {
      const knownTotal = knownEntries.reduce((s, e) => s + e.tokens, 0);
      const remaining = Math.max(pack.estimatedTokens - knownTotal, 0);
      const perUnknown = Math.round(remaining / unknownPaths.length);
      for (const fp of unknownPaths) {
        fileTokenMap.set(fp, perUnknown);
      }
    }
  }

  return fileTokenMap;
}
