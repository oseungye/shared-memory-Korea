-- ============================================================
-- Shared Memory Project — 참여자 수의 '추정치'를 따로 알려 주는 함수 (구분 표기용)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
-- · 앞의 SQL(2026-10-count-everyone)을 실행한 상태를 전제로 합니다.
-- · 함수 하나를 추가만 합니다. participation_summary()·테이블·행·권한은 바꾸지 않습니다.
--
-- 왜 필요한가요
--   participation_summary() 의 participants 에는 서버 기록(참여 기록·공동 표현·객관식)과 함께
--   participation_baseline 의 '추정치'(API 요청 로그로 센 이전 참여자 52명)가 더해져 있습니다.
--   첫 화면이 "서버 기록 n명 + 추정 m명"으로 나눠 보여 줄 수 있도록 추정치 합계만 공개합니다.
--   추정 방법을 적은 note 와 원자료는 공개하지 않습니다(숫자와 기준 시각만).
-- ============================================================

create or replace function public.participation_estimate()
returns table(estimated bigint, counted_until timestamptz)
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(sum(b.participants), 0)::bigint, max(b.counted_until)
  from public.participation_baseline b;
$$;

revoke all on function public.participation_estimate() from public, anon, authenticated;
grant execute on function public.participation_estimate() to anon;

notify pgrst, 'reload schema';

-- 확인:  select * from public.participation_summary();  select * from public.participation_estimate();
-- 되돌리기 (필요할 때만): revoke execute on function public.participation_estimate() from anon;
--   (사이트는 이 함수가 없으면 예전처럼 합계만 표시합니다)
