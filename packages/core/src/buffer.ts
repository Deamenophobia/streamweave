/** Fixed-capacity history for visualization. Never use overwrite semantics for analytical windows. */
export class HistoryBuffer<T> {
  private values: (T | undefined)[];
  private cursor = 0;
  private count = 0;
  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new Error("History capacity must be a positive integer.");
    this.values = new Array<T | undefined>(capacity);
  }
  push(value: T): void {
    this.values[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }
  toArray(): T[] {
    return Array.from(
      { length: this.count },
      (_, i) => this.values[(this.cursor - this.count + i + this.capacity) % this.capacity]!,
    );
  }
  reset(): void {
    this.values.fill(undefined);
    this.cursor = 0;
    this.count = 0;
  }
}
