import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { api } from '../../api/client';
import type { DailyCandle, MarketDataResponse } from '../../api/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type AnalyticsPanelProps = {
  selectedCoin: string;
  chartRange: number;
  onRangeChange: (range: number) => void;
  queryKey: string;
};

const RANGE_OPTIONS = [30, 60, 90, 180];

const AnalyticsPanel = ({ selectedCoin, chartRange, onRangeChange, queryKey }: AnalyticsPanelProps) => {
  const priceQuery = useQuery({
    queryKey: ['dailyData', selectedCoin, chartRange, queryKey],
    queryFn: () => api.getDailyData(selectedCoin, chartRange),
    enabled: Boolean(selectedCoin)
  });

  const marketDataQuery = useQuery({
    queryKey: ['marketData', selectedCoin],
    queryFn: () => api.getMarketData(selectedCoin),
    enabled: Boolean(selectedCoin)
  });

  const priceData = priceQuery.data ?? [];

  const chartConfig = useMemo(() => buildChart(priceData), [priceData]);
  const statCards = useMemo(
    () => buildStats(priceData, marketDataQuery.data),
    [priceData, marketDataQuery.data]
  );

  return (
    <section className="panel analytics-panel">
      <div className="analytics-controls">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2 style={{ margin: '6px 0' }}>{selectedCoin} Price &amp; Liquidity</h2>
          <p className="subtitle">Upbit 일봉 데이터 · {chartRange}일 구간 비교</p>
        </div>
        <div className="range-buttons">
          {RANGE_OPTIONS.map(option => (
            <button
              key={option}
              type="button"
              className={option === chartRange ? 'active' : ''}
              onClick={() => onRangeChange(option)}
            >
              {option}D
            </button>
          ))}
        </div>
      </div>

      <div style={{ minHeight: 320 }}>
        {priceQuery.isLoading && <div className="loading">가격 데이터를 로딩 중...</div>}
        {!priceQuery.isLoading && priceData.length === 0 && (
          <div className="no-results" style={{ padding: '60px 0' }}>
            선택한 코인에 대한 일봉 데이터가 없습니다.
          </div>
        )}
        {priceData.length > 0 && (
          <Line
            data={chartConfig.data}
            options={chartConfig.options}
            style={{ maxHeight: 360 }}
            height={360}
          />
        )}
      </div>

      <div className="stats-grid">
        {statCards.map(card => (
          <div key={card.title} className="stat-card">
            <p className="stat-title">{card.title}</p>
            <p className="stat-value">{card.value}</p>
            {card.sub && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

function buildChart(data: DailyCandle[]) {
  const labels = data.map(item => item.date);
  const closing = data.map(item => item.close);
  const volume = data.map(item => item.volume);

  return {
    data: {
      labels,
      datasets: [
        {
          label: '종가 (KRW)',
          data: closing,
          borderColor: '#6366f1',
          tension: 0.3,
          fill: true,
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          yAxisID: 'y'
        },
        {
          label: '거래량',
          data: volume,
          borderColor: '#a855f7',
          borderDash: [6, 6],
          pointRadius: 0,
          tension: 0.2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      interaction: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            usePointStyle: true
          }
        }
      },
      scales: {
        y: {
          type: 'linear' as const,
          position: 'left' as const,
          ticks: {
            callback: (value: number | string) => Number(value).toLocaleString('ko-KR')
          }
        },
        y1: {
          type: 'linear' as const,
          position: 'right' as const,
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            callback: (value: number | string) => Number(value).toLocaleString('ko-KR')
          }
        },
        x: {
          ticks: {
            maxTicksLimit: 8
          }
        }
      }
    }
  };
}

type StatCard = { title: string; value: string; sub?: string };

function buildStats(data: DailyCandle[], marketData?: MarketDataResponse | null): StatCard[] {
  if (!data.length) {
    return [
      { title: '종가', value: '-' },
      { title: '일간 변동', value: '-' },
      { title: '평균 거래량', value: '-' },
      { title: '최대 거래대금 (6M)', value: '-' }
    ];
  }

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const dayChange = prev ? (((last.close - prev.close) / prev.close) * 100).toFixed(2) : '0.00';
  const avgVolume =
    data.reduce((sum, item) => sum + item.volume, 0) / (data.length || 1);
  const highestTrading = marketData?.statistics?.highest;

  return [
    {
      title: '종가',
      value: `${last.close.toLocaleString('ko-KR')}₩`,
      sub: last.date
    },
    {
      title: '일간 변동률',
      value: `${Number(dayChange) >= 0 ? '+' : ''}${dayChange}%`,
      sub: prev ? `${prev.date} 대비` : undefined
    },
    {
      title: '평균 거래량',
      value: `${Math.round(avgVolume).toLocaleString('ko-KR')}`,
      sub: `${data.length}일 평균`
    },
    {
      title: '최대 거래대금 (6M)',
      value: highestTrading ? `${Math.round(highestTrading.value).toLocaleString('ko-KR')}₩` : '-',
      sub: highestTrading ? highestTrading.date : 'market data'
    }
  ];
}

export default AnalyticsPanel;
