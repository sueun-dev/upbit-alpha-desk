import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import Sidebar, { RecentListings } from './components/Sidebar';
import AnalyticsPanel from './components/analytics/AnalyticsPanel';
import ListingLabPanel from './components/listing/ListingLabPanel';
import InsightsPanel from './components/InsightsPanel';
import Footer from './components/Footer';

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
    description: '최근 3개월 상장 코인 숏 전략 리포트'
  },
  operations: {
    label: 'Operations',
    description: '스케줄러/캐시 상태 및 운영 모니터링'
  }
};

const MODULE_ANCHORS: Record<ModuleKey, string> = {
  spot: 'finder',
  listing: 'listing-lab',
  operations: 'operations'
};

function resolveModuleFromHash(hash?: string): ModuleKey | null {
  if (!hash) return null;
  const normalized = hash.replace('#', '');
  const match = (Object.entries(MODULE_ANCHORS) as Array<[ModuleKey, string]>).find(
    ([, anchor]) => anchor === normalized
  );
  return match ? match[0] : null;
}

function useAnchoredModule(defaultModule: ModuleKey) {
  const [module, setModule] = useState<ModuleKey>(() => {
    if (typeof window === 'undefined') return defaultModule;
    return resolveModuleFromHash(window.location.hash) ?? defaultModule;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      const next = resolveModuleFromHash(window.location.hash);
      if (next) {
        setModule(next);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetHash = `#${MODULE_ANCHORS[module]}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }, [module]);

  return [module, setModule] as const;
}

function AppShell() {
  const [selectedCoin, setSelectedCoin] = useState<string>('BTC');
  const [chartRange, setChartRange] = useState<number>(60);
  const [activeModule, setActiveModule] = useAnchoredModule('spot');

  const analyticsKey = useMemo(() => `${selectedCoin}-${chartRange}`, [selectedCoin, chartRange]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeModule]);

  const handleNavigate = (module: ModuleKey) => {
    setActiveModule(module);
  };

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

        <nav className="module-nav" aria-label="Primary">
          {Object.entries(MODULES).map(([key, info]) => {
            const moduleKey = key as ModuleKey;
            const anchor = MODULE_ANCHORS[moduleKey];
            const tabId = `${anchor}-tab`;
            return (
              <a
                key={key}
                href={`#${anchor}`}
                id={tabId}
                aria-controls={anchor}
                className={`module-tab ${activeModule === key ? 'active' : ''}`}
                onClick={event => {
                  event.preventDefault();
                  handleNavigate(moduleKey);
                }}
              >
                <span>{info.label}</span>
                <small>{info.description}</small>
              </a>
            );
          })}
        </nav>

      </header>

      <div className="app-views" role="presentation">
        <section
          id={MODULE_ANCHORS.spot}
          className={`app-view ${activeModule === 'spot' ? 'active' : ''}`}
          role="tabpanel"
          aria-labelledby={`${MODULE_ANCHORS.spot}-tab`}
          aria-hidden={activeModule !== 'spot'}
        >
          <FinderView
            selectedCoin={selectedCoin}
            onSelectCoin={setSelectedCoin}
            chartRange={chartRange}
            onRangeChange={setChartRange}
            analyticsKey={analyticsKey}
          />
        </section>

        <section
          id={MODULE_ANCHORS.listing}
          className={`app-view ${activeModule === 'listing' ? 'active' : ''}`}
          role="tabpanel"
          aria-labelledby={`${MODULE_ANCHORS.listing}-tab`}
          aria-hidden={activeModule !== 'listing'}
        >
          <ListingLabPanel />
        </section>

        <section
          id={MODULE_ANCHORS.operations}
          className={`app-view ${activeModule === 'operations' ? 'active' : ''}`}
          role="tabpanel"
          aria-labelledby={`${MODULE_ANCHORS.operations}-tab`}
          aria-hidden={activeModule !== 'operations'}
        >
          <InsightsPanel selectedCoin={selectedCoin} />
        </section>
      </div>
      <Footer />
    </div>
  );
}

type FinderViewProps = {
  selectedCoin: string;
  onSelectCoin: (symbol: string) => void;
  chartRange: number;
  onRangeChange: (range: number) => void;
  analyticsKey: string;
};

const FinderView = ({
  selectedCoin,
  onSelectCoin,
  chartRange,
  onRangeChange,
  analyticsKey
}: FinderViewProps) => {
  return (
    <div className="finder-view">
      <Sidebar selectedCoin={selectedCoin} onSelectCoin={onSelectCoin} />
      <div className="finder-main">
        <div className="finder-topline panel">
          <div className="finder-topline-copy">
            <p className="eyebrow">최근 상장 캘린더</p>
            <h3 style={{ margin: '6px 0' }}>Upbit 3개월 상장 현황</h3>
            <p className="subtitle" style={{ fontSize: '0.9rem' }}>
              KRW 마켓 신규 Listings와 Bybit 선물 커버리지를 동시에 확인하세요.
            </p>
          </div>
          <div className="finder-topline-list">
            <RecentListings onSelectCoin={onSelectCoin} compact limit={12} showStatus showLimitInfo />
          </div>
        </div>
        <AnalyticsPanel
          selectedCoin={selectedCoin}
          chartRange={chartRange}
          onRangeChange={onRangeChange}
          queryKey={analyticsKey}
        />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
