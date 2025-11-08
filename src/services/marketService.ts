import axios from 'axios';

export interface MarketInfo {
  market: string;
  korean_name: string;
  english_name: string;
  market_warning?: string;
}

export interface CoinInfo {
  symbol: string;
  name: string;
  koreanName: string;
  market: string;
}

export class MarketService {
  private static instance: MarketService;
  private markets: CoinInfo[] = [];
  private marketMap: Map<string, CoinInfo> = new Map();

  static getInstance(): MarketService {
    if (!MarketService.instance) {
      MarketService.instance = new MarketService();
    }
    return MarketService.instance;
  }

  async loadMarkets(): Promise<void> {
    try {
      const response = await axios.get<MarketInfo[]>('https://api.upbit.com/v1/market/all');

      // KRW 마켓만 필터링
      const krwMarkets = response.data.filter(m => m.market.startsWith('KRW-'));

      this.markets = krwMarkets.map(market => {
        const symbol = market.market.replace('KRW-', '');
        const coinInfo: CoinInfo = {
          symbol,
          market: market.market,
          name: market.english_name,
          koreanName: market.korean_name
        };

        this.marketMap.set(symbol, coinInfo);
        return coinInfo;
      });

      // 거래량 순으로 정렬하기 위해 ticker 정보 가져오기
      const marketString = krwMarkets.map(m => m.market).join(',');
      const tickerResponse = await axios.get(`https://api.upbit.com/v1/ticker?markets=${marketString}`);

      // 거래대금 기준으로 정렬
      const volumeMap = new Map();
      tickerResponse.data.forEach((ticker: any) => {
        const symbol = ticker.market.replace('KRW-', '');
        volumeMap.set(symbol, ticker.acc_trade_price_24h);
      });

      // 거래량 순으로 정렬
      this.markets.sort((a, b) => {
        const volumeA = volumeMap.get(a.symbol) || 0;
        const volumeB = volumeMap.get(b.symbol) || 0;
        return volumeB - volumeA;
      });

      console.log(`📊 총 ${this.markets.length}개의 KRW 마켓 로드 완료`);
    } catch (error) {
      console.error('❌ 마켓 정보 로드 실패:', error);
      // 실패시 기본 코인만 사용
      this.markets = [
        { symbol: 'BTC', name: 'Bitcoin', koreanName: '비트코인', market: 'KRW-BTC' },
        { symbol: 'ETH', name: 'Ethereum', koreanName: '이더리움', market: 'KRW-ETH' },
        { symbol: 'SOL', name: 'Solana', koreanName: '솔라나', market: 'KRW-SOL' }
      ];
    }
  }

  getMarkets(): CoinInfo[] {
    return this.markets;
  }

  getMarket(symbol: string): CoinInfo | undefined {
    return this.marketMap.get(symbol);
  }

  getTopMarkets(count: number = 20): CoinInfo[] {
    return this.markets.slice(0, count);
  }
}