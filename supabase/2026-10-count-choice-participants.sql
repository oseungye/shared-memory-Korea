-- ============================================================
-- Shared Memory Project — 참여자 수에 '기본 체험 객관식 참여'도 포함
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
-- · 앞의 SQL(2026-10-server-moderation · 2026-10-exploration-choices)을 실행한 상태를 전제로 합니다.
-- · participation_summary() 하나만 바꿉니다. 테이블·행·정책·권한은 바꾸지 않습니다.
-- · 반환 형식(participants, completed_participants, expressions)은 그대로라 사이트 코드는 바꾸지 않아도 됩니다.
--
-- 무엇이 바뀌나요
--   participants = (기존) 공동 표현 참여자 수
--                + (추가) 기본 체험 객관식 참여 수 — '익명 통계에 보태기'에 동의해 서버에 보낸 응답 묶음 수
--   completed_participants · expressions 는 공동 표현 기준 그대로입니다.
--
-- 객관식 참여는 어떻게 세나요
--   · 객관식 행에는 참여자 키가 없습니다(개인을 이을 수 없게 설계). 대신 한 사람의 응답은 사이트가
--     한 번의 INSERT로 보내므로 같은 트랜잭션 시각(created_at = now())을 가집니다.
--     → (event_key, created_at) 묶음 하나를 참여 1회로 셉니다.
--   · 동의하지 않은 참여자는 서버에 아무것도 남기지 않으므로 셀 수 없습니다 (수집 범위는 바꾸지 않음).
--   · 같은 사람이 객관식(기본 체험)과 공동 표현(심화 탐구)을 모두 했다면 두 번 셀 수 있습니다
--     (두 데이터를 잇지 않는 설계의 한계 — 참여 '횟수'에 가까운 값).
-- ============================================================

create or replace function public.participation_summary()
returns table(participants bigint, completed_participants bigint, expressions bigint)
language sql
stable security definer
set search_path = ''
as $$
  select
    (select count(distinct p.participant_key)
       from public.expression_participants p
       join public.shared_expressions s on s.id = p.expression_id
      where not s.is_hidden)
      + (select count(*) from public.shared_expressions s
         where not s.is_hidden
           and not exists (select 1 from public.expression_participants p where p.expression_id = s.id))
      + (select count(*) from (select distinct c.event_key, c.created_at
                                 from public.exploration_choices c) as choice_submissions),
    (select count(distinct p.participant_key)
       from public.expression_participants p
       join public.shared_expressions s on s.id = p.expression_id
      where s.completed_flow is true and not s.is_hidden),
    (select count(*) from public.shared_expressions s where not s.is_hidden);
$$;

-- create or replace 는 기존 권한을 유지하지만, 하드닝과 같은 상태임을 다시 보장합니다.
revoke all on function public.participation_summary() from public, anon, authenticated;
grant execute on function public.participation_summary() to anon;

notify pgrst, 'reload schema';

-- 되돌리기 (필요할 때만): 2026-10-server-moderation.sql 의 participation_summary 부분을 다시 실행하세요.
