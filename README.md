# Daily Trading — 매매일지

Bybit / Binance 청산 포지션을 불러와 Supabase에 자동 기록하는 매매일지입니다.

## 구조

```
거래소 API (Bybit / Binance)
        ↓  POST /api/sync
   청산 포지션 변환
        ↓
   Supabase `trades` 테이블
        ↓  GET /api/trades
   매매일지 UI
```

## 설정

### 1. Supabase

1. [Supabase](https://supabase.com) 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/001_trading_journal.sql` 실행
3. Project Settings → API 에서 URL / anon key / service_role key 복사

### 2. 거래소 API 키

**읽기 전용** 키를 권장합니다. (포지션/거래 내역 조회만)

| 거래소 | 필요한 권한 |
|--------|-------------|
| Bybit  | Position / Trade History Read |
| Binance Futures | Read |

### 3. 환경변수

```bash
cp .env.example .env.local
```

`.env.local`에 Supabase + 사용할 거래소 키를 넣습니다. Bybit만 써도 되고, 둘 다 넣어도 됩니다.

### 4. 실행
npm install
http://localhost:3000 접속 후 **거래소 동기화** 버튼을 누르면 최근 7일 청산 포지션이 DB에 저장됩니다.

## API

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/sync` | `{ exchange?, symbol?, days? }` — 거래소 → DB 동기화 |
| `GET` | `/api/trades` | `?limit=&symbol=&exchange=` — 매매일지 목록 |
| `PATCH` | `/api/trades` | `{ id, notes?, status?, screenshot_url? }` — 메모/상태 수정 |

## 기록되는 필드

스크린샷 매매일지와 동일한 핵심 정보:
- 심볼 / 롱·숏
- TP / SL / CLOSED 상태
- 실현 손익 (net PnL)
- 보유 시간
- 진입가 · 청산가 · 수량
- 진입·청산 시각

## 자동 동기화 (선택)

Vercel Cron 또는 외부 스케줄러로 주기적으로 sync를 호출할 수 있습니다.

```bash
curl -X POST https://your-domain/api/sync \
  -H "Content-Type: application/json" \
  -d '{"days":1}'
```

## 추가 SQL (북마크)

매매일지 테이블 외에 북마크가 필요하면:

`supabase/migrations/002_bookmarks.sql` 도 SQL Editor에서 실행하세요.