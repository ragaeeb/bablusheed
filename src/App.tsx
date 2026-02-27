import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";
import { FolderOpen, Loader2, Package2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FilePreview } from "@/components/FilePreview";
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
import { cn } from "@/lib/utils";
import type { FileNode, FileTreeNode, PackOptions as PackOptionsType } from "@/types";

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

/** Count total non-directory files in a tree */
function countFiles(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (!n.isDir) count++;
    if (n.children) count += countFiles(n.children);
  }
  return count;
}

/** Count total non-directory files in a FileNode tree */
function countFileNodes(nodes: FileNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (!n.isDir) count++;
    if (n.children) count += countFileNodes(n.children);
  }
  return count;
}

/** 2b: Workflow step indicator */
type WorkflowStep = 1 | 2 | 3;

function StepIndicator({ step, currentStep }: { step: WorkflowStep; currentStep: WorkflowStep }) {
  const labels: Record<WorkflowStep, string> = {
    1: "Select Files",
    2: "Configure",
    3: "Pack & Export",
  };
  const isActive = step === currentStep;
  const isCompleted = step < currentStep;

  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium transition-colors",
        isActive ? "text-primary" : isCompleted ? "text-foreground/60" : "text-muted-foreground/40"
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold border",
          isActive
            ? "bg-primary text-primary-foreground border-primary"
            : isCompleted
              ? "bg-foreground/20 text-foreground/60 border-foreground/20"
              : "bg-transparent border-muted-foreground/30 text-muted-foreground/40"
        )}
      >
        {step}
      </span>
      {labels[step]}
    </div>
  );
}

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
  // 2a: File preview state
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [centerTab, setCenterTab] = useState<"options" | "preview">("options");
  // 3l: Last project path for reopen
  const [lastProjectPath, setLastProjectPath] = useState<string | null>(null);
  const [lastProjectName, setLastProjectName] = useState<string | null>(null);

  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);

  // 3i: Stable refs for gitignore/patterns to avoid loadProject recreation
  const gitignoreRef = useRef(packOptions.respectGitignore);
  const ignorePatternRef = useRef(packOptions.customIgnorePatterns);
  useEffect(() => {
    gitignoreRef.current = packOptions.respectGitignore;
  }, [packOptions.respectGitignore]);
  useEffect(() => {
    ignorePatternRef.current = packOptions.customIgnorePatterns;
  }, [packOptions.customIgnorePatterns]);

  const {
    flatItems,
    selectedFiles,
    searchQuery,
    highlightedPath,
    visibleFilePaths,
    loadTree,
    toggleCheck,
    toggleExpand,
    updateTokens,
    selectAll,
    quickSelect,
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
    selectedLlmId,
    tokenMap
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
        const savedLastPath = await store.get<string>("lastProjectPath");

        if (savedTheme) setTheme(savedTheme);
        if (savedLlmId) setSelectedLlmId(savedLlmId);
        if (savedPackOptions) setPackOptions({ ...DEFAULT_PACK_OPTIONS, ...savedPackOptions });
        if (savedLastPath) {
          setLastProjectPath(savedLastPath);
          const parts = savedLastPath.replace(/\\/g, "/").split("/");
          setLastProjectName(parts[parts.length - 1] ?? savedLastPath);
        }
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

  // 3k: Save settings with 1500ms debounce; don't save projectPath here
  const saveSettings = useCallback(async () => {
    if (!storeRef.current) return;
    try {
      await storeRef.current.set("theme", theme);
      await storeRef.current.set("lastLlmProfileId", selectedLlmId);
      await storeRef.current.set("packOptions", packOptions);
      await storeRef.current.save();
    } catch (err) {
      console.warn("Failed to save settings:", err);
    }
  }, [theme, selectedLlmId, packOptions]);

  useEffect(() => {
    const timer = setTimeout(saveSettings, 1500);
    return () => clearTimeout(timer);
  }, [saveSettings]);

  // 3c: Lazy file content loading — load on demand, cache in fileContents
  const loadFileContent = useCallback(
    async (path: string): Promise<void> => {
      if (fileContents.has(path)) return;
      try {
        const content = await readTextFile(path);
        setFileContents((prev) => {
          const next = new Map(prev);
          next.set(path, content);
          return next;
        });
      } catch {
        setFileContents((prev) => {
          const next = new Map(prev);
          next.set(path, "");
          return next;
        });
      }
    },
    [fileContents]
  );

  // 3c: Load content for newly selected files
  const loadContentsForFiles = useCallback(
    async (files: FileTreeNode[]) => {
      const toLoad = files.filter((f) => !f.isDir && !fileContents.has(f.path));
      if (toLoad.length === 0) return;
      const updates = new Map<string, string>();
      await Promise.all(
        toLoad.map(async (f) => {
          try {
            const content = await readTextFile(f.path);
            updates.set(f.path, content);
          } catch {
            updates.set(f.path, "");
          }
        })
      );
      if (updates.size > 0) {
        setFileContents((prev) => {
          const next = new Map(prev);
          for (const [k, v] of updates) next.set(k, v);
          return next;
        });
      }
    },
    [fileContents]
  );

  // Load content for selected files whenever selection changes
  useEffect(() => {
    loadContentsForFiles(selectedFiles);
  }, [selectedFiles, loadContentsForFiles]);

  // 3i: loadProject reads from refs, stable reference
  const loadProject = useCallback(
    async (folderPath: string) => {
      setIsLoadingTree(true);
      setProjectPath(folderPath);
      const parts = folderPath.replace(/\\/g, "/").split("/");
      const name = parts[parts.length - 1] ?? folderPath;
      setProjectName(name);

      try {
        const customIgnoreList = ignorePatternRef.current
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);

        const nodes = await invoke<FileNode[]>("walk_directory", {
          path: folderPath,
          respectGitignore: gitignoreRef.current,
          customIgnorePatterns: customIgnoreList,
        });

        loadTree(nodes);

        // 3c: Eager pre-load only for small projects (<50 files)
        const totalFileCount = countFileNodes(nodes);
        if (totalFileCount < 50) {
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
        } else {
          // Large project: start fresh, lazy load on demand
          setFileContents(new Map());
        }

        // 3k: Save lastProjectPath only when explicitly opening a project
        if (storeRef.current) {
          await storeRef.current.set("lastProjectPath", folderPath);
          await storeRef.current.save();
        }
        setLastProjectPath(folderPath);
        setLastProjectName(name);
      } catch (err) {
        console.error("Failed to load project:", err);
      } finally {
        setIsLoadingTree(false);
      }
    },
    [loadTree]
  );

  const handleOpenProject = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      await loadProject(selected);
    }
  }, [loadProject]);

  // 3l: Reopen last project
  const handleReopenLastProject = useCallback(async () => {
    if (lastProjectPath) {
      await loadProject(lastProjectPath);
    }
  }, [lastProjectPath, loadProject]);

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

  // 2a: File preview handler
  const handleFilePreview = useCallback((path: string) => {
    setPreviewPath(path);
    setCenterTab("preview");
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewPath(null);
    setCenterTab("options");
  }, []);

  // 3n: Cap numPacks slider max at selectedFiles.length
  const maxSensiblePacks = Math.min(
    llmProfile.maxFileAttachments,
    Math.max(selectedFiles.length, 1)
  );
  useEffect(() => {
    if (packOptions.numPacks > maxSensiblePacks) {
      setPackOptions((prev) => ({ ...prev, numPacks: maxSensiblePacks }));
    }
  }, [maxSensiblePacks, packOptions.numPacks]);

  // 2b: Determine current workflow step
  const workflowStep: WorkflowStep = useMemo(() => {
    if (showOutput && packResult) return 3;
    if (selectedFiles.length > 0) return 2;
    return 1;
  }, [showOutput, packResult, selectedFiles.length]);

  const totalFiles = countFiles(rootNodes);

  // Find the preview file node
  const previewFile = useMemo(() => {
    if (!previewPath) return null;
    function findNode(nodes: typeof rootNodes): (typeof rootNodes)[0] | null {
      for (const n of nodes) {
        if (n.path === previewPath) return n;
        if (n.children) {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    }
    return findNode(rootNodes);
  }, [previewPath, rootNodes]);

  // 2e: Deselect heaviest N files
  const handleDeselectHeaviest = useCallback(
    (count: number) => {
      const sorted = [...selectedFiles]
        .filter((f) => !f.isDir)
        .sort((a, b) => (tokenMap.get(b.path) ?? 0) - (tokenMap.get(a.path) ?? 0));
      const toDeselect = sorted.slice(0, count);
      for (const f of toDeselect) {
        toggleCheck(f.id);
      }
    },
    [selectedFiles, tokenMap, toggleCheck]
  );

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
          <EmptyState
            onOpenProject={handleOpenProject}
            onReopenLastProject={lastProjectName ? handleReopenLastProject : undefined}
            lastProjectName={lastProjectName}
            isDragging={isDragging}
          />
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
                    visibleFilePaths={visibleFilePaths}
                    onToggleCheck={toggleCheck}
                    onToggleExpand={toggleExpand}
                    onSearchChange={setSearchQuery}
                    onSelectAll={selectAll}
                    onQuickSelect={quickSelect}
                    onFilePreview={handleFilePreview}
                    totalSelected={selectedFiles.length}
                    totalFiles={totalFiles}
                  />
                )}
              </div>
            </div>

            {/* CENTER: Controls / Preview */}
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
                  packOptions={packOptions}
                  tokenMap={tokenMap}
                  selectedFilePaths={selectedFiles.map((f) => f.path)}
                  onApplyOptimization={(partial) =>
                    setPackOptions((prev) => ({ ...prev, ...partial }))
                  }
                  onDeselectHeaviest={handleDeselectHeaviest}
                />

                {/* 2b: Step indicators */}
                <div className="flex items-center gap-3">
                  <StepIndicator step={1} currentStep={workflowStep} />
                  <span className="text-muted-foreground/30 text-[10px]">→</span>
                  <StepIndicator step={2} currentStep={workflowStep} />
                  <span className="text-muted-foreground/30 text-[10px]">→</span>
                  <StepIndicator step={3} currentStep={workflowStep} />
                </div>

                {/* 2a: Tab toggle between Options and Preview */}
                {previewPath && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCenterTab("options")}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded border font-medium transition-colors",
                        centerTab === "options"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Options
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterTab("preview")}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded border font-medium transition-colors",
                        centerTab === "preview"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Preview
                    </button>
                  </div>
                )}
              </div>

              {/* Center content: Options or Preview */}
              {centerTab === "preview" && previewFile ? (
                <div className="flex-1 overflow-hidden">
                  <FilePreview
                    file={previewFile}
                    fileContents={fileContents}
                    tokenMap={tokenMap}
                    packOptions={packOptions}
                    isSelected={previewFile.checkState === "checked"}
                    onToggleSelect={toggleCheck}
                    onLoadContent={loadFileContent}
                    onClose={handleClosePreview}
                  />
                </div>
              ) : (
                <>
                  {/* Options + Heaviest files */}
                  <div className="flex-1 overflow-y-auto">
                    <PackOptions
                      options={packOptions}
                      onChange={setPackOptions}
                      maxPacks={maxSensiblePacks}
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
                          Pack{" "}
                          {selectedFiles.length > 0 ? `${selectedFiles.length} Files` : "Files"}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
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
