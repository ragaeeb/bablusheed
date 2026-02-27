import { FolderOpen, Package2, RotateCcw } from "lucide-react";

interface EmptyStateProps {
  onOpenProject: () => void;
  onReopenLastProject?: () => void;
  lastProjectName?: string | null;
  isDragging: boolean;
}

export function EmptyState({
  onOpenProject,
  onReopenLastProject,
  lastProjectName,
  isDragging,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center h-full gap-8 transition-all ${
        isDragging ? "bg-primary/5 border-2 border-dashed border-primary/40 m-4 rounded-xl" : ""
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Icon */}
        <div className="relative">
          <div
            className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all ${
              isDragging ? "bg-primary/15 scale-110" : "bg-muted border border-border"
            }`}
          >
            <Package2
              className={`h-8 w-8 transition-colors ${
                isDragging ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </div>
          {isDragging && (
            <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary/60 animate-pulse" />
          )}
        </div>

        {/* Text */}
        <div className="text-center space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            {isDragging ? "Drop folder here" : "Open a project folder"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isDragging
              ? "Release to load the project"
              : "Pack your codebase for LLM context windows"}
          </p>
        </div>
      </div>

      {!isDragging && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onOpenProject}
            className="inline-flex items-center gap-2 h-8 px-4 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open Project Folder
          </button>

          {/* 3l: Reopen last project button */}
          {lastProjectName && onReopenLastProject && (
            <button
              type="button"
              onClick={onReopenLastProject}
              className="inline-flex items-center gap-2 h-7 px-3 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reopen {lastProjectName}
            </button>
          )}

          <p className="text-xs text-muted-foreground/70">or drag & drop a folder</p>
        </div>
      )}
    </div>
  );
}
