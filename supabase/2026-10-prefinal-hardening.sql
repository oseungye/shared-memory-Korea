-- ============================================================
-- Shared Memory Project — 본선 배포 전 보안·개인정보 하드닝 (1단계)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- · 앞의 SQL 3개(2026-09-shared-memory-upgrade / 2026-10-participant-demographics /
--   2026-10-add-chinese-language)를 먼저 실행한 상태를 전제로 합니다.
-- · 지금 배포되어 있는 사이트(이전 버전 script.js·shared-store.js)와도 호환됩니다.
--   (테이블 직접 조회 select('*')는 그대로 허용 — 막는 것은 2단계 SQL에서)
-- · 테이블·행을 지우거나 데이터를 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 테이블 권한 최소화
--    Supabase 기본값으로 anon/authenticated 에 UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER 까지
--    부여되어 있었습니다. RLS 정책이 없어 REST 로는 실행되지 않지만, 필요 없는 권한이므로 회수합니다.
--    INSERT 는 "사이트가 실제로 보내는 컬럼"에만 허용합니다.
--    → id·created_at 을 직접 지정할 수 없어, 날짜를 미래로 넣어 목록 맨 위에 고정하는 요청이 막힙니다.
-- ------------------------------------------------------------
revoke all on table public.shared_expressions     from anon, authenticated;
revoke all on table public.expression_empathy     from anon, authenticated;
revoke all on table public.expression_participants from anon, authenticated;

-- 공개 조회: 1단계에서는 기존 사이트 호환을 위해 전체 컬럼 조회를 유지합니다 (2단계에서 age_group 제외).
grant select on table public.shared_expressions to anon, authenticated;

grant insert (event_key, author_name, country_code, content, reason,
              expression_style, selected_concepts, reason_tags, before_content,
              age_group, prior_learning, viewed_compare, viewed_nlp, viewed_sources, completed_flow)
  on table public.shared_expressions to anon, authenticated;

-- 공감·참여자 연결: 등록만 (조회 권한 없음 — voter_key·participant_key 는 외부에서 읽을 수 없음)
grant insert (expression_id, voter_key)       on table public.expression_empathy      to anon, authenticated;
grant insert (expression_id, participant_key) on table public.expression_participants to anon, authenticated;

-- ------------------------------------------------------------
-- 2) 입력값 제한 (CHECK) — 직접 REST 요청으로 이상한 값이 저장되지 않도록
--    ※ 사건을 새로 추가하면 shared_expressions_event_key_chk 의 목록도 함께 고쳐야 합니다.
-- ------------------------------------------------------------
do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_event_key_chk
    check (event_key in ('imjin', 'zainichi', 'culture', 'tribute', 'modern', 'hiroshima')) not valid;
exception when duplicate_object then null; end $$;

-- 작성 언어 (2026-10-add-chinese-language.sql 과 같은 제약 — 실행하지 않았던 경우를 위해 다시 둡니다)
do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_lang_chk
    check (country_code is null or country_code in ('ko', 'zh', 'ja', 'en', 'unknown', 'ETC')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_content_blank_chk
    check (btrim(content) <> '') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_reason_tags_chk
    check (reason_tags is null or reason_tags <@ array['multi_perspective', 'responsibility', 'damage',
                                                       'common_facts', 'future_dialogue', 'other']::text[]) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_concepts_len_chk
    check (selected_concepts is null or char_length(array_to_string(selected_concepts, '')) <= 1000) not valid;
exception when duplicate_object then null; end $$;

-- 기존 행도 모두 조건을 만족하므로 검증(VALIDATE)해 둡니다. (실패하면 해당 제약만 NOT VALID 로 남습니다)
do $$
declare c text;
begin
  foreach c in array array[
    'shared_expressions_event_key_chk', 'shared_expressions_lang_chk', 'shared_expressions_content_blank_chk',
    'shared_expressions_reason_tags_chk', 'shared_expressions_concepts_len_chk',
    'shared_expressions_style_chk', 'shared_expressions_content_len_chk', 'shared_expressions_author_len_chk',
    'shared_expressions_reason_len_chk', 'shared_expressions_before_len_chk', 'shared_expressions_arrays_chk',
    'shared_expressions_age_group_chk', 'shared_expressions_prior_learning_chk']
  loop
    begin
      execute format('alter table public.shared_expressions validate constraint %I', c);
    exception when others then
      raise notice '제약 % 은(는) 기존 행 중 조건을 벗어난 값이 있어 NOT VALID 로 둡니다: %', c, sqlerrm;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3) 집계 함수(RPC) 하드닝
--    · SECURITY DEFINER 유지: 조회 정책이 없는 비공개 테이블(참여자 키·공감 키)을 읽어
--      "집계값만" 돌려주기 위해 필요합니다. INVOKER 로 바꾸면 집계가 0이 되거나,
--      비공개 키 테이블에 공개 조회 권한을 줘야 합니다.
--    · search_path 를 빈 값으로 고정하고 모든 객체를 public. 으로 지정합니다.
--    · PUBLIC·authenticated 실행 권한을 회수하고 사이트가 쓰는 anon 에만 EXECUTE 를 줍니다.
--      (사이트는 로그인 기능이 없어 항상 anon 역할로 호출합니다)
--    · 입력값은 SQL 파라미터로만 비교하며 동적 SQL 이 없어 SQL 인젝션 경로가 없습니다.
-- ------------------------------------------------------------

-- 소표본 보호 기준 (generation-analysis.js 의 MIN_GROUP_SIZE 와 같은 값)
create or replace function public.sm_min_group_size()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

revoke all on function public.sm_min_group_size() from public, anon, authenticated;

-- 3-1) 전체 참여 현황 (전체 합계만 반환 — 집단별 값 없음)
create or replace function public.participation_summary()
returns table (participants bigint, completed_participants bigint, expressions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(distinct p.participant_key) from public.expression_participants p)
      + (select count(*) from public.shared_expressions s
         where not exists (select 1 from public.expression_participants p where p.expression_id = s.id)),
    (select count(distinct p.participant_key)
       from public.expression_participants p
       join public.shared_expressions s on s.id = p.expression_id
      where s.completed_flow is true),
    (select count(*) from public.shared_expressions);
$$;

revoke all on function public.participation_summary() from public, anon, authenticated;
grant execute on function public.participation_summary() to anon;

-- 3-2) 사건별 공감 수 (제안 id 별 숫자만 — voter_key 는 반환하지 않음)
create or replace function public.empathy_counts(p_event_key text)
returns table (expression_id bigint, empathy_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.expression_id, count(*)::bigint as empathy_count
  from public.expression_empathy e
  join public.shared_expressions s on s.id = e.expression_id
  where s.event_key = p_event_key
  group by e.expression_id;
$$;

revoke all on function public.empathy_counts(text) from public, anon, authenticated;
grant execute on function public.empathy_counts(text) to anon;

-- 3-3) 사건별·연령대별 참여자 수 — 소표본 보호
--      실제 연령대(10s~60plus) 가운데 5명 미만인 집단은 숫자 대신 participants = null 을 반환합니다.
--      (반환 형식은 그대로라 drop 없이 교체됩니다. 이전 사이트는 null 을 0으로 읽어 "표본 부족"으로 처리합니다)
create or replace function public.age_group_participants(p_event_key text)
returns table (age_group text, participants bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with g as (
    select coalesce(s.age_group, 'unknown') as age_group,
           count(distinct coalesce(p.participant_key, 'expr:' || s.id::text))::bigint as n
    from public.shared_expressions s
    left join public.expression_participants p on p.expression_id = s.id
    where s.event_key = p_event_key
    group by coalesce(s.age_group, 'unknown')
  )
  select g.age_group,
         case when g.age_group in ('10s', '20s', '30s', '40s', '50s', '60plus')
                   and g.n < public.sm_min_group_size() then null else g.n end
  from g;
$$;

revoke all on function public.age_group_participants(text) from public, anon, authenticated;
grant execute on function public.age_group_participants(text) to anon;

-- 3-4) 공개용 제안 목록 — 새 사이트(shared-store.js)는 테이블 대신 이 함수로 불러옵니다.
--      5명 미만 연령대의 age_group 은 null 로 가리고 age_group_suppressed = true 로 표시합니다.
--      (2단계 SQL 에서 테이블의 age_group 직접 조회를 막으면, 소표본 연령대를 외부에서 셀 방법이 사라집니다)
create or replace function public.public_expressions(p_event_key text, p_limit integer default 500)
returns table (
  id bigint, event_key text, author_name text, country_code text, content text, reason text,
  created_at timestamptz, expression_style text, selected_concepts text[], reason_tags text[],
  before_content text, age_group text, age_group_suppressed boolean, prior_learning text,
  viewed_compare boolean, viewed_nlp boolean, viewed_sources boolean, completed_flow boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with sizes as (
    select s.age_group,
           count(distinct coalesce(p.participant_key, 'expr:' || s.id::text)) as n
    from public.shared_expressions s
    left join public.expression_participants p on p.expression_id = s.id
    where s.event_key = p_event_key and s.age_group is not null
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
  where s.event_key = p_event_key
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 500), 1), 500);
$$;

revoke all on function public.public_expressions(text, integer) from public, anon, authenticated;
grant execute on function public.public_expressions(text, integer) to anon;

-- ------------------------------------------------------------
-- 4) API 스키마 캐시 새로고침
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
