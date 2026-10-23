import { PressureWindow, validateEvent, type StreamEvent, type WindowConfig, type PressureSnapshot } from "./pressure.js";

export interface ReplayFrame extends PressureSnapshot { smoothedPressure: number | null; pressureChangePerSecond: number | null }
export interface ReplayConfig extends Partial<WindowConfig> {
  stream: string;
  stepMs?: number;
  smoothingHalfLifeMs?: number;
  smoothingSource?: "pressure" | "decayedPressure";
  includeQuietTail?: boolean;
}

/** Stable chronological replay. Frames never consume future observations. */
export function replay(events: readonly StreamEvent[], config: ReplayConfig): ReplayFrame[] {
  const step = config.stepMs ?? 1000;
  const halfLife = config.smoothingHalfLifeMs ?? 5000;
  if (!Number.isSafeInteger(step) || step < 1) throw new Error("Replay step must be a positive integer.");
  if (!Number.isFinite(halfLife) || halfLife < 1) throw new Error("Smoothing half-life must be at least 1 ms.");
  const window = new PressureWindow(config.stream, config);
  const ids = new Set<string>();
  const ordered = events.filter(event => event.stream === config.stream).map(event => {
    validateEvent(event);
    if (ids.has(event.id)) throw new Error(`Duplicate event id: ${event.id}`);
    ids.add(event.id);
    return event;
  }).sort((a, b) => a.timestampMs - b.timestampMs);
  if (!ordered.length) return [];
  const start = ordered[0]!.timestampMs;
  const end = ordered.at(-1)!.timestampMs + (config.includeQuietTail === false ? 0 : window.config.windowMs);
  const frameCount = Math.ceil((end - start) / step) + 1;
  if (!Number.isSafeInteger(end) || frameCount > 10_000) throw new Error("Replay exceeds 10,000 frames; increase the step or select a shorter recording.");
  if (ordered.length > 100_000) throw new Error("Replay supports at most 100,000 events per stream.");
  const frames: ReplayFrame[] = [];
  let cursor = 0, smooth: number | null = null;
  for (let k = 0; k < frameCount; k++) {
    const now = Math.min(start + k * step, end);
    while (cursor < ordered.length && ordered[cursor]!.timestampMs <= now) window.push(ordered[cursor++]!);
    const snapshot = window.snapshot(now);
    const previous = frames.at(-1);
    const dt = previous ? now - previous.timestampMs : step;
    const raw = snapshot[config.smoothingSource ?? "decayedPressure"];
    smooth = raw === null ? null : smooth === null ? raw : smooth + (1 - 2 ** (-dt / halfLife)) * (raw - smooth);
    const change = snapshot.pressure !== null && previous?.pressure !== null && previous?.pressure !== undefined && dt > 0
      ? (snapshot.pressure - previous.pressure) * 1000 / dt : null;
    frames.push({ ...snapshot, smoothedPressure: smooth, pressureChangePerSecond: change });
  }
  return frames;
}
