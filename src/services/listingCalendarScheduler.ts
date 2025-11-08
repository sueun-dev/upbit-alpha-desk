import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { DataManager } from './dataManager';
import { CoinInfo } from './marketService';

export interface ListingCalendarEntry {
  symbol: string;
  name: string;
  koreanName: string;
  market: string;
  listingDate: string;
  isRecent: boolean;
}

export interface ListingCalendarSnapshot {
  status: 'idle' | 'running' | 'error';
  lastUpdated: Date | null;
  nextRunAt: Date | null;
  entries: ListingCalendarEntry[];
  recentCount: number;
  error?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class ListingCalendarScheduler {
  private status: ListingCalendarSnapshot['status'] = 'idle';
  private lastUpdated: Date | null = null;
  private nextRunAt: Date | null = null;
  private entries: ListingCalendarEntry[] = [];
  private recentCount = 0;
  private timer?: NodeJS.Timeout;
  private lastError?: string;

  private readonly persistPath?: string;

  constructor(
    private readonly dataManager: DataManager,
    private readonly options: {
      intervalMs?: number;
      months?: number;
      maxCoins?: number;
      persistPath?: string;
    } = {}
  ) {
    this.persistPath = options.persistPath;
  }

  async start() {
    if (this.persistPath) {
      await this.loadFromDisk();
    }
    void this.triggerRun();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.status = 'idle';
  }

  getSnapshot(): ListingCalendarSnapshot {
    return {
      status: this.status,
      lastUpdated: this.lastUpdated,
      nextRunAt: this.nextRunAt,
      entries: this.entries,
      recentCount: this.recentCount,
      error: this.lastError
    };
  }

  private async triggerRun() {
    await this.runAnalysis();
    this.scheduleNextRun();
  }

  private scheduleNextRun() {
    const interval = this.options.intervalMs ?? 1000 * 60 * 60 * 3; // default 3h
    this.nextRunAt = new Date(Date.now() + interval);
    this.timer = setTimeout(() => this.triggerRun(), interval);
  }

  private async runAnalysis() {
    if (this.status === 'running') return;
    const coins = this.dataManager.getSupportedCoins();
    if (coins.length === 0) return;

    this.status = 'running';
    this.lastError = undefined;

    try {
      const entries = await this.computeListingDates(coins);
      entries.sort((a, b) => b.listingDate.localeCompare(a.listingDate));

      this.entries = entries;
      this.recentCount = entries.filter(entry => entry.isRecent).length;
      this.lastUpdated = new Date();
      await this.saveToDisk();
      this.status = 'idle';
    } catch (error: any) {
      console.error('ListingCalendarScheduler failed:', error);
      this.status = 'error';
      this.lastError = error?.message ?? 'Unknown error';
    }
  }

  private async computeListingDates(coins: CoinInfo[]): Promise<ListingCalendarEntry[]> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - (this.options.months ?? 6));
    const maxCoins = this.options.maxCoins ?? 30;
    const results: ListingCalendarEntry[] = [];

    for (const coin of coins.slice(0, maxCoins)) {
      try {
        const listingDate = await this.fetchOldestDate(coin);
        if (!listingDate) continue;

        const dateObj = new Date(listingDate);
        results.push({
          symbol: coin.symbol,
          name: coin.name,
          koreanName: coin.koreanName,
          market: coin.market,
          listingDate,
          isRecent: dateObj > sixMonthsAgo
        });
        await sleep(100); // basic rate limit guard
      } catch (error) {
        console.error(`Listing calendar: failed to fetch ${coin.symbol}`, error);
      }
    }

    return results;
  }

  private async fetchOldestDate(coin: CoinInfo): Promise<string | null> {
    let oldestDate: string | null = null;
    let attempts = 0;
    const maxAttempts = 5;
    let currentDate = new Date();

    while (attempts < maxAttempts && !oldestDate) {
      const response = await axios.get('https://api.upbit.com/v1/candles/days', {
        params: {
          market: coin.market,
          count: 200,
          to: currentDate.toISOString()
        }
      });

      if (response.data && response.data.length > 0) {
        const oldestCandle = response.data[response.data.length - 1];
        oldestDate = oldestCandle.candle_date_time_kst.substring(0, 10);

        if (response.data.length === 200) {
          currentDate = new Date(oldestCandle.candle_date_time_utc);
          currentDate.setDate(currentDate.getDate() - 1);
          attempts++;
          continue;
        }
      }
      break;
    }

    return oldestDate;
  }

  private async loadFromDisk() {
    if (!this.persistPath) return;
    try {
      const raw = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        entries: ListingCalendarEntry[];
        recentCount: number;
        lastUpdated?: string;
      };
      this.entries = parsed.entries || [];
      this.recentCount = parsed.recentCount || 0;
      this.lastUpdated = parsed.lastUpdated ? new Date(parsed.lastUpdated) : null;
      console.log('ListingCalendarScheduler: loaded cached calendar from disk');
    } catch (error) {
      console.warn('ListingCalendarScheduler: no cached calendar found, will compute fresh.');
    }
  }

  private async saveToDisk() {
    if (!this.persistPath) return;
    try {
      await fs.mkdir(path.dirname(this.persistPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(
        this.persistPath,
        JSON.stringify(
          {
            entries: this.entries,
            recentCount: this.recentCount,
            lastUpdated: this.lastUpdated?.toISOString() ?? null
          },
          null,
          2
        )
      );
    } catch (error) {
      console.error('ListingCalendarScheduler: failed to persist calendar', error);
    }
  }
}
