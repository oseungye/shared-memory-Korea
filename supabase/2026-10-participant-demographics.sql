-- ============================================================
-- Shared Memory Project — 참여자 통계(연령대·학습 경험·탐구 진행) 확장 SQL
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- · 2026-09-shared-memory-upgrade.sql 을 먼저 실행한 상태를 전제로 합니다.
-- · 추가(additive)만 합니다. 테이블을 지우거나 다시 만들지 않고, 기존 행을 수정하지 않습니다.
-- · 여러 번 실행해도 안전합니다 (if not exists / duplicate_object 무시 / create or replace).
-- · 새 컬럼은 모두 비어 있어도(null) 됩니다. 기존 행은 null 그대로 분석에 포함됩니다.
-- · 이 SQL을 실행하기 전에도 사이트는 동작합니다 (새 항목만 저장되지 않고, 참여자 수 문구가 숨겨짐).
-- · 개인정보(이름·연락처·생년월일·정확한 나이·학교)는 어떤 컬럼에도 저장하지 않습니다.
-- ============================================================

-- 1) 공동 표현 확장 컬럼 --------------------------------------
alter table public.shared_expressions
  add column if not exists age_group      text,      -- 10s | 20s | 30s | 40s | 50s | 60plus | no_answer
  add column if not exists prior_learning text,      -- yes | no | unsure | no_answer (이 사건을 배우거나 접한 경험)
  add column if not exists viewed_compare boolean,   -- 국가별 서술을 실제로 확인했는가
  add column if not exists viewed_nlp     boolean,   -- NLP 비교 분석 탭을 열었는가 (추가 분석용)
  add column if not exists viewed_sources boolean,   -- 관련 사료 탭을 열었는가 (추가 분석용)
  add column if not exists completed_flow boolean;   -- 완료 참여 기준 충족 여부 (README 참고)

-- 2) 입력값 제한 (NOT VALID: 기존 행은 검사하지 않고 새 행만 검사) --
do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_age_group_chk
    check (age_group is null or age_group in ('10s', '20s', '30s', '40s', '50s', '60plus', 'no_answer')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shared_expressions add constraint shared_expressions_prior_learning_chk
    check (prior_learning is null or prior_learning in ('yes', 'no', 'unsure', 'no_answer')) not valid;
exception when duplicate_object then null; end $$;

create index if not exists shared_expressions_event_age_idx
  on public.shared_expressions (event_key, age_group);

-- 3) 익명 참여자 연결 테이블 (비공개) ---------------------------
-- 브라우저가 만든 무작위 키(participant_key)를 제안 id와 연결해, 한 사람이 여러 사건에 참여해도
-- "참여자 수"가 중복으로 세어지지 않게 합니다. 키는 개인정보가 아니지만, 외부에서 읽을 수 없도록
-- 조회(select) 정책을 만들지 않습니다. 집계는 아래 함수로만 제공합니다.
create table if not exists public.expression_participants (
  expression_id   bigint primary key references public.shared_expressions (id) on delete cascade,
  participant_key text   not null check (char_length(participant_key) between 8 and 64),
  created_at      timestamptz not null default now()
);

create index if not exists expression_participants_key_idx
  on public.expression_participants (participant_key);

alter table public.expression_participants enable row level security;

-- 등록만 허용. 방금(10분 이내) 등록된 제안에만 연결할 수 있어, 오래된 제안에 키를 붙일 수 없습니다.
drop policy if exists "참여자 연결 등록 허용" on public.expression_participants;
create policy "참여자 연결 등록 허용" on public.expression_participants
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.shared_expressions s
      where s.id = expression_id
        and s.created_at > now() - interval '10 minutes'
    )
  );

-- 4) 집계 함수 (RPC) — 원본 키는 절대 반환하지 않습니다 ----------
-- 참여자 수 = 서로 다른 participant_key 수 + 키가 연결되지 않은 제안 수(이 SQL 이전의 기존 행 등, 1건 = 1명으로 추정)
create or replace function public.participation_summary()
returns table (participants bigint, completed_participants bigint, expressions bigint)
language sql
stable
security definer
set search_path = public
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

revoke all on function public.participation_summary() from public;
grant execute on function public.participation_summary() to anon, authenticated;

-- 사건별·연령대별 참여자 수 (표본이 적은 집단을 숨기는 기준에 사용)
create or replace function public.age_group_participants(p_event_key text)
returns table (age_group text, participants bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.age_group, 'unknown') as age_group,
         count(distinct coalesce(p.participant_key, 'expr:' || s.id::text))::bigint as participants
  from public.shared_expressions s
  left join public.expression_participants p on p.expression_id = s.id
  where s.event_key = p_event_key
  group by coalesce(s.age_group, 'unknown');
$$;

revoke all on function public.age_group_participants(text) from public;
grant execute on function public.age_group_participants(text) to anon, authenticated;

-- 5) API 스키마 캐시 새로고침 -----------------------------------
notify pgrst, 'reload schema';
