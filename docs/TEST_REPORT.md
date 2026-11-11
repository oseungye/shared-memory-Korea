# 테스트 결과 · 미검증 항목 (2026-11-11 재실행)

기준: `main` 1629157 + 11/11 시연 피드백 수정 브랜치 `ccr-233804b0-i8f5q5-pilot` (2026-11-07판은 75cb522, 2026-11-05 첫 작성은 148406c 기준)
환경: Node.js v22.22.0 · Playwright 1.56.1 · Chromium 141.0.7390.37 · Linux

## 1. 자동 테스트 — 통과

| 구분 | 결과 |
|---|---|
| 단위 테스트 `npm test` (node:test) | **234 / 234 통과** (실패 0 · 건너뜀 0) |
| 브라우저 E2E `npm run test:e2e` (실제 Chromium · 가짜 Supabase) | **16개 스위트 578 / 578 통과** |

E2E 스위트별: archive-entry 39 · ask-ai 39 · card-save 42 · explore-steps 46 · feedback-round1 37 · fourth-narrator 43 · live-refresh 17 · memory-card 64 · offline-vendor 20 · participation-count 18 · pilot-feedback 22 (11/11 추가) · quick-experience 90 · reflection-privacy 13 · regression-smoke 22 · shared-archive 20 · shared-device 46 (합계 578. 11/7판의 556에 pilot-feedback 22가 더해졌습니다. 2026-11-05판의 ‘557’은 합계를 잘못 적은 것)

GitHub Actions(`.github/workflows/test.yml`)가 PR마다 같은 테스트를 실행합니다(테스트 0개·실행 못함도 실패로 처리).

## 2. 핵심 참여 동선 — 직접 진행 (휴대폰 390px · Chromium · 가짜 Supabase, 2026-11-05 main 148406c)

| # | 동선 | 결과 |
|---|---|---|
| 1 | QR·URL(`#/e/imjin`) 접속 | PASS |
| 2 | 첫 화면 사건 선택 | PASS |
| 3 | 세 나라 서술 비교 | PASS |
| 4 | AI 분석 (AI 답변 기록 · 단어 분석 · 질문하는 AI: 동의하지 않으면 외부 호출 0건) | PASS |
| 5 | 관점 선택 · 공동 표현 공개 | PASS |
| 6 | 심화 공동 표현 작성·등록 | PASS |
| 7 | 객관식 · 내 생각 · 참여 기록 저장 | PASS |
| 8 | Memory Card 생성 · PNG 다운로드 | PASS |
| 9 | 새 참여자로 시작 (참여자 키 초기화) | PASS |
| 10 | 모바일 재진입 (사건 링크 · 새로고침은 첫 화면) | PASS |

P0 수정 뒤에는 위 동선을 포함한 E2E 전체(1절)로 다시 확인했습니다.

## 3. 운영 환경 점검 (읽기 전용, 2026-11-05)

| 항목 | 결과 |
|---|---|
| Supabase 테이블 8개 RLS | 모두 켜짐 |
| Security Advisor | WARN 6 = 공개 집계 함수(의도된 SECURITY DEFINER) · INFO 2 = 정책 없는 비공개 테이블(의도) |
| Edge Function `ask-ai` | v5 동작, Verify JWT 끔(사이트가 publishable 키로 호출), 코드의 자료 지문 = 저장소 `data.json` |
| 비밀정보 | 저장소에 비밀 키·서비스 롤 키·JWT 없음(브라우저용 publishable 키만) |
| CI · Pages 배포 (148406c) | 성공 |
| DB 재현 | 빈 PostgreSQL 16에 `supabase/reproduce/README.md` 순서 적용 → 테이블 8개·함수 12개가 운영과 같음 |
| 운영 데이터 영향 (이번 수정) | **없음** — DB 스키마·행 변경 없음. 참여자 수 표시는 운영에 이미 있던 `participation_estimate()`를 읽기만 함 |

## 4. 미검증 — 사람이 확인해야 함

| 항목 | 이유 |
|---|---|
| 배포 사이트를 실제로 열어 본 것 | 점검 환경에서 github.io 접속이 막혀 있음 |
| 운영 Supabase에 실제 등록·조회하는 브라우저 흐름 | 자동 테스트는 가짜 DB (운영 데이터를 만들지 않기 위해) |
| 실제 휴대폰: iOS Safari · Android Chrome · 카카오톡/네이버 인앱 — QR 인식 · 카드 저장 | 기기 없음 |
| 질문하는 AI의 실제 응답 품질·속도 | 운영 호출 기록 3건(2026-11-02)뿐 |
| 학생 8명 실사용 | 진행 전 |
| 사료 링크 직접 열람(선조실록 개별 기사 등) | 해당 사이트가 점검 환경의 네트워크 허용 목록 밖 — 검색 색인으로만 교차 확인 |
