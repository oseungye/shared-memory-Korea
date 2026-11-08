# Shared Memory — 본선 제출 안내

> 같은 역사를 한국·일본·중국은, 그리고 AI는 어떻게 다르게 말할까?
> 세 나라의 서술과 AI의 답을 나란히 읽고, 내 관점을 고르고 생각을 기록해 **My Memory Card**로 받는 참여형 역사 탐구 웹사이트입니다. 누가 옳은지 판정하지 않습니다.

| 항목 | 내용 |
|---|---|
| 배포 주소 | https://oseungye.github.io/shared-memory-Korea/ |
| 저장소 | https://github.com/oseungye/shared-memory-Korea |
| 구성 | 정적 웹사이트(HTML·CSS·JavaScript, 빌드 없음) · GitHub Pages · Supabase(PostgreSQL·RLS·RPC, Edge Function 1개) |
| 개발 기록 전체 | [README.md](README.md) (기능별 상세·분석 방법·DB 변경 이력) |

## 0. 공식 제출물 (운영사무국 안내 · 마감 2026-11-15(일) 23:59 · 이메일 swfd@sw.or.kr)

| # | 필수 제출물 | Shared Memory |
|---|---|---|
| 1 | 최종 완성 작품 — 정상 작동하는 웹 서비스 URL | https://oseungye.github.io/shared-memory-Korea/ |
| 2 | 소스코드 — GitHub 저장소 URL 또는 ZIP 중 하나 | https://github.com/oseungye/shared-memory-Korea (공개 저장소) |
| 3 | 최종 발표 PPT — 15분 발표·기능 시연용 | 발표자가 별도 제출 |

이 문서와 테스트 보고서·DB 재현 SQL 등은 저장소 안의 **보조 자료**이며 공식 필수 제출물이 아닙니다.
배포 사이트는 저장소 `main` 브랜치를 GitHub Pages로 그대로 배포하므로, 제출 시점의 `main`과 사이트가 같은 버전입니다
(확인: 저장소 Actions의 `pages build and deployment` 최신 실행이 `main` 최신 커밋에서 성공했는지).

## 1. 무엇을 하나요

- **기본 체험** (임진왜란·재일조선인, 약 3–5분 목표): 세 나라 기록 비교 → 관점 고르기 3문항(정답 없음) → 내 생각 기록(선택) → 공개 여부 선택 → My Memory Card(이미지 저장)
- **심화 탐구** (6개 사건): 탐구 전 한 문장 · 세 나라 서술 · ‘AI는 어떻게 말할까?’(AI 답변 기록 54건 · 기억의 빈자리 · 질문하는 AI) · 단어 분석 · 관련 사료 · 공동 표현 작성 · 공동 기억 지도 · Shared Archive

## 2. 실행 방법

```bash
python3 -m http.server 8000      # 저장소 폴더에서 → 브라우저 http://localhost:8000
```

- 로컬에서 열어도 **운영 Supabase**에 연결됩니다(`supabase-config.js`의 공개 publishable 키). 시험 데이터가 운영에 쌓이지 않게 하려면 배포 주소를 쓰거나, 새 Supabase 프로젝트에 [supabase/reproduce/README.md](supabase/reproduce/README.md) 순서로 DB를 만들고 `supabase-config.js`의 주소·키를 바꾸세요.
- 테스트(선택, Node.js 22.12+): `npm ci` → `npm test` / `npx playwright install chromium` → `npm run test:e2e` (가짜 DB, 운영 DB에 접속하지 않음)

## 3. 기술 구조

| 층 | 내용 | 주요 파일 |
|---|---|---|
| 화면 | 바닐라 JS 단일 페이지, 프레임워크·빌드 없음 | `index.html` `style.css` `script.js` |
| 서술 비교 분석 | 브라우저 안 규칙 기반 계산 — TF-IDF, 코사인·Jaccard 유사도(단어별 기여도), 다국어 개념 사전. 같은 입력이면 같은 결과, 근거 단어 표시 | `nlp-analyzer.js` `concept-lexicon.js` |
| 참여 문장 분석 | 단어+문자 2-gram+개념 사전 TF-IDF → 평균 연결 병합 군집화, 개념 사전 기반 프레이밍, 탐구 전/후 비교, 연령대별 비교(5명 미만 숨김) | `shared-memory-analyzer.js` `generation-analysis.js` `memory-map.js` |
| AI | ① **네 번째 서술자**: 같은 질문을 한·일·중 각 3회 Claude(`claude-opus-5-5`)에 물은 답 54건을 2026-10-22 기록해 보여 줌(실시간 호출 없음) ② **질문하는 AI**: 학생이 외부 전송에 동의한 경우만 Edge Function이 Anthropic API 호출(최대 2회, 실패 시 준비된 질문) | `ai-narratives-data.js` `narrator-analysis.js` `ask-ai.js` `supabase/functions/ask-ai/` |
| 데이터 | 모든 테이블 RLS, 브라우저는 publishable 키만, anon은 등록만(공개 문장은 정책·RPC로 조회), 집계는 SECURITY DEFINER RPC(`search_path=''`), 서버 단 숨김·등록 빈도 제한 | `shared-store.js` `supabase/*.sql` |
| 안정성 | 요청 15초 제한 시간, 서버·AI 장애 시에도 비교·카드 동작, 라이브러리 저장소 보관(학교망 CDN 차단 대비), 공용 기기용 ‘새 참여자로 시작’ | `supabase-config.js` `vendor/` |

## 4. 개인정보 · 데이터

- 이름·연락처·학교·정확한 나이를 받지 않습니다. 기본 체험의 고른 관점과 ‘내 생각’은 이름 없이 저장되며 다른 참여자에게 공개되지 않습니다. ‘내 생각’에 연락처·링크·이름 밝히기·학교 이름·학년/반이 있으면 저장 전에 막습니다.
- 공개 아카이브에는 학생이 ‘공개하기’를 누른 문장만 올라가며, 공개 문장·이유·탐구 전 문장·닉네임의 연락처·링크는 등록 전에 막습니다.
- 첫 화면 참여자 수는 **서버에 실제로 기록된 참여만** 셉니다(기록 시작 전 접속 로그 추정치는 넣지 않음).
- 질문하는 AI는 동의한 학생의 답을 Anthropic(미국) API로 보냅니다. 사이트는 그 답과 AI 응답을 저장하지 않습니다.

## 5. AI 활용 범위와 개발자 기여

[docs/AI_USE_AND_CONTRIBUTION.md](docs/AI_USE_AND_CONTRIBUTION.md) — 서비스 안의 AI 활용 범위(사실)와, 개발 과정에서의 AI 도구 사용 · **개발자 본인 기여(직접 작성)**.
커밋·PR 기록만으로 정리한 단계별 흐름과 고친 문제: [docs/DEVELOPMENT_EVIDENCE.md](docs/DEVELOPMENT_EVIDENCE.md).

## 6. 테스트 결과 · 미검증 항목

[docs/TEST_REPORT.md](docs/TEST_REPORT.md)

## 7. 알려진 제한사항

- 세 나라 서술은 프로젝트가 쓴 짧은 요약이며 각국 교과서·역사 인식을 대표하지 않습니다. 사료 21건 중 출처 확인 13 · 일부 확인 8 · 검토 전 0 (2026-11-08, [검증 기록](docs/SOURCE_VERIFICATION.md)).
- AI 답변 기록은 한 모델·한 날짜의 관찰입니다.
- 참여 데이터는 자발적·소규모 표본이며, 탐구 전/후 변화는 교육 효과를 증명하지 않습니다(대조군 없음).
- 같은 사람이 다른 기기·브라우저를 쓰면 참여자로 두 번 셀 수 있습니다.
- 자동 브라우저 테스트는 가짜 DB를 쓰며, RLS·트리거·Edge Function의 실제 동작은 운영 점검과 로컬 PostgreSQL 재현으로 확인했습니다.

## 8. 라이선스 · 외부 리소스

| 이름 | 라이선스 | 비고 |
|---|---|---|
| @supabase/supabase-js 2.117.2 | MIT | `vendor/supabase-js/` (LICENSE·해시 포함) |
| qrcode-generator 2.0.4 | MIT | `vendor/qrcode-generator/` (LICENSE·해시 포함) |
| Playwright 1.56.1 · @anthropic-ai/sdk 0.135.0 | Apache-2.0 · MIT | 개발·테스트·수집 스크립트용 (사이트 실행에 불필요) |
| Noto Serif KR·SC, Zen Old Mincho, Gowun Batang, Cormorant Garamond, Cinzel, Pretendard, 마루부리 | SIL OFL 1.1 | Google Fonts · jsDelivr · 네이버 한글에서 불러옴(실패 시 기본 서체) |
| GitHub Pages · Supabase · Anthropic API | 외부 서비스 | API 키는 Supabase secret에만 저장 |

프로젝트 자체의 오픈소스 라이선스 파일은 없습니다(공모전 요구 여부 확인 필요).
