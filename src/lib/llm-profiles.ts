export interface LLMProfile {
  id: string;
  name: string;
  contextWindowTokens: number;
  maxFileAttachments: number;
  tokensPerFile?: number;
  tokenizer: "cl100k" | "o200k" | "gemini" | "claude";
}

export const LLM_PROFILES: LLMProfile[] = [
  {
    id: "claude-opus-4",
    name: "Anthropic Claude (Opus 4)",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "claude",
  },
  {
    id: "claude-sonnet-4",
    name: "Anthropic Claude (Sonnet 4)",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "claude",
  },
  {
    id: "gemini-2-5-pro",
    name: "Google Gemini 2.5 Pro",
    contextWindowTokens: 1_048_576,
    maxFileAttachments: 20,
    tokenizer: "gemini",
  },
  {
    id: "gemini-2-0-flash",
    name: "Google Gemini 2.0 Flash",
    contextWindowTokens: 1_048_576,
    maxFileAttachments: 20,
    tokenizer: "gemini",
  },
  {
    id: "chatgpt-4o",
    name: "OpenAI ChatGPT-4o",
    contextWindowTokens: 128_000,
    maxFileAttachments: 20,
    tokenizer: "o200k",
  },
  {
    id: "chatgpt-o3",
    name: "OpenAI o3",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "o200k",
  },
  {
    id: "chatgpt-o4-mini",
    name: "OpenAI o4-mini",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "o200k",
  },
];

export function getProfile(id: string): LLMProfile {
  return LLM_PROFILES.find((p) => p.id === id) ?? LLM_PROFILES[0];
}

export function getTokenizerEncoding(
  tokenizer: LLMProfile["tokenizer"]
): "cl100k_base" | "o200k_base" {
  if (tokenizer === "o200k") {
    return "o200k_base";
  }
  return "cl100k_base";
}

export function isApproximateTokenizer(tokenizer: LLMProfile["tokenizer"]): boolean {
  return tokenizer === "claude" || tokenizer === "gemini";
}
