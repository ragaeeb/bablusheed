import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { applyAstDeadCode } from '@/lib/ast-reachability';
import { resolveAdvisoryMaxTokensPerFile, splitOversizedFilesForPacking } from '@/lib/pack-strategy';
import { applyOptimizationPipeline } from '@/lib/utils';
import type { FileTreeNode, PackOptions, PackResponse } from '@/types';

type Logger = (level: 'error' | 'info' | 'debug', message: string) => void;

function getPackableFiles(selectedFiles: FileTreeNode[]) {
    return selectedFiles.filter((file) => !file.isDir);
}

function getMissingSelectedPaths(selectedFiles: FileTreeNode[], sourceContents: ReadonlyMap<string, string>) {
    return getPackableFiles(selectedFiles)
        .map((file) => file.path)
        .filter((path) => !sourceContents.has(path));
}

function buildRawContentMap(selectedFiles: FileTreeNode[], sourceContents: ReadonlyMap<string, string>) {
    return new Map(getPackableFiles(selectedFiles).map((file) => [file.path, sourceContents.get(file.path) ?? '']));
}

function logAstProcessingSummary(
    options: PackOptions,
    rawContentMap: Map<string, string>,
    astProcessedContentMap: Map<string, string>,
    onLog?: Logger,
) {
    if (!options.astDeadCode || !options.entryPoint) {
        return;
    }
    let changedFiles = 0;
    let charDelta = 0;
    for (const [path, raw] of rawContentMap) {
        const processed = astProcessedContentMap.get(path) ?? '';
        if (processed !== raw) {
            changedFiles += 1;
            charDelta += processed.length - raw.length;
        }
    }
    onLog?.('info', `pack ast processed files=${rawContentMap.size} changed=${changedFiles} charDelta=${charDelta}`);
}

function buildOptimizedContentMap(
    selectedFiles: FileTreeNode[],
    astProcessedContentMap: Map<string, string>,
    options: PackOptions,
) {
    const contentMap = new Map<string, string>();
    for (const file of getPackableFiles(selectedFiles)) {
        const baseContent = astProcessedContentMap.get(file.path) ?? '';
        const content = applyOptimizationPipeline(baseContent, file.extension, file.relativePath, options);
        contentMap.set(file.path, content);
    }
    return contentMap;
}

function buildPackFiles(
    selectedFiles: FileTreeNode[],
    contentMap: Map<string, string>,
    tokenMap?: Map<string, number>,
) {
    return getPackableFiles(selectedFiles).map((file) => ({
        content: contentMap.get(file.path) ?? '',
        path: file.relativePath,
        tokenCount: tokenMap?.get(file.path),
    }));
}

function logPackStart(selectedFileCount: number, llmProfileId: string, options: PackOptions, onLog?: Logger) {
    onLog?.(
        'info',
        `pack start selected=${selectedFileCount} llm=${llmProfileId} numPacks=${options.numPacks} format=${options.outputFormat} ast=${options.astDeadCode && !!options.entryPoint}`,
    );
}

function getMissingContentMessage(missingPaths: string[]) {
    const preview = missingPaths.slice(0, 3).join(', ');
    const overflow = missingPaths.length > 3 ? ` (+${missingPaths.length - 3} more)` : '';
    return `Missing content for ${missingPaths.length} selected file(s): ${preview}${overflow}`;
}

async function getAstProcessedContentMap(
    options: PackOptions,
    selectedFiles: FileTreeNode[],
    rawContentMap: Map<string, string>,
) {
    if (!options.astDeadCode || !options.entryPoint) {
        return rawContentMap;
    }
    return applyAstDeadCode(selectedFiles, rawContentMap, options.entryPoint);
}

function preparePackFiles(
    selectedFiles: FileTreeNode[],
    sourceContents: ReadonlyMap<string, string>,
    tokenMap?: Map<string, number>,
) {
    const rawContentMap = buildRawContentMap(selectedFiles, sourceContents);
    return { rawContentMap, tokenMap };
}

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
        const packableFiles = getPackableFiles(selectedFiles);
        if (packableFiles.length === 0) {
            return null;
        }

        setIsPacking(true);
        setPackError(null);
        setPackResult(null);
        setPackWarnings([]);
        logPackStart(packableFiles.length, llmProfileId, options, onLog);

        try {
            const sourceContents = contentOverrides ?? fileContents;
            const missingPaths = getMissingSelectedPaths(selectedFiles, sourceContents);

            if (missingPaths.length > 0) {
                const message = getMissingContentMessage(missingPaths);
                setPackError(message);
                onLog?.('error', `pack blocked missing-content count=${missingPaths.length}`);
                return null;
            }

            const { rawContentMap } = preparePackFiles(selectedFiles, sourceContents, tokenMap);
            const astProcessedContentMap = await getAstProcessedContentMap(options, selectedFiles, rawContentMap);
            logAstProcessingSummary(options, rawContentMap, astProcessedContentMap, onLog);

            const contentMap = buildOptimizedContentMap(selectedFiles, astProcessedContentMap, options);
            const files = buildPackFiles(selectedFiles, contentMap, tokenMap);

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
