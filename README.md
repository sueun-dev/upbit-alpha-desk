# Upbit Alpha Desk

**Upbit Alpha Desk** is a realtime intelligence board for the KRW market.  
It combines Upbit day candles, cached ticker prices, saved market-volume data,  
and Bybit-based listing strategy analytics into a single dashboard optimized for speed and low API usage.

## ✨ Key Features
- **Live Ticker Cache (1‑minute TTL)** – frontend polls every minute while the server shares a disk-backed cache so restarts don’t hammer Upbit.
- **Day-Candle Analytics** – historical candles/statistics are served from an in-memory map (via `DataManager`) with incremental updates at 00:05 KST.
- **Market Data Overlay** – saved JSON files are parsed once and cached based on file `mtime`, exposing trading-value statistics per coin.
- **Listing Calendar & Strategy Lab** – schedulers run every 3 hours, pulling Upbit listing dates and Bybit 1h klines to compute post-listing short scenarios. Results are cached to disk for instant responses.
- **Platform-Friendly Security** – configurable CORS allowlist, optional API key check (`x-api-key`), and rate limiting protect every `/api/*` route.

## 🏗 Architecture at a Glance
- **Backend**: Node.js, Express, TypeScript
- **Frontend**: Vanilla HTML + Chart.js, optimized for a single-page dashboard
- **Schedulers**: Listing calendar + strategy report (3h cadence), ticker cache persistence, saved-data cache
- **Package Manager**: pnpm

```
src/
├── server.ts                 # Express entrypoint
├── config.ts                 # Security / rate-limit settings
├── services/
│   ├── dataManager.ts        # Candle store & incremental updater
│   ├── listingStrategyService.ts
│   ├── listingStrategyScheduler.ts
│   └── listingCalendarScheduler.ts
├── clients/
│   └── bybitClient.ts
public/
└── index.html                # Dashboard UI + inline logic
cache/                        # Disk snapshots for schedulers & ticker cache
saved_data/                   # Market data JSON (trading values)
```

## 🚀 Getting Started
```bash
pnpm install          # install dependencies
pnpm run dev          # start dev server (tsx + nodemon)
pnpm run build        # compile TypeScript
pnpm start            # run compiled server
```

Set environment variables (create `.env`) before running in production:
```env
CORS_ORIGINS=https://your-domain.example
API_KEY=your-secure-key
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
```

## 🔌 Important API Endpoints
| Route | Description |
| --- | --- |
| `GET /api/coins` | Supported KRW markets (sorted by volume). |
| `GET /api/data/:coin/latest?days=30` | Latest N-day candle slice for a coin. |
| `GET /api/data/:coin/statistics` | Min/Max/Range stats for a coin. |
| `GET /api/market-data/:coin` | Cached trading-value overlay from `saved_data`. |
| `GET /api/coins/listing-dates` | Cached listing calendar (3h updates). |
| `GET /api/coins/listing-strategies` | Cached listing strategy report (3h updates). |
| `GET /api/ticker` / `:coins` | 1-minute cached Upbit tickers (requires API key if configured). |

## 🔄 Data Refresh Cadence
- **Ticker Cache**: 1-minute TTL; disk snapshot used on restart.
- **Saved Candles**: `DataManager` updates at startup and 00:05 KST daily.
- **Market Data**: re-parsed only when `saved_data/*.json` changes.
- **Listing Calendar & Strategy Lab**: schedulers run every 3 hours and persist JSON snapshots.

---

# 업비트 알파 데스크 (Korean)

Upbit Alpha Desk는 KRW 마켓을 위한 실시간 인텔리전스 보드입니다.  
Upbit 일봉, 캐시된 티커, 저장된 거래대금, Bybit 기반 상장 전략 통계를 한 화면에서 보여 주면서 API 호출을 최소화하도록 설계되었습니다.

## ✨ 핵심 기능
- **1분 캐시 티커** – 서버가 디스크 캐시를 유지해 재시작 후에도 즉시 티커를 제공하고, 프론트는 1분 간격으로 갱신합니다.
- **일봉/통계 즉시 응답** – `DataManager`가 메모리에 적재한 캔들 데이터를 바로 반환합니다 (00:05 KST 자동 업데이트).
- **거래대금 오버레이** – `saved_data` JSON을 `mtime` 기준으로 캐시해 반복 파싱 없이 거래대금 그래프를 렌더링합니다.
- **상장 캘린더 & 숏 패턴** – 3시간 주기로 Upbit/Bybit 데이터를 조합해 상장 관련 인사이트를 계산하고, 디스크에 스냅샷을 저장합니다.
- **플랫폼 보안 옵션** – CORS 허용 목록, API Key(`x-api-key`), Rate Limit 설정으로 무단 호출을 차단합니다.

## 🏗 아키텍처 요약
- **백엔드**: Node.js, Express, TypeScript  
- **프런트엔드**: HTML + Chart.js  
- **스케줄러**: 상장 캘린더 / 상장 전략 / 티커 캐시 / saved_data 캐시  
- **패키지 매니저**: pnpm

```
src/
├── server.ts
├── config.ts
├── services/
│   ├── dataManager.ts
│   ├── listingStrategyService.ts
│   ├── listingStrategyScheduler.ts
│   └── listingCalendarScheduler.ts
├── clients/bybitClient.ts
public/index.html
cache/ (스냅샷)
saved_data/ (거래대금 JSON)
```

## 🚀 시작 방법
```bash
pnpm install
pnpm run dev     # 개발 서버
pnpm run build   # TypeScript 빌드
pnpm start       # 프로덕션 서버
```

`.env` 예시:
```env
CORS_ORIGINS=https://your-domain.example
API_KEY=your-secure-key
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
```

## 🔌 주요 API
| 경로 | 설명 |
| --- | --- |
| `GET /api/coins` | 지원하는 KRW 마켓 목록 (거래대금 순). |
| `GET /api/data/:coin/latest?days=N` | 최근 N일 일봉 데이터. |
| `GET /api/data/:coin/statistics` | 최고/최저/기간 통계. |
| `GET /api/market-data/:coin` | 저장된 거래대금(캘린더 기반) 데이터. |
| `GET /api/coins/listing-dates` | 3시간마다 갱신되는 상장 캘린더. |
| `GET /api/coins/listing-strategies` | 3시간마다 갱신되는 상장 숏 전략 리포트. |
| `GET /api/ticker` / `:coins` | 1분 캐시 티커 (API 키 필요 시 `x-api-key`). |

## 🔄 데이터 갱신 주기
- **티커**: 1분 TTL, 재시작 시 캐시 파일 로드.
- **일봉 데이터**: 서버 시작 및 매일 00:05에 자동 갱신.
- **거래대금**: `saved_data` 파일이 변경될 때만 다시 파싱.
- **상장 캘린더/전략**: 3시간마다 스케줄링 후 JSON 스냅샷 저장.

이 README는 영어/한국어 두 버전을 함께 제공합니다. 플랫폼 배포 시 참고해 주세요.
# upbit-alpha-desk
