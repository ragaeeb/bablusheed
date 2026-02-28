import { getEncoding, type TiktokenEncoding } from "js-tiktoken";
import type { WorkerMessage, WorkerResult } from "../types";

const encodingCache = new Map<string, ReturnType<typeof getEncoding>>();

function getEncoder(encoding: TiktokenEncoding) {
  const cached = encodingCache.get(encoding);
  if (cached) return cached;
  const enc = getEncoding(encoding);
  encodingCache.set(encoding, enc);
  return enc;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, requestId, files, strategy } = event.data;

  if (type === "count") {
    const results = files.map(({ path, content }) => {
      try {
        const encoding: TiktokenEncoding = strategy === "openai" ? "o200k_base" : "cl100k_base";
        // "approx" is intentionally a fast single-pass estimate, not a model-exact tokenizer.
        const tokens = getEncoder(encoding).encode(content).length;
        return { path, tokens };
      } catch {
        // Fallback: rough estimate of 4 chars per token
        return { path, tokens: Math.ceil(content.length / 4) };
      }
    });

    const result: WorkerResult = { type: "result", requestId, results };
    self.postMessage(result);
  }
};
