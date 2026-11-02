/* 참여자 수: 모든 참여를 세는 참여 기록 — 실행: npm test
   · supabase/2026-10-participation-pings.sql 이 두 칸(사건·무작위 키)만 받는 등록 전용 테이블을 만들고,
     participation_summary() 가 키를 합집합으로 세며 반환 형식·권한을 유지하는지 확인합니다.
   · shared-store.js recordParticipation 이 사건마다 한 번, 두 칸만 보내는지 확인합니다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8').replace(/--.*$/gm, '');
const CODE = read('2026-10-participation-pings.sql');
const PREV = read('2026-10-count-choice-participants.sql');
const sig = sql => sql.match(/create or replace function public\.participation_summary\(\)\s*returns table\s*\(([\s\S]*?)\)\s*language/i)[1].replace(/\s+/g, ' ').trim();
const summary = CODE.match(/create or replace function public\.participation_summary\(\)[\s\S]*?\$\$([\s\S]*?)\$\$;/)[1];

test('참여 기록 테이블: 사건 이름·무작위 키 두 칸만 등록, 조회 정책 없음, 같은 키·사건은 한 번', () => {
  assert.match(CODE, /create table if not exists public\.participation_pings/);
  const table = CODE.match(/create table if not exists public\.participation_pings \(([\s\S]*?)\n\);/)[1];
  const cols = [...table.matchAll(/^\s+([a-z_]+)\s+(bigint|text|timestamptz)/gm)].map(m => m[1]);
  assert.deepEqual(cols, ['id', 'event_key', 'participant_key', 'created_at']);   // 답·문장·닉네임·연령대 칸 없음
  assert.match(table, /unique \(participant_key, event_key\)/);
  assert.match(CODE, /grant insert \(event_key, participant_key\) on table public\.participation_pings to anon, authenticated;/);
  assert.doesNotMatch(CODE, /grant\s+(select|update|delete|all)[^;]*participation_pings/i);
  assert.doesNotMatch(CODE, /for select/i);
  assert.match(CODE, /alter table public\.participation_pings enable row level security;/);
});

test('참여자 수: 참여 기록 키 ∪ 공동 표현 키 (한 사람 한 번) + 예전 데이터, 반환 형식·권한 그대로', () => {
  assert.equal(sig(CODE), sig(PREV));
  assert.match(summary, /union\s+select g\.participant_key from public\.participation_pings g/);
  assert.doesNotMatch(summary, /union all/);                                   // 같은 키는 한 번만
  assert.equal((summary.match(/not s\.is_hidden/g) || []).length, 4);          // 숨김 처리 유지
  // 참여 기록을 시작한 뒤의 객관식은 두 번 세지 않음
  assert.match(summary, /c\.created_at < coalesce\(\(select min\(g\.created_at\) from public\.participation_pings g\), 'infinity'::timestamptz\)/);
  assert.match(CODE, /revoke all on function public\.participation_summary\(\) from public, anon, authenticated;/);
  assert.match(CODE, /grant execute on function public\.participation_summary\(\) to anon;/);
  assert.match(CODE, /revoke all on function public\.sm_ping_insert_guard\(\) from public, anon, authenticated;/);
  const definers = CODE.split('security definer').length - 1;
  assert.equal((CODE.match(/security definer\s+set search_path = ''/g) || []).length, definers);
});

test('recordParticipation: 두 칸만 보내고, 사건마다 한 번, 중복(23505)·테이블 없음 처리', async () => {
  global.self = global.self || {};
  delete require.cache[require.resolve('../shared-store.js')];
  require('../shared-store.js');
  const Store = global.self.SharedStore;
  const sent = [];
  let reply = { error: null };
  global.db = { from: table => ({ insert: rows => { sent.push({ table, rows }); return Promise.resolve(reply); } }) };
  try {
    Store.resetParticipant();
    let r = await Store.recordParticipation('imjin');
    assert.ok(r.ok && !r.already);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].table, 'participation_pings');
    assert.deepEqual(Object.keys(sent[0].rows[0]).sort(), ['event_key', 'participant_key']);
    assert.equal(sent[0].rows[0].participant_key, Store.participantKey());
    r = await Store.recordParticipation('imjin');                     // 같은 사건은 다시 보내지 않음
    assert.ok(r.already);
    assert.equal(sent.length, 1);

    reply = { error: { code: '23505', message: 'duplicate key' } };   // 다른 탭에서 이미 보낸 경우
    r = await Store.recordParticipation('zainichi');
    assert.ok(r.ok && r.already);
    assert.equal(sent.length, 2);

    reply = { error: { code: 'PGRST205', message: "Could not find the table 'public.participation_pings' in the schema cache" } };
    r = await Store.recordParticipation('tribute');                   // SQL 실행 전: 표시 안 하고 다음에 다시 시도
    assert.ok(r.unavailable);
    r = await Store.recordParticipation('tribute');
    assert.equal(sent.length, 4);

    Store.resetParticipant();                                          // 새 참여자는 다시 셈 (키도 바뀜)
    const before = sent[0].rows[0].participant_key;
    reply = { error: null };
    r = await Store.recordParticipation('imjin');
    assert.ok(r.ok && !r.already);
    assert.notEqual(sent[sent.length - 1].rows[0].participant_key, before);

    assert.equal((await Store.recordParticipation('../x')).ok, false);     // 사건 이름 형식 검사
  } finally {
    delete global.db;
    Store.resetParticipant();
  }
});
