import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { applyAstDeadCode } from '@/lib/ast-reachability';
import { resolveAdvisoryMaxTokensPerFile, splitOversizedFilesForPacking } from '@/lib/pack-strategy';
import { applyOptimizationPipeline } from '@/lib/utils';
import type { FileTreeNode, PackOptions, PackResponse } from '@/types';

export function usePackager(
    selectedFiles: FileTreeNode[],
    fileContents: Map<string, string>,
    llmProfileId: string,
    contextWindowTokens: number,
    tokenMap?: Map<string, number>,
    onLog?: (level: 'error' | 'info' | 'debug', message: string) => void,
) {
    const [packResult, setPackResult] = useState<PackResponse | null>(null);
    const [isPacking, setIsPacking] = useState(false);
    const [packError, setPackError] = useState<string | null>(null);
    const [packWarnings, setPackWarnings] = useState<string[]>([]);

    const pack = async (
        options: PackOptions,
        contentOverrides?: ReadonlyMap<string, string>,
    ): Promise<PackResponse | null> => {
        if (selectedFiles.length === 0) {
            return null;
        }

        setIsPacking(true);
        setPackError(null);
        setPackResult(null);
        setPackWarnings([]);
        onLog?.(
            'info',
            `pack start selected=${selectedFiles.filter((f) => !f.isDir).length} llm=${llmProfileId} numPacks=${options.numPacks} format=${options.outputFormat} ast=${options.astDeadCode && !!options.entryPoint}`,
        );

        try {
            const sourceContents = contentOverrides ?? fileContents;
            const missingPaths = selectedFiles
                .filter((file) => !file.isDir)
                .map((file) => file.path)
                .filter((path) => !sourceContents.has(path));

            if (missingPaths.length > 0) {
                const preview = missingPaths.slice(0, 3).join(', ');
                const overflow = missingPaths.length > 3 ? ` (+${missingPaths.length - 3} more)` : '';
                const message = `Missing content for ${missingPaths.length} selected file(s): ${preview}${overflow}`;
                setPackError(message);
                onLog?.('error', `pack blocked missing-content count=${missingPaths.length}`);
                return null;
            }

            const rawContentMap = new Map<string, string>();
            for (const file of selectedFiles) {
                if (file.isDir) {
                    continue;
                }
                rawContentMap.set(file.path, sourceContents.get(file.path) ?? '');
            }

            const astProcessedContentMap =
                options.astDeadCode && options.entryPoint
                    ? await applyAstDeadCode(selectedFiles, rawContentMap, options.entryPoint)
                    : rawContentMap;
            if (options.astDeadCode && options.entryPoint) {
                let changedFiles = 0;
                let charDelta = 0;
                for (const [path, raw] of rawContentMap) {
                    const processed = astProcessedContentMap.get(path) ?? '';
                    if (processed !== raw) {
                        changedFiles += 1;
                        charDelta += processed.length - raw.length;
                    }
                }
                onLog?.(
                    'info',
                    `pack ast processed files=${rawContentMap.size} changed=${changedFiles} charDelta=${charDelta}`,
                );
            }

            const contentMap = new Map<string, string>();
            for (const file of selectedFiles) {
                if (file.isDir) {
                    continue;
                }
                const baseContent = astProcessedContentMap.get(file.path) ?? '';
                const content = applyOptimizationPipeline(baseContent, file.extension, file.relativePath, options);
                contentMap.set(file.path, content);
            }

            const files = selectedFiles
                .filter((f) => !f.isDir)
                .map((file) => ({
                    content: contentMap.get(file.path) ?? '',
                    path: file.relativePath,
                    tokenCount: tokenMap?.get(file.path),
                }));

            const advisoryMaxTokensPerFile = resolveAdvisoryMaxTokensPerFile(
                options.maxTokensPerPackFile,
                contextWindowTokens,
            );
            const balanced = splitOversizedFilesForPacking(files, advisoryMaxTokensPerFile);
            setPackWarnings(balanced.warnings);
            if (balanced.warnings.length > 0) {
                onLog?.('info', `pack warnings count=${balanced.warnings.length}`);
            }
            onLog?.(
                'debug',
                `pack balancing filesIn=${files.length} filesOut=${balanced.files.length} splitFiles=${balanced.splitFileCount} generatedParts=${balanced.generatedPartCount}`,
            );

            const result = await invoke<PackResponse>('pack_files', {
                request: {
                    files: balanced.files,
                    llmProfileId,
                    numPacks: options.numPacks,
                    outputFormat: options.outputFormat,
                },
            });

            setPackResult(result);
            onLog?.('info', `pack success packs=${result.packs.length} totalTokens=${result.totalTokens}`);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setPackError(message);
            onLog?.('error', `pack failed err=${message}`);
            return null;
        } finally {
            setIsPacking(false);
        }
    };

    const clearResult = () => {
        setPackResult(null);
        setPackError(null);
        setPackWarnings([]);
    };

    return { clearResult, isPacking, pack, packError, packResult, packWarnings };
}
