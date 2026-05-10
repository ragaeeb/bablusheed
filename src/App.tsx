import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { dirname } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { load } from '@tauri-apps/plugin-store';
import { Download, FolderOpen, Loader2, Moon, Package2, Sun, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { FilePreview } from '@/components/FilePreview';
import { FileTree } from '@/components/FileTree';
import { LLMSelector } from '@/components/LLMSelector';
import { OutputPreview } from '@/components/OutputPreview';
import { PackOptions } from '@/components/PackOptions';
import { TokenBar } from '@/components/TokenBar';
import { TopHeavyFiles } from '@/components/TopHeavyFiles';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useFileTree } from '@/hooks/useFileTree';
import { usePackager } from '@/hooks/usePackager';
import { useTokenCount } from '@/hooks/useTokenCount';
import { getFileTreeProjectKey } from '@/lib/file-tree-view';
import { getProfile } from '@/lib/llm-profiles';
import { DEFAULT_CUSTOM_IGNORE_PATTERNS_TEXT, normalizeSavedPackOptions } from '@/lib/pack-options';
import {
    buildOversizedFilesWarning,
    findOversizedFiles,
    forecastSplitPartCounts,
    resolveAdvisoryMaxTokensPerFile,
} from '@/lib/pack-strategy';
import { useRenderDiagnostics } from '@/lib/render-diagnostics';
import { cn } from '@/lib/utils';
import type { FileNode, PackOptions as PackOptionsType } from '@/types';

const DEFAULT_PACK_OPTIONS: PackOptionsType = {
    astDeadCode: false,
    customIgnorePatterns: DEFAULT_CUSTOM_IGNORE_PATTERNS_TEXT,
    entryPoint: null,
    maxTokensPerPackFile: 0,
    minifyMarkdown: true,
    numPacks: 3,
    outputFormat: 'markdown',
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
        if (!n.isDir) {
            count++;
        }
        if (n.children) {
            count += countNodes(n.children);
        }
    }
    return count;
}

function buildPackFingerprint(selectedPaths: string[], llmId: string, options: PackOptionsType): string {
    return JSON.stringify({
        llmId,
        options: {
            astDeadCode: options.astDeadCode,
            entryPoint: options.entryPoint,
            maxTokensPerPackFile: options.maxTokensPerPackFile,
            minifyMarkdown: options.minifyMarkdown,
            numPacks: options.numPacks,
            outputFormat: options.outputFormat,
            reduceWhitespace: options.reduceWhitespace,
            stripComments: options.stripComments,
            stripMarkdownBlockquotes: options.stripMarkdownBlockquotes,
            stripMarkdownHeadings: options.stripMarkdownHeadings,
        },
        selectedPaths: [...selectedPaths].sort(),
    });
}

/** 2b: Workflow step indicator */
type WorkflowStep = 1 | 2 | 3;

function StepIndicator({ step, currentStep }: { step: WorkflowStep; currentStep: WorkflowStep }) {
    const labels: Record<WorkflowStep, string> = {
        1: 'Select Files',
        2: 'Configure',
        3: 'Pack & Export',
    };
    const isActive = step === currentStep;
    const isCompleted = step < currentStep;

    return (
        <div
            className={cn(
                'flex items-center gap-1 font-medium text-[10px] transition-colors',
                isActive ? 'text-primary' : isCompleted ? 'text-foreground/60' : 'text-muted-foreground/40',
            )}
        >
            <span
                className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full border font-bold text-[9px]',
                    isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isCompleted
                          ? 'border-foreground/20 bg-foreground/20 text-foreground/60'
                          : 'border-muted-foreground/30 bg-transparent text-muted-foreground/40',
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

type LogLevel = 'off' | 'error' | 'info' | 'debug';

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 3,
    error: 1,
    info: 2,
    off: 0,
};

function isLogLevel(value: unknown): value is LogLevel {
    return value === 'off' || value === 'error' || value === 'info' || value === 'debug';
}

function shouldCaptureLog(level: LogLevel, incoming: 'error' | 'info' | 'debug'): boolean {
    return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[incoming];
}

function hasTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export default function App() {
    const [theme, setTheme] = useState<'dark' | 'light'>('light');
    const [projectPath, setProjectPath] = useState<string | null>(null);
    const [projectName, setProjectName] = useState<string>('');
    const [isLoadingTree, setIsLoadingTree] = useState(false);
    const [selectedLlmId, setSelectedLlmId] = useState('chatgpt-5-2');
    const [packOptions, setPackOptions] = useState<PackOptionsType>(DEFAULT_PACK_OPTIONS);
    const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
    const [isDragging, setIsDragging] = useState(false);
    const [showOutput, setShowOutput] = useState(false);
    // 2a: File preview state
    const [previewPath, setPreviewPath] = useState<string | null>(null);
    const [centerTab, setCenterTab] = useState<'options' | 'preview'>('options');
    // 3l: Last project path for reopen
    const [lastProjectPath, setLastProjectPath] = useState<string | null>(null);
    const [lastProjectName, setLastProjectName] = useState<string | null>(null);
    const [logLevel, setLogLevel] = useState<LogLevel>('error');
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [fileTreeLoadRevision, setFileTreeLoadRevision] = useState(0);
    const [hasManualNumPacksOverride, setHasManualNumPacksOverride] = useState(false);
    const [lastPackedFingerprint, setLastPackedFingerprint] = useState<string | null>(null);
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
    const logLevelRef = useRef<LogLevel>('error');
    const lastRequestedPackFingerprintRef = useRef<string | null>(null);
    const currentPackFingerprintRef = useRef<string>('');
    const fileContentsRef = useRef(fileContents);
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
    useEffect(() => {
        fileContentsRef.current = fileContents;
    }, [fileContents]);

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
    const debugLogging = logLevel === 'debug';
    const appendLog = useCallback((level: 'error' | 'info' | 'debug', message: string) => {
        if (!shouldCaptureLog(logLevelRef.current, level)) {
            return;
        }
        const line = `[${new Date().toISOString()}] [${level}] ${message}`;
        setDebugLogs((prev) => {
            const next = [...prev, line];
            return next.length > 5000 ? next.slice(next.length - 5000) : next;
        });
    }, []);
    const appendDebugLog = useCallback((line: string) => {
        if (!shouldCaptureLog(logLevelRef.current, 'debug')) {
            return;
        }
        const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
        const normalized = match
            ? `[${match[1]}] [debug] ${match[2]}`
            : `[${new Date().toISOString()}] [debug] ${line}`;
        setDebugLogs((prev) => {
            const next = [...prev, normalized];
            return next.length > 5000 ? next.slice(next.length - 5000) : next;
        });
    }, []);
    const appendRenderSample = (component: string, timestampMs: number) => {
        if (!debugLogging) {
            return;
        }
        const bucket = renderSamplesRef.current[component] ?? [];
        bucket.push(timestampMs);
        renderSamplesRef.current[component] = bucket;
    };
    const incrementDebugMetric = (name: 'astRecompute' | 'astCacheHit' | 'workerQueued' | 'workerResult') => {
        if (!debugLogging) {
            return;
        }
        debugMetricCountsRef.current[name] += 1;
    };

    useRenderDiagnostics({
        component: 'App',
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
        appendLog,
    );

    useEffect(() => {
        logLevelRef.current = logLevel;
    }, [logLevel]);

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
        appendLog,
    );

    const advisoryMaxTokensPerFile = resolveAdvisoryMaxTokensPerFile(
        packOptions.maxTokensPerPackFile,
        llmProfile.contextWindowTokens,
    );
    const selectedPackFiles = useMemo(
        () =>
            selectedFiles
                .filter((f) => !f.isDir)
                .map((f) => ({
                    content: fileContents.get(f.path) ?? '',
                    path: f.relativePath,
                    tokenCount: tokenMap.get(f.path),
                })),
        [fileContents, selectedFiles, tokenMap],
    );
    const oversizedSelection = findOversizedFiles(selectedPackFiles, advisoryMaxTokensPerFile);
    const advisorySelectionWarning = buildOversizedFilesWarning(oversizedSelection, advisoryMaxTokensPerFile);
    const splitPartCountByAbsolutePath = useMemo(() => {
        const selectedAbsoluteFiles = selectedFiles
            .filter((f) => !f.isDir)
            .map((f) => ({
                content: fileContents.get(f.path) ?? '',
                path: f.path,
                tokenCount: tokenMap.get(f.path),
            }));
        return forecastSplitPartCounts(selectedAbsoluteFiles, advisoryMaxTokensPerFile);
    }, [advisoryMaxTokensPerFile, fileContents, selectedFiles, tokenMap]);
    const relativeTokenMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const file of selectedFiles) {
            if (file.isDir) {
                continue;
            }
            const tokens = tokenMap.get(file.path);
            if (tokens !== undefined) {
                map.set(file.relativePath, tokens);
            }
        }
        return map;
    }, [selectedFiles, tokenMap]);
    const selectedAbsolutePaths = useMemo(
        () => selectedFiles.filter((f) => !f.isDir).map((f) => f.path),
        [selectedFiles],
    );
    const selectedFileCount = selectedAbsolutePaths.length;
    const maxSensiblePacks = Math.min(llmProfile.maxFileAttachments, Math.max(selectedFileCount, 1));
    const defaultNumPacks = Math.min(maxSensiblePacks, Math.max(1, Math.min(selectedFileCount, 5)));
    const currentPackFingerprint = buildPackFingerprint(selectedAbsolutePaths, selectedLlmId, packOptions);
    const isPackOutdated =
        packResult !== null && lastPackedFingerprint !== null && lastPackedFingerprint !== currentPackFingerprint;

    useEffect(() => {
        currentPackFingerprintRef.current = currentPackFingerprint;
    }, [currentPackFingerprint]);

    useEffect(() => {
        if (!packResult) {
            return;
        }
        setLastPackedFingerprint(lastRequestedPackFingerprintRef.current ?? currentPackFingerprintRef.current);
    }, [packResult]);

    // Update token counts in tree when tokenMap changes
    useEffect(() => {
        updateTokens(tokenMap);
    }, [tokenMap, updateTokens]);

    // Load settings from store on startup
    useEffect(() => {
        if (!hasTauriRuntime()) {
            return;
        }
        async function loadSettings() {
            try {
                const store = await load('settings.json');
                storeRef.current = store;

                const savedTheme = await store.get<'dark' | 'light'>('theme');
                const savedLlmId = await store.get<string>('lastLlmProfileId');
                const savedPackOptions = await store.get<PackOptionsType>('packOptions');
                const savedLogLevel = await store.get<LogLevel>('logLevel');
                const legacyDebugLogging = await store.get<boolean>('debugLogging');
                const savedLastPath = await store.get<string>('lastProjectPath');

                if (savedTheme) {
                    setTheme(savedTheme);
                }
                if (savedLlmId) {
                    setSelectedLlmId(savedLlmId);
                }
                if (isLogLevel(savedLogLevel)) {
                    setLogLevel(savedLogLevel);
                } else if (legacyDebugLogging) {
                    setLogLevel('debug');
                }
                if (savedPackOptions) {
                    setPackOptions(normalizeSavedPackOptions(savedPackOptions, DEFAULT_PACK_OPTIONS));
                }
                if (savedLastPath) {
                    setLastProjectPath(savedLastPath);
                    const parts = savedLastPath.replace(/\\/g, '/').split('/');
                    setLastProjectName(parts[parts.length - 1] ?? savedLastPath);
                }
            } catch (err) {
                console.warn('Failed to load settings:', err);
            }
        }
        loadSettings();
    }, []);

    // Apply theme class to root element
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [theme]);

    // 3k: Save settings with 1500ms debounce; don't save projectPath here
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!storeRef.current) {
                return;
            }
            try {
                await storeRef.current.set('theme', theme);
                await storeRef.current.set('lastLlmProfileId', selectedLlmId);
                await storeRef.current.set('packOptions', packOptions);
                await storeRef.current.set('logLevel', logLevel);
                await storeRef.current.save();
            } catch (err) {
                console.warn('Failed to save settings:', err);
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [theme, selectedLlmId, packOptions, logLevel]);

    const readProjectFile = useCallback(
        async (path: string): Promise<string> => invoke<string>('read_file_content', { path }),
        [],
    );

    const hydrateFileContents = useCallback(
        async (paths: string[], reason: string): Promise<Map<string, string>> => {
            const pendingPaths = Array.from(new Set(paths)).filter((path) => !fileContentsRef.current.has(path));
            if (pendingPaths.length === 0) {
                return new Map();
            }

            appendLog('debug', `${reason} start count=${pendingPaths.length}`);
            const updates = new Map<string, string>();

            await Promise.all(
                pendingPaths.map(async (path) => {
                    try {
                        const content = await readProjectFile(path);
                        updates.set(path, content);
                    } catch (err) {
                        appendLog('error', `${reason} failed path=${path} err=${String(err)}`);
                    }
                }),
            );

            if (updates.size > 0) {
                setFileContents((prev) => {
                    const next = new Map(prev);
                    for (const [path, content] of updates) {
                        next.set(path, content);
                    }
                    return next;
                });
            }

            appendLog('debug', `${reason} done loaded=${updates.size} requested=${pendingPaths.length}`);
            return updates;
        },
        [appendLog, readProjectFile],
    );

    // 3c: Lazy file content loading — load on demand, cache in fileContents.
    // Uses functional updater to check existence inside the updater so fileContents
    // is not a dependency (avoids recreating the callback on every Map change).
    const loadFileContent = useCallback(
        async (path: string): Promise<void> => {
            appendLog('debug', `preview-read start path=${path}`);
            try {
                const content = await readProjectFile(path);
                setFileContents((prev) => {
                    if (prev.has(path)) {
                        return prev;
                    }
                    const next = new Map(prev);
                    next.set(path, content);
                    return next;
                });
                appendLog('debug', `preview-read success path=${path} chars=${content.length}`);
            } catch (err) {
                appendLog('error', `preview-read failed path=${path} err=${String(err)}`);
            }
        },
        [appendLog, readProjectFile],
    );

    // Load content for selected files whenever selection changes.
    // Filter to only files not yet loaded to avoid redundant reads.
    useEffect(() => {
        const filesToLoad = selectedFiles
            .filter((f) => !f.isDir)
            .map((f) => f.path)
            .filter((path) => !fileContents.has(path));
        if (filesToLoad.length === 0) {
            return;
        }

        let cancelled = false;
        const loadMissingContents = async () => {
            const updates = await hydrateFileContents(filesToLoad, 'selection-preload');
            if (cancelled || updates.size === 0) {
                return;
            }
        };

        void loadMissingContents();
        return () => {
            cancelled = true;
        };
    }, [fileContents, hydrateFileContents, selectedFiles]);

    // 3i: loadProject reads from refs, stable reference
    const loadProject = async (folderPath: string) => {
        setIsLoadingTree(true);
        setHasManualNumPacksOverride(false);
        setLastPackedFingerprint(null);
        lastRequestedPackFingerprintRef.current = null;
        setFileTreeLoadRevision((prev) => prev + 1);
        setSearchQuery('');
        setHighlightedPath(null);
        setProjectPath(folderPath);
        const parts = folderPath.replace(/\\/g, '/').split('/');
        const name = parts[parts.length - 1] ?? folderPath;
        setProjectName(name);
        appendLog('info', `project-load start path=${folderPath}`);

        try {
            const customIgnoreList = ignorePatternRef.current
                .split('\n')
                .map((p) => p.trim())
                .filter(Boolean);

            const nodes = await invoke<FileNode[]>('walk_directory', {
                customIgnorePatterns: customIgnoreList,
                path: folderPath,
                respectGitignore: gitignoreRef.current,
            });

            loadTree(nodes);

            const totalFileCount = countNodes(nodes);
            appendLog('info', `project-load tree-ready path=${folderPath} files=${totalFileCount}`);
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
                            } catch (err) {
                                appendLog('error', `project-preload failed path=${node.path} err=${String(err)}`);
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
                await storeRef.current.set('lastProjectPath', folderPath);
                await storeRef.current.save();
            }
            setLastProjectPath(folderPath);
            setLastProjectName(name);
            appendLog('info', `project-load success path=${folderPath}`);
        } catch (err) {
            console.error('Failed to load project:', err);
            appendLog('error', `project-load failed path=${folderPath} err=${String(err)}`);
        } finally {
            setIsLoadingTree(false);
        }
    };

    loadProjectRef.current = loadProject;

    const handleOpenProject = async () => {
        appendLog('debug', 'project-open-dialog start');
        const selected = await open({ directory: true, multiple: false });
        if (selected && typeof selected === 'string') {
            appendLog('info', `project-open-dialog selected path=${selected}`);
            await loadProject(selected);
        } else {
            appendLog('debug', 'project-open-dialog cancelled');
        }
    };

    // 3l: Reopen last project
    const handleReopenLastProject = async () => {
        if (lastProjectPath) {
            appendLog('info', `project-reopen path=${lastProjectPath}`);
            await loadProject(lastProjectPath);
        }
    };

    // Drag and drop support
    useEffect(() => {
        if (!hasTauriRuntime()) {
            return;
        }
        const unlistens: Array<() => void> = [];
        let disposed = false;

        listen<{ paths: string[]; position: { x: number; y: number } }>('tauri://drag-drop', (event) => {
            setIsDragging(false);
            if (event.payload.paths.length > 0) {
                loadProjectRef.current(event.payload.paths[0]);
            }
        }).then((fn) => {
            if (disposed) {
                fn();
                return;
            }
            unlistens.push(fn);
        });

        listen('tauri://drag-enter', () => setIsDragging(true)).then((fn) => {
            if (disposed) {
                fn();
                return;
            }
            unlistens.push(fn);
        });
        listen('tauri://drag-leave', () => setIsDragging(false)).then((fn) => {
            if (disposed) {
                fn();
                return;
            }
            unlistens.push(fn);
        });

        return () => {
            disposed = true;
            for (const fn of unlistens) {
                fn();
            }
        };
    }, []);

    const handlePack = async () => {
        appendLog(
            'info',
            `pack-trigger selected=${selectedFileCount} packs=${packOptions.numPacks} llm=${selectedLlmId}`,
        );
        const missingSelectedPaths = selectedFiles
            .filter((file) => !file.isDir)
            .map((file) => file.path)
            .filter((path) => !fileContents.has(path));

        let contentOverrides: Map<string, string> | undefined;
        if (missingSelectedPaths.length > 0) {
            const loaded = await hydrateFileContents(missingSelectedPaths, 'pack-preload');
            contentOverrides = new Map(fileContentsRef.current);
            for (const [path, content] of loaded) {
                contentOverrides.set(path, content);
            }
        }

        lastRequestedPackFingerprintRef.current = currentPackFingerprint;
        const result = await pack(packOptions, contentOverrides);
        setShowOutput(result !== null);
    };

    const handleFileHighlight = (path: string) => {
        setHighlightedPath(path);
        setTimeout(() => setHighlightedPath(null), 2000);
    };

    // 2a: File preview handler
    const handleFilePreview = (path: string) => {
        setPreviewPath(path);
        setCenterTab('preview');
    };

    const handleClosePreview = () => {
        setPreviewPath(null);
        setCenterTab('options');
    };

    const handleCloseProject = () => {
        appendLog('info', `project-close path=${projectPath ?? 'none'}`);
        setProjectPath(null);
        setProjectName('');
        setPreviewPath(null);
        setCenterTab('options');
        setFileContents(new Map());
        setHasManualNumPacksOverride(false);
        setLastPackedFingerprint(null);
        lastRequestedPackFingerprintRef.current = null;
        setShowOutput(false);
        setSearchQuery('');
        setHighlightedPath(null);
        clearResult();
        loadTree([]);
    };

    const handleClearDebugLogs = () => {
        setDebugLogs([]);
    };

    const handleExportDebugLogs = async () => {
        if (debugLogs.length === 0) {
            return;
        }
        appendLog('info', `bug-report export start lines=${debugLogs.length}`);
        try {
            const path = await save({
                defaultPath: `bablusheed_bug_report_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
                filters: [{ extensions: ['txt', 'log'], name: 'Log Files' }],
            });
            if (!path) {
                appendLog('info', 'bug-report export cancelled');
                return;
            }
            const exportDir = await dirname(path);
            await invoke('authorize_export_directory', { path: exportDir });

            const header = [
                'Bablusheed Debug Log',
                `Generated: ${new Date().toISOString()}`,
                `Project: ${projectPath ?? 'none'}`,
                `Model: ${llmProfile.name}`,
                `Log level: ${logLevel}`,
                `Selected files: ${selectedFiles.length}`,
                '',
            ].join('\n');

            await invoke('write_file_content', {
                content: `${header}${debugLogs.join('\n')}\n`,
                path,
            });
            appendLog('info', `bug-report export success path=${path} lines=${debugLogs.length}`);
        } catch (err) {
            console.error('Failed to export debug logs:', err);
            appendLog('error', `bug-report export failed err=${String(err)}`);
        }
    };

    // 3n: Cap numPacks slider max at selectedFiles.length
    useEffect(() => {
        if (selectedFileCount === 0) {
            setHasManualNumPacksOverride(false);
        }
    }, [selectedFileCount]);

    useEffect(() => {
        if (packOptions.numPacks > maxSensiblePacks) {
            setPackOptions((prev) => ({ ...prev, numPacks: maxSensiblePacks }));
            return;
        }

        if (!hasManualNumPacksOverride && packOptions.numPacks !== defaultNumPacks) {
            setPackOptions((prev) => ({ ...prev, numPacks: defaultNumPacks }));
        }
    }, [defaultNumPacks, hasManualNumPacksOverride, maxSensiblePacks, packOptions.numPacks]);

    // 2b: Determine current workflow step
    const workflowStep: WorkflowStep = (() => {
        if (showOutput && packResult) {
            return 3;
        }
        if (selectedFiles.length > 0) {
            return 2;
        }
        return 1;
    })();

    const totalFiles = useMemo(() => countNodes(rootNodes), [rootNodes]);

    // Find the preview file node
    const previewFile = useMemo(() => {
        if (!previewPath) {
            return null;
        }
        function findNode(nodes: typeof rootNodes): (typeof rootNodes)[0] | null {
            for (const n of nodes) {
                if (n.path === previewPath) {
                    return n;
                }
                if (n.children) {
                    const found = findNode(n.children);
                    if (found) {
                        return found;
                    }
                }
            }
            return null;
        }
        return findNode(rootNodes);
    }, [previewPath, rootNodes]);

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
            <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
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
                        <div className="flex w-[260px] shrink-0 flex-col overflow-hidden border-border border-r bg-card">
                            {/* Project header */}
                            <div className="flex shrink-0 items-center gap-1.5 border-border border-b bg-muted/30 px-2 py-1.5">
                                <button
                                    type="button"
                                    onClick={handleOpenProject}
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    title="Open project"
                                >
                                    <FolderOpen className="h-3.5 w-3.5" />
                                </button>
                                <span
                                    className="truncate font-medium font-mono text-foreground/80 text-xs"
                                    title={projectPath}
                                >
                                    {projectName}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCloseProject}
                                    className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    title="Close project"
                                    aria-label="Close project"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                                {isCalculating && (
                                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/60" />
                                )}
                            </div>

                            {/* File tree */}
                            <div className="flex-1 overflow-hidden">
                                {isLoadingTree ? (
                                    <div className="flex h-20 items-center justify-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span className="text-xs">Loading...</span>
                                    </div>
                                ) : (
                                    <FileTree
                                        key={getFileTreeProjectKey(projectPath, fileTreeLoadRevision)}
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
                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-border border-r bg-background">
                            {/* Top bar: model selector + token bar */}
                            <div className="shrink-0 space-y-2 border-border border-b bg-card/50 px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <LLMSelector selectedId={selectedLlmId} onSelect={setSelectedLlmId} />
                                    <div className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2">
                                        <span className="font-medium text-[10px] text-muted-foreground">Logs</span>
                                        <select
                                            value={logLevel}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                if (isLogLevel(next)) {
                                                    setLogLevel(next);
                                                }
                                            }}
                                            className="h-5 rounded border border-border bg-background px-1 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                            aria-label="Log verbosity"
                                        >
                                            <option value="off">Off</option>
                                            <option value="error">Errors</option>
                                            <option value="info">Info</option>
                                            <option value="debug">Debug</option>
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleExportDebugLogs}
                                        disabled={debugLogs.length === 0}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Download bug report"
                                        aria-label="Download bug report"
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearDebugLogs}
                                        disabled={debugLogs.length === 0}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Clear debug logs"
                                        aria-label="Clear debug logs"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                                    >
                                        {theme === 'dark' ? (
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
                                {logLevel !== 'off' && (
                                    <div className="space-y-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                                        <div>
                                            Logging: {logLevel} · {debugLogs.length} entries
                                        </div>
                                        {debugLogging && (
                                            <>
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
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* 2b: Step indicators */}
                                <div className="flex items-center gap-3">
                                    <StepIndicator step={1} currentStep={workflowStep} />
                                    <span className="text-[10px] text-muted-foreground/30">→</span>
                                    <StepIndicator step={2} currentStep={workflowStep} />
                                    <span className="text-[10px] text-muted-foreground/30">→</span>
                                    <StepIndicator step={3} currentStep={workflowStep} />
                                </div>

                                {/* 2a: Tab toggle between Options and Preview */}
                                {previewPath && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setCenterTab('options')}
                                            className={cn(
                                                'rounded border px-2 py-0.5 font-medium text-[10px] transition-colors',
                                                centerTab === 'options'
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            Options
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCenterTab('preview')}
                                            className={cn(
                                                'rounded border px-2 py-0.5 font-medium text-[10px] transition-colors',
                                                centerTab === 'preview'
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            Preview
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Center content: Options or Preview */}
                            {centerTab === 'preview' && previewFile ? (
                                <div className="flex-1 overflow-hidden">
                                    <FilePreview
                                        file={previewFile}
                                        fileContents={fileContents}
                                        tokenMap={tokenMap}
                                        packOptions={packOptions}
                                        isSelected={previewFile.checkState === 'checked'}
                                        onToggleSelect={toggleCheck}
                                        onLoadContent={loadFileContent}
                                        debugLogging={debugLogging}
                                        onDebugLog={appendDebugLog}
                                        onClose={handleClosePreview}
                                    />
                                </div>
                            ) : (
                                <>
                                    {/* Options + Heaviest files */}
                                    <div className="flex-1 overflow-y-auto">
                                        <PackOptions
                                            options={packOptions}
                                            onChange={(next) => {
                                                if (next.numPacks !== packOptions.numPacks) {
                                                    setHasManualNumPacksOverride(true);
                                                }
                                                setPackOptions(next);
                                            }}
                                            maxPacks={maxSensiblePacks}
                                            selectedFiles={selectedFiles}
                                            contextWindowTokens={llmProfile.contextWindowTokens}
                                        />

                                        {selectedFiles.length > 0 && (
                                            <>
                                                <div className="mx-2 h-px bg-border/60" />
                                                <TopHeavyFiles
                                                    selectedFiles={selectedFiles}
                                                    tokenMap={tokenMap}
                                                    onFileClick={handleFileHighlight}
                                                />
                                            </>
                                        )}
                                    </div>

                                    {/* Pack button */}
                                    <div className="shrink-0 border-border border-t bg-card/50 px-3 py-2">
                                        {isPackOutdated && (
                                            <p className="mb-1.5 font-medium text-[11px] text-amber-700 dark:text-amber-400">
                                                Output is out of date. Selection or options changed since last pack.
                                            </p>
                                        )}
                                        {packError && (
                                            <p className="mb-1.5 font-mono text-[11px] text-red-500 dark:text-red-400">
                                                {packError}
                                            </p>
                                        )}
                                        {advisorySelectionWarning && (
                                            <p className="mb-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                                                {advisorySelectionWarning}
                                            </p>
                                        )}
                                        {packWarnings.map((warning) => (
                                            <p
                                                key={warning}
                                                className="mb-1.5 text-[11px] text-amber-700 dark:text-amber-400"
                                            >
                                                {warning}
                                            </p>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={handlePack}
                                            disabled={selectedFileCount === 0 || isPacking}
                                            className={cn(
                                                'inline-flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md font-semibold text-primary-foreground text-xs shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-40',
                                                isPackOutdated
                                                    ? 'bg-amber-600 hover:bg-amber-500'
                                                    : 'bg-primary hover:bg-primary/90',
                                            )}
                                        >
                                            {isPacking ? (
                                                <>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    Packing...
                                                </>
                                            ) : (
                                                <>
                                                    <Package2 className="h-3.5 w-3.5" />
                                                    {isPackOutdated ? 'Re-Pack' : 'Pack'}{' '}
                                                    {selectedFileCount > 0 ? `${selectedFileCount} Files` : 'Files'}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* RIGHT: Output Preview */}
                        {showOutput && packResult && (
                            <div className="flex w-[400px] shrink-0 flex-col overflow-hidden border-border border-l">
                                <OutputPreview
                                    packResult={packResult}
                                    tokenMap={relativeTokenMap}
                                    debugLogging={debugLogging}
                                    onDebugLog={appendDebugLog}
                                    onEventLog={appendLog}
                                    onRenderSample={appendRenderSample}
                                    onClose={() => {
                                        setShowOutput(false);
                                        setLastPackedFingerprint(null);
                                        lastRequestedPackFingerprintRef.current = null;
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
