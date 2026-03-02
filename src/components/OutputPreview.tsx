import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronRight, FileText, Package, X } from "lucide-react";
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
  onEventLog?: (level: "error" | "info" | "debug", message: string) => void;
  onRenderSample?: (component: string, timestampMs: number) => void;
  onClose: () => void;
}

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
  filePaths,
  tokenMap,
  packTokens,
}: {
  content: string;
  filePaths: string[];
  tokenMap: Map<string, number>;
  packTokens: number;
}) {
  return (
    <div className="relative flex flex-col h-full">
      {/* Pack manifest */}
      <PackManifest filePaths={filePaths} tokenMap={tokenMap} totalTokens={packTokens} />
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
  onEventLog,
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

  const [showHowTo, setShowHowTo] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const fileTokenMap = buildPackFileTokenMap(packResult.packs, tokenMap);

  const handleExportAll = async () => {
    setExportingAll(true);
    onEventLog?.("info", `export-all start packs=${packResult.packs.length}`);
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        title: "Select folder for exported packs",
      });
      if (!folder || typeof folder !== "string") {
        onEventLog?.("info", "export-all cancelled");
        return;
      }
      await invoke("authorize_export_directory", { path: folder });

      for (const pack of packResult.packs) {
        const filename = `bablusheed_pack_${pack.index + 1}_of_${packResult.packs.length}.txt`;
        const path = await join(folder, filename);
        onEventLog?.("debug", `export-all write start path=${path}`);
        await invoke("write_file_content", { content: pack.content, path });
        onEventLog?.("debug", `export-all write success path=${path}`);
      }
      onEventLog?.("info", `export-all success packs=${packResult.packs.length} dir=${folder}`);
    } catch (err) {
      console.error("Export all failed:", err);
      onEventLog?.("error", `export-all failed err=${String(err)}`);
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
          <button
            type="button"
            onClick={handleExportAll}
            disabled={exportingAll}
            className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
            title={
              packResult.packs.length > 1
                ? "Export all packs as .txt files"
                : "Export pack as .txt file"
            }
          >
            <Package className="h-3 w-3" />
            {exportingAll ? "Exporting..." : packResult.packs.length > 1 ? "Export All" : "Export"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
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
          </ol>
        )}
      </div>
    </div>
  );
}
