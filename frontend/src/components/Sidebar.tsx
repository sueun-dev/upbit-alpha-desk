import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../api/client';
import type { ListingCalendarResponse, Ticker } from '../api/types';

type SidebarProps = {
  selectedCoin: string;
  onSelectCoin: (symbol: string) => void;
};

function buildTickerMap(tickers?: Ticker[]) {
  if (!tickers) return new Map<string, Ticker>();
  return new Map(
    tickers.map(ticker => [ticker.market.replace('KRW-', ''), ticker])
  );
}

function formatChangeRate(rate?: number) {
  if (rate === undefined || rate === null) return '-';
  const pct = rate * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

const Sidebar = ({ selectedCoin, onSelectCoin }: SidebarProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const coinsQuery = useQuery({
    queryKey: ['coins'],
    queryFn: api.getCoins
  });

  const coins = coinsQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!searchTerm) {
      return coins;
    }
    const keyword = searchTerm.toUpperCase();
    return coins
      .filter(
        coin =>
          coin.symbol.includes(keyword) ||
          coin.name.toUpperCase().includes(keyword) ||
          coin.koreanName.includes(searchTerm)
      );
  }, [coins, searchTerm]);

  const tickerQuery = useQuery({
    queryKey: ['ticker', 'all'],
    queryFn: api.getAllTickers,
    enabled: coins.length > 0,
    refetchInterval: 60 * 1000
  });

  const tickerMap = useMemo(() => buildTickerMap(tickerQuery.data), [tickerQuery.data]);

  return (
    <aside className="sidebar panel">
      <div>
        <p className="eyebrow">Finder</p>
        <h3 style={{ margin: '6px 0' }}>코인 탐색</h3>
        <p className="subtitle" style={{ fontSize: '0.9rem' }}>
          검색 또는 단축 버튼으로 코인을 선택하고 워치리스트를 업데이트하세요.
        </p>
      </div>

      <div className="search-box">
        <input
          type="text"
          className="search-input"
          placeholder="코인을 검색하세요 (예: BTC, 비트코인)"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
        />
        <span className="search-icon">🔍</span>
      </div>

      <div className="section-heading">
        <span>라이브 워치리스트</span>
        <span className="pill">TOP</span>
      </div>
      <div className="coin-list">
        {(coinsQuery.isLoading || tickerQuery.isLoading) && (
          <div className="loading">코인 목록을 불러오는 중...</div>
        )}
        {!coinsQuery.isLoading && filtered.length === 0 && (
          <div className="no-results">검색 결과가 없습니다</div>
        )}
        {filtered.map(coin => {
          const ticker = tickerMap.get(coin.symbol);
          const changeRate = ticker?.signed_change_rate ?? 0;
          const changeClass = changeRate >= 0 ? 'positive' : 'negative';
          return (
            <button
              key={coin.symbol}
              type="button"
              className={`coin-item ${selectedCoin === coin.symbol ? 'active' : ''}`}
              onClick={() => onSelectCoin(coin.symbol)}
            >
              <div className="coin-header">
                <div className="coin-symbol">
                  {coin.symbol}{' '}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {coin.koreanName}
                  </span>
                </div>
                <div className={`coin-change ${changeClass}`}>{formatChangeRate(changeRate)}</div>
              </div>
              <div className="coin-price">
                {ticker ? ticker.trade_price.toLocaleString('ko-KR') + '₩' : '-'}
              </div>
            </button>
          );
        })}
      </div>

    </aside>
  );
};

type RecentListingsProps = {
  onSelectCoin: (symbol: string) => void;
  compact?: boolean;
  limit?: number;
};

export const RecentListings = ({
  onSelectCoin,
  compact = false,
  limit
}: RecentListingsProps) => {
  const calendarQuery = useQuery<ListingCalendarResponse>({
    queryKey: ['listingCalendar'],
    queryFn: api.getListingCalendar,
    refetchInterval: 1000 * 60 * 30 // 30 minutes
  });

  const recentCoins =
    calendarQuery.data?.coins
      .filter(entry => entry.isRecent)
      .slice(0, limit ?? Number.MAX_SAFE_INTEGER) ?? [];

  const statusText = calendarQuery.data
    ? buildSchedulerStatus(calendarQuery.data)
    : '상장 캘린더를 준비 중입니다.';

  return (
    <section className={compact ? 'compact-calendar' : undefined}>
      {!compact && (
        <>
          <div className="section-heading">
            <span>최근 상장 캘린더</span>
            <span className="pill">6개월</span>
          </div>
          <p className="scenario-note">{statusText}</p>
        </>
      )}
      {calendarQuery.isLoading && <div className="loading">최근 상장 코인을 불러오는 중...</div>}
      {!calendarQuery.isLoading && recentCoins.length === 0 && (
        <div className="no-results" style={{ padding: '12px 0' }}>
          최근 6개월 내 상장 코인이 없습니다.
        </div>
      )}
      <div className={`recent-grid ${compact ? 'compact' : ''}`}>
        {recentCoins.map(entry => (
          <button
            type="button"
            className="recent-card"
            key={entry.symbol}
            onClick={() => onSelectCoin(entry.symbol)}
          >
            <div style={{ fontWeight: 700 }}>{entry.symbol}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{entry.koreanName}</div>
            <div style={{ marginTop: 6, fontSize: '0.75rem' }}>
              상장: {format(new Date(entry.listingDate), 'yyyy.MM.dd')}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

function buildSchedulerStatus(snapshot: ListingCalendarResponse) {
  const { status, lastUpdated, nextUpdateAt } = snapshot;
  const statusLabel =
    status === 'running' ? '갱신 중' : status === 'error' ? '오류' : '대기 중';
  const updatedText = lastUpdated
    ? `최근 ${format(new Date(lastUpdated), 'MM월 dd일 HH:mm')}`
    : '초기 로딩';
  const nextText = nextUpdateAt
    ? ` · 다음 ${format(new Date(nextUpdateAt), 'MM월 dd일 HH:mm')}`
    : '';
  return `${statusLabel} · ${updatedText}${nextText}`;
}

export default Sidebar;
