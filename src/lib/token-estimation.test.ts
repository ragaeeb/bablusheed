import { describe, expect, it } from 'bun:test';
import { APPROX_CHARS_PER_TOKEN, estimateApproxTokens } from '@/lib/token-estimation';

describe('estimateApproxTokens', () => {
    it('should return zero for empty content', () => {
        expect(estimateApproxTokens('')).toBe(0);
    });

    it('should round up partial token buckets', () => {
        expect(estimateApproxTokens('a'.repeat(APPROX_CHARS_PER_TOKEN))).toBe(1);
        expect(estimateApproxTokens('a'.repeat(APPROX_CHARS_PER_TOKEN + 1))).toBe(2);
        expect(estimateApproxTokens('a'.repeat(APPROX_CHARS_PER_TOKEN * 2 - 1))).toBe(2);
    });
});
