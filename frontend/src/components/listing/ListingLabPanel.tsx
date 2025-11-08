import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import { api } from '../../api/client';
import type {
  CoinListingAnalysis,
  DailyCandle,
  ListingStrategyResponse,
  ScenarioResult
} from '../../api/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const ListingLabPanel = () => {
  const strategyQuery = useQuery<ListingStrategyResponse>({
    queryKey: ['listingStrategies'],
    queryFn: api.getListingStrategies,
    refetchInterval: 1000 * 60 * 30 // 30 minutes
  });

  const bestScenario = useMemo(() => {
    const summary = strategyQuery.data?.summary || [];
    return summary.reduce(
      (best, current) => {
        if (current.averageReturn === null || current.averageReturn === undefined) return best;
        if (!best || (best.averageReturn || 0) < (current.averageReturn || 0)) {
          return current;
        }
        return best;
      },
      undefined as ListingStrategyResponse['summary'][number] | undefined
    );
  }, [strategyQuery.data]);

  const summaryRows = strategyQuery.data?.summary ?? [];

  const recentCoins = useMemo(() => {
    if (!strategyQuery.data?.coins) return [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (strategyQuery.data?.months ?? 3));
    return strategyQuery.data.coins
      .filter(coin => new Date(`${coin.listingDate}T00:00:00Z`) >= cutoff)
      .sort((a, b) => b.listingDate.localeCompare(a.listingDate));
  }, [strategyQuery.data]);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  useEffect(() => {
    if (recentCoins.length > 0) {
      setSelectedSymbol(recentCoins[0].symbol);
    } else {
      setSelectedSymbol(null);
    }
  }, [recentCoins]);

  const selectedCoin = useMemo<CoinListingAnalysis | null>(() => {
    if (!selectedSymbol) return null;
    return recentCoins.find(c => c.symbol === selectedSymbol) ?? null;
  }, [recentCoins, selectedSymbol]);

  const metaCards = useMemo(() => {
    if (!strategyQuery.data) return [];
    const { generatedAt, months, coinsAnalyzed } = strategyQuery.data;
    return [
      { label: '관측 기간', value: `${months}개월` },
      { label: '분석 코인', value: `${coinsAnalyzed}개` },
      { label: '생성 시각', value: format(new Date(generatedAt), 'MM.dd HH:mm') }
    ];
  }, [strategyQuery.data]);

  return (
    <section className="panel">
      <div>
        <p className="eyebrow">Listing Lab</p>
        <h3 style={{ margin: '6px 0' }}>최근 3개월 상장 코인 통계</h3>
        <p className="subtitle" style={{ fontSize: '0.9rem' }}>
          Bybit USDT 선물 4시간 캔들 기준 · 각 시나리오는 지정 시점에 진입해 24시간 동안 최고·중간·최저 진입가를 가정한 수익률을 계산합니다.
        </p>
      </div>
      {strategyQuery.isLoading && <div className="loading">Listing Lab 보고서를 계산 중...</div>}
      {strategyQuery.isError && (
        <div className="error-text">Listing Lab 데이터를 불러오지 못했습니다.</div>
      )}
      {strategyQuery.data && (
        <>
          <div className="listing-top-grid">
            <div className="listing-summary-card">
              {bestScenario && (
                <div className="stat-card" style={{ background: 'rgba(22, 199, 132, 0.12)' }}>
                  <p className="stat-title">가장 높은 평균 수익 시나리오 (24h)</p>
                  <p className="stat-value">
                    {bestScenario.label} ·{' '}
                    {bestScenario.averageReturn !== null && bestScenario.averageReturn !== undefined
                      ? `${bestScenario.averageReturn.toFixed(2)}%`
                      : '-'}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    성공률{' '}
                    {bestScenario.successRate !== null && bestScenario.successRate !== undefined
                      ? `${bestScenario.successRate.toFixed(1)}%`
                      : '-'}{' '}
                    · 표본 {bestScenario.sampleSize}
                  </p>
                </div>
              )}

              {metaCards.length > 0 && (
                <div className="listing-meta-grid">
                  {metaCards.map(card => (
                    <div key={card.label} className="meta-card">
                      <p className="meta-label">{card.label}</p>
                      <p className="meta-value">{card.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="listing-table-panel">
              <div className="panel-header">
                <p className="eyebrow">시나리오 통계</p>
                <p className="subtitle" style={{ fontSize: '0.8rem' }}>
                  24h 기준 수익률/성공률을 빠르게 비교하세요.
                </p>
              </div>
              <div className="table-scroll">
                <table className="scenario-table compact">
                  <thead>
                    <tr>
                      <th>시나리오</th>
                      <th>24h 평균</th>
                      <th>성공률</th>
                      <th>표본</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map(row => (
                      <tr key={row.scenarioId}>
                        <td>{row.label}</td>
                        <td>{row.averageReturn !== null ? `${row.averageReturn.toFixed(2)}%` : '-'}</td>
                        <td>{row.successRate !== null ? `${row.successRate.toFixed(1)}%` : '-'}</td>
                        <td>{row.sampleSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <CoinScenarioGallery
            coins={recentCoins}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
            selectedCoin={selectedCoin}
          />
        </>
      )}
    </section>
  );
};

type CoinScenarioGalleryProps = {
  coins: CoinListingAnalysis[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  selectedCoin: CoinListingAnalysis | null;
};

const CoinScenarioGallery = ({
  coins,
  selectedSymbol,
  onSelect,
  selectedCoin
}: CoinScenarioGalleryProps) => {
  return (
    <div className="listing-gallery">
      <div className="gallery-list">
        <div className="gallery-header">
          <p className="eyebrow">샘플 코인</p>
          <p className="subtitle" style={{ fontSize: '0.85rem' }}>최근 3개월 상장</p>
        </div>
        <div className="coin-gallery">
          {coins.length === 0 && (
            <span className="loading">최근 3개월 상장 데이터가 없습니다.</span>
          )}
          {coins.map(coin => (
            <button
              key={coin.symbol}
              type="button"
              className={`coin-gallery-item ${selectedSymbol === coin.symbol ? 'active' : ''}`}
              onClick={() => onSelect(coin.symbol)}
            >
              <div className="coin-symbol">{coin.symbol}</div>
              <div className="coin-name">{coin.koreanName}</div>
              <div className="coin-listing-date">상장 {coin.listingDate}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="gallery-detail">
        {selectedCoin ? (
          <CoinScenarioDetail coin={selectedCoin} />
        ) : (
          <div className="loading">샘플 코인을 선택하세요.</div>
        )}
      </div>
    </div>
  );
};

type CoinScenarioDetailProps = {
  coin: CoinListingAnalysis;
};

const CoinScenarioDetail = ({ coin }: CoinScenarioDetailProps) => {
  const priceQuery = useQuery({
    queryKey: ['listingCoinData', coin.symbol],
    queryFn: () => api.getDailyData(coin.symbol, 60),
    staleTime: 1000 * 60 * 10
  });

  const chartData = useMemo(() => buildCoinChart(priceQuery.data ?? [], coin.scenarios), [
    priceQuery.data,
    coin.scenarios
  ]);

  return (
    <div className="scenario-detail">
      <h4>
        {coin.koreanName} ({coin.symbol}) 시나리오
      </h4>
      <div className="scenario-chart">
        {priceQuery.isLoading && <div className="loading">가격 데이터를 불러오는 중...</div>}
        {priceQuery.isError && (
          <div className="error-text">가격 데이터를 불러오지 못했습니다.</div>
        )}
        {priceQuery.data && priceQuery.data.length > 0 && (
          <Line data={chartData.data} options={chartData.options} height={220} />
        )}
      </div>
      {coin.scenarios.length === 0 ? (
        <p className="error-text">시나리오 데이터가 준비되지 않았습니다.</p>
      ) : (
        <table className="scenario-table">
          <thead>
            <tr>
              <th>시나리오</th>
              <th>진입시점</th>
              <th>수익률</th>
              <th>진입가</th>
              <th>청산가</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {coin.scenarios.map((scenario: ScenarioResult) => (
              <tr key={`${coin.symbol}-${scenario.scenarioId}`}>
                <td>{scenario.label}</td>
                <td>{scenario.date}</td>
                <td>{scenario.returnPct.toFixed(2)}%</td>
                <td>{scenario.entryPrice.toFixed(4)}</td>
                <td>{scenario.exitPrice.toFixed(4)}</td>
                <td>{scenario.liquidated ? '청산' : scenario.returnPct >= 0 ? '이익' : '손실'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

function buildCoinChart(prices: DailyCandle[], scenarios: ScenarioResult[]) {
  const labels = prices.map(p => p.date);
  const closing = prices.map(p => p.close);

  const markers = scenarios
    .map(scenario => {
      const index = labels.indexOf(scenario.date);
      if (index === -1) return null;
      return {
        x: scenario.date,
        y: prices[index].close,
        label: scenario.label,
        positive: scenario.returnPct >= 0
      };
    })
    .filter(Boolean) as { x: string; y: number; label: string; positive: boolean }[];

  const markerMap = markers.reduce<Record<string, (typeof markers)[number]>>((acc, marker) => {
    acc[marker.x] = marker;
    return acc;
  }, {});

  const markerSeries = labels.map(label => markerMap[label]?.y ?? null);
  const markerColors = labels.map(label =>
    markerMap[label] ? (markerMap[label]?.positive ? '#16c784' : '#f43f5e') : 'rgba(0,0,0,0)'
  );

  return {
    data: {
      labels,
      datasets: [
        {
          label: '종가 (KRW)',
          data: closing,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: '시나리오 진입',
          data: markerSeries,
          borderColor: markerColors,
          backgroundColor: markerColors,
          pointRadius: labels.map(label => (markerMap[label] ? 6 : 0)),
          pointHoverRadius: labels.map(label => (markerMap[label] ? 8 : 0)),
          showLine: false,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'line'>) => {
              const value = ctx.parsed.y ?? 0;
              const marker = markerMap[ctx.label];
              if (marker && ctx.datasetIndex === 1) {
                return `${marker.label}: ${value.toLocaleString('ko-KR')}₩`;
              }
              return `종가: ${value.toLocaleString('ko-KR')}₩`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (value: number | string) => Number(value).toLocaleString('ko-KR')
          }
        },
        x: {
          ticks: { maxTicksLimit: 8 }
        }
      }
    }
  };
}

export default ListingLabPanel;
