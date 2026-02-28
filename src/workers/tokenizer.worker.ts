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
        const tokens =
          strategy === "openai"
            ? getEncoder("o200k_base").encode(content).length
            : Math.max(
                getEncoder("cl100k_base").encode(content).length,
                getEncoder("o200k_base").encode(content).length
              );
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
