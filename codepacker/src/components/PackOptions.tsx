import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileTreeNode, PackOptions as PackOptionsType } from "@/types";

interface PackOptionsProps {
  options: PackOptionsType;
  onChange: (options: PackOptionsType) => void;
  maxPacks: number;
  selectedFiles: FileTreeNode[];
}

function OptionRow({
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label className={cn("text-sm cursor-pointer", disabled && "opacity-50")} htmlFor={label}>
            {label}
          </Label>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <Switch
          id={label}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      </div>
      {children}
    </div>
  );
}

export function PackOptions({ options, onChange, maxPacks, selectedFiles }: PackOptionsProps) {
  const [outputOpen, setOutputOpen] = useState(true);
  const [optimizeOpen, setOptimizeOpen] = useState(true);
  const [ignoreOpen, setIgnoreOpen] = useState(false);

  const hasMarkdownFiles = selectedFiles.some((f) => f.extension === "md");

  const update = (partial: Partial<PackOptionsType>) => {
    onChange({ ...options, ...partial });
  };

  return (
    <div className="space-y-2">
      {/* Output Configuration */}
      <Collapsible open={outputOpen} onOpenChange={setOutputOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 rounded-md transition-colors">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Output Configuration
          </span>
          {outputOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-2 space-y-4">
            {/* Number of packs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Output Packs</Label>
                <span className="text-sm font-mono text-primary">{options.numPacks}</span>
              </div>
              <Slider
                min={1}
                max={maxPacks}
                step={1}
                value={[options.numPacks]}
                onValueChange={([val]) => update({ numPacks: val })}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>{maxPacks}</span>
              </div>
            </div>

            {/* Output format */}
            <div className="space-y-1.5">
              <Label className="text-sm">Output Format</Label>
              <div className="grid grid-cols-3 gap-1">
                {(["plaintext", "markdown", "xml"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => update({ outputFormat: fmt })}
                    className={cn(
                      "px-2 py-1.5 text-xs rounded-md border transition-colors",
                      options.outputFormat === fmt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 border-border hover:bg-muted"
                    )}
                  >
                    {fmt === "plaintext" ? "Plain" : fmt === "markdown" ? "MD" : "XML"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Token Optimization */}
      <Collapsible open={optimizeOpen} onOpenChange={setOptimizeOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 rounded-md transition-colors">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Token Optimization
          </span>
          {optimizeOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-2 space-y-4">
            <OptionRow
              label="Strip Comments"
              description="Remove single-line and multi-line comments from code files"
              checked={options.stripComments}
              onCheckedChange={(val) => update({ stripComments: val })}
            />

            <OptionRow
              label="Reduce Whitespace"
              description="Collapse multiple blank lines and trim trailing whitespace"
              checked={options.reduceWhitespace}
              onCheckedChange={(val) => update({ reduceWhitespace: val })}
            />

            <OptionRow
              label="AST Dead-Code Elimination"
              description="Use Tree-sitter to remove unreachable functions/classes from JS/TS/Python/Rust/Go"
              checked={options.astDeadCode}
              onCheckedChange={(val) => update({ astDeadCode: val })}
            >
              {options.astDeadCode && (
                <div className="pl-2 border-l-2 border-primary/30">
                  <Label className="text-xs text-muted-foreground">Entry Point File</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select an entry point file in the file tree and enable AST analysis via the Pack
                    button
                  </p>
                </div>
              )}
            </OptionRow>

            <OptionRow
              label="Minify Markdown"
              description="Strip badges, HTML comments, div/img/br tags from .md files"
              checked={options.minifyMarkdown}
              onCheckedChange={(val) => update({ minifyMarkdown: val })}
              disabled={!hasMarkdownFiles}
            >
              {options.minifyMarkdown && hasMarkdownFiles && (
                <div className="pl-2 border-l-2 border-primary/30 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.stripMarkdownHeadings}
                      onChange={(e) => update({ stripMarkdownHeadings: e.target.checked })}
                      className="h-3 w-3"
                    />
                    <span className="text-xs text-muted-foreground">Strip headings</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.stripMarkdownBlockquotes}
                      onChange={(e) => update({ stripMarkdownBlockquotes: e.target.checked })}
                      className="h-3 w-3"
                    />
                    <span className="text-xs text-muted-foreground">Strip blockquotes</span>
                  </label>
                </div>
              )}
            </OptionRow>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Include/Exclude Rules */}
      <Collapsible open={ignoreOpen} onOpenChange={setIgnoreOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 rounded-md transition-colors">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Include / Exclude
          </span>
          {ignoreOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-2 space-y-4">
            <OptionRow
              label="Respect .gitignore"
              description="Automatically exclude files listed in .gitignore"
              checked={options.respectGitignore}
              onCheckedChange={(val) => update({ respectGitignore: val })}
            />

            <div className="space-y-1.5">
              <Label className="text-sm">Custom Ignore Patterns</Label>
              <p className="text-xs text-muted-foreground">One glob pattern per line</p>
              <textarea
                value={options.customIgnorePatterns}
                onChange={(e) => update({ customIgnorePatterns: e.target.value })}
                placeholder={"**/*.test.ts\n**/*.spec.*\n**/__mocks__/**"}
                className="w-full h-24 text-xs font-mono bg-muted/50 border border-border rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
