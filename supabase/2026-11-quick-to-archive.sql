-- ============================================================
-- Shared Memory Project — 기본 체험 한 줄 소감 '아카이브에 보태기' (선택 동의 · 운영자 확인 후 게시)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- · 앞의 SQL(2026-10-server-moderation — is_hidden 컬럼·조회 정책)을 실행한 상태를 전제로 합니다.
-- · 추가(additive)만 합니다. 기존 테이블·행·정책·함수를 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- · 이 SQL을 실행하기 전에는 사이트가 '보태기'를 보내지 않고 "준비 중"이라고 안내합니다
--   (확인 없이 바로 공개되는 일이 없도록, entry_source 칸이 없으면 보내지 않음).
--
-- 무엇이 바뀌나요
--   · shared_expressions 에 칸 두 개를 더합니다.
--       entry_source : 'quick' = 기본 체험 한 줄 소감에서 '아카이브에 보태기'로 들어온 문장 (그 밖에는 비어 있음)
--       reviewed_at  : 운영자가 확인한 시각 (사이트는 보내지 못함)
--   · 트리거: entry_source = 'quick' 인 문장은 등록될 때 항상 숨김(is_hidden = true)으로 들어갑니다.
--     → 공개 목록·아카이브·공감·참여자 수 어디에도 보이지 않다가, 운영자가 확인하고 풀면 게시됩니다.
--   · 심화 탐구의 공동 표현(entry_source 비어 있음)은 지금처럼 바로 게시됩니다 (변화 없음).
-- ============================================================

-- 1) 칸 추가 --------------------------------------------------
alter table public.shared_expressions
  add column if not exists entry_source text,
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shared_expressions_entry_source_chk') then
    alter table public.shared_expressions add constraint shared_expressions_entry_source_chk
      check (entry_source is null or entry_source in ('quick'));
  end if;
end $$;

comment on column public.shared_expressions.entry_source is
  'quick = 기본 체험 한 줄 소감에서 공개에 동의해 보탠 문장 (등록 시 항상 숨김 → 운영자 확인 후 게시)';
comment on column public.shared_expressions.reviewed_at is
  '운영자가 확인한 시각 (게시·비게시 모두). anon 은 등록·수정 불가';

-- anon 은 entry_source 만 보낼 수 있습니다 (is_hidden·reviewed_at 은 보낼 수 없음)
grant insert (entry_source) on table public.shared_expressions to anon, authenticated;

create index if not exists shared_expressions_review_idx
  on public.shared_expressions (created_at) where entry_source = 'quick' and reviewed_at is null;

-- 2) 확인 전 숨김 트리거 ------------------------------------------
create or replace function public.sm_quick_entry_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_source = 'quick' then
    new.is_hidden := true;        -- 운영자가 확인하기 전에는 공개하지 않음
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.sm_quick_entry_hold() from public, anon, authenticated;

create or replace trigger shared_expressions_quick_hold
  before insert on public.shared_expressions
  for each row execute function public.sm_quick_entry_hold();

-- 3) API 스키마 캐시 새로고침 -----------------------------------
notify pgrst, 'reload schema';

-- ============================================================
-- 운영 방법 (확인 대기열) — SQL Editor 에서 필요할 때 실행
--
--   확인 대기 목록 (오래된 순)
--     select id, event_key, content, created_at
--     from public.shared_expressions
--     where entry_source = 'quick' and reviewed_at is null
--     order by created_at;
--
--   게시하기 (아카이브·공감에 나타남)
--     update public.shared_expressions set is_hidden = false, reviewed_at = now() where id = <id>;
--
--   게시하지 않기 (숨김 유지, 대기 목록에서만 빠짐)
--     update public.shared_expressions set reviewed_at = now() where id = <id>;
--
--   ※ 역사 해석이 다르다는 이유로는 게시를 막지 않습니다. 개인정보(이름·학교·연락처)·욕설·혐오 표현만 거릅니다
--     (README '부적절 게시물 관리 방침').
--
-- 되돌리기 (필요할 때만)
--   drop trigger if exists shared_expressions_quick_hold on public.shared_expressions;
--   drop function if exists public.sm_quick_entry_hold();
--   revoke insert (entry_source) on table public.shared_expressions from anon, authenticated;
--   (칸은 남겨 두어도 사이트 동작에 영향 없음. 지우면 사이트는 다시 '준비 중'으로 돌아갑니다)
-- ============================================================
