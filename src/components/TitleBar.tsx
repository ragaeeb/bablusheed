import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Moon, Package2, Square, Sun, X } from "lucide-react";

interface TitleBarProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function TitleBar({ theme, onToggleTheme }: TitleBarProps) {
  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-8 px-3 bg-card border-b border-border select-none shrink-0"
      style={{ minHeight: 32 }}
    >
      {/* App title */}
      <div className="flex items-center gap-1.5 pointer-events-none">
        <Package2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold tracking-tight text-foreground">CodePacker</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleTheme}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        </button>

        <div className="w-px h-3.5 bg-border mx-1" />

        {/* Window controls */}
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Minimize"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.toggleMaximize()}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Maximize"
        >
          <Square className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-white hover:bg-red-500 transition-colors"
          title="Close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
