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

interface LLMSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function LLMSelector({ selectedId, onSelect }: LLMSelectorProps) {
  const selected = LLM_PROFILES.find((p) => p.id === selectedId);
  const isApprox = selected ? isApproximateTokenizer(selected.tokenizer) : false;

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger className="w-[220px] bg-background/50">
          <SelectValue placeholder="Select LLM..." />
        </SelectTrigger>
        <SelectContent>
          {LLM_PROFILES.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {profile.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isApprox && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-[200px]">
              Token count is an estimate using cl100k encoding. Actual counts may vary.
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
