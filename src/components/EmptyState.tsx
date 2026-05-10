import { FolderOpen, Package2, RotateCcw } from 'lucide-react';

type EmptyStateProps = {
    onOpenProject: () => void;
    onReopenLastProject?: () => void;
    lastProjectName?: string | null;
    isDragging: boolean;
};

export function EmptyState({ onOpenProject, onReopenLastProject, lastProjectName, isDragging }: EmptyStateProps) {
    return (
        <div
            className={`flex h-full flex-col items-center justify-center gap-8 transition-all ${
                isDragging ? 'm-4 rounded-xl border-2 border-primary/40 border-dashed bg-primary/5' : ''
            }`}
        >
            <div className="flex flex-col items-center gap-4">
                {/* Icon */}
                <div className="relative">
                    <div
                        className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all ${
                            isDragging ? 'scale-110 bg-primary/15' : 'border border-border bg-muted'
                        }`}
                    >
                        <Package2
                            className={`h-8 w-8 transition-colors ${
                                isDragging ? 'text-primary' : 'text-muted-foreground'
                            }`}
                        />
                    </div>
                    {isDragging && (
                        <div className="absolute inset-0 animate-pulse rounded-2xl border-2 border-primary/60 border-dashed" />
                    )}
                </div>

                {/* Text */}
                <div className="space-y-1 text-center">
                    <h2 className="font-semibold text-foreground text-sm">
                        {isDragging ? 'Drop folder here' : 'Open a project folder'}
                    </h2>
                    <p className="text-muted-foreground text-xs">
                        {isDragging ? 'Release to load the project' : 'Pack your codebase for LLM context windows'}
                    </p>
                </div>
            </div>

            {!isDragging && (
                <div className="flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={onOpenProject}
                        className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-xs shadow-sm transition-colors hover:bg-primary/90"
                    >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Open Project Folder
                    </button>

                    {/* 3l: Reopen last project button */}
                    {lastProjectName && onReopenLastProject && (
                        <button
                            type="button"
                            onClick={onReopenLastProject}
                            className="inline-flex h-7 items-center gap-2 rounded-md border border-border px-3 font-medium text-muted-foreground text-xs transition-colors hover:border-foreground/30 hover:text-foreground"
                            title={`Reopen ${lastProjectName}`}
                        >
                            <RotateCcw className="h-3 w-3" />
                            <span className="shrink-0">Reopen</span>
                            <span
                                className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap"
                                title={lastProjectName}
                            >
                                {lastProjectName}
                            </span>
                        </button>
                    )}

                    <p className="text-muted-foreground/70 text-xs">or drag & drop a folder</p>
                </div>
            )}
        </div>
    );
}
