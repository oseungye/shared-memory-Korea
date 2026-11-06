# 발표 16번(기술 구조) · 16-2번(검증) 시각자료 (2026-11-06)

| 파일 | 내용 |
|---|---|
| `slide16-structure.png` / `-notitle.png` | 16번: 사용자 참여 → 서술 비교 → 분석 → 결과 확인을 ‘어디서(브라우저 · 저장소 기록 데이터 · Supabase)’와 겹쳐 그린 작동 구조 |
| `slide16b-verification.png` / `-notitle.png` | 16-2번(새 장): 자동 테스트 · 개발 기록 · 발견하고 고친 문제(PR) · 운영 점검 · 미검증 |
| `source/tech.html`, `source/render.js` | 시안 HTML과 렌더 스크립트 (`node docs/presentation/slides-16-tech/source/render.js`) |

## 근거 (모두 2026-11-06 확인)

| 슬라이드 문구 | 근거 |
|---|---|
| 단위 테스트 234/234 | `npm test` 2026-11-06 실행 (tests/*.test.js 26개 파일) |
| 브라우저 테스트 556/556, 15개 묶음 | `npm run test:e2e` 2026-11-06 실행. **docs/TEST_REPORT.md의 “557”은 합계 오기** — 같은 문서의 스위트별 숫자 합도 556 |
| 커밋 129 · PR 병합 43 · 5.24–11.05 | `git log origin/main` (main 75cb522) |
| AI 답변 54건, 실시간 호출 없음 | `ai-narratives-data.js`, 수집 2026-10-22 |
| 질문하는 AI: 동의 시만 · 최대 2회 · 키는 서버 · 저장 안 함 · 실패 시 준비된 질문 | `ask-ai.js` 머리 주석, `supabase/functions/ask-ai/index.ts` |
| 개념 사전 26개 · 사료 21건(확인 5 · 일부 2 · 검토 전 14) | `concept-lexicon.js`, SUBMISSION.md 7절 |
| 입력 검사(연락처·링크·학교·학년/반) | PR #48, SUBMISSION.md 4절 |
| 연령대 비교 5명 미만 숨김 · 참여자 수는 서버 기록만 | `generation-analysis.js`, PR #48 |
| 테이블 8개 RLS · 비밀 키 없음 · 재현 SQL | docs/TEST_REPORT.md 3절 (2026-11-05 운영 점검, 읽기 전용) |
| PR #7 · #8 · #45 · #46 · #48 | 각 PR 병합 커밋 메시지 |
| 아직 확인 못 한 것 | docs/TEST_REPORT.md 4절 |

구현되지 않은 것은 넣지 않았습니다: 행위자·인과 분석, 문맥·부정문 구분, 실시간 AI 답변 생성.
