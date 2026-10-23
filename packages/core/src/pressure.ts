/** One observation. Direction is supplied by the data adapter; weight uses one consistent unit. */
export interface StreamEvent {
  id: string;
  stream: string;
  timestampMs: number;
  direction: 1 | -1;
  weight: number;
  value?: number;
}

export interface WindowConfig {
  windowMs: number;
  halfLifeMs: number;
  minEvents: number;
  maxEvents: number;
}

export const DEFAULT_WINDOW: Readonly<WindowConfig> = Object.freeze({
  windowMs: 30_000, halfLifeMs: 10_000, minEvents: 5, maxEvents: 100_000,
});

export interface PressureSnapshot {
  timestampMs: number;
  stream: string;
  status: "empty" | "warming" | "ready";
  count: number;
  positiveWeight: number;
  negativeWeight: number;
  eventsPerSecond: number;
  weightPerSecond: number;
  /** Bounded descriptive indicators, not probabilities. Null until minEvents is reached. */
  pressure: number | null;
  decayedPressure: number | null;
  /** Kish effective sample size of decayed event weights; not prediction confidence. */
  effectiveEvents: number;
  valueChange: number | null;
}

export function validateEvent(event: StreamEvent): void {
  if (!event || typeof event.id !== "string" || !event.id.trim() || event.id.length > 200
    || typeof event.stream !== "string" || !event.stream.trim() || event.stream.length > 200) {
    throw new Error("Each event needs non-empty id and stream strings (at most 200 characters).");
  }
  if (!Number.isSafeInteger(event.timestampMs) || event.timestampMs < 0) throw new Error("timestampMs must be a non-negative safe integer.");
  if (event.direction !== 1 && event.direction !== -1) throw new Error("direction must be 1 or -1.");
  if (!Number.isFinite(event.weight) || event.weight < 1e-12 || event.weight > 1e12) throw new Error("weight must be finite and between 1e-12 and 1e12.");
  if (event.value !== undefined && (!Number.isFinite(event.value) || Math.abs(event.value) > 1e12)) throw new Error("value must be finite with magnitude at most 1e12 when supplied.");
}

export function validateWindow(config: WindowConfig): void {
  if (!Number.isSafeInteger(config.windowMs) || config.windowMs < 1 || config.windowMs > 3_600_000) throw new Error("Window must be 1 ms to 1 hour.");
  if (!Number.isFinite(config.halfLifeMs) || config.halfLifeMs < 1) throw new Error("Half-life must be at least 1 ms.");
  if (!Number.isSafeInteger(config.maxEvents) || config.maxEvents < 1 || config.maxEvents > 100_000) throw new Error("Capacity must be 1 to 100,000 events.");
  if (!Number.isSafeInteger(config.minEvents) || config.minEvents < 1 || config.minEvents > config.maxEvents) throw new Error("Minimum events must be between 1 and capacity.");
}

/** Forward-only event-time window (now - windowMs, now]. No internal wall clock or I/O. */
export class PressureWindow {
  readonly config: Readonly<WindowConfig>;
  private events: StreamEvent[] = [];
  private head = 0;
  private ids = new Set<string>();
  private clock = -1;

  constructor(readonly stream: string, config: Partial<WindowConfig> = {}) {
    if (!stream.trim()) throw new Error("A stream is required.");
    this.config = Object.freeze({ ...DEFAULT_WINDOW, ...config });
    validateWindow(this.config);
  }

  push(event: StreamEvent): boolean {
    validateEvent(event);
    if (event.stream !== this.stream) throw new Error("Mixed streams must use separate windows.");
    if (this.ids.has(event.id)) return false;
    this.advance(event.timestampMs);
    if (this.events.length - this.head >= this.config.maxEvents) throw new Error("Window capacity reached; no observations were silently discarded.");
    this.events.push({ ...event });
    this.ids.add(event.id);
    return true;
  }

  private advance(nowMs: number): void {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs < this.clock) throw new Error("Event time must be monotonic; late events require upstream reordering.");
    this.clock = nowMs;
    const cutoff = nowMs - this.config.windowMs;
    while (this.head < this.events.length && this.events[this.head]!.timestampMs <= cutoff) {
      this.ids.delete(this.events[this.head]!.id);
      this.head++;
    }
    if (this.head > 4096 || this.head === this.events.length) {
      this.events = this.events.slice(this.head);
      this.head = 0;
    }
  }

  snapshot(nowMs: number): PressureSnapshot {
    this.advance(nowMs); // Expiration also occurs during silence.
    let positive = 0, negative = 0, decayedPositive = 0, decayedNegative = 0;
    let sumSquared = 0, firstValue: number | undefined, lastValue: number | undefined, values = 0;
    const count = this.events.length - this.head;
    // Relative weights avoid underflow during silence; the common age factor cancels in both ratios.
    const newest = this.events.at(-1)?.timestampMs ?? nowMs;
    let maxWeight = 0;
    for (let i = this.head; i < this.events.length; i++) maxWeight = Math.max(maxWeight, this.events[i]!.weight);
    for (let i = this.head; i < this.events.length; i++) {
      const event = this.events[i]!;
      const weighted = (event.weight / maxWeight) * 2 ** (-(newest - event.timestampMs) / this.config.halfLifeMs);
      if (event.direction === 1) { positive += event.weight; decayedPositive += weighted; }
      else { negative += event.weight; decayedNegative += weighted; }
      sumSquared += weighted * weighted;
      if (event.value !== undefined) { firstValue ??= event.value; lastValue = event.value; values++; }
    }
    const total = positive + negative, decayedTotal = decayedPositive + decayedNegative;
    const status = count === 0 ? "empty" : count < this.config.minEvents ? "warming" : "ready";
    const ratio = (a: number, b: number) => Math.max(-100, Math.min(100, 100 * (a - b) / (a + b)));
    return {
      timestampMs: nowMs, stream: this.stream, status, count,
      positiveWeight: positive, negativeWeight: negative,
      eventsPerSecond: count * 1000 / this.config.windowMs,
      weightPerSecond: total * 1000 / this.config.windowMs,
      pressure: status === "ready" ? ratio(positive, negative) : null,
      decayedPressure: status === "ready" ? ratio(decayedPositive, decayedNegative) : null,
      effectiveEvents: sumSquared > 0 ? decayedTotal ** 2 / sumSquared : 0,
      valueChange: values >= 2 ? lastValue! - firstValue! : null,
    };
  }
}
