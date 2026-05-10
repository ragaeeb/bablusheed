/**
 * Suggestion calculation logic for TokenBar component.
 * Extracted to reduce cognitive complexity.
 */

import { formatTokenCount } from '@/lib/utils';
import type { PackOptions } from '@/types';

export type Suggestion = {
    label: string;
    action: () => void;
};

/**
 * Calculate token savings from stripping comments.
 */
function calculateCommentSavings(usedTokens: number): number {
    // Rough estimate: comments are ~15% of code
    return Math.round(usedTokens * 0.15);
}

/**
 * Calculate token savings from minifying markdown.
 */
function calculateMarkdownSavings(selectedFilePaths: string[], tokenMap: Map<string, number>): number {
    const mdTokens = selectedFilePaths
        .filter((p) => p.endsWith('.md') || p.endsWith('.mdx'))
        .reduce((sum, p) => sum + (tokenMap.get(p) ?? 0), 0);
    // Rough estimate: markdown minification saves ~30%
    return Math.round(mdTokens * 0.3);
}

/**
 * Calculate token savings from deselecting heaviest files.
 */
function calculateDeselectSavings(selectedFilePaths: string[], tokenMap: Map<string, number>, count: number): number {
    const sorted = [...selectedFilePaths].sort((a, b) => (tokenMap.get(b) ?? 0) - (tokenMap.get(a) ?? 0));
    let savings = 0;
    for (let i = 0; i < Math.min(count, sorted.length); i++) {
        savings += tokenMap.get(sorted[i]) ?? 0;
    }
    return savings;
}

/**
 * Generate actionable suggestions when token usage is over threshold.
 */
export function generateSuggestions(
    isWarning: boolean,
    usedTokens: number,
    packOptions: PackOptions | undefined,
    tokenMap: Map<string, number> | undefined,
    selectedFilePaths: string[] | undefined,
    onApplyOptimization: ((partial: Partial<PackOptions>) => void) | undefined,
    onDeselectHeaviest: ((count: number) => void) | undefined,
): Suggestion[] {
    const suggestions: Suggestion[] = [];

    if (!isWarning || !tokenMap || !selectedFilePaths) {
        return suggestions;
    }

    if (!onApplyOptimization && !onDeselectHeaviest) {
        return suggestions;
    }

    // Suggestion: Strip Comments
    if (packOptions && onApplyOptimization && !packOptions.stripComments) {
        const savings = calculateCommentSavings(usedTokens);
        suggestions.push({
            action: () => onApplyOptimization({ stripComments: true }),
            label: `Strip Comments saves ~${formatTokenCount(savings)}`,
        });
    }

    // Suggestion: Minify Markdown
    if (packOptions && onApplyOptimization && !packOptions.minifyMarkdown) {
        const savings = calculateMarkdownSavings(selectedFilePaths, tokenMap);
        if (savings > 0) {
            suggestions.push({
                action: () => onApplyOptimization({ minifyMarkdown: true }),
                label: `Minify Markdown saves ~${formatTokenCount(savings)}`,
            });
        }
    }

    // Suggestion: Deselect 2 heaviest files
    if (onDeselectHeaviest && selectedFilePaths.length >= 2) {
        const savings = calculateDeselectSavings(selectedFilePaths, tokenMap, 2);
        if (savings > 0) {
            suggestions.push({
                action: () => onDeselectHeaviest(2),
                label: `Deselect 2 heaviest files saves ~${formatTokenCount(savings)}`,
            });
        }
    }

    return suggestions;
}
