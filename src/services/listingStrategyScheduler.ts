import fs from 'fs/promises';
import path from 'path';
import { DataManager } from './dataManager';
import {
  ListingStrategyReport,
  buildListingStrategyReport,
  LISTING_SCENARIOS
} from './listingStrategyService';

type SchedulerStatus = 'idle' | 'running' | 'error';

export interface ListingStrategySnapshot {
  status: SchedulerStatus;
  lastUpdated: Date | null;
  nextRunAt: Date | null;
  report: ListingStrategyReport | null;
  error?: string;
}

export class ListingStrategyScheduler {
  private report: ListingStrategyReport | null = null;
  private lastUpdated: Date | null = null;
  private nextRunAt: Date | null = null;
  private status: SchedulerStatus = 'idle';
  private timer?: NodeJS.Timeout;
  private readonly intervalMs: number;
  private readonly months: number;
  private readonly persistPath?: string;

  constructor(
    private readonly dataManager: DataManager,
    options?: { intervalMs?: number; months?: number; persistPath?: string }
  ) {
    this.intervalMs = options?.intervalMs ?? 1000 * 60 * 60 * 3; // default 3 hours
    this.months = options?.months ?? 6;
    this.persistPath = options?.persistPath;
  }

  async start(): Promise<void> {
    if (this.persistPath) {
      await this.loadFromDisk();
    }
    void this.triggerRun();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.status = 'idle';
  }

  getSnapshot(): ListingStrategySnapshot {
    return {
      status: this.status,
      lastUpdated: this.lastUpdated,
      nextRunAt: this.nextRunAt,
      report: this.report,
      error: this.status === 'error' ? this.lastError : undefined
    };
  }

  private lastError: string | undefined;

  private async triggerRun(): Promise<void> {
    await this.runAnalysis();
    this.scheduleNextRun();
  }

  private scheduleNextRun(): void {
    this.nextRunAt = new Date(Date.now() + this.intervalMs);
    this.timer = setTimeout(() => {
      this.triggerRun();
    }, this.intervalMs);
  }

  private async runAnalysis(): Promise<void> {
    if (this.status === 'running') {
      return;
    }

    const coins = this.dataManager.getSupportedCoins();
    if (coins.length === 0) {
      console.warn('ListingStrategyScheduler: No supported coins available yet.');
      return;
    }

    this.status = 'running';
    this.lastError = undefined;

    try {
      const report = await buildListingStrategyReport(coins, this.months);
      this.report = report;
      this.lastUpdated = new Date();
      await this.saveToDisk(report);
      this.status = 'idle';
    } catch (error: any) {
      console.error('ListingStrategyScheduler: analysis failed', error);
      this.status = 'error';
      this.lastError = error?.message ?? 'Unknown error';
    }
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.persistPath) return;
    try {
      const raw = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(raw) as ListingStrategyReport;
      this.report = parsed;
      this.lastUpdated = parsed.generatedAt ? new Date(parsed.generatedAt) : new Date();
      console.log('ListingStrategyScheduler: loaded cached report from disk');
    } catch (error) {
      // Ignore if file missing/corrupt; will regenerate.
      console.warn('ListingStrategyScheduler: no cached report found, will compute fresh.');
    }
  }

  private async saveToDisk(report: ListingStrategyReport): Promise<void> {
    if (!this.persistPath) return;
    try {
      await fs.mkdir(path.dirname(this.persistPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(this.persistPath, JSON.stringify(report, null, 2));
    } catch (error) {
      console.error('ListingStrategyScheduler: failed to persist report', error);
    }
  }
}

export { LISTING_SCENARIOS };
