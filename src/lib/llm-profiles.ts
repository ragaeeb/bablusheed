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
    id: "chatgpt-5-2",
    name: "ChatGPT 5.2",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "o200k",
  },
  {
    id: "chatgpt-5-2-extended-thinking",
    name: "ChatGPT 5.2 Extended Thinking",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "o200k",
  },
  {
    id: "chatgpt-5o-thinking-mini",
    name: "ChatGPT 5o Thinking Mini",
    contextWindowTokens: 128_000,
    maxFileAttachments: 20,
    tokenizer: "o200k",
  },
  {
    id: "claude-sonnet-4-6-thinking",
    name: "Claude Sonnet 4.6 Thinking",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "gemini-3-1-pro",
    name: "Gemini 3.1 Pro",
    contextWindowTokens: 1_048_576,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "glm-5",
    name: "GLM-5",
    contextWindowTokens: 128_000,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "grok-4-20-beta",
    name: "Grok 4.20 Beta",
    contextWindowTokens: 256_000,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "grok-4-expert",
    name: "Grok 4 Expert",
    contextWindowTokens: 256_000,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "kimi-k2-5",
    name: "Kimi K2.5",
    contextWindowTokens: 128_000,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "minimax-m2-5",
    name: "MiniMax M2.5",
    contextWindowTokens: 128_000,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "nova-2-pro",
    name: "Nova 2 Pro",
    contextWindowTokens: 200_000,
    maxFileAttachments: 20,
    tokenizer: "approx",
  },
  {
    id: "qwen-3-5-plus",
    name: "Qwen 3.5 Plus",
    contextWindowTokens: 128_000,
    maxFileAttachments: 20,
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
