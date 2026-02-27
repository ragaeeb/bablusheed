import { FolderOpen, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onOpenProject: () => void;
  isDragging: boolean;
}

export function EmptyState({ onOpenProject, isDragging }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center h-full gap-6 transition-colors ${
        isDragging ? "bg-primary/5 border-2 border-dashed border-primary rounded-lg" : ""
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Package className="h-10 w-10 text-primary" />
          </div>
          {isDragging && (
            <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary animate-pulse" />
          )}
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold">
            {isDragging ? "Drop folder here" : "Open a project folder"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isDragging
              ? "Release to load the project"
              : "Select files to pack for LLM consumption"}
          </p>
        </div>
      </div>

      {!isDragging && (
        <div className="flex flex-col items-center gap-3">
          <Button onClick={onOpenProject} size="lg" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Open Project Folder
          </Button>
          <p className="text-xs text-muted-foreground">Or drag & drop a folder here</p>
        </div>
      )}
    </div>
  );
}
