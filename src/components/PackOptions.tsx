import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AST_SUPPORTED_EXTENSIONS } from "@/lib/ast-reachability";
import {
  deriveAdvisoryMaxTokensPerFile,
  resolveAdvisoryMaxTokensPerFile,
} from "@/lib/pack-strategy";
import { cn } from "@/lib/utils";
import type { FileTreeNode, PackOptions as PackOptionsType } from "@/types";

type PackOptionsProps = {
  options: PackOptionsType;
  onChange: (options: PackOptionsType) => void;
  maxPacks: number;
  selectedFiles: FileTreeNode[];
  contextWindowTokens: number;
};

function SectionHeader({ label, isOpen }: { label: string; isOpen: boolean }) {
  return (
    <div className="flex items-center justify-between w-full py-1.5 px-2">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
      {isOpen ? (
        <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 py-0.5">
        <div className="flex items-center gap-1">
          <span className={cn("text-xs text-foreground/80", disabled && "opacity-40")}>
            {label}
          </span>
          {description && (
            <Tooltip>
              <TooltipTrigger className="inline-flex items-center">
                <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="max-w-[180px] text-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <Switch
          aria-label={label}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className={cn(disabled && "opacity-40")}
        />
      </div>
      {children}
    </div>
  );
}

// Derive the display hint from the constant so it always matches the actual supported list
const AST_SUPPORTED_EXTENSIONS_HINT = Array.from(AST_SUPPORTED_EXTENSIONS).join(", ");

export function PackOptions({
  options,
  onChange,
  maxPacks,
  selectedFiles,
  contextWindowTokens,
}: PackOptionsProps) {
  const [outputOpen, setOutputOpen] = useState(true);
  const [optimizeOpen, setOptimizeOpen] = useState(true);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const optionsRef = useRef(options);

  const hasMarkdownFiles = selectedFiles.some((f) => f.extension === "md");
  const autoAdvisoryMax = deriveAdvisoryMaxTokensPerFile(contextWindowTokens);
  const effectiveAdvisoryMax = resolveAdvisoryMaxTokensPerFile(
    options.maxTokensPerPackFile,
    contextWindowTokens
  );

  // Files eligible as AST entry points
  const astEligibleFiles = selectedFiles.filter(
    (f) => !f.isDir && AST_SUPPORTED_EXTENSIONS.has(f.extension.toLowerCase())
  );
  const eligiblePathSet = useMemo(
    () => new Set(astEligibleFiles.map((f) => f.path)),
    [astEligibleFiles]
  );

  const update = (partial: Partial<PackOptionsType>) => {
    onChange({ ...options, ...partial });
  };

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Revalidate entryPoint when eligible files change.
  useEffect(() => {
    if (options.entryPoint && !eligiblePathSet.has(options.entryPoint)) {
      onChange({ ...optionsRef.current, entryPoint: null });
    }
  }, [eligiblePathSet, onChange, options.entryPoint]);

  return (
    <div className="space-y-0">
      {/* Output Configuration */}
      <Collapsible open={outputOpen} onOpenChange={setOutputOpen}>
        <CollapsibleTrigger className="w-full hover:bg-muted/50 rounded transition-colors">
          <SectionHeader label="Output" isOpen={outputOpen} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-2 space-y-3">
            {/* Number of packs */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/80">Number of output packs</span>
                <span className="text-xs font-mono font-semibold text-primary">
                  {options.numPacks}
                </span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min={1}
                  max={maxPacks}
                  step={1}
                  value={options.numPacks}
                  onChange={(e) => update({ numPacks: Number(e.target.value) })}
                  className="w-full h-1.5 appearance-none bg-muted rounded-full cursor-pointer accent-primary"
                  style={{
                    background:
                      maxPacks > 1
                        ? `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${((options.numPacks - 1) / (maxPacks - 1)) * 100}%, hsl(var(--muted)) ${((options.numPacks - 1) / (maxPacks - 1)) * 100}%, hsl(var(--muted)) 100%)`
                        : "hsl(var(--primary))",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono">
                <span>1</span>
                <span>{maxPacks}</span>
              </div>
            </div>

            {/* Output format */}
            <div className="space-y-1.5">
              <span className="text-xs text-foreground/80">Format</span>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {(["plaintext", "markdown"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => update({ outputFormat: fmt })}
                    className={cn(
                      "py-1 text-[10px] font-medium rounded border transition-colors cursor-pointer",
                      options.outputFormat === fmt
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-transparent border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {fmt === "plaintext" ? "Plain" : "Markdown"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/80">Advisory max tokens per file</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  effective: {effectiveAdvisoryMax.toLocaleString()}
                </span>
              </div>
              <input
                type="number"
                min={0}
                step={500}
                value={options.maxTokensPerPackFile}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  update({
                    maxTokensPerPackFile: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
                  });
                }}
                className="w-full h-7 text-[11px] font-mono bg-muted/40 border border-border rounded px-2 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground">
                Use <span className="font-mono">0</span> for auto (
                {autoAdvisoryMax.toLocaleString()} for this model). Oversized files are warned and
                auto-split across packs.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="h-px bg-border/60 mx-2" />

      {/* Token Optimization */}
      <Collapsible open={optimizeOpen} onOpenChange={setOptimizeOpen}>
        <CollapsibleTrigger className="w-full hover:bg-muted/50 rounded transition-colors">
          <SectionHeader label="Optimize" isOpen={optimizeOpen} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-2 space-y-1">
            <ToggleRow
              label="Strip Comments"
              description="Remove single-line and multi-line comments from code files"
              checked={options.stripComments}
              onCheckedChange={(val) => update({ stripComments: val })}
            />

            <ToggleRow
              label="Reduce Whitespace"
              description="Collapse multiple blank lines and trim trailing whitespace"
              checked={options.reduceWhitespace}
              onCheckedChange={(val) => update({ reduceWhitespace: val })}
            />

            <ToggleRow
              label="AST Dead-Code"
              description="Use Tree-sitter to remove unreachable functions/classes from JS/TS/Python/Rust/Go"
              checked={options.astDeadCode}
              onCheckedChange={(val) =>
                update({
                  astDeadCode: val,
                  entryPoint: val
                    ? (options.entryPoint ?? astEligibleFiles[0]?.path ?? null)
                    : null,
                })
              }
            >
              {options.astDeadCode && (
                <div className="ml-2 pl-2 border-l-2 border-primary/20 mt-1 space-y-1">
                  {astEligibleFiles.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">
                      Select source files ({AST_SUPPORTED_EXTENSIONS_HINT}) to choose an entry point
                    </p>
                  ) : (
                    <>
                      <p className="text-[10px] text-muted-foreground">Entry point file:</p>
                      <select
                        value={options.entryPoint ?? ""}
                        onChange={(e) => update({ entryPoint: e.target.value || null })}
                        className="w-full text-[10px] font-mono bg-muted/40 border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— select entry point —</option>
                        {astEligibleFiles.map((f) => (
                          <option key={f.path} value={f.path}>
                            {f.relativePath}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )}
            </ToggleRow>

            <ToggleRow
              label="Minify Markdown"
              description="Strip badges, HTML comments, div/img/br tags from .md files"
              checked={options.minifyMarkdown}
              onCheckedChange={(val) => update({ minifyMarkdown: val })}
              disabled={!hasMarkdownFiles}
            >
              {options.minifyMarkdown && hasMarkdownFiles && (
                <div className="ml-2 pl-2 border-l-2 border-primary/20 mt-1 space-y-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.stripMarkdownHeadings}
                      onChange={(e) => update({ stripMarkdownHeadings: e.target.checked })}
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="text-[10px] text-muted-foreground">Strip headings</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.stripMarkdownBlockquotes}
                      onChange={(e) => update({ stripMarkdownBlockquotes: e.target.checked })}
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="text-[10px] text-muted-foreground">Strip blockquotes</span>
                  </label>
                </div>
              )}
            </ToggleRow>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="h-px bg-border/60 mx-2" />

      {/* Include/Exclude Rules */}
      <Collapsible open={ignoreOpen} onOpenChange={setIgnoreOpen}>
        <CollapsibleTrigger className="w-full hover:bg-muted/50 rounded transition-colors">
          <SectionHeader label="Filters" isOpen={ignoreOpen} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-2 space-y-2">
            <ToggleRow
              label="Respect .gitignore"
              description="Automatically exclude files listed in .gitignore"
              checked={options.respectGitignore}
              onCheckedChange={(val) => update({ respectGitignore: val })}
            />

            <div className="space-y-1">
              <span className="text-xs text-foreground/80">Ignore Patterns</span>
              <p className="text-[10px] text-muted-foreground/60">One glob per line</p>
              <textarea
                value={options.customIgnorePatterns}
                onChange={(e) => update({ customIgnorePatterns: e.target.value })}
                placeholder={"**/*.test.ts\n**/*.spec.*\n**/__mocks__/**"}
                className="w-full h-20 text-[11px] font-mono bg-muted/40 border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background placeholder:text-muted-foreground/40"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
