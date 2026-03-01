export interface LLMProfile {
  id: string;
  name: string;
  contextWindowTokens: number;
  maxFileAttachments: number;
  tokensPerFile?: number;
  tokenizer: "o200k" | "approx";
}

export const LLM_PROFILES: LLMProfile[] = [
  {
    contextWindowTokens: 200_000,
    id: "chatgpt-5-2",
    maxFileAttachments: 20,
    name: "ChatGPT 5.2",
    tokenizer: "o200k",
  },
  {
    contextWindowTokens: 200_000,
    id: "chatgpt-5-2-extended-thinking",
    maxFileAttachments: 20,
    name: "ChatGPT 5.2 Extended Thinking",
    tokenizer: "o200k",
  },
  {
    contextWindowTokens: 128_000,
    id: "chatgpt-5o-thinking-mini",
    maxFileAttachments: 20,
    name: "ChatGPT 5o Thinking Mini",
    tokenizer: "o200k",
  },
  {
    contextWindowTokens: 200_000,
    id: "claude-sonnet-4-6-thinking",
    maxFileAttachments: 20,
    name: "Claude Sonnet 4.6 Thinking",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 1_048_576,
    id: "gemini-3-1-pro",
    maxFileAttachments: 20,
    name: "Gemini 3.1 Pro",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 128_000,
    id: "glm-5",
    maxFileAttachments: 20,
    name: "GLM-5",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 256_000,
    id: "grok-4-20-beta",
    maxFileAttachments: 20,
    name: "Grok 4.20 Beta",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 256_000,
    id: "grok-4-expert",
    maxFileAttachments: 20,
    name: "Grok 4 Expert",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 128_000,
    id: "kimi-k2-5",
    maxFileAttachments: 20,
    name: "Kimi K2.5",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 128_000,
    id: "minimax-m2-5",
    maxFileAttachments: 20,
    name: "MiniMax M2.5",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 200_000,
    id: "nova-2-pro",
    maxFileAttachments: 20,
    name: "Nova 2 Pro",
    tokenizer: "approx",
  },
  {
    contextWindowTokens: 128_000,
    id: "qwen-3-5-plus",
    maxFileAttachments: 20,
    name: "Qwen 3.5 Plus",
    tokenizer: "approx",
  },
];

export function getProfile(id: string): LLMProfile {
  return LLM_PROFILES.find((p) => p.id === id) ?? LLM_PROFILES[0];
}

export function getTokenizerEncoding(tokenizer: LLMProfile["tokenizer"]): "openai" | "approx" {
  if (tokenizer === "o200k") return "openai";
  return "approx";
}

export function isApproximateTokenizer(tokenizer: LLMProfile["tokenizer"]): boolean {
  return tokenizer === "approx";
}
