-- ============================================================
-- Shared Memory Project — 소표본 보호 2단계 (새 사이트 배포 "후"에 실행)
-- ⚠ 반드시 이번 버전의 shared-store.js 가 GitHub Pages 에 배포된 뒤 실행하세요.
--   이전 버전 사이트는 테이블을 select('*') 로 읽기 때문에, 먼저 실행하면 공동 표현 목록이 비어 보입니다.
--   (새 버전은 public_expressions() 함수로 읽고, 함수가 없거나 실패하면 공개 컬럼만 골라 읽습니다)
-- · 2026-10-prefinal-hardening.sql(1단계)을 먼저 실행한 상태를 전제로 합니다.
-- · 데이터를 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
--
-- 목적: shared_expressions 의 행 단위 age_group 을 공개 API 에서 직접 읽지 못하게 합니다.
--       연령대는 public_expressions() 함수가 5명 미만 집단을 가린 값으로만 제공합니다.
--       → "30대 2명"처럼 작은 집단의 존재와 그 제안 내용을 외부에서 연결할 수 없습니다.
--
-- 되돌리기: grant select on table public.shared_expressions to anon, authenticated;
-- ============================================================

revoke select on table public.shared_expressions from anon, authenticated;

grant select (id, event_key, author_name, country_code, content, reason, created_at,
              expression_style, selected_concepts, reason_tags, before_content,
              prior_learning, viewed_compare, viewed_nlp, viewed_sources, completed_flow)
  on table public.shared_expressions to anon, authenticated;

-- ※ 앞으로 shared_expressions 에 새 컬럼을 추가하면, 공개해도 되는 컬럼인지 판단한 뒤
--   위 grant select (...) 목록과 public_expressions() 반환 목록에 함께 추가해야 합니다.

notify pgrst, 'reload schema';
