import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { format, startOfDay, differenceInDays } from 'date-fns';
import { MarketService, CoinInfo } from './marketService';
import { runWithUpbitRateLimit } from '../utils/upbitRateLimiter';

interface Candle {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  timestamp: number;
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
}

interface DailyData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  value: number;
}

export class DataManager {
  private dataDir: string;
  private coinData: Map<string, Map<string, DailyData>> = new Map();
  private loadedCoins: Set<string> = new Set();
  private marketService: MarketService;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.marketService = MarketService.getInstance();
  }

  async initialize(): Promise<void> {
    await this.ensureDataDirectory();
    await this.marketService.loadMarkets();
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }
  }

  private getDataFilePath(coin: string): string {
    return path.join(this.dataDir, `${coin.toLowerCase()}_daily.json`);
  }

  async loadCoinData(coin: string): Promise<void> {
    // 이미 로드된 경우 스킵
    if (this.loadedCoins.has(coin)) {
      return;
    }

    const coinInfo = this.marketService.getMarket(coin);
    if (!coinInfo) {
      console.log(`❌ ${coin} 마켓 정보를 찾을 수 없습니다.`);
      return;
    }

    // 데이터 맵 초기화
    if (!this.coinData.has(coin)) {
      this.coinData.set(coin, new Map());
    }

    // 기존 데이터 로드
    await this.loadExistingData(coin);

    // 최신 데이터 업데이트
    await this.updateData(coin);

    this.loadedCoins.add(coin);
  }

  private async loadExistingData(coin: string): Promise<void> {
    const filePath = this.getDataFilePath(coin);
    const dataMap = this.coinData.get(coin) || new Map();
    this.coinData.set(coin, dataMap);

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);

      jsonData.data.forEach((item: DailyData) => {
        dataMap.set(item.date, item);
      });

      console.log(`📂 ${coin} 기존 데이터 로드: ${dataMap.size}개`);
    } catch (error) {
      console.log(`📝 ${coin} 새로운 데이터 파일 생성`);
    }
  }

  private async fetchFromUpbit(market: string, to?: Date, count: number = 200): Promise<Candle[]> {
    const url = 'https://api.upbit.com/v1/candles/days';
    const params: any = {
      market,
      count
    };

    if (to) {
      params.to = to.toISOString();
    }

    try {
      const response = await runWithUpbitRateLimit(() => axios.get<Candle[]>(url, { params }));
      return response.data;
    } catch (error) {
      console.error(`❌ Upbit API 오류 (${market}):`, error);
      return [];
    }
  }

  async updateData(coin: string): Promise<void> {
    const coinInfo = this.marketService.getMarket(coin);
    if (!coinInfo) return;

    console.log(`🔄 ${coin} 데이터 업데이트 시작...`);

    let dataMap = this.coinData.get(coin);
    if (!dataMap) {
      dataMap = new Map();
      this.coinData.set(coin, dataMap);
    }

    // 마지막 데이터 날짜 확인
    let oldestDate = new Date();
    if (dataMap.size > 0) {
      const dates = Array.from(dataMap.keys()).sort();
      const newestDateStr = dates[dates.length - 1];
      oldestDate = new Date(newestDateStr + 'T00:00:00Z');
    } else {
      // 처음 실행시 2024년 1월 1일부터 (또는 코인 상장일 이후)
      oldestDate = new Date('2024-01-01T00:00:00Z');
    }

    const today = startOfDay(new Date());
    const daysDiff = differenceInDays(today, oldestDate);

    if (daysDiff <= 0) {
      console.log(`✅ ${coin} 데이터가 최신 상태입니다.`);
      return;
    }

    // 새로운 데이터 가져오기
    let currentDate = new Date();
    const targetDate = oldestDate;
    let fetchCount = 0;
    const maxFetchCount = coin === 'BTC' || coin === 'ETH' ? 10 : 5; // 주요 코인은 더 많이

    while (currentDate > targetDate && fetchCount < maxFetchCount) {
      const candles = await this.fetchFromUpbit(coinInfo.market, currentDate);

      if (candles.length === 0) break;

      let addedCount = 0;
      for (const candle of candles) {
        const date = candle.candle_date_time_kst.substring(0, 10);

        if (!dataMap.has(date)) {
          dataMap.set(date, {
            date,
            open: candle.opening_price,
            high: candle.high_price,
            low: candle.low_price,
            close: candle.trade_price,
            volume: candle.candle_acc_trade_volume,
            value: candle.candle_acc_trade_price
          });
          addedCount++;
        }
      }

      if (addedCount > 0) {
        console.log(`  📊 ${coin}: ${addedCount}개 새로운 데이터 추가`);
      }

      // 가장 오래된 데이터의 날짜로 이동
      const oldestCandle = candles[candles.length - 1];
      currentDate = new Date(oldestCandle.candle_date_time_utc);
      currentDate.setDate(currentDate.getDate() - 1);

      fetchCount++;

      // API 제한 방지
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await this.saveData(coin);
    console.log(`✅ ${coin} 업데이트 완료: 총 ${dataMap.size}개 데이터`);
  }

  private async saveData(coin: string): Promise<void> {
    const filePath = this.getDataFilePath(coin);
    const dataMap = this.coinData.get(coin);

    if (!dataMap) return;

    const sortedData = Array.from(dataMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([_, data]) => data);

    const jsonData = {
      coin,
      lastUpdate: new Date().toISOString(),
      count: sortedData.length,
      data: sortedData
    };

    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
  }

  async getLatestData(coin: string, days?: number): Promise<DailyData[]> {
    // 데이터가 로드되지 않았으면 먼저 로드
    if (!this.loadedCoins.has(coin)) {
      await this.loadCoinData(coin);
    }

    const dataMap = this.coinData.get(coin);
    if (!dataMap) return [];

    const sortedData = Array.from(dataMap.values())
      .sort((a, b) => a.date.localeCompare(b.date));

    if (days) {
      return sortedData.slice(-days);
    }
    return sortedData;
  }

  async getDataRange(coin: string, startDate: string, endDate?: string): Promise<DailyData[]> {
    // 데이터가 로드되지 않았으면 먼저 로드
    if (!this.loadedCoins.has(coin)) {
      await this.loadCoinData(coin);
    }

    const dataMap = this.coinData.get(coin);
    if (!dataMap) return [];

    const end = endDate || format(new Date(), 'yyyy-MM-dd');

    return Array.from(dataMap.values())
      .filter(d => d.date >= startDate && d.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getStatistics(coin: string): Promise<{
    coin: string;
    name: string;
    koreanName: string;
    total: number;
    earliest: string | null;
    latest: string | null;
    currentPrice: number | null;
    highestPrice: { price: number; date: string } | null;
    lowestPrice: { price: number; date: string } | null;
  }> {
    // 데이터가 로드되지 않았으면 먼저 로드
    if (!this.loadedCoins.has(coin)) {
      await this.loadCoinData(coin);
    }

    const dataMap = this.coinData.get(coin);
    const coinInfo = this.marketService.getMarket(coin);

    if (!dataMap || !coinInfo) {
      return {
        coin,
        name: coinInfo?.name || '',
        koreanName: coinInfo?.koreanName || '',
        total: 0,
        earliest: null,
        latest: null,
        currentPrice: null,
        highestPrice: null,
        lowestPrice: null
      };
    }

    const sortedData = Array.from(dataMap.values())
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sortedData.length === 0) {
      return {
        coin,
        name: coinInfo.name,
        koreanName: coinInfo.koreanName,
        total: 0,
        earliest: null,
        latest: null,
        currentPrice: null,
        highestPrice: null,
        lowestPrice: null
      };
    }

    let highest = sortedData[0];
    let lowest = sortedData[0];

    for (const data of sortedData) {
      if (data.high > highest.high) {
        highest = data;
      }
      if (data.low < lowest.low) {
        lowest = data;
      }
    }

    return {
      coin,
      name: coinInfo.name,
      koreanName: coinInfo.koreanName,
      total: sortedData.length,
      earliest: sortedData[0].date,
      latest: sortedData[sortedData.length - 1].date,
      currentPrice: sortedData[sortedData.length - 1].close,
      highestPrice: { price: highest.high, date: highest.date },
      lowestPrice: { price: lowest.low, date: lowest.date }
    };
  }

  getSupportedCoins(): CoinInfo[] {
    return this.marketService.getMarkets();
  }

  getLoadedCoins(): string[] {
    return Array.from(this.loadedCoins);
  }

  async updateAllLoadedCoins(): Promise<void> {
    console.log('🔄 로드된 코인 자동 업데이트 시작...');

    for (const coin of this.loadedCoins) {
      await this.updateData(coin);
      // API 제한 방지
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`✅ ${this.loadedCoins.size}개 코인 업데이트 완료`);
  }
}
