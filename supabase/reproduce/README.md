# 새 Supabase 프로젝트에 DB를 처음부터 만들기 (재현용)

**운영 DB에는 실행하지 마세요.** 운영 DB는 이미 아래 상태이며, 이 폴더는 심사·검증·새 학교 도입처럼
**빈 프로젝트**에서 같은 구조를 만들 때만 씁니다. 참여자 데이터는 들어 있지 않습니다(구조만).

## 순서 (SQL Editor에서 차례로)

| # | 파일 | 내용 |
|---|---|---|
| 0 | `supabase/reproduce/00-base-shared_expressions.sql` | 기본 테이블 `shared_expressions` + RLS·초기 정책. 운영에서는 프로젝트 초기에 대시보드로 만들어 저장소에 없던 부분(운영 구조에서 읽어 작성). 테이블이 이미 있으면 아무것도 하지 않고 멈춤 |
| 1 | `supabase/2026-09-shared-memory-upgrade.sql` | 작성 가이드 컬럼 · 공감 테이블 · `empathy_counts` |
| 2 | `supabase/2026-10-participant-demographics.sql` | 연령대·학습 경험·탐구 단계 · 참여자 키 테이블 |
| 3 | `supabase/2026-10-add-chinese-language.sql` | 작성 언어 제약 (선택) |
| 4 | `supabase/2026-10-prefinal-hardening.sql` | 권한 최소화 · CHECK · RPC 하드닝 · 소표본 보호 |
| 5 | `supabase/2026-10-after-deploy-hide-age-column.sql` | 연령대 직접 조회 차단 |
| 6 | `supabase/2026-10-server-moderation.sql` | 서버 단 숨김(`is_hidden`) · 등록 빈도 제한 |
| 7 | `supabase/2026-10-exploration-choices.sql` | 기본 체험 객관식 응답 · `choice_counts` |
| 8 | `supabase/2026-10-save-answers.sql` | 묶음 번호 · 비공개 ‘내 생각’ 테이블 |
| 9 | `supabase/2026-10-count-everyone.sql` | 참여 기록 · 추정치 테이블 · `participation_summary` (participation-pings 포함) |
| 10 | `supabase/2026-10-participation-estimate.sql` | 추정치 합계 함수 (첫 화면이 서버 기록만 보여 주는 데 사용) |
| 11 | `supabase/2026-10-ask-ai-limit.sql` | 질문하는 AI 호출 한도 기록 (서비스 롤 전용) |

- 적용하지 않는 파일: `2026-10-participation-pings.sql`(9번에 포함) · `2026-10-count-choice-participants.sql`(9번이 대체) · `2026-11-quick-to-archive.sql`(운영에도 미적용, 현재 화면은 쓰지 않음).
- **9번 다음에** 운영 사이트용 추정치 행을 지우세요: `delete from public.participation_baseline where source = 'quick_card_screens_logs';`
  (새 프로젝트에는 해당하지 않는 숫자입니다. 지우지 않아도 첫 화면은 10번 함수로 추정치를 빼고 보여 주지만, 합계 함수 값에는 남습니다.)
- 그다음 `supabase-config.js`의 `SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY`를 새 프로젝트 값으로 바꿉니다.
- 질문하는 AI(선택): `docs/ask-ai-runbook.md` — Edge Function 배포와 secret 등록. 하지 않아도 사이트는 준비된 질문으로 동작합니다.

## 검증 기록 (2026-11-05)

로컬 PostgreSQL 16 빈 DB(Supabase 역할 `anon`·`authenticated`·`service_role`만 만듦)에 0–11번을 순서대로 적용 → **모두 성공**.
0번을 다시 실행하면 안전장치가 멈추고(바뀐 것 없음), 1–11번은 다시 실행해도 오류 없음.
결과 테이블 8개·컬럼과 public 함수 12개가 운영 DB와 같음.
anon으로 공동 표현 등록·공개 RPC 조회·참여 기록 등록 가능, 비공개 ‘내 생각’ 테이블 조회는 거부됨.
Supabase의 PostgREST·Edge Function·대시보드 설정은 이 검증 범위 밖입니다.
