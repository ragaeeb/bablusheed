import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Check, Copy, Download, FileText, Package, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-xs bg-background/80 backdrop-blur-sm"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1 text-green-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          className="h-7 px-2 text-xs bg-background/80 backdrop-blur-sm"
        >
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1 text-green-400" />
              Saved
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5 mr-1" />
              Save
            </>
          )}
        </Button>
      </div>
      <pre className="text-xs font-mono bg-muted/30 rounded-md p-3 overflow-auto max-h-[calc(100vh-320px)] whitespace-pre-wrap break-all leading-relaxed pt-10">
        {content}
      </pre>
    </div>
  );
}

export function OutputPreview({ packResult, onClose }: OutputPreviewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Output Preview</span>
          <span className="text-xs text-muted-foreground">
            {formatTokenCount(packResult.totalTokens)} total tokens
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden p-3">
        <Tabs defaultValue="0" className="h-full flex flex-col">
          <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0 mb-2">
            {packResult.packs.map((pack) => (
              <TabsTrigger
                key={pack.index}
                value={String(pack.index)}
                className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <FileText className="h-3 w-3 mr-1" />
                Pack {pack.index + 1}
                <span className="ml-1 opacity-70">~{formatTokenCount(pack.estimatedTokens)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {packResult.packs.map((pack) => (
            <TabsContent key={pack.index} value={String(pack.index)} className="flex-1 mt-0">
              <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
                <span>
                  Files: {pack.fileCount} · ~{formatTokenCount(pack.estimatedTokens)} tokens
                </span>
              </div>
              <PackContent
                content={pack.content}
                packIndex={pack.index}
                totalPacks={packResult.packs.length}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="p-3 border-t border-border/50 bg-muted/20">
        <p className="text-xs text-muted-foreground">
          Paste Pack 1 first, then Pack 2, etc. Tell the LLM these are sequential parts of your
          codebase.
        </p>
      </div>
    </div>
  );
}
