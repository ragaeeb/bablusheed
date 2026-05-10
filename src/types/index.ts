export type FileNode = {
    id: string;
    path: string;
    relativePath: string;
    name: string;
    extension: string;
    size: number;
    isDir: boolean;
    children?: FileNode[];
};

export type CheckState = 'checked' | 'unchecked' | 'indeterminate';

export interface FileTreeNode extends Omit<FileNode, 'children'> {
    checkState: CheckState;
    tokenCount: number;
    depth: number;
    isExpanded: boolean;
    children?: FileTreeNode[];
}

export type FlatTreeItem = {
    node: FileTreeNode;
    depth: number;
    hasChildren: boolean;
};

export type PackOptions = {
    numPacks: number;
    maxTokensPerPackFile: number;
    outputFormat: 'plaintext' | 'markdown';
    stripComments: boolean;
    reduceWhitespace: boolean;
    astDeadCode: boolean;
    entryPoint: string | null;
    minifyMarkdown: boolean;
    stripMarkdownHeadings: boolean;
    stripMarkdownBlockquotes: boolean;
    respectGitignore: boolean;
    customIgnorePatterns: string;
};

export type PackRequest = {
    files: Array<{
        path: string;
        content: string;
        tokenCount?: number;
    }>;
    numPacks: number;
    outputFormat: 'plaintext' | 'markdown';
    llmProfileId: string;
};

export type PackItem = {
    index: number;
    content: string;
    estimatedTokens: number;
    fileCount: number;
    filePaths: string[];
};

export type PackResponse = {
    outputFormat: 'plaintext' | 'markdown';
    packs: PackItem[];
    totalTokens: number;
};

export type FileContent = {
    path: string;
    content: string;
    tokenCount?: number;
};

export type ReachabilityResult = {
    reachable_symbols: Record<string, string[]>;
    unreachable_symbols: Record<string, string[]>;
};

export type AppSettings = {
    lastProjectPath: string | null;
    lastLlmProfileId: string;
    packOptions: PackOptions;
    theme: 'dark' | 'light';
};

export type TokenCountResult = {
    path: string;
    tokens: number;
};

export type WorkerMessage = {
    type: 'count';
    requestId: number;
    files: Array<{ path: string; content: string }>;
    strategy: TiktokenEncoding | 'approx';
};

export type WorkerResult = {
    type: 'result';
    requestId: number;
    results: TokenCountResult[];
};

import type { TiktokenEncoding } from 'js-tiktoken';
