import axios from 'axios';
import { CoinInfo } from './marketService';
import { fetchBybitHourlyKlines } from '../clients/bybitClient';
import { runWithUpbitRateLimit, sleep } from '../utils/upbitRateLimiter';

interface UpbitDailyCandle {
  candle_date_time_kst: string;
  candle_date_time_utc: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
}

type PriceProfile = 'HIGH' | 'MID' | 'LOW';

export interface ListingScenarioDefinition {
  id: string;
  label: string;
  description: string;
  entryHours: number;
  priceProfile: PriceProfile;
}

export interface ScenarioResult {
  scenarioId: string;
  label: string;
  date: string;
  entryHours: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  priceProfile: PriceProfile;
  liquidated: boolean;
}

export interface CoinListingAnalysis {
  symbol: string;
  market: string;
  name: string;
  koreanName: string;
  listingDate: string;
  scenarios: ScenarioResult[];
}

export interface ScenarioSummary {
  scenarioId: string;
  label: string;
  description: string;
  entryHours: number;
  sampleSize: number;
  averageReturn: number | null;
  successRate: number | null;
}

export interface ListingStrategyReport {
  generatedAt: string;
  months: number;
  coinsAnalyzed: number;
  scenarioDefinitions: ListingScenarioDefinition[];
  summary: ScenarioSummary[];
  coins: CoinListingAnalysis[];
}

const BASE_SCENARIOS: Array<{ id: string; label: string; description: string; entryHours: number }> =
  [
    { id: 'D0_OPEN', label: '상장 직후 숏', description: '상장 순간에 진입 후 24시간 보유', entryHours: 0 },
    {
      id: 'D0_12H',
      label: '상장 +12시간 숏',
      description: '상장 12시간 뒤 진입 후 24시간 보유',
      entryHours: 12
    },
    { id: 'D1_OPEN', label: '상장 +1일 숏', description: '상장 다음날 진입 후 24시간 보유', entryHours: 24 },
    { id: 'D3_OPEN', label: '상장 +3일 숏', description: '상장 3일 뒤 진입 후 24시간 보유', entryHours: 72 },
    { id: 'D5_OPEN', label: '상장 +5일 숏', description: '상장 5일 뒤 진입 후 24시간 보유', entryHours: 120 }
  ];

const PRICE_PROFILES: Array<{ id: PriceProfile; label: string }> = [
  { id: 'HIGH', label: '최고가' },
  { id: 'MID', label: '중간값' },
  { id: 'LOW', label: '최저가' }
];

export const LISTING_SCENARIOS: ListingScenarioDefinition[] = BASE_SCENARIOS.flatMap(base =>
  PRICE_PROFILES.map(profile => ({
    id: `${base.id}_${profile.id}`,
    label: `${base.label} · ${profile.label}`,
    description: `${base.description} (${profile.label} 진입)`,
    entryHours: base.entryHours,
    priceProfile: profile.id
  }))
);

const HOLD_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;
const MAX_ENTRY_HOURS = Math.max(...LISTING_SCENARIOS.map(s => s.entryHours));
const DEFAULT_MAX_COINS = 150;

async function fetchUpbitDailyCandles(coin: CoinInfo): Promise<UpbitDailyCandle[]> {
  const response = await runWithUpbitRateLimit(() =>
    axios.get<UpbitDailyCandle[]>('https://api.upbit.com/v1/candles/days', {
      params: { market: coin.market, count: 200 }
    })
  );
  return response.data;
}

function isRecentListing(date: string, cutoff: Date): boolean {
  return new Date(`${date}T00:00:00+09:00`) >= cutoff;
}

export async function buildListingStrategyReport(
  coins: CoinInfo[],
  months: number = 3,
  maxCoins: number = DEFAULT_MAX_COINS
): Promise<ListingStrategyReport> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  const summaryMap = new Map<string, { totalReturn: number; wins: number; count: number }>();
  LISTING_SCENARIOS.forEach(s => summaryMap.set(s.id, { totalReturn: 0, wins: 0, count: 0 }));
  const scenarioDefinitionMap = new Map<string, ListingScenarioDefinition>();
  LISTING_SCENARIOS.forEach(def => scenarioDefinitionMap.set(def.id, def));

  const analyzedCoins: CoinListingAnalysis[] = [];

  for (const coin of coins.slice(0, maxCoins)) {
    try {
      const candles = await fetchUpbitDailyCandles(coin);
      if (!candles || candles.length === 0) {
        continue;
      }

      const orderedCandles = [...candles].sort((a, b) =>
        a.candle_date_time_kst.localeCompare(b.candle_date_time_kst)
      );

      const earliest = orderedCandles[0];
      const listingDate = adjustListingDate(earliest.candle_date_time_kst);

      if (!isRecentListing(listingDate, cutoffDate)) {
        continue;
      }

      const listingDateObj = new Date(`${listingDate}T00:00:00+09:00`);
      const bybitSymbol = `${coin.symbol}USDT`;
      const fetchStart = listingDateObj.getTime() - MS_PER_HOUR;
      const fetchEnd = listingDateObj.getTime() + (MAX_ENTRY_HOURS + HOLD_HOURS + 12) * MS_PER_HOUR;
      const bybitKlines = await fetchBybitHourlyKlines(bybitSymbol, fetchStart, fetchEnd, '240');

      if (bybitKlines.length === 0) {
        continue;
      }

      const scenarioResults: ScenarioResult[] = [];

      for (const baseScenario of BASE_SCENARIOS) {
        const entryTime = listingDateObj.getTime() + baseScenario.entryHours * MS_PER_HOUR;
        const exitTime = entryTime + HOLD_HOURS * MS_PER_HOUR;

        const entryCandle = bybitKlines.find(k => k.start >= entryTime);
        const exitCandle = bybitKlines.find(k => k.start >= exitTime);

        if (!entryCandle || !exitCandle) {
          continue;
        }

        const exitPrice = exitCandle.close;
        if (!exitPrice) continue;

        const windowKlines = bybitKlines.filter(k => k.start >= entryTime && k.start < exitTime);
        if (windowKlines.length === 0) continue;

        const profilePrices = buildProfilePrices(windowKlines);

        for (const profile of PRICE_PROFILES) {
          const entryPrice = profilePrices[profile.id];
          if (!entryPrice) continue;
          const returnPct = ((entryPrice - exitPrice) / entryPrice) * 100;
          const scenarioId = `${baseScenario.id}_${profile.id}`;
          const scenarioDef = scenarioDefinitionMap.get(scenarioId);
          if (!scenarioDef) continue;

          scenarioResults.push({
            scenarioId,
            label: scenarioDef.label,
            date: new Date(entryTime).toISOString().substring(0, 10),
            entryHours: baseScenario.entryHours,
            entryPrice,
            exitPrice,
            returnPct: Number(returnPct.toFixed(2)),
            priceProfile: profile.id,
            liquidated: returnPct <= -90
          });

          const summary = summaryMap.get(scenarioId);
          if (summary) {
            summary.totalReturn += returnPct;
            if (returnPct > 0) summary.wins += 1;
            summary.count += 1;
          }
        }
      }

      if (scenarioResults.length > 0) {
        analyzedCoins.push({
          symbol: coin.symbol,
          market: coin.market,
          name: coin.name,
          koreanName: coin.koreanName,
          listingDate,
          scenarios: scenarioResults
        });
      }

      // 기본적인 Rate Limit 대비 (Upbit + Bybit)
      await sleep(120);
    } catch (error) {
      console.error(`Failed to analyze listing strategy for ${coin.symbol}:`, error);
    }
  }

  const summary: ScenarioSummary[] = LISTING_SCENARIOS.map(scenario => {
    const stats = summaryMap.get(scenario.id);
    return {
      scenarioId: scenario.id,
      label: scenario.label,
      description: scenario.description,
      entryHours: scenario.entryHours,
      sampleSize: stats?.count || 0,
      averageReturn:
        stats && stats.count ? Number((stats.totalReturn / stats.count).toFixed(2)) : null,
      successRate:
        stats && stats.count ? Number(((stats.wins / stats.count) * 100).toFixed(1)) : null
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    months,
    coinsAnalyzed: analyzedCoins.length,
    scenarioDefinitions: LISTING_SCENARIOS,
    summary,
    coins: analyzedCoins
  };
}

function adjustListingDate(kstTimestamp: string): string {
  const base = new Date(`${kstTimestamp}+09:00`);
  base.setDate(base.getDate() - 1);
  return base.toISOString().substring(0, 10);
}

function buildProfilePrices(klines: Array<{ high: number; low: number }>): Record<PriceProfile, number | null> {
  if (!klines.length) {
    return { HIGH: null, MID: null, LOW: null };
  }
  const highs = klines.map(k => k.high).filter(v => Number.isFinite(v));
  const lows = klines.map(k => k.low).filter(v => Number.isFinite(v));
  if (!highs.length || !lows.length) {
    return { HIGH: null, MID: null, LOW: null };
  }
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  if (!Number.isFinite(maxHigh) || !Number.isFinite(minLow)) {
    return { HIGH: null, MID: null, LOW: null };
  }
  return {
    HIGH: maxHigh,
    LOW: minLow,
    MID: (maxHigh + minLow) / 2
  };
}
