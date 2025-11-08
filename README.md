# Upbit Alpha Desk

Upbit Alpha Desk is a full-stack trading-intel console for the KRW market.  
It blends Upbit day-candles, cached tickers, saved trading-value files, and Bybit-based listing strategies into one React frontend backed by an Express + Redis API layer.

## 🔧 Tech Stack
- **Backend**: Node.js, Express, TypeScript, Redis (market-data cache), Axios schedulers
- **Frontend**: React (Vite + TypeScript), React Query, Chart.js, date-fns
- **Scheduling**: Listing calendar & listing strategy analyzers (3h), ticker cache persistence, saved_data parsing, midnight candle refresh
- **Package Manager**: pnpm

## 📁 Repository Layout
```
src/                    # Express server + schedulers
├── server.ts           # API & static serving entry
├── config.ts           # CORS / API key / rate-limit config
├── clients/
│   ├── redisClient.ts  # Lazy Redis connector
│   └── bybitClient.ts  # Bybit hourly candle fetcher
├── services/           # DataManager + schedulers
frontend/               # React/Vite SPA (served as static build)
├── src/components/...  # Sidebar, analytics, listing lab, insights
├── src/api/            # Typed API client + DTOs
public/                 # Legacy static assets (still served)
cache/                  # JSON snapshots for schedulers & ticker cache
saved_data/             # Trading-value JSON files parsed into Redis
```

## 🚀 Local Development
1. **Backend**
   ```bash
   pnpm install
   pnpm dev           # tsx + nodemon
   ```
2. **Frontend**
   ```bash
   cd frontend
   pnpm install
   pnpm dev           # http://localhost:5173 (uses VITE_API_BASE_URL)
   ```
3. **Production build**
   ```bash
   pnpm build        # compiles backend + frontend
   pnpm start        # serves /api and the built SPA
   ```
   The Express server automatically serves `frontend/dist` (set `SERVE_FRONTEND=false` to disable).
4. **Tests**
   ```bash
   pnpm test         # vitest unit tests (rate limiter, etc.)
   ```

## 🔐 Environment
Copy `.env.example` (backend root):
```env
CORS_ORIGINS=https://app.your-domain.com
API_KEY=optional-x-api-key
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
REDIS_URL=redis://default:password@host:11219
SERVE_FRONTEND=true
PORT=3000
```
For the React dev server, copy `frontend/.env.example` and adjust:
```env
VITE_API_BASE_URL=http://localhost:3000
```

## 🔌 Core API Endpoints
| Route | Description |
| --- | --- |
| `GET /api/coins` | Supported KRW markets (volume sorted). |
| `GET /api/data/:coin/latest?days=30` | Latest day-candle slice. |
| `GET /api/data/:coin/statistics` | Min/Max/Range per coin. |
| `GET /api/market-data/:coin` | Redis-backed trading-value overlay (falls back to saved files). |
| `GET /api/coins/listing-dates` | Cached listing calendar snapshot (3h cadence). |
| `GET /api/coins/listing-strategies` | Cached Bybit short-scenario lab (3h cadence). |
| `GET /api/ticker` / `GET /api/ticker/:coins` | 1-minute cached Upbit tickers (API-key protected if set). |

## 🔄 Data Refresh Cadence
- **Ticker cache**: 60s TTL + persisted JSON (restored on restart).
- **Day candles**: Loaded on-demand and updated daily at 00:05 KST.
- **Market data overlay**: Parsed once per `saved_data` mtime, then cached in Redis for 6h per coin.
- **Listing calendar & lab**: Every 3 hours; results saved to `cache/` and, after restart, to Redis for warm responses.

---

# 업비트 알파 데스크 (Korean)

Upbit Alpha Desk는 KRW 마켓용 리액트 기반 대시보드입니다.  
Upbit 일봉, 1분 캐시 티커, `saved_data` 거래대금, Bybit 상장 숏 전략 통계를 Redis가 뒷단에서 캐싱하고 Express API로 제공합니다.

## 🔧 기술 스택
- **백엔드**: Node.js, Express, TypeScript, Redis 캐시, Axios 스케줄러
- **프런트엔드**: React (Vite), React Query, Chart.js, date-fns
- **스케줄러**: 상장 캘린더 / 상장 전략(3시간), 티커 캐시, saved_data 파서, 자정 데이터 갱신

## 📁 구조
```
src/                  # Express API + 스케줄러
frontend/             # React/Vite SPA
public/               # 기존 정적 자원
cache/, saved_data/   # 운영 캐시/데이터
```

## 🚀 개발 방법
1. 루트에서 `pnpm install`, `pnpm dev` (API 서버).
2. `frontend/`에서 `pnpm install`, `pnpm dev` (Vite). `.env`에 `VITE_API_BASE_URL`을 백엔드 주소로 지정.
3. 배포 시 `pnpm build` (백/프런트 동시 빌드) 후 `pnpm start` 실행 → Express가 `frontend/dist`(SPA)와 `/api/*`를 함께 서비스합니다.
4. `pnpm test` 명령으로 기본 유닛 테스트(레이트 리미터)를 돌릴 수 있습니다.

## 🔐 환경 변수
```env
CORS_ORIGINS=https://app.example.com
API_KEY=선택적 인증 키
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
REDIS_URL=redis://default:password@host:11219
SERVE_FRONTEND=true
```
프런트는 `frontend/.env` 안에 `VITE_API_BASE_URL`을 설정하세요.

## 🔌 주요 API
| 경로 | 설명 |
| --- | --- |
| `/api/coins` | 지원 KRW 마켓 목록 |
| `/api/data/:coin/latest?days=N` | 최근 N일 일봉 데이터 |
| `/api/data/:coin/statistics` | 통계 (최고/최저 등) |
| `/api/market-data/:coin` | Redis 캐시된 거래대금/거래량 |
| `/api/coins/listing-dates` | 3시간마다 갱신되는 상장 캘린더 |
| `/api/coins/listing-strategies` | 3시간마다 계산되는 상장 숏 전략 보고서 |
| `/api/ticker` / `/api/ticker/:coins` | 1분 캐시 Upbit 티커 |

## 🔄 갱신 주기
- 티커: 1분 TTL + 디스크 백업
- 일봉 데이터: 자정(00:05) 자동 업데이트
- 거래대금: `saved_data` 파일 변경 시 재파싱 → Redis 6시간 캐시
- 상장 캘린더/전략: 3시간마다 재계산 + 디스크/Redis 스냅샷

영어/한국어 설명을 함께 제공하니 플랫폼화 작업 시 참고하세요.
