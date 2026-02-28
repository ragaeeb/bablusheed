import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Package,
  X,
} from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildPackFileTokenMap } from "@/lib/output-preview";
import { useRenderDiagnostics } from "@/lib/render-diagnostics";
import { formatTokenCount } from "@/lib/utils";
import type { PackResponse } from "@/types";

interface OutputPreviewProps {
  packResult: PackResponse;
  /** Optional real per-file token counts from the tokenizer; used to show accurate per-file estimates */
  tokenMap?: Map<string, number>;
  debugLogging?: boolean;
  onDebugLog?: (line: string) => void;
  onRenderSample?: (component: string, timestampMs: number) => void;
  onClose: () => void;
}

const DEFAULT_PROMPT = `You are reading a multi-file project pack.

Instructions:
- Each embedded file starts with a path marker like "// path/to/file.ext".
- Use those markers to identify file boundaries and references.
- Read packs in order (Pack 1, then Pack 2, ...).
- If a file appears as "(part N/M)", treat parts as one continuous file in part order.
- Cite exact file paths when referencing code in your answer.
`;

function PackManifest({
  filePaths,
  tokenMap,
  totalTokens,
}: {
  filePaths: string[];
  tokenMap: Map<string, number>;
  totalTokens: number;
}) {
  return (
    <div className="mb-2 p-2 bg-muted/30 border border-border rounded text-[10px] font-mono space-y-0.5">
      {filePaths.map((p) => {
        const t = tokenMap.get(p);
        return (
          <div key={p} className="flex items-center gap-2">
            <span className="text-muted-foreground">📄</span>
            <span className="flex-1 truncate text-foreground/70">{p}</span>
            {t !== undefined && (
              <span className="text-muted-foreground shrink-0">~{formatTokenCount(t)}</span>
            )}
          </div>
        );
      })}
      <div className="border-t border-border/60 mt-1 pt-1 text-muted-foreground">
        Total: {filePaths.length} files · ~{formatTokenCount(totalTokens)} tokens
      </div>
    </div>
  );
}

function PackContent({
  content,
  packIndex,
  totalPacks,
  prompt,
  filePaths,
  tokenMap,
  packTokens,
}: {
  content: string;
  packIndex: number;
  totalPacks: number;
  prompt: string;
  filePaths: string[];
  tokenMap: Map<string, number>;
  packTokens: number;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedWithPrompt, setCopiedWithPrompt] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = async (withPrompt: boolean) => {
    try {
      const text = withPrompt && prompt ? `${prompt}\n\n---\n\n${content}` : content;
      await writeText(text);
      if (withPrompt) {
        setCopiedWithPrompt(true);
        setTimeout(() => setCopiedWithPrompt(false), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleSave = async () => {
    try {
      const path = await save({
        defaultPath: `bablusheed_pack_${packIndex + 1}_of_${totalPacks}.txt`,
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      });
      if (path) {
        await invoke("write_file_content", { path, content });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Pack manifest */}
      <PackManifest filePaths={filePaths} tokenMap={tokenMap} totalTokens={packTokens} />

      {/* Action buttons */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <button
          type="button"
          onClick={() => handleCopy(false)}
          className={`inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border transition-colors ${
            copied
              ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400"
              : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy Pack
            </>
          )}
        </button>

        {prompt && (
          <button
            type="button"
            onClick={() => handleCopy(true)}
            className={`inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border transition-colors ${
              copiedWithPrompt
                ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400"
                : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
            }`}
          >
            {copiedWithPrompt ? (
              <>
                <Check className="h-3 w-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy + Prompt
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          className={`inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border transition-colors ${
            saved
              ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400"
              : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
          }`}
        >
          {saved ? (
            <>
              <Check className="h-3 w-3" />
              Saved
            </>
          ) : (
            <>
              <Download className="h-3 w-3" />
              Save
            </>
          )}
        </button>
      </div>
      <pre className="flex-1 text-[11px] font-mono bg-muted/30 border border-border rounded overflow-auto whitespace-pre-wrap break-all leading-relaxed p-3 text-foreground/80">
        {content}
      </pre>
    </div>
  );
}

export function OutputPreview({
  packResult,
  tokenMap,
  debugLogging = false,
  onDebugLog,
  onRenderSample,
  onClose,
}: OutputPreviewProps) {
  useRenderDiagnostics({
    component: "OutputPreview",
    enabled: debugLogging,
    onLog: onDebugLog,
    onRenderSample,
    threshold: 80,
    windowMs: 3000,
  });

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [showHowTo, setShowHowTo] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const fileTokenMap = buildPackFileTokenMap(packResult.packs, tokenMap);

  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        title: "Select folder for exported packs",
      });
      if (!folder || typeof folder !== "string") return;

      for (const pack of packResult.packs) {
        const filename = `bablusheed_pack_${pack.index + 1}_of_${packResult.packs.length}.txt`;
        const path = await join(folder, filename);
        await invoke("write_file_content", { path, content: pack.content });
      }
    } catch (err) {
      console.error("Export all failed:", err);
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Output</span>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {formatTokenCount(packResult.totalTokens)} tokens
          </span>
        </div>
        <div className="flex items-center gap-1">
          {packResult.packs.length > 1 && (
            <button
              type="button"
              onClick={handleExportAll}
              disabled={exportingAll}
              className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
              title="Export all packs as .txt files"
            >
              <Package className="h-3 w-3" />
              {exportingAll ? "Exporting..." : "Export All"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Prompt Builder */}
      <div className="shrink-0 px-3 pt-2 pb-1 border-b border-border">
        <label
          htmlFor="prompt-builder"
          className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1"
        >
          Prompt (prepended to Pack 1 when copying)
        </label>
        <textarea
          id="prompt-builder"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Please review this code for security vulnerabilities..."
          className="w-full h-14 text-[11px] font-mono bg-muted/40 border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-3">
        <Tabs defaultValue="0" className="h-full flex flex-col">
          <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0 mb-2 shrink-0">
            {packResult.packs.map((pack) => (
              <TabsTrigger
                key={pack.index}
                value={String(pack.index)}
                className="h-6 px-2 text-[11px] font-medium rounded border border-border bg-background data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-3 w-3 mr-1" />
                Pack {pack.index + 1}
                <span className="ml-1 opacity-60 font-mono">
                  ~{formatTokenCount(pack.estimatedTokens)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {packResult.packs.map((pack) => (
            <TabsContent
              key={pack.index}
              value={String(pack.index)}
              className="flex-1 mt-0 overflow-hidden flex flex-col"
            >
              <div className="flex-1 overflow-hidden flex flex-col">
                <PackContent
                  content={pack.content}
                  packIndex={pack.index}
                  totalPacks={packResult.packs.length}
                  prompt={pack.index === 0 ? prompt : ""}
                  filePaths={pack.filePaths}
                  tokenMap={fileTokenMap}
                  packTokens={pack.estimatedTokens}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* How-to hint (collapsible) */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        <button
          type="button"
          onClick={() => setShowHowTo((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors w-full"
        >
          {showHowTo ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          How to use these files
        </button>
        {showHowTo && (
          <ol className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground/70 list-decimal list-inside">
            <li>Go to claude.ai or chatgpt.com and start a new conversation.</li>
            <li>Attach Pack 1 as a file (drag the .txt file or use the paperclip icon).</li>
            <li>If you have multiple packs, attach them all before sending.</li>
            <li>Paste your prompt and send.</li>
            <li>Use "Copy + Prompt" to copy Pack 1 with your prompt already prepended.</li>
          </ol>
        )}
      </div>
    </div>
  );
}
