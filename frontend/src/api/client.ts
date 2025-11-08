import type {
  CoinInfo,
  CoinListingAnalysis,
  CoinStatistics,
  DailyCandle,
  ListingCalendarResponse,
  ListingStrategyResponse,
  MarketDataResponse,
  ScenarioSummary,
  Ticker
} from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  getCoins: () => request<CoinInfo[]>('/api/coins'),
  getAllTickers: () => request<Ticker[]>('/api/ticker'),
  getTicker: (symbols: string[]) => {
    const param = symbols.join(',');
    return request<Ticker[]>(`/api/ticker/${param}`);
  },
  getDailyData: (symbol: string, days: number) =>
    request<DailyCandle[]>(`/api/data/${symbol}/latest?days=${days}`),
  getStatistics: (symbol: string) => request<CoinStatistics>(`/api/data/${symbol}/statistics`),
  getMarketData: (symbol: string) => request<MarketDataResponse>(`/api/market-data/${symbol}`),
  getListingCalendar: () => request<ListingCalendarResponse>('/api/coins/listing-dates'),
  getListingStrategies: () =>
    request<ListingStrategyResponse>('/api/coins/listing-strategies')
};

export type {
  CoinInfo,
  CoinListingAnalysis,
  CoinStatistics,
  DailyCandle,
  ListingCalendarResponse,
  ListingStrategyResponse,
  MarketDataResponse,
  ScenarioSummary,
  Ticker
};
