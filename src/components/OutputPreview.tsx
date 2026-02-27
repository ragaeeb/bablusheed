import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Check, Copy, Download, FileText, X } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTokenCount } from "@/lib/utils";
import type { PackResponse } from "@/types";

interface OutputPreviewProps {
  packResult: PackResponse;
  onClose: () => void;
}

function PackContent({
  content,
  packIndex,
  totalPacks,
}: {
  content: string;
  packIndex: number;
  totalPacks: number;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = async () => {
    try {
      await writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleSave = async () => {
    try {
      const path = await save({
        defaultPath: `codepacker_pack_${packIndex + 1}_of_${totalPacks}.txt`,
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      });
      if (path) {
        await writeTextFile(path, content);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Action buttons */}
      <div className="flex items-center gap-1 mb-2">
        <button
          type="button"
          onClick={handleCopy}
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
              Copy
            </>
          )}
        </button>
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

export function OutputPreview({ packResult, onClose }: OutputPreviewProps) {
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
        <button
          type="button"
          onClick={onClose}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
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
              <div className="flex items-center gap-2 mb-1.5 text-[10px] text-muted-foreground font-mono">
                <span>{pack.fileCount} files</span>
                <span>·</span>
                <span>~{formatTokenCount(pack.estimatedTokens)} tokens</span>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <PackContent
                  content={pack.content}
                  packIndex={pack.index}
                  totalPacks={packResult.packs.length}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground/60">
          Paste Pack 1 first, then Pack 2, etc. Tell the LLM these are sequential parts.
        </p>
      </div>
    </div>
  );
}
