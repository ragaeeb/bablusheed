import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { dirname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import {
  Bug,
  BugOff,
  Download,
  FolderOpen,
  Loader2,
  Moon,
  Package2,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FilePreview } from "@/components/FilePreview";
import { FileTree } from "@/components/FileTree";
import { LLMSelector } from "@/components/LLMSelector";
import { OutputPreview } from "@/components/OutputPreview";
import { PackOptions } from "@/components/PackOptions";
import { TokenBar } from "@/components/TokenBar";
import { TopHeavyFiles } from "@/components/TopHeavyFiles";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFileTree } from "@/hooks/useFileTree";
import { usePackager } from "@/hooks/usePackager";
import { useTokenCount } from "@/hooks/useTokenCount";
import { getProfile } from "@/lib/llm-profiles";
import {
  buildOversizedFilesWarning,
  findOversizedFiles,
  forecastSplitPartCounts,
  resolveAdvisoryMaxTokensPerFile,
} from "@/lib/pack-strategy";
import { useRenderDiagnostics } from "@/lib/render-diagnostics";
import { cn } from "@/lib/utils";
import type { FileNode, PackOptions as PackOptionsType } from "@/types";

const DEFAULT_PACK_OPTIONS: PackOptionsType = {
  astDeadCode: false,
  customIgnorePatterns: "**/*.test.ts\n**/*.spec.*\n**/__mocks__/**",
  entryPoint: null,
  maxTokensPerPackFile: 0,
  minifyMarkdown: true,
  numPacks: 3,
  outputFormat: "markdown",
  reduceWhitespace: true,
  respectGitignore: true,
  stripComments: true,
  stripMarkdownBlockquotes: false,
  stripMarkdownHeadings: false,
};

/** Count total non-directory files in any tree whose nodes have isDir and optional children */
function countNodes<T extends { isDir: boolean; children?: T[] }>(nodes: T[]): number {
  let count = 0;
  for (const n of nodes) {
    if (!n.isDir) count++;
    if (n.children) count += countNodes(n.children);
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
        isActive ? "text-primary" : isCompleted ? "text-foreground/60" : "text-muted-foreground/40",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold border",
          isActive
            ? "bg-primary text-primary-foreground border-primary"
            : isCompleted
              ? "bg-foreground/20 text-foreground/60 border-foreground/20"
              : "bg-transparent border-muted-foreground/30 text-muted-foreground/40",
        )}
      >
        {step}
      </span>
      {labels[step]}
    </div>
  );
}

type DebugLiveMetrics = {
  appRendersPerMin: number;
  fileTreeRendersPerMin: number;
  outputPreviewRendersPerMin: number;
  astRecomputeCount: number;
  astCacheHitCount: number;
  workerQueuedCount: number;
  workerResultCount: number;
};

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [selectedLlmId, setSelectedLlmId] = useState("chatgpt-5-2");
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
  const [debugLogging, setDebugLogging] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [debugLiveMetrics, setDebugLiveMetrics] = useState<DebugLiveMetrics>({
    appRendersPerMin: 0,
    astCacheHitCount: 0,
    astRecomputeCount: 0,
    fileTreeRendersPerMin: 0,
    outputPreviewRendersPerMin: 0,
    workerQueuedCount: 0,
    workerResultCount: 0,
  });

  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);
  const loadProjectRef = useRef<(folderPath: string) => Promise<void>>(async () => {});
  const renderSamplesRef = useRef<Record<string, number[]>>({
    App: [],
    FileTree: [],
    OutputPreview: [],
  });
  const debugMetricCountsRef = useRef({
    astCacheHit: 0,
    astRecompute: 0,
    workerQueued: 0,
    workerResult: 0,
  });

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
  const appendDebugLog = (line: string) => {
    setDebugLogs((prev) => {
      const next = [...prev, line];
      return next.length > 5000 ? next.slice(next.length - 5000) : next;
    });
  };
  const appendRenderSample = (component: string, timestampMs: number) => {
    if (!debugLogging) return;
    const bucket = renderSamplesRef.current[component] ?? [];
    bucket.push(timestampMs);
    renderSamplesRef.current[component] = bucket;
  };
  const incrementDebugMetric = (
    name: "astRecompute" | "astCacheHit" | "workerQueued" | "workerResult",
  ) => {
    if (!debugLogging) return;
    debugMetricCountsRef.current[name] += 1;
  };

  useRenderDiagnostics({
    component: "App",
    enabled: debugLogging,
    onLog: appendDebugLog,
    onRenderSample: appendRenderSample,
    threshold: 80,
    windowMs: 3000,
  });

  const tokenCountOptions = {
    astDeadCode: packOptions.astDeadCode,
    entryPoint: packOptions.entryPoint,
    minifyMarkdown: packOptions.minifyMarkdown,
    reduceWhitespace: packOptions.reduceWhitespace,
    stripComments: packOptions.stripComments,
    stripMarkdownBlockquotes: packOptions.stripMarkdownBlockquotes,
    stripMarkdownHeadings: packOptions.stripMarkdownHeadings,
  };

  const { tokenMap, totalTokens, isCalculating } = useTokenCount(
    selectedFiles,
    fileContents,
    llmProfile,
    tokenCountOptions,
    debugLogging,
    appendDebugLog,
    incrementDebugMetric,
  );

  useEffect(() => {
    if (!debugLogging) {
      renderSamplesRef.current = { App: [], FileTree: [], OutputPreview: [] };
      debugMetricCountsRef.current = {
        astCacheHit: 0,
        astRecompute: 0,
        workerQueued: 0,
        workerResult: 0,
      };
      setDebugLiveMetrics({
        appRendersPerMin: 0,
        astCacheHitCount: 0,
        astRecomputeCount: 0,
        fileTreeRendersPerMin: 0,
        outputPreviewRendersPerMin: 0,
        workerQueuedCount: 0,
        workerResultCount: 0,
      });
      return;
    }

    const timer = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 60_000;
      const appSamples = renderSamplesRef.current.App.filter((t) => t >= cutoff);
      const treeSamples = renderSamplesRef.current.FileTree.filter((t) => t >= cutoff);
      const previewSamples = renderSamplesRef.current.OutputPreview.filter((t) => t >= cutoff);
      renderSamplesRef.current.App = appSamples;
      renderSamplesRef.current.FileTree = treeSamples;
      renderSamplesRef.current.OutputPreview = previewSamples;

      setDebugLiveMetrics({
        appRendersPerMin: appSamples.length,
        astCacheHitCount: debugMetricCountsRef.current.astCacheHit,
        astRecomputeCount: debugMetricCountsRef.current.astRecompute,
        fileTreeRendersPerMin: treeSamples.length,
        outputPreviewRendersPerMin: previewSamples.length,
        workerQueuedCount: debugMetricCountsRef.current.workerQueued,
        workerResultCount: debugMetricCountsRef.current.workerResult,
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [debugLogging]);

  const { packResult, isPacking, packError, packWarnings, pack, clearResult } = usePackager(
    selectedFiles,
    fileContents,
    selectedLlmId,
    llmProfile.contextWindowTokens,
    tokenMap,
  );

  const advisoryMaxTokensPerFile = resolveAdvisoryMaxTokensPerFile(
    packOptions.maxTokensPerPackFile,
    llmProfile.contextWindowTokens,
  );
  const selectedPackFiles = selectedFiles
    .filter((f) => !f.isDir)
    .map((f) => ({
      content: fileContents.get(f.path) ?? "",
      path: f.relativePath,
      tokenCount: tokenMap.get(f.path),
    }));
  const oversizedSelection = findOversizedFiles(selectedPackFiles, advisoryMaxTokensPerFile);
  const advisorySelectionWarning = buildOversizedFilesWarning(
    oversizedSelection,
    advisoryMaxTokensPerFile,
  );
  const splitPartCountByAbsolutePath = (() => {
    const selectedAbsoluteFiles = selectedFiles
      .filter((f) => !f.isDir)
      .map((f) => ({
        content: fileContents.get(f.path) ?? "",
        path: f.path,
        tokenCount: tokenMap.get(f.path),
      }));
    return forecastSplitPartCounts(selectedAbsoluteFiles, advisoryMaxTokensPerFile);
  })();
  const relativeTokenMap = (() => {
    const map = new Map<string, number>();
    for (const file of selectedFiles) {
      if (file.isDir) continue;
      const tokens = tokenMap.get(file.path);
      if (tokens !== undefined) {
        map.set(file.relativePath, tokens);
      }
    }
    return map;
  })();
  const selectedAbsolutePaths = selectedFiles.filter((f) => !f.isDir).map((f) => f.path);

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
        if (savedPackOptions) {
          const merged = { ...DEFAULT_PACK_OPTIONS, ...savedPackOptions };
          if (merged.outputFormat !== "markdown" && merged.outputFormat !== "plaintext") {
            merged.outputFormat = "markdown";
          }
          setPackOptions(merged);
        }
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
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!storeRef.current) return;
      try {
        await storeRef.current.set("theme", theme);
        await storeRef.current.set("lastLlmProfileId", selectedLlmId);
        await storeRef.current.set("packOptions", packOptions);
        await storeRef.current.save();
      } catch (err) {
        console.warn("Failed to save settings:", err);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [theme, selectedLlmId, packOptions]);

  const readProjectFile = useCallback(
    async (path: string): Promise<string> => invoke<string>("read_file_content", { path }),
    [],
  );

  // 3c: Lazy file content loading — load on demand, cache in fileContents.
  // Uses functional updater to check existence inside the updater so fileContents
  // is not a dependency (avoids recreating the callback on every Map change).
  const loadFileContent = async (path: string): Promise<void> => {
    try {
      const content = await readProjectFile(path);
      setFileContents((prev) => {
        if (prev.has(path)) return prev;
        const next = new Map(prev);
        next.set(path, content);
        return next;
      });
    } catch {
      setFileContents((prev) => {
        if (prev.has(path)) return prev;
        const next = new Map(prev);
        next.set(path, "");
        return next;
      });
    }
  };

  // Load content for selected files whenever selection changes.
  // Filter to only files not yet loaded to avoid redundant reads.
  useEffect(() => {
    const filesToLoad = selectedAbsolutePaths.filter((path) => !fileContents.has(path));
    if (filesToLoad.length === 0) return;

    let cancelled = false;
    const loadMissingContents = async () => {
      const updates = new Map<string, string>();
      await Promise.all(
        filesToLoad.map(async (path) => {
          try {
            const content = await readProjectFile(path);
            updates.set(path, content);
          } catch {
            updates.set(path, "");
          }
        }),
      );
      if (cancelled || updates.size === 0) return;
      setFileContents((prev) => {
        const toAdd = Array.from(updates.entries()).filter(([k]) => !prev.has(k));
        if (toAdd.length === 0) return prev;
        const next = new Map(prev);
        for (const [k, v] of toAdd) next.set(k, v);
        return next;
      });
    };

    void loadMissingContents();
    return () => {
      cancelled = true;
    };
  }, [fileContents, readProjectFile, selectedAbsolutePaths]);

  // 3i: loadProject reads from refs, stable reference
  const loadProject = async (folderPath: string) => {
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
        customIgnorePatterns: customIgnoreList,
        path: folderPath,
        respectGitignore: gitignoreRef.current,
      });

      loadTree(nodes);

      const totalFileCount = countNodes(nodes);
      if (totalFileCount < 50) {
        const contentMap = new Map<string, string>();

        async function loadContents(nodeList: FileNode[]) {
          const promises = nodeList.map(async (node) => {
            if (node.isDir && node.children) {
              await loadContents(node.children);
            } else if (!node.isDir) {
              try {
                const content = await readProjectFile(node.path);
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
        setFileContents(new Map());
      }

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
  };

  loadProjectRef.current = loadProject;

  const handleOpenProject = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      await loadProject(selected);
    }
  };

  // 3l: Reopen last project
  const handleReopenLastProject = async () => {
    if (lastProjectPath) {
      await loadProject(lastProjectPath);
    }
  };

  // Drag and drop support
  useEffect(() => {
    const unlistens: Array<() => void> = [];

    listen<{ paths: string[]; position: { x: number; y: number } }>(
      "tauri://drag-drop",
      (event) => {
        setIsDragging(false);
        if (event.payload.paths.length > 0) {
          loadProjectRef.current(event.payload.paths[0]);
        }
      },
    ).then((fn) => unlistens.push(fn));

    listen("tauri://drag-enter", () => setIsDragging(true)).then((fn) => unlistens.push(fn));
    listen("tauri://drag-leave", () => setIsDragging(false)).then((fn) => unlistens.push(fn));

    return () => {
      for (const fn of unlistens) {
        fn();
      }
    };
  }, []);

  const handlePack = async () => {
    await pack(packOptions);
    setShowOutput(true);
  };

  const handleFileHighlight = (path: string) => {
    setHighlightedPath(path);
    setTimeout(() => setHighlightedPath(null), 2000);
  };

  // 2a: File preview handler
  const handleFilePreview = (path: string) => {
    setPreviewPath(path);
    setCenterTab("preview");
  };

  const handleClosePreview = () => {
    setPreviewPath(null);
    setCenterTab("options");
  };

  const handleCloseProject = () => {
    setProjectPath(null);
    setProjectName("");
    setPreviewPath(null);
    setCenterTab("options");
    setFileContents(new Map());
    setShowOutput(false);
    setSearchQuery("");
    setHighlightedPath(null);
    clearResult();
    loadTree([]);
  };

  const handleClearDebugLogs = () => {
    setDebugLogs([]);
  };

  const handleExportDebugLogs = async () => {
    if (debugLogs.length === 0) return;
    try {
      const path = await save({
        defaultPath: `bablusheed_debug_${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
        filters: [{ extensions: ["log", "txt"], name: "Log Files" }],
      });
      if (!path) return;
      const exportDir = await dirname(path);
      await invoke("authorize_export_directory", { path: exportDir });

      const header = [
        "Bablusheed Debug Log",
        `Generated: ${new Date().toISOString()}`,
        `Project: ${projectPath ?? "none"}`,
        `Model: ${llmProfile.name}`,
        `Selected files: ${selectedFiles.length}`,
        "",
      ].join("\n");

      await invoke("write_file_content", {
        content: `${header}${debugLogs.join("\n")}\n`,
        path,
      });
    } catch (err) {
      console.error("Failed to export debug logs:", err);
    }
  };

  // 3n: Cap numPacks slider max at selectedFiles.length
  const maxSensiblePacks = Math.min(
    llmProfile.maxFileAttachments,
    Math.max(selectedFiles.length, 1),
  );
  useEffect(() => {
    if (packOptions.numPacks > maxSensiblePacks) {
      setPackOptions((prev) => ({ ...prev, numPacks: maxSensiblePacks }));
    }
  }, [maxSensiblePacks, packOptions.numPacks]);

  // 2b: Determine current workflow step
  const workflowStep: WorkflowStep = (() => {
    if (showOutput && packResult) return 3;
    if (selectedFiles.length > 0) return 2;
    return 1;
  })();

  const totalFiles = countNodes(rootNodes);

  // Find the preview file node
  const previewFile = (() => {
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
  })();

  // 2e: Deselect heaviest N files
  const handleDeselectHeaviest = (count: number) => {
    const sorted = [...selectedFiles]
      .filter((f) => !f.isDir)
      .sort((a, b) => (tokenMap.get(b.path) ?? 0) - (tokenMap.get(a.path) ?? 0));
    const toDeselect = sorted.slice(0, count);
    for (const f of toDeselect) {
      toggleCheck(f.id);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
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
                <button
                  type="button"
                  onClick={handleCloseProject}
                  className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-auto"
                  title="Close project"
                  aria-label="Close project"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {isCalculating && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60 shrink-0" />
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
                    splitPartCountByPath={splitPartCountByAbsolutePath}
                    debugLogging={debugLogging}
                    onDebugLog={appendDebugLog}
                    onRenderSample={appendRenderSample}
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
                  <button
                    type="button"
                    onClick={() => setDebugLogging((v) => !v)}
                    className={cn(
                      "h-7 w-7 inline-flex items-center justify-center rounded border transition-colors",
                      debugLogging
                        ? "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                    title={debugLogging ? "Disable debug logging" : "Enable debug logging"}
                    aria-label={debugLogging ? "Disable debug logging" : "Enable debug logging"}
                  >
                    {debugLogging ? (
                      <BugOff className="h-3.5 w-3.5" />
                    ) : (
                      <Bug className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDebugLogs}
                    disabled={debugLogs.length === 0}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Export debug logs"
                    aria-label="Export debug logs"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClearDebugLogs}
                    disabled={debugLogs.length === 0}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Clear debug logs"
                    aria-label="Clear debug logs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                    className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                    aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  >
                    {theme === "dark" ? (
                      <Sun className="h-3.5 w-3.5" />
                    ) : (
                      <Moon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <TokenBar
                  usedTokens={totalTokens}
                  maxTokens={llmProfile.contextWindowTokens}
                  selectedFileCount={selectedFiles.length}
                  numPacks={packOptions.numPacks}
                  advisoryMaxTokensPerFile={advisoryMaxTokensPerFile}
                  packOptions={packOptions}
                  tokenMap={tokenMap}
                  selectedFilePaths={selectedFiles.map((f) => f.path)}
                  onApplyOptimization={(partial) =>
                    setPackOptions((prev) => ({ ...prev, ...partial }))
                  }
                  onDeselectHeaviest={handleDeselectHeaviest}
                />
                {debugLogging && (
                  <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 space-y-0.5">
                    <div>Debug logging enabled: {debugLogs.length} entries</div>
                    <div className="text-[9px] text-muted-foreground">
                      renders/min app:{debugLiveMetrics.appRendersPerMin} tree:
                      {debugLiveMetrics.fileTreeRendersPerMin} preview:
                      {debugLiveMetrics.outputPreviewRendersPerMin}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      ast recompute:{debugLiveMetrics.astRecomputeCount} cache-hit:
                      {debugLiveMetrics.astCacheHitCount} queued:
                      {debugLiveMetrics.workerQueuedCount} result:
                      {debugLiveMetrics.workerResultCount}
                    </div>
                  </div>
                )}

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
                          : "border-border text-muted-foreground hover:text-foreground",
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
                          : "border-border text-muted-foreground hover:text-foreground",
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
                      contextWindowTokens={llmProfile.contextWindowTokens}
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
                    {advisorySelectionWarning && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-1.5">
                        {advisorySelectionWarning}
                      </p>
                    )}
                    {packWarnings.map((warning) => (
                      <p
                        key={warning}
                        className="text-[11px] text-amber-700 dark:text-amber-400 mb-1.5"
                      >
                        {warning}
                      </p>
                    ))}
                    <button
                      type="button"
                      onClick={handlePack}
                      disabled={selectedFiles.length === 0 || isPacking}
                      className="w-full h-8 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow-sm cursor-pointer transition-all duration-150 hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
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
                  tokenMap={relativeTokenMap}
                  debugLogging={debugLogging}
                  onDebugLog={appendDebugLog}
                  onRenderSample={appendRenderSample}
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
