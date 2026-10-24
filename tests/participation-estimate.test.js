/* 참여자 수 구분 표기 — 실행: npm test
   · supabase/2026-10-participation-estimate.sql 이 추정치 합계·기준 시각만 공개하고 다른 것은 바꾸지 않는지,
   · shared-store.js 가 추정치를 읽고 함수가 없을 때 조용히 넘어가는지 확인합니다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;

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

test('shared-store: 추정치를 숫자로 읽고, 함수가 없으면 available=false', async () => {
  global.db = { rpc: async name => (name === 'participation_estimate'
    ? { data: [{ estimated: '52', counted_until: '2026-10-23T13:25:00+00:00' }], error: null }
    : { data: null, error: { code: 'PGRST202' } }) };
  try {
    assert.deepEqual(await Store.fetchParticipationEstimate(), { available: true, estimated: 52, countedUntil: '2026-10-23T13:25:00+00:00' });
    global.db = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) };
    assert.equal((await Store.fetchParticipationEstimate()).available, false);
    global.db = { rpc: async () => { throw new Error('Failed to fetch'); } };
    assert.equal((await Store.fetchParticipationEstimate()).available, false);
  } finally {
    delete global.db;
  }
});
