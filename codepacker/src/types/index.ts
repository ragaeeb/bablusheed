export interface FileNode {
  id: string;
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  isDir: boolean;
  children?: FileNode[];
}

export type CheckState = "checked" | "unchecked" | "indeterminate";

export interface FileTreeNode extends Omit<FileNode, "children"> {
  checkState: CheckState;
  tokenCount: number;
  depth: number;
  isExpanded: boolean;
  children?: FileTreeNode[];
}

export interface FlatTreeItem {
  node: FileTreeNode;
  depth: number;
  hasChildren: boolean;
}

export interface PackOptions {
  numPacks: number;
  outputFormat: "plaintext" | "markdown" | "xml";
  stripComments: boolean;
  reduceWhitespace: boolean;
  astDeadCode: boolean;
  entryPoint: string | null;
  minifyMarkdown: boolean;
  stripMarkdownHeadings: boolean;
  stripMarkdownBlockquotes: boolean;
  respectGitignore: boolean;
  customIgnorePatterns: string;
}

export interface PackRequest {
  files: Array<{
    path: string;
    content: string;
  }>;
  numPacks: number;
  outputFormat: "plaintext" | "markdown" | "xml";
  llmProfileId: string;
}

export interface PackItem {
  index: number;
  content: string;
  estimatedTokens: number;
  fileCount: number;
  filePaths: string[];
}

export interface PackResponse {
  packs: PackItem[];
  totalTokens: number;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface ReachabilityResult {
  reachable_symbols: Record<string, string[]>;
  unreachable_symbols: Record<string, string[]>;
}

export interface AppSettings {
  lastProjectPath: string | null;
  lastLlmProfileId: string;
  packOptions: PackOptions;
  theme: "dark" | "light";
}

export interface TokenCountResult {
  path: string;
  tokens: number;
}

export interface WorkerMessage {
  type: "count";
  files: Array<{ path: string; content: string }>;
  encoding: "cl100k_base" | "o200k_base";
}

export interface WorkerResult {
  type: "result";
  results: TokenCountResult[];
}
