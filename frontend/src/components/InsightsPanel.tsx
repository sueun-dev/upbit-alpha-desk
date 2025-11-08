import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../api/client';
import { RecentListings } from './Sidebar';

type InsightsPanelProps = {
  selectedCoin: string;
};

const RUNBOOK = [
  {
    title: 'API 서버 (hot reload)',
    commands: ['pnpm install', 'pnpm dev']
  },
  {
    title: 'React 프런트 (Vite)',
    commands: ['cd frontend', 'pnpm install', 'pnpm dev']
  },
  {
    title: '배포 빌드 + 통합 실행',
    commands: ['pnpm build', 'cd frontend && pnpm build', 'cd .. && pnpm start']
  }
];

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
    <section className="panel operations-panel">
      <div className="operations-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h3 style={{ margin: '6px 0' }}>오퍼레이션 메트릭 & 플레이북</h3>
          <p className="subtitle" style={{ fontSize: '0.9rem' }}>
            스케줄러 상태, Redis 커버리지, 최신 상장 정보를 한 화면에서 점검하세요.
          </p>
        </div>
      </div>
      <div className="operations-grid">
        <div className="operations-left">
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
          {strategyQuery.data && (
            <div className="ops-meta-grid">
              <div className="meta-card">
                <p className="meta-label">Listing Lab 생성</p>
                <p className="meta-value">{format(new Date(strategyQuery.data.generatedAt), 'MM.dd HH:mm')}</p>
              </div>
              <div className="meta-card">
                <p className="meta-label">분석 코인</p>
                <p className="meta-value">{strategyQuery.data.coinsAnalyzed}개</p>
              </div>
              <div className="meta-card">
                <p className="meta-label">관측 기간</p>
                <p className="meta-value">{strategyQuery.data.months}개월</p>
              </div>
            </div>
          )}
        </div>
        <div className="operations-right">
          <RecentListings onSelectCoin={() => {}} compact limit={12} showStatus showLimitInfo />
        </div>
      </div>
      <div className="operations-runbook">
        <p className="eyebrow" style={{ marginTop: 18 }}>Runbook</p>
        <h4 style={{ margin: '6px 0 12px' }}>핵심 명령어</h4>
        <div className="runbook-grid">
          {RUNBOOK.map(entry => (
            <div key={entry.title} className="runbook-card">
              <p className="runbook-label">{entry.title}</p>
              <ul className="runbook-list">
                {entry.commands.map(command => (
                  <li key={command}>
                    <code>{command}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
