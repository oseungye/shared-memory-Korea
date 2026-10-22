-- ============================================================
-- Shared Memory Project — 서버 단 숨김 · 등록 빈도 제한 (본선 시연 대비)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- · 앞의 SQL(…/2026-10-prefinal-hardening / 2026-10-after-deploy-hide-age-column)을 실행한 상태를 전제로 합니다.
-- · 테이블·행을 지우지 않습니다. 컬럼 하나(is_hidden, 기본 false)와 트리거 하나를 더하고,
--   공개 조회 정책·집계 함수에서 숨긴 행을 빼도록 바꿉니다. 여러 번 실행해도 안전합니다.
-- · 지금 배포된 사이트와 호환됩니다(사이트는 is_hidden 을 보내거나 읽지 않습니다).
--
-- 운영 방법 — 부적절한 게시물을 숨길 때 (재배포 필요 없음, 바로 반영)
--   Table Editor → shared_expressions → 해당 행의 is_hidden 을 true 로
--   또는 SQL:  update public.shared_expressions set is_hidden = true where id = <제안 id>;
--   되돌리기:  update public.shared_expressions set is_hidden = false where id = <제안 id>;
--   ※ 역사 해석이 다르다는 이유로는 숨기지 않습니다 (README '부적절 게시물 관리 방침').
-- ============================================================

-- ------------------------------------------------------------
-- 1) 숨김 표시 컬럼
--    anon/authenticated 에는 INSERT 권한을 주지 않으므로 사이트·외부 요청은 항상 false 로만 등록됩니다.
--    조회 권한은 줍니다(공개해도 되는 true/false 값이며, 아래 조회 정책이 이 컬럼을 읽습니다).
-- ------------------------------------------------------------
alter table public.shared_expressions
  add column if not exists is_hidden boolean not null default false;

comment on column public.shared_expressions.is_hidden is
  '운영자 숨김 표시. true 이면 공개 조회·목록·집계에서 빠짐 (행은 유지). anon 은 등록·수정 불가';

grant select (is_hidden) on table public.shared_expressions to anon, authenticated;

-- 목록 정렬·빈도 확인용
create index if not exists shared_expressions_event_created_idx
  on public.shared_expressions (event_key, created_at desc);

-- ------------------------------------------------------------
-- 2) 공개 조회 정책: 숨긴 행은 테이블 직접 조회에서도 보이지 않음
-- ------------------------------------------------------------
-- 기존 정책(2026-09 SQL, using (true))의 조건만 바꿉니다 (정책을 지웠다가 다시 만드는 사이의 빈틈 없음).
alter policy "공동 표현 조회 허용" on public.shared_expressions
  to anon, authenticated
  using (not is_hidden);

-- ------------------------------------------------------------
-- 3) 공개 함수에서 숨긴 행 제외 (반환 형식·권한은 그대로)
-- ------------------------------------------------------------
create or replace function public.public_expressions(p_event_key text, p_limit integer default 500)
returns table(id bigint, event_key text, author_name text, country_code text, content text, reason text,
              created_at timestamptz, expression_style text, selected_concepts text[],
              reason_tags text[], before_content text, age_group text, age_group_suppressed boolean,
              prior_learning text, viewed_compare boolean, viewed_nlp boolean, viewed_sources boolean,
              completed_flow boolean)
language sql
stable security definer
set search_path = ''
as $$
  with sizes as (
    select s.age_group,
           count(distinct coalesce(p.participant_key, 'expr:' || s.id::text)) as n
    from public.shared_expressions s
    left join public.expression_participants p on p.expression_id = s.id
    where s.event_key = p_event_key and s.age_group is not null and not s.is_hidden
    group by s.age_group
  )
  select s.id, s.event_key, s.author_name, s.country_code, s.content, s.reason,
         s.created_at, s.expression_style, s.selected_concepts, s.reason_tags,
         s.before_content,
         case when hide.flag then null else s.age_group end,
         coalesce(hide.flag, false),
         s.prior_learning, s.viewed_compare, s.viewed_nlp, s.viewed_sources, s.completed_flow
  from public.shared_expressions s
  left join lateral (
    select (s.age_group in ('10s', '20s', '30s', '40s', '50s', '60plus')
            and z.n < public.sm_min_group_size()) as flag
    from sizes z where z.age_group = s.age_group
  ) hide on true
  where s.event_key = p_event_key and not s.is_hidden
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 500), 1), 500);
$$;

create or replace function public.empathy_counts(p_event_key text)
returns table(expression_id bigint, empathy_count bigint)
language sql
stable security definer
set search_path = ''
as $$
  select e.expression_id, count(*)::bigint as empathy_count
  from public.expression_empathy e
  join public.shared_expressions s on s.id = e.expression_id
  where s.event_key = p_event_key and not s.is_hidden
  group by e.expression_id;
$$;

create or replace function public.age_group_participants(p_event_key text)
returns table(age_group text, participants bigint)
language sql
stable security definer
set search_path = ''
as $$
  with g as (
    select coalesce(s.age_group, 'unknown') as age_group,
           count(distinct coalesce(p.participant_key, 'expr:' || s.id::text))::bigint as n
    from public.shared_expressions s
    left join public.expression_participants p on p.expression_id = s.id
    where s.event_key = p_event_key and not s.is_hidden
    group by coalesce(s.age_group, 'unknown')
  )
  select g.age_group,
         case when g.age_group in ('10s', '20s', '30s', '40s', '50s', '60plus')
                   and g.n < public.sm_min_group_size() then null else g.n end
  from g;
$$;

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
           and not exists (select 1 from public.expression_participants p where p.expression_id = s.id)),
    (select count(distinct p.participant_key)
       from public.expression_participants p
       join public.shared_expressions s on s.id = p.expression_id
      where s.completed_flow is true and not s.is_hidden),
    (select count(*) from public.shared_expressions s where not s.is_hidden);
$$;

-- create or replace 는 기존 권한을 유지하지만, 하드닝과 같은 상태임을 다시 보장합니다.
revoke all on function public.public_expressions(text, integer) from public, anon, authenticated;
revoke all on function public.empathy_counts(text)              from public, anon, authenticated;
revoke all on function public.age_group_participants(text)      from public, anon, authenticated;
revoke all on function public.participation_summary()           from public, anon, authenticated;
grant execute on function public.public_expressions(text, integer) to anon;
grant execute on function public.empathy_counts(text)              to anon;
grant execute on function public.age_group_participants(text)      to anon;
grant execute on function public.participation_summary()           to anon;

-- ------------------------------------------------------------
-- 4) 등록 빈도 제한 (BEFORE INSERT 트리거)
--    · sm_duplicate   : 같은 사건에 모든 내용이 같은 제안이 5분 안에 다시 들어온 경우
--                       (응답 시간 초과 뒤 다시 누른 경우·도배). 같은 문장 틀을 쓴 다른 학생은
--                       닉네임·이유·탐구 전 문장·연령대 등이 모두 같아야만 걸리므로 거의 막히지 않습니다.
--    · sm_rate_limited: 전체 등록이 1분에 120건 이상 (자동 도배 방지). 본선 청중 규모보다 넉넉한 값.
--    사이트(shared-store.js)는 두 오류를 안내 문구로 바꿔 보여 줍니다. 쓰던 문장은 남습니다.
--    트리거 함수는 REST 로 호출할 수 없고(트리거 전용), 실행 권한도 회수합니다.
-- ------------------------------------------------------------
create or replace function public.sm_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.shared_expressions s
    where s.event_key = new.event_key
      and s.created_at > now() - interval '5 minutes'
      and btrim(s.content) = btrim(new.content)
      and s.author_name is not distinct from new.author_name
      and s.country_code is not distinct from new.country_code
      and s.reason is not distinct from new.reason
      and s.before_content is not distinct from new.before_content
      and s.expression_style is not distinct from new.expression_style
      and s.selected_concepts is not distinct from new.selected_concepts
      and s.reason_tags is not distinct from new.reason_tags
      and s.age_group is not distinct from new.age_group
  ) then
    raise exception 'sm_duplicate' using errcode = 'P0001', hint = '같은 제안이 방금 등록되었습니다.';
  end if;

  if (select count(*) from public.shared_expressions s
      where s.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'sm_rate_limited' using errcode = 'P0001', hint = '등록이 몰려 잠시 멈췄습니다.';
  end if;

  return new;
end;
$$;

revoke all on function public.sm_insert_guard() from public, anon, authenticated;

create or replace trigger shared_expressions_insert_guard
  before insert on public.shared_expressions
  for each row execute function public.sm_insert_guard();

-- ------------------------------------------------------------
-- 되돌리기 (필요할 때만)
--   drop trigger if exists shared_expressions_insert_guard on public.shared_expressions;
--   drop function if exists public.sm_insert_guard();
--   alter policy "공동 표현 조회 허용" on public.shared_expressions using (true);
--   함수 4개는 2026-10-prefinal-hardening.sql 의 정의로 다시 실행
--   (is_hidden 컬럼은 남겨 두어도 사이트 동작에 영향 없음)
-- ============================================================
