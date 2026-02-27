import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";
import { FolderOpen, Loader2, Package2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FileTree } from "@/components/FileTree";
import { LLMSelector } from "@/components/LLMSelector";
import { OutputPreview } from "@/components/OutputPreview";
import { PackOptions } from "@/components/PackOptions";
import { TitleBar } from "@/components/TitleBar";
import { TokenBar } from "@/components/TokenBar";
import { TopHeavyFiles } from "@/components/TopHeavyFiles";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFileTree } from "@/hooks/useFileTree";
import { usePackager } from "@/hooks/usePackager";
import { useTokenCount } from "@/hooks/useTokenCount";
import { getProfile } from "@/lib/llm-profiles";
import type { FileNode, PackOptions as PackOptionsType } from "@/types";

const DEFAULT_PACK_OPTIONS: PackOptionsType = {
  numPacks: 3,
  outputFormat: "markdown",
  stripComments: true,
  reduceWhitespace: true,
  astDeadCode: false,
  entryPoint: null,
  minifyMarkdown: true,
  stripMarkdownHeadings: false,
  stripMarkdownBlockquotes: false,
  respectGitignore: true,
  customIgnorePatterns: "**/*.test.ts\n**/*.spec.*\n**/__mocks__/**",
};

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [selectedLlmId, setSelectedLlmId] = useState("claude-opus-4");
  const [packOptions, setPackOptions] = useState<PackOptionsType>(DEFAULT_PACK_OPTIONS);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);

  const {
    flatItems,
    selectedFiles,
    searchQuery,
    highlightedPath,
    loadTree,
    toggleCheck,
    toggleExpand,
    updateTokens,
    selectAll,
    setSearchQuery,
    setHighlightedPath,
    rootNodes,
  } = useFileTree();

  const llmProfile = getProfile(selectedLlmId);

  const { tokenMap, totalTokens, isCalculating } = useTokenCount(
    selectedFiles,
    fileContents,
    llmProfile,
    {
      stripComments: packOptions.stripComments,
      reduceWhitespace: packOptions.reduceWhitespace,
      minifyMarkdown: packOptions.minifyMarkdown,
      stripMarkdownHeadings: packOptions.stripMarkdownHeadings,
      stripMarkdownBlockquotes: packOptions.stripMarkdownBlockquotes,
    }
  );

  const { packResult, isPacking, packError, pack, clearResult } = usePackager(
    selectedFiles,
    fileContents,
    selectedLlmId
  );

  // Update token counts in tree when tokenMap changes
  useEffect(() => {
    if (tokenMap.size > 0) {
      updateTokens(tokenMap);
    }
  }, [tokenMap, updateTokens]);

  // Load settings from store on startup
  useEffect(() => {
    async function loadSettings() {
      try {
        const store = await load("settings.json");
        storeRef.current = store;

        const savedTheme = await store.get<"dark" | "light">("theme");
        const savedLlmId = await store.get<string>("lastLlmProfileId");
        const savedPackOptions = await store.get<PackOptionsType>("packOptions");

        if (savedTheme) setTheme(savedTheme);
        if (savedLlmId) setSelectedLlmId(savedLlmId);
        if (savedPackOptions) setPackOptions({ ...DEFAULT_PACK_OPTIONS, ...savedPackOptions });
      } catch (err) {
        console.warn("Failed to load settings:", err);
      }
    }
    loadSettings();
  }, []);

  // Apply theme class to root element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Save settings when they change
  const saveSettings = useCallback(async () => {
    if (!storeRef.current) return;
    try {
      await storeRef.current.set("theme", theme);
      await storeRef.current.set("lastLlmProfileId", selectedLlmId);
      await storeRef.current.set("packOptions", packOptions);
      if (projectPath) await storeRef.current.set("lastProjectPath", projectPath);
      await storeRef.current.save();
    } catch (err) {
      console.warn("Failed to save settings:", err);
    }
  }, [theme, selectedLlmId, packOptions, projectPath]);

  useEffect(() => {
    const timer = setTimeout(saveSettings, 500);
    return () => clearTimeout(timer);
  }, [saveSettings]);

  const loadProject = useCallback(
    async (folderPath: string) => {
      setIsLoadingTree(true);
      setProjectPath(folderPath);
      const parts = folderPath.replace(/\\/g, "/").split("/");
      setProjectName(parts[parts.length - 1] ?? folderPath);

      try {
        const customIgnoreList = packOptions.customIgnorePatterns
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);

        const nodes = await invoke<FileNode[]>("walk_directory", {
          path: folderPath,
          respectGitignore: packOptions.respectGitignore,
          customIgnorePatterns: customIgnoreList,
        });

        loadTree(nodes);

        // Pre-load file contents
        const contentMap = new Map<string, string>();

        async function loadContents(nodeList: FileNode[]) {
          const promises = nodeList.map(async (node) => {
            if (node.isDir && node.children) {
              await loadContents(node.children);
            } else if (!node.isDir) {
              try {
                const content = await readTextFile(node.path);
                contentMap.set(node.path, content);
              } catch {
                contentMap.set(node.path, "");
              }
            }
          });
          await Promise.all(promises);
        }

        await loadContents(nodes);
        setFileContents(contentMap);
      } catch (err) {
        console.error("Failed to load project:", err);
      } finally {
        setIsLoadingTree(false);
      }
    },
    [packOptions.respectGitignore, packOptions.customIgnorePatterns, loadTree]
  );

  const handleOpenProject = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      await loadProject(selected);
    }
  }, [loadProject]);

  // Drag and drop support
  useEffect(() => {
    const unlistens: Array<() => void> = [];

    listen<{ paths: string[]; position: { x: number; y: number } }>(
      "tauri://drag-drop",
      (event) => {
        setIsDragging(false);
        if (event.payload.paths.length > 0) {
          loadProject(event.payload.paths[0]);
        }
      }
    ).then((fn) => unlistens.push(fn));

    listen("tauri://drag-enter", () => setIsDragging(true)).then((fn) => unlistens.push(fn));
    listen("tauri://drag-leave", () => setIsDragging(false)).then((fn) => unlistens.push(fn));

    return () => {
      for (const fn of unlistens) {
        fn();
      }
    };
  }, [loadProject]);

  const handlePack = useCallback(async () => {
    await pack(packOptions);
    setShowOutput(true);
  }, [pack, packOptions]);

  const handleFileHighlight = useCallback(
    (path: string) => {
      setHighlightedPath(path);
      setTimeout(() => setHighlightedPath(null), 2000);
    },
    [setHighlightedPath]
  );

  function countFiles(nodes: typeof rootNodes): number {
    let count = 0;
    for (const n of nodes) {
      if (!n.isDir) count++;
      if (n.children) count += countFiles(n.children);
    }
    return count;
  }

  const totalFiles = countFiles(rootNodes);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {/* Title bar */}
        <TitleBar
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        />

        {/* Main content */}
        {!projectPath ? (
          <EmptyState onOpenProject={handleOpenProject} isDragging={isDragging} />
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT: File Tree */}
            <div className="w-[260px] shrink-0 flex flex-col border-r border-border overflow-hidden bg-card">
              {/* Project header */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border shrink-0 bg-muted/30">
                <button
                  type="button"
                  onClick={handleOpenProject}
                  className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                  title="Open project"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
                <span
                  className="text-xs font-mono font-medium truncate text-foreground/80"
                  title={projectPath}
                >
                  {projectName}
                </span>
                {isCalculating && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60 shrink-0 ml-auto" />
                )}
              </div>

              {/* File tree */}
              <div className="flex-1 overflow-hidden">
                {isLoadingTree ? (
                  <div className="flex items-center justify-center h-20 gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-xs">Loading...</span>
                  </div>
                ) : (
                  <FileTree
                    flatItems={flatItems}
                    tokenMap={tokenMap}
                    searchQuery={searchQuery}
                    highlightedPath={highlightedPath}
                    onToggleCheck={toggleCheck}
                    onToggleExpand={toggleExpand}
                    onSearchChange={setSearchQuery}
                    onSelectAll={selectAll}
                    totalSelected={selectedFiles.length}
                    totalFiles={totalFiles}
                  />
                )}
              </div>
            </div>

            {/* CENTER: Controls */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-border min-w-0 bg-background">
              {/* Top bar: model selector + token bar */}
              <div className="shrink-0 px-3 py-2 border-b border-border space-y-2 bg-card/50">
                <div className="flex items-center gap-2">
                  <LLMSelector selectedId={selectedLlmId} onSelect={setSelectedLlmId} />
                </div>
                <TokenBar
                  usedTokens={totalTokens}
                  maxTokens={llmProfile.contextWindowTokens}
                  selectedFileCount={selectedFiles.length}
                  numPacks={packOptions.numPacks}
                />
              </div>

              {/* Options + Heaviest files */}
              <div className="flex-1 overflow-y-auto">
                <PackOptions
                  options={packOptions}
                  onChange={setPackOptions}
                  maxPacks={llmProfile.maxFileAttachments}
                  selectedFiles={selectedFiles}
                />

                {selectedFiles.length > 0 && (
                  <>
                    <div className="h-px bg-border/60 mx-2" />
                    <TopHeavyFiles
                      selectedFiles={selectedFiles}
                      tokenMap={tokenMap}
                      onFileClick={handleFileHighlight}
                    />
                  </>
                )}
              </div>

              {/* Pack button */}
              <div className="shrink-0 px-3 py-2 border-t border-border bg-card/50">
                {packError && (
                  <p className="text-[11px] text-red-500 dark:text-red-400 mb-1.5 font-mono">
                    {packError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handlePack}
                  disabled={selectedFiles.length === 0 || isPacking}
                  className="w-full h-8 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {isPacking ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Packing...
                    </>
                  ) : (
                    <>
                      <Package2 className="h-3.5 w-3.5" />
                      Pack {selectedFiles.length > 0 ? `${selectedFiles.length} Files` : "Files"}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT: Output Preview */}
            {showOutput && packResult && (
              <div className="w-[400px] shrink-0 flex flex-col overflow-hidden border-l border-border">
                <OutputPreview
                  packResult={packResult}
                  onClose={() => {
                    setShowOutput(false);
                    clearResult();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
