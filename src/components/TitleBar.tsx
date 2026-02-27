import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Moon, Package, Square, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TitleBarProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function TitleBar({ theme, onToggleTheme }: TitleBarProps) {
  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-9 px-3 bg-background/95 border-b border-border/50 select-none shrink-0"
    >
      {/* App title */}
      <div className="flex items-center gap-2 pointer-events-none">
        <Package className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">CodePacker</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>

        <div className="w-px h-4 bg-border/50 mx-1" />

        {/* Window controls */}
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.toggleMaximize()}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive text-muted-foreground hover:text-destructive-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
