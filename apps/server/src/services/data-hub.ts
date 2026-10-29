import { EventEmitter } from 'node:events';
import {
  DATA_SOURCES,
  type DataEnvelope,
  type DataMap,
  type DataSource,
  type DataState,
} from '@officeboard/shared';
import { errorMessage } from '../lib/http.js';

export interface Provider<K extends DataSource = DataSource> {
  source: K;
  /** Polling interval; null means the provider only runs when refresh() is called. */
  intervalMs: () => number | null;
  fetch: () => Promise<DataMap[K]>;
}

export class DataHub extends EventEmitter<{ update: [source: DataSource] }> {
  private state = Object.fromEntries(
    DATA_SOURCES.map((s) => [s, { data: null, updatedAt: null, error: null }]),
  ) as unknown as DataState;
  private providers = new Map<DataSource, Provider>();
  private timers = new Map<DataSource, NodeJS.Timeout>();
  private inFlight = new Map<DataSource, Promise<void>>();
  private started = false;

  register<K extends DataSource>(provider: Provider<K>): void {
    this.providers.set(provider.source, provider as unknown as Provider);
    if (this.started) this.schedule(provider.source, true);
  }

  start(): void {
    this.started = true;
    for (const source of this.providers.keys()) this.schedule(source, true);
  }

  stop(): void {
    this.started = false;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  getState(): DataState {
    return this.state;
  }

  get<K extends DataSource>(source: K): DataEnvelope<DataMap[K]> {
    return this.state[source] as DataEnvelope<DataMap[K]>;
  }

  /** Runs the provider now (deduplicating concurrent calls) and restarts its polling timer. */
  refresh(source: DataSource): Promise<void> {
    const existing = this.inFlight.get(source);
    if (existing) return existing;
    const provider = this.providers.get(source);
    if (!provider) return Promise.resolve();
    const run = (async () => {
      try {
        const data = await provider.fetch();
        this.set(source, data);
      } catch (err) {
        const prev = this.state[source];
        (this.state as Record<DataSource, DataEnvelope<unknown>>)[source] = {
          ...prev,
          error: errorMessage(err),
        };
        this.emit('update', source);
      } finally {
        this.inFlight.delete(source);
        if (this.started) this.schedule(source, false);
      }
    })();
    this.inFlight.set(source, run);
    return run;
  }

  /** Re-arms the timer for a source, e.g. after its interval setting changed. */
  reschedule(source: DataSource): void {
    if (this.started) this.schedule(source, false);
  }

  set<K extends DataSource>(source: K, data: DataMap[K]): void {
    (this.state as Record<DataSource, DataEnvelope<unknown>>)[source] = {
      data,
      updatedAt: new Date().toISOString(),
      error: null,
    };
    this.emit('update', source);
  }

  private schedule(source: DataSource, immediate: boolean): void {
    const existing = this.timers.get(source);
    if (existing) clearTimeout(existing);
    this.timers.delete(source);
    const provider = this.providers.get(source);
    if (!provider) return;
    if (immediate) {
      void this.refresh(source);
      return;
    }
    const interval = provider.intervalMs();
    if (interval === null) return;
    this.timers.set(
      source,
      setTimeout(() => void this.refresh(source), interval),
    );
  }
}
