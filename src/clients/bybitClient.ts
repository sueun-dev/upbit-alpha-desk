import axios from 'axios';

export interface BybitKline {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Fetches Bybit linear-perp hourly klines for the given symbol.
 * The API only allows fetching up to 200 points per request, but in our
 * use-case we only ever need a few days of data so a single request suffices.
 */
export async function fetchBybitHourlyKlines(
  symbol: string,
  start: number,
  end: number
): Promise<BybitKline[]> {
  try {
    const response = await axios.get('https://api.bybit.com/v5/market/kline', {
      params: {
        category: 'linear',
        symbol,
        interval: '60',
        start,
        end,
        limit: 200
      }
    });

    const list = response.data?.result?.list;
    if (!list || !Array.isArray(list)) {
      return [];
    }

    return list
      .map((item: any) => ({
        start: Number(item[0]),
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4])
      }))
      .filter(k => !Number.isNaN(k.start) && !Number.isNaN(k.open) && !Number.isNaN(k.close))
      .sort((a, b) => a.start - b.start);
  } catch (error: any) {
    console.error(`Failed to fetch Bybit data for ${symbol}:`, error?.response?.data || error);
    return [];
  }
}

