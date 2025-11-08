import express, { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import path from 'path';
import axios from 'axios';
import fs from 'fs/promises';
import fsSync from 'fs';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { DataManager } from './services/dataManager';
import { ListingStrategyScheduler } from './services/listingStrategyScheduler';
import { ListingCalendarScheduler } from './services/listingCalendarScheduler';
import { securityConfig } from './config';
import { initRedisClient, getRedisClient } from './clients/redisClient';

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = securityConfig.allowedOrigins;
const corsOptions: CorsOptions = allowedOrigins.length
  ? {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    }
  : {};
const PUBLIC_DIR = path.join(__dirname, '../public');
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
const serveFrontend = process.env.SERVE_FRONTEND !== 'false';

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));
const hasFrontendBuild = serveFrontend && fsSync.existsSync(FRONTEND_DIST);
if (hasFrontendBuild) {
  app.use(express.static(FRONTEND_DIST));
}

const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!securityConfig.apiKey) return next();
  const providedKey = req.header('x-api-key');
  if (providedKey && providedKey === securityConfig.apiKey) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
};

const apiLimiter = rateLimit({
  windowMs: securityConfig.rateLimitWindowMs,
  max: securityConfig.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', requireApiKey, apiLimiter);

const dataManager = new DataManager();
const CACHE_DIR = path.join(__dirname, '../cache');
const SAVED_DATA_DIR = path.join(__dirname, '../saved_data');
const STRATEGY_CACHE_PATH = path.join(CACHE_DIR, 'listingStrategyReport.json');
const CALENDAR_CACHE_PATH = path.join(CACHE_DIR, 'listingCalendar.json');

let listingStrategyScheduler: ListingStrategyScheduler | null = null;
let listingCalendarScheduler: ListingCalendarScheduler | null = null;

// API 엔드포인트
app.get('/api/coins', async (req, res) => {
  try {
    const coins = dataManager.getSupportedCoins();
    res.json(coins);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coins' });
  }
});

app.get('/api/data/:coin/latest', async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const data = await dataManager.getLatestData(coin, days);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.get('/api/data/:coin/range', async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    const { start, end } = req.query;
    if (!start) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    const data = await dataManager.getDataRange(coin, start as string, end as string);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.get('/api/data/:coin/statistics', async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    const stats = await dataManager.getStatistics(coin);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

type TickerCacheEntry = {
  data: any;
  fetchedAt: number;
};

const tickerCache: { all?: TickerCacheEntry; [key: string]: TickerCacheEntry | undefined } = {};
const TICKER_TTL_MS = 60 * 1000; // 1 minute
const TICKER_CACHE_FILE = path.join(CACHE_DIR, 'ticker-cache.json');
const marketDataCache: Record<string, { payload: MarketDataPayload; mtimeMs: number }> = {};
const COIN_SYMBOL_REGEX = /^[A-Z0-9]{1,10}$/;
const MAX_TICKER_SYMBOLS = 50;
const MARKET_DATA_REDIS_PREFIX = 'market-data:';
const MARKET_DATA_REDIS_TTL_SECONDS = 60 * 60 * 6; // 6 hours

async function getMarketDataFromRedis(coin: string): Promise<MarketDataPayload | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(`${MARKET_DATA_REDIS_PREFIX}${coin}`);
    return raw ? (JSON.parse(raw) as MarketDataPayload) : null;
  } catch (error) {
    console.error(`Failed to read market data for ${coin} from Redis:`, error);
    return null;
  }
}

async function cacheMarketDataInRedis(coin: string, payload: MarketDataPayload): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.set(`${MARKET_DATA_REDIS_PREFIX}${coin}`, JSON.stringify(payload), {
      EX: MARKET_DATA_REDIS_TTL_SECONDS
    });
  } catch (error) {
    console.error(`Failed to cache market data for ${coin} in Redis:`, error);
  }
}

async function loadMarketDataFromFilesystem(coin: string): Promise<MarketDataPayload | null> {
  const files = await fs.readdir(SAVED_DATA_DIR);
  const coinFiles = files.filter(f => f.startsWith(`${coin}_`) && f.endsWith('.json'));

  if (coinFiles.length === 0) {
    return null;
  }

  coinFiles.sort().reverse();
  const latestFile = coinFiles[0];
  const filePath = path.join(SAVED_DATA_DIR, latestFile);
  const stats = await fs.stat(filePath);
  const cacheKey = `${coin}:${filePath}`;
  const cached = marketDataCache[cacheKey];

  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.payload;
  }

  const fileContent = await fs.readFile(filePath, 'utf-8');
  const marketData = JSON.parse(fileContent);

  const USD_TO_KRW = 1330;
  const processedData: DailyMarketDataPoint[] = marketData.map((item: any) => ({
    date: item.candle_date_time_kst.substring(0, 10),
    tradingValue: item.candle_acc_trade_price * USD_TO_KRW,
    volume: item.candle_acc_trade_volume,
    price: item.trade_price * USD_TO_KRW
  }));

  const dailyData = new Map<string, DailyMarketDataPoint>();
  processedData.forEach(item => {
    if (!dailyData.has(item.date)) {
      dailyData.set(item.date, {
        date: item.date,
        tradingValue: item.tradingValue,
        volume: item.volume,
        price: item.price
      });
    } else {
      const existing = dailyData.get(item.date)!;
      existing.tradingValue += item.tradingValue;
      existing.volume += item.volume;
      existing.price = item.price;
    }
  });

  const sortedDates = Array.from(dailyData.keys()).sort();
  if (sortedDates.length > 0) {
    const lastDate = sortedDates[sortedDates.length - 1];
    dailyData.delete(lastDate);
  }

  const sortedData = Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date));
  const nonZeroTradingValues = sortedData.filter(d => d.tradingValue > 0);
  let highestTradingEntry: DailyMarketDataPoint | null = null;
  let lowestTradingEntry: DailyMarketDataPoint | null = null;

  if (nonZeroTradingValues.length > 0) {
    highestTradingEntry = nonZeroTradingValues.reduce((max, curr) =>
      curr.tradingValue > max.tradingValue ? curr : max
    );
    lowestTradingEntry = nonZeroTradingValues.reduce((min, curr) =>
      curr.tradingValue < min.tradingValue ? curr : min
    );
  }

  const payload: MarketDataPayload = {
    hasMarketData: true,
    coin,
    data: sortedData,
    statistics: {
      highest: highestTradingEntry
        ? { value: highestTradingEntry.tradingValue, date: highestTradingEntry.date }
        : null,
      lowest: lowestTradingEntry
        ? { value: lowestTradingEntry.tradingValue, date: lowestTradingEntry.date }
        : null
    }
  };

  marketDataCache[cacheKey] = { payload, mtimeMs: stats.mtimeMs };
  return payload;
}
type DailyMarketDataPoint = {
  date: string;
  tradingValue: number;
  volume: number;
  price: number;
};

type MarketDataPayload = {
  hasMarketData: boolean;
  coin: string;
  data: DailyMarketDataPoint[];
  statistics: {
    highest: { value: number; date: string } | null;
    lowest: { value: number; date: string } | null;
  };
};

async function fetchUpbitTicker(markets: string): Promise<any> {
  const response = await axios.get(`https://api.upbit.com/v1/ticker?markets=${markets}`);
  return response.data;
}

function getCacheKey(markets: string): string {
  return markets.split(',').sort().join(',');
}

function getCachedTicker(key: string): any | null {
  const entry = tickerCache[key];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TICKER_TTL_MS) {
    delete tickerCache[key];
    return null;
  }
  return entry.data;
}

function setCachedTicker(key: string, data: any) {
  tickerCache[key] = { data, fetchedAt: Date.now() };
}

async function loadTickerCacheFromDisk() {
  try {
    const raw = await fs.readFile(TICKER_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, TickerCacheEntry>;
    Object.assign(tickerCache, parsed);
    console.log('Ticker cache loaded from disk');
  } catch (error) {
    console.warn('No ticker cache found on disk, will start fresh.');
  }
}

async function persistTickerCache() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
    await fs.writeFile(TICKER_CACHE_FILE, JSON.stringify(tickerCache, null, 2));
  } catch (error) {
    console.error('Failed to persist ticker cache:', error);
  }
}

app.get('/api/ticker', async (req, res) => {
  try {
    const markets = dataManager.getSupportedCoins().map(c => c.market).join(',');
    const cacheKey = getCacheKey(markets);
    const cached = getCachedTicker(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchUpbitTicker(markets);
    setCachedTicker(cacheKey, data);
    await persistTickerCache();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ticker data' });
  }
});

app.get('/api/ticker/:coins', async (req, res) => {
  try {
    const coins = req.params.coins
      .split(',')
      .map(c => c.trim().toUpperCase())
      .filter(Boolean);

    if (coins.length === 0 || coins.length > MAX_TICKER_SYMBOLS) {
      return res.status(400).json({
        error: `You must request between 1 and ${MAX_TICKER_SYMBOLS} symbols.`
      });
    }

    for (const symbol of coins) {
      if (!COIN_SYMBOL_REGEX.test(symbol)) {
        return res.status(400).json({ error: `Invalid symbol: ${symbol}` });
      }
    }

    const markets = coins.map(c => `KRW-${c}`).join(',');
    const cacheKey = getCacheKey(markets);
    const cached = getCachedTicker(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchUpbitTicker(markets);
    setCachedTicker(cacheKey, data);
    await persistTickerCache();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ticker data' });
  }
});

// 새로운 API: saved_data에서 시장 데이터 가져오기
app.get('/api/market-data/:coin', async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    if (!COIN_SYMBOL_REGEX.test(coin)) {
      return res.status(400).json({ hasMarketData: false, error: 'Invalid coin symbol.' });
    }
    const redisPayload = await getMarketDataFromRedis(coin);
    if (redisPayload) {
      return res.json(redisPayload);
    }

    const payload = await loadMarketDataFromFilesystem(coin);
    if (!payload) {
      return res.json({ hasMarketData: false });
    }

    await cacheMarketDataInRedis(coin, payload);
    res.json(payload);
  } catch (error) {
    console.error('Failed to fetch market data:', error);
    res.json({ hasMarketData: false });
  }
});

// 코인 상장일 확인 API
app.get('/api/coins/listing-dates', (req, res) => {
  if (!listingCalendarScheduler) {
    return res.status(503).json({ error: 'Listing calendar scheduler is not initialized.' });
  }

  const snapshot = listingCalendarScheduler.getSnapshot();
  if (snapshot.entries.length === 0) {
    return res.status(503).json({
      status: snapshot.status,
      lastUpdated: snapshot.lastUpdated?.toISOString() ?? null,
      nextUpdateAt: snapshot.nextRunAt?.toISOString() ?? null,
      error: snapshot.error || 'Listing calendar is being prepared.'
    });
  }

  res.json({
    status: snapshot.status,
    lastUpdated: snapshot.lastUpdated?.toISOString() ?? null,
    nextUpdateAt: snapshot.nextRunAt?.toISOString() ?? null,
    total: snapshot.entries.length,
    recentCount: snapshot.recentCount,
    coins: snapshot.entries
  });
});

app.get('/api/coins/listing-strategies', async (req, res) => {
  if (!listingStrategyScheduler) {
    return res.status(503).json({ error: 'Listing strategy scheduler is not initialized.' });
  }

  const snapshot = listingStrategyScheduler.getSnapshot();

  if (!snapshot.report) {
    return res.status(503).json({
      status: snapshot.status,
      lastUpdated: snapshot.lastUpdated?.toISOString() ?? null,
      nextUpdateAt: snapshot.nextRunAt?.toISOString() ?? null,
      error: snapshot.error || 'Listing strategy analysis in progress.'
    });
  }

  res.json({
    ...snapshot.report,
    status: snapshot.status,
    lastUpdated: snapshot.lastUpdated?.toISOString() ?? null,
    nextUpdateAt: snapshot.nextRunAt?.toISOString() ?? null
  });
});

// React SPA fallback
if (hasFrontendBuild) {
  app.get(/^\/(?!api).*$/, (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// 서버 시작
async function start() {
  try {
    await dataManager.initialize();
    try {
      await initRedisClient();
    } catch (redisError) {
      console.warn('Redis initialization failed. Falling back to filesystem cache only.', redisError);
    }
    await fs.mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
    await loadTickerCacheFromDisk();
    listingStrategyScheduler = new ListingStrategyScheduler(dataManager, {
      persistPath: STRATEGY_CACHE_PATH,
      maxCoins: 200,
      months: 3
    });
    await listingStrategyScheduler.start();
    listingCalendarScheduler = new ListingCalendarScheduler(dataManager, {
      persistPath: CALENDAR_CACHE_PATH,
      maxCoins: 150,
      months: 3
    });
    await listingCalendarScheduler.start();

    app.listen(PORT, () => {
      console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행중입니다.`);

      const markets = dataManager.getSupportedCoins();
      console.log(`📊 총 ${markets.length}개 KRW 마켓 지원`);
      console.log(`📈 상위 5개 코인: ${markets.slice(0, 5).map(m => m.symbol).join(', ')}`);
    });

    // 매일 자정(0시 5분)에 자동 업데이트
    const scheduleUpdate = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 5, 0, 0); // 다음날 0시 5분

      const msUntilUpdate = tomorrow.getTime() - now.getTime();

      setTimeout(async () => {
        console.log('🔄 자동 데이터 업데이트 실행 (매일 0시 5분)');
        await dataManager.updateAllLoadedCoins(); // 로드된 코인만 업데이트
        scheduleUpdate(); // 다음 업데이트 스케줄
      }, msUntilUpdate);

      console.log(`⏰ 다음 자동 업데이트: ${tomorrow.toLocaleString('ko-KR')}`);
    };

    scheduleUpdate();

  } catch (error) {
    console.error('❌ 서버 시작 실패:', error);
    process.exit(1);
  }
}

start();
