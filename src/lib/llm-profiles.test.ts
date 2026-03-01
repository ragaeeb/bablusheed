import { describe, expect, it } from "bun:test";
import {
  LLM_PROFILES,
  getProfile,
  getTokenizerEncoding,
  isApproximateTokenizer,
} from "./llm-profiles";

describe("getProfile", () => {
  it("should return the profile matching the given id", () => {
    const profile = getProfile("chatgpt-5-2");
    expect(profile.id).toBe("chatgpt-5-2");
    expect(profile.name).toBe("ChatGPT 5.2");
  });

  it("should return the first profile as fallback for unknown id", () => {
    const profile = getProfile("nonexistent-model");
    expect(profile).toBe(LLM_PROFILES[0]);
  });

  it("should return the first profile for empty string", () => {
    const profile = getProfile("");
    expect(profile).toBe(LLM_PROFILES[0]);
  });

  it("should find every known profile by its id", () => {
    for (const expected of LLM_PROFILES) {
      const found = getProfile(expected.id);
      expect(found.id).toBe(expected.id);
      expect(found.name).toBe(expected.name);
    }
  });
});

describe("getTokenizerEncoding", () => {
  it("should return 'openai' for o200k tokenizer", () => {
    expect(getTokenizerEncoding("o200k")).toBe("openai");
  });

  it("should return 'approx' for approx tokenizer", () => {
    expect(getTokenizerEncoding("approx")).toBe("approx");
  });
});

describe("isApproximateTokenizer", () => {
  it("should return true for approx tokenizer", () => {
    expect(isApproximateTokenizer("approx")).toBe(true);
  });

  it("should return false for o200k tokenizer", () => {
    expect(isApproximateTokenizer("o200k")).toBe(false);
  });
});

describe("LLM_PROFILES", () => {
  it("should have unique ids", () => {
    const ids = LLM_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have positive context window tokens for all profiles", () => {
    for (const profile of LLM_PROFILES) {
      expect(profile.contextWindowTokens).toBeGreaterThan(0);
    }
  });

  it("should have positive max file attachments for all profiles", () => {
    for (const profile of LLM_PROFILES) {
      expect(profile.maxFileAttachments).toBeGreaterThan(0);
    }
  });

  it("should have valid tokenizer values", () => {
    const validTokenizers = new Set(["o200k", "approx"]);
    for (const profile of LLM_PROFILES) {
      expect(validTokenizers.has(profile.tokenizer)).toBe(true);
    }
  });
});
