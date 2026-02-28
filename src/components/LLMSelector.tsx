import { Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isApproximateTokenizer, LLM_PROFILES } from "@/lib/llm-profiles";
import { formatTokenCount } from "@/lib/utils";

interface LLMSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function LLMSelector({ selectedId, onSelect }: LLMSelectorProps) {
  const selected = LLM_PROFILES.find((p) => p.id === selectedId);
  const isApprox = selected ? isApproximateTokenizer(selected.tokenizer) : false;

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <Select value={selectedId} onValueChange={(value) => value && onSelect(value)}>
        <SelectTrigger className="flex-1 h-7 text-xs bg-background border-border hover:border-primary/50 focus:ring-1 focus:ring-ring">
          <SelectValue placeholder="Select model..." />
        </SelectTrigger>
        <SelectContent className="text-xs">
          {LLM_PROFILES.map((profile) => (
            <SelectItem key={profile.id} value={profile.id} className="text-xs">
              {profile.name} · {formatTokenCount(profile.contextWindowTokens)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isApprox && (
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center">
            <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="max-w-[180px] text-xs">
              Token count is a conservative estimate for Claude/Gemini. Exact counts require
              provider count APIs.
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
