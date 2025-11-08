import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import AnalyticsPanel from './components/analytics/AnalyticsPanel';
import ListingLabPanel from './components/listing/ListingLabPanel';
import InsightsPanel from './components/InsightsPanel';
import HeaderStatus from './components/HeaderStatus';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

type ModuleKey = 'spot' | 'listing' | 'operations';

const MODULES: Record<
  ModuleKey,
  {
    label: string;
    description: string;
  }
> = {
  spot: {
    label: 'KRW Spot Coverage',
    description: '실시간 KRW 마켓 가격·거래대금 인텔리전스'
  },
  listing: {
    label: 'Listing Lab',
    description: '최근 6개월 상장 코인 숏 전략 리포트'
  },
  operations: {
    label: 'Operations',
    description: '스케줄러/캐시 상태 및 운영 모니터링'
  }
};

function AppShell() {
  const [selectedCoin, setSelectedCoin] = useState<string>('BTC');
  const [chartRange, setChartRange] = useState<number>(60);
  const [activeModule, setActiveModule] = useState<ModuleKey>('spot');

  const analyticsKey = useMemo(() => `${selectedCoin}-${chartRange}`, [selectedCoin, chartRange]);

  return (
    <div className="app-shell">
      <header className="app-header panel">
        <div className="brand">
          <div className="brand-mark">UP</div>
          <div>
            <p className="eyebrow">Upbit Alpha Desk</p>
            <h1>Market Intelligence Console</h1>
            <p className="subtitle">
              Professional toolkit for KRW market momentum, listing analysis, and tape reading.
            </p>
          </div>
        </div>
        <div className="module-nav">
          {Object.entries(MODULES).map(([key, info]) => (
            <button
              key={key}
              type="button"
              className={`module-tab ${activeModule === key ? 'active' : ''}`}
              onClick={() => setActiveModule(key as ModuleKey)}
            >
              <span>{info.label}</span>
              <small>{info.description}</small>
            </button>
          ))}
        </div>
        <HeaderStatus />
      </header>

      <div className="app-body">
        <Sidebar selectedCoin={selectedCoin} onSelectCoin={setSelectedCoin} />
        <main className="main-column">
          {activeModule === 'spot' && (
            <AnalyticsPanel
              selectedCoin={selectedCoin}
              chartRange={chartRange}
              onRangeChange={setChartRange}
              queryKey={analyticsKey}
            />
          )}

          {activeModule === 'listing' && <ListingLabPanel />}

          {activeModule === 'operations' && <InsightsPanel selectedCoin={selectedCoin} />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
