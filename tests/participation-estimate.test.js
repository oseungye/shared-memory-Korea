/* 참여자 수 구분 표기 — 실행: npm test
   · supabase/2026-10-participation-estimate.sql 이 추정치 합계·기준 시각만 공개하고 다른 것은 바꾸지 않는지,
   · 화면이 이 값을 합계에서 빼는 동작은 prefinal-stabilization.test.js · e2e/participation-count.e2e.js 가 확인합니다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', '2026-10-participation-estimate.sql'), 'utf8')
  .replace(/--.*$/gm, '');

test('추정치 함수: 합계와 기준 시각만 돌려주고 note(추정 방법 원문)는 공개하지 않는다', () => {
  assert.match(SQL, /create or replace function public\.participation_estimate\(\)\s+returns table\(estimated bigint, counted_until timestamptz\)/);
  const body = SQL.match(/\$\$([\s\S]*?)\$\$;/)[1];
  assert.match(body, /coalesce\(sum\(b\.participants\), 0\)::bigint, max\(b\.counted_until\)/);
  assert.doesNotMatch(body, /\bnote\b|\bsource\b/);
});

test('추정치 함수: search_path 고정 + PUBLIC 회수 후 anon에만 EXECUTE, 추가만 한다', () => {
  assert.match(SQL, /security definer\s+set search_path = ''/);
  assert.match(SQL, /revoke all on function public\.participation_estimate\(\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function public\.participation_estimate\(\) to anon;/);
  assert.doesNotMatch(SQL, /participation_summary|\bdrop\b|\bdelete\b|\bupdate\b|\btruncate\b|\balter table\b|\bgrant [^;]* on table\b/i);
});
