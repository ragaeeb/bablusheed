export const APPROX_CHARS_PER_TOKEN = 4;

export function estimateApproxTokens(content: string): number {
    if (content.length === 0) {
        return 0;
    }

    return Math.max(Math.ceil(content.length / APPROX_CHARS_PER_TOKEN), 1);
}
