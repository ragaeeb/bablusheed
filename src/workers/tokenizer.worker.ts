import { getEncoding, type TiktokenEncoding } from "js-tiktoken";
import { estimateApproxTokens } from "../lib/token-estimation";
import type { WorkerMessage, WorkerResult } from "../types";

const encodingCache = new Map<string, ReturnType<typeof getEncoding>>();

function getEncoder(encoding: TiktokenEncoding) {
  const cached = encodingCache.get(encoding);
  if (cached) {
    return cached;
  }
  const enc = getEncoding(encoding);
  encodingCache.set(encoding, enc);
  return enc;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, requestId, files, strategy } = event.data;

  if (type === "count") {
    const results = files.map(({ path, content }) => {
      try {
        if (strategy === "approx") {
          return { path, tokens: estimateApproxTokens(content) };
        }

        const encoding: TiktokenEncoding = "o200k_base";
        return { path, tokens: getEncoder(encoding).encode(content).length };
      } catch {
        // Fallback: rough estimate of 4 chars per token
        return { path, tokens: estimateApproxTokens(content) };
      }
    });

    const result: WorkerResult = { requestId, results, type: "result" };
    self.postMessage(result);
  }
};
