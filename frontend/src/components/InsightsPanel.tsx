import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../api/client';

type InsightsPanelProps = {
  selectedCoin: string;
};

const InsightsPanel = ({ selectedCoin }: InsightsPanelProps) => {
  const calendarQuery = useQuery({
    queryKey: ['listingCalendar'],
    queryFn: api.getListingCalendar
  });

  const strategyQuery = useQuery({
    queryKey: ['listingStrategies'],
    queryFn: api.getListingStrategies
  });

  const marketDataQuery = useQuery({
    queryKey: ['marketData', selectedCoin],
    queryFn: () => api.getMarketData(selectedCoin),
    enabled: Boolean(selectedCoin)
  });

  const insights = useMemo(
    () => [
      {
        title: 'Listing Lab 상태',
        value: strategyQuery.data
          ? formatScheduler(strategyQuery.data.status, strategyQuery.data.lastUpdated)
          : strategyQuery.isLoading
            ? '계산 중...'
            : '데이터 없음'
      },
      {
        title: '상장 캘린더 업데이트',
        value: calendarQuery.data
          ? formatScheduler(calendarQuery.data.status, calendarQuery.data.lastUpdated)
          : calendarQuery.isLoading
            ? '불러오는 중...'
            : '데이터 없음',
        sub: calendarQuery.data?.nextUpdateAt
          ? `Next ${format(new Date(calendarQuery.data.nextUpdateAt), 'MM.dd HH:mm')}`
          : undefined
      },
      {
        title: `${selectedCoin} 시장 데이터`,
        value: marketDataQuery.data?.hasMarketData
          ? `샘플 ${marketDataQuery.data.data.length}일`
          : '캐시 준비 중',
        sub: marketDataQuery.data?.statistics?.highest
          ? `피크 ${marketDataQuery.data.statistics.highest.date}`
          : undefined
      }
    ],
    [calendarQuery.data, calendarQuery.isLoading, marketDataQuery.data, selectedCoin, strategyQuery.data, strategyQuery.isLoading]
  );

  return (
    <section className="panel">
      <div>
        <p className="eyebrow">Insights</p>
        <h3 style={{ margin: '6px 0' }}>오퍼레이션 메트릭</h3>
        <p className="subtitle" style={{ fontSize: '0.9rem' }}>
          스케줄러 상태와 Redis 캐시 커버리지를 한눈에 확인하세요.
        </p>
      </div>
      <div className="insights-grid">
        {insights.map(card => (
          <div key={card.title} className="insight-card">
            <p className="insight-title">{card.title}</p>
            <p className="insight-value">{card.value}</p>
            {card.sub && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

function formatScheduler(status?: string, lastUpdated?: string | null) {
  if (!status) return '대기 중';
  const statusLabel =
    status === 'running' ? '실행 중' : status === 'error' ? '오류' : '대기';
  const timeLabel = lastUpdated ? format(new Date(lastUpdated), 'MM.dd HH:mm') : 'N/A';
  return `${statusLabel} · ${timeLabel}`;
}

export default InsightsPanel;
