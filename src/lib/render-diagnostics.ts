import { useEffect, useRef } from "react";

interface RenderDiagnosticsOptions {
  component: string;
  enabled: boolean;
  onLog?: (line: string) => void;
  onRenderSample?: (component: string, timestampMs: number) => void;
  threshold?: number;
  windowMs?: number;
}

interface RenderBurstState {
  startedAt: number;
  count: number;
  warned: boolean;
}

export function useRenderDiagnostics({
  component,
  enabled,
  onLog,
  onRenderSample,
  threshold = 40,
  windowMs = 3000,
}: RenderDiagnosticsOptions): void {
  const stateRef = useRef<RenderBurstState>({
    startedAt: 0,
    count: 0,
    warned: false,
  });

  useEffect(() => {
    if (!enabled) {
      stateRef.current = { startedAt: 0, count: 0, warned: false };
      return;
    }

    const now = Date.now();
    onRenderSample?.(component, now);
    const state = stateRef.current;
    const elapsed = now - state.startedAt;

    if (state.startedAt === 0 || elapsed > windowMs) {
      state.startedAt = now;
      state.count = 1;
      state.warned = false;
      return;
    }

    state.count += 1;
    if (!state.warned && state.count >= threshold) {
      state.warned = true;
      onLog?.(
        `[${new Date().toISOString()}] render-burst component=${component} count=${state.count} windowMs=${windowMs}`
      );
    }
  });
}
