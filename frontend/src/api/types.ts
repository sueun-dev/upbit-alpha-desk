export interface CoinInfo {
  symbol: string;
  name: string;
  koreanName: string;
  market: string;
}

export interface DailyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  value: number;
}

export interface Ticker {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  change: 'RISE' | 'FALL' | 'EVEN' | string;
  acc_trade_price_24h?: number;
}

export interface ListingCalendarEntry {
  symbol: string;
  name: string;
  koreanName: string;
  market: string;
  listingDate: string;
  isRecent: boolean;
}

export interface ListingCalendarResponse {
  status: 'idle' | 'running' | 'error';
  lastUpdated: string | null;
  nextUpdateAt: string | null;
  total: number;
  recentCount: number;
  coins: ListingCalendarEntry[];
  error?: string;
}

export interface ListingScenarioDefinition {
  id: string;
  label: string;
  description: string;
  entryHours: number;
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

export interface ScenarioResult {
  scenarioId: string;
  label: string;
  date: string;
  entryHours: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
}

export interface CoinListingAnalysis {
  symbol: string;
  market: string;
  name: string;
  koreanName: string;
  listingDate: string;
  scenarios: ScenarioResult[];
}

export interface ListingStrategyReport {
  generatedAt: string;
  months: number;
  coinsAnalyzed: number;
  scenarioDefinitions: ListingScenarioDefinition[];
  summary: ScenarioSummary[];
  coins: CoinListingAnalysis[];
}

export interface ListingStrategyResponse extends ListingStrategyReport {
  status: 'idle' | 'running' | 'error';
  lastUpdated: string | null;
  nextUpdateAt: string | null;
}

export interface MarketDataPoint {
  date: string;
  tradingValue: number;
  volume: number;
  price: number;
}

export interface MarketDataResponse {
  hasMarketData: boolean;
  coin: string;
  data: MarketDataPoint[];
  statistics: {
    highest: { value: number; date: string } | null;
    lowest: { value: number; date: string } | null;
  };
  error?: string;
}

export interface CoinStatistics {
  coin: string;
  name: string;
  koreanName: string;
  total: number;
  earliest: string | null;
  latest: string | null;
  currentPrice: number | null;
  highestPrice: { price: number; date: string } | null;
  lowestPrice: { price: number; date: string } | null;
}
