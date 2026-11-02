/* 참여자 수: 이전 참여자 추정치까지 — 실행: npm test
   · supabase/2026-10-count-everyone.sql 이 participation-pings SQL을 그대로 포함하고,
     추정치 테이블은 사이트(anon)에서 읽거나 쓸 수 없으며, 집계는 추정치 합만 더하는지 확인합니다.
   · 실제 실행 결과는 로컬 PostgreSQL에서 운영과 같은 모양의 데이터로 확인했습니다(18 → 70). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8').replace(/--.*$/gm, '');
const ALL = read('2026-10-count-everyone.sql');
const PINGS = read('2026-10-participation-pings.sql');
const norm = s => s.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
const section = (sql, from, to) => norm(sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from))));
const summary = sql => sql.match(/create or replace function public\.participation_summary\(\)[\s\S]*?\$\$([\s\S]*?)\$\$;/)[1];

test('참여 기록 테이블·트리거 부분은 participation-pings SQL과 글자 그대로 같다', () => {
  const a = section(ALL, 'create table if not exists public.participation_pings', 'create table if not exists public.participation_baseline');
  const b = section(PINGS, 'create table if not exists public.participation_pings', 'create or replace function public.participation_summary');
  assert.equal(a, b);
});

test('추정치 테이블: RLS 켜짐, 사이트(anon·authenticated)는 읽기·쓰기 불가, 숫자만 저장', () => {
  assert.match(ALL, /alter table public\.participation_baseline enable row level security;/);
  assert.match(ALL, /revoke all on table public\.participation_baseline from anon, authenticated;/);
  assert.doesNotMatch(ALL, /grant [^;]*participation_baseline/i);
  assert.doesNotMatch(ALL, /create policy [^;]*participation_baseline/i);
  const cols = ALL.match(/create table if not exists public\.participation_baseline \(([\s\S]*?)\n\);/)[1];
  assert.deepEqual([...cols.matchAll(/^\s+([a-z_]+)\s/gm)].map(m => m[1]), ['source', 'participants', 'counted_until', 'note']);
  assert.match(ALL, /values \('quick_card_screens_logs', 52, '2026-10-23 13:25:00\+00',/);
  assert.match(ALL, /on conflict \(source\) do nothing;/);                    // 다시 실행해도 두 번 더하지 않음
});

test('집계: participation-pings 집계 + 추정치 합만 더하고, 반환 형식·권한 그대로', () => {
  const now = norm(summary(ALL));
  const added = ' + (select coalesce(sum(b.participants), 0) from public.participation_baseline b)';
  assert.ok(now.includes(norm(added)));
  assert.equal(norm(now.replace(norm(added), '')), norm(summary(PINGS)));
  assert.match(ALL, /revoke all on function public\.participation_summary\(\) from public, anon, authenticated;/);
  assert.match(ALL, /grant execute on function public\.participation_summary\(\) to anon;/);
  assert.doesNotMatch(ALL, /\bdrop (table|function)\b|\bdelete from\b|\btruncate\b/i);
});
