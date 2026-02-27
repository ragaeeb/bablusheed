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
  const { type, files, encoding } = event.data;

  if (type === "count") {
    const enc = getEncoder(encoding);
    const results = files.map(({ path, content }) => {
      try {
        const tokens = enc.encode(content).length;
        return { path, tokens };
      } catch {
        // Fallback: rough estimate of 4 chars per token
        return { path, tokens: Math.ceil(content.length / 4) };
      }
    });

    const result: WorkerResult = { type: "result", results };
    self.postMessage(result);
  }
};
