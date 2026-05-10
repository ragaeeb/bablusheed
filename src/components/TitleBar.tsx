import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Moon, Package2, Square, Sun, X } from 'lucide-react';

// Module-scope: created once, not on every render
const appWindow = getCurrentWindow();

const runWindowAction = (actionName: string, action: () => Promise<void>) => {
    action().catch((err) => {
        console.error(`${actionName} failed:`, err);
    });
};

type TitleBarProps = {
    theme: 'dark' | 'light';
    onToggleTheme: () => void;
};

export function TitleBar({ theme, onToggleTheme }: TitleBarProps) {
    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: header needs onMouseDown for window dragging
        <header
            className="flex h-8 shrink-0 select-none items-center justify-between border-border border-b bg-card px-3"
            style={{ minHeight: 32 }}
            onMouseDown={(e) => {
                if (e.button !== 0) {
                    return;
                }
                const target = e.target as HTMLElement;
                // Don't drag if clicking a button or interactive element
                if (target.closest('button')) {
                    return;
                }
                runWindowAction('startDragging', () => appWindow.startDragging());
            }}
        >
            {/* App title */}
            <div className="pointer-events-none flex items-center gap-1.5">
                <Package2 className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold text-foreground text-xs tracking-tight">Bablusheed</span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5">
                <button
                    type="button"
                    onClick={onToggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                </button>

                <div className="mx-1 h-3.5 w-px bg-border" />

                {/* Window controls */}
                <button
                    type="button"
                    aria-label="Minimize"
                    onClick={() => runWindowAction('minimize', () => appWindow.minimize())}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Minimize"
                >
                    <Minus className="h-3 w-3" />
                </button>
                <button
                    type="button"
                    aria-label="Toggle maximize"
                    onClick={() => runWindowAction('toggleMaximize', () => appWindow.toggleMaximize())}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Toggle maximize"
                >
                    <Square className="h-2.5 w-2.5" />
                </button>
                <button
                    type="button"
                    aria-label="Close"
                    onClick={() => runWindowAction('close', () => appWindow.close())}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-500 hover:text-white"
                    title="Close"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
        </header>
    );
}
