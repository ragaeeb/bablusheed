import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";
import { FolderOpen, Loader2, Package } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FileTree } from "@/components/FileTree";
import { LLMSelector } from "@/components/LLMSelector";
import { OutputPreview } from "@/components/OutputPreview";
import { PackOptions } from "@/components/PackOptions";
import { TitleBar } from "@/components/TitleBar";
import { TokenBar } from "@/components/TokenBar";
import { TopHeavyFiles } from "@/components/TopHeavyFiles";
import { Button } from "@/components/ui/button";
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {/* Custom title bar */}
        <TitleBar
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        />

        {/* Main content */}
        {!projectPath ? (
          <EmptyState onOpenProject={handleOpenProject} isDragging={isDragging} />
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT: File Tree (280px) */}
            <div className="w-[280px] shrink-0 flex flex-col border-r border-border/50 overflow-hidden">
              {/* Project header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenProject}
                  className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
                <span
                  className="text-xs font-mono truncate text-foreground/80 font-medium"
                  title={projectPath}
                >
                  {projectName}
                </span>
              </div>

              {/* File tree */}
              <div className="flex-1 overflow-hidden">
                {isLoadingTree ? (
                  <div className="flex items-center justify-center h-24 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
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
            <div className="flex-1 flex flex-col overflow-hidden border-r border-border/50 min-w-0">
              {/* Top bar */}
              <div className="shrink-0 p-3 space-y-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <LLMSelector selectedId={selectedLlmId} onSelect={setSelectedLlmId} />
                  {isCalculating && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
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
                <div className="p-2">
                  <PackOptions
                    options={packOptions}
                    onChange={setPackOptions}
                    maxPacks={llmProfile.maxFileAttachments}
                    selectedFiles={selectedFiles}
                  />
                </div>

                <div className="px-2 pb-2">
                  <TopHeavyFiles
                    selectedFiles={selectedFiles}
                    tokenMap={tokenMap}
                    onFileClick={handleFileHighlight}
                  />
                </div>
              </div>

              {/* Pack button */}
              <div className="shrink-0 p-3 border-t border-border/50">
                {packError && <p className="text-xs text-red-400 mb-2">{packError}</p>}
                <Button
                  onClick={handlePack}
                  disabled={selectedFiles.length === 0 || isPacking}
                  className="w-full gap-2"
                >
                  {isPacking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Packing...
                    </>
                  ) : (
                    <>
                      <Package className="h-4 w-4" />
                      Pack {selectedFiles.length} Files
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* RIGHT: Output Preview (slides in) */}
            {showOutput && packResult && (
              <div className="w-[380px] shrink-0 flex flex-col overflow-hidden">
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
