/* 기본 체험 객관식 답·한 줄 소감 저장 — 실행: npm test
   · supabase/2026-10-save-answers.sql: 추가만 하고, 소감 테이블은 등록 전용(조회 불가)·세 칸만, 길이 제한
   · shared-store.js: insertChoices 가 묶음 번호를 보내고 SQL 실행 전이면 그 칸만 빼고 다시 보냄,
     insertReflection 이 세 칸만 보냄
   · 실제 실행은 로컬 PostgreSQL 16에서 운영과 같은 구조로 확인(기존 행 유지, anon 조회 거부, 빈·301자 소감 거부). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'supabase', '2026-10-save-answers.sql'), 'utf8').replace(/--.*$/gm, '');

test('SQL: 추가만 함 (기존 행·칸을 지우거나 바꾸지 않음)', () => {
  assert.doesNotMatch(CODE, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|column)\b|\bupdate\s+public\./i);
  assert.match(CODE, /alter table public\.exploration_choices add column if not exists submission_id uuid;/);
  assert.match(CODE, /grant insert \(submission_id\) on table public\.exploration_choices to anon, authenticated;/);
});

test('SQL: 소감 테이블은 세 칸만 등록, 조회 정책·권한 없음, 1~300자', () => {
  const table = CODE.match(/create table if not exists public\.exploration_reflections \(([\s\S]*?)\n\);/)[1];
  assert.deepEqual([...table.matchAll(/^\s+([a-z_]+)\s/gm)].map(m => m[1]), ['id', 'event_key', 'submission_id', 'content', 'created_at']);
  assert.match(table, /check \(char_length\(btrim\(content\)\) between 1 and 300\)/);
  assert.match(CODE, /alter table public\.exploration_reflections enable row level security;/);
  assert.match(CODE, /grant insert \(event_key, submission_id, content\) on table public\.exploration_reflections to anon, authenticated;/);
  assert.doesNotMatch(CODE, /grant\s+(select|update|delete|all)[^;]*exploration_reflections/i);
  assert.doesNotMatch(CODE, /for select/i);
  assert.match(CODE, /revoke all on function public\.sm_reflection_insert_guard\(\) from public, anon, authenticated;/);
  assert.match(CODE, /security definer\s+set search_path = ''/);
});

test('store: 객관식은 묶음 번호와 함께, SQL 실행 전이면 그 칸만 빼고 다시 · 소감은 세 칸만', async () => {
  global.self = global.self || {};
  delete require.cache[require.resolve('../shared-store.js')];
  require('../shared-store.js');
  const Store = global.self.SharedStore;
  const sent = [];
  let replies = [];
  global.db = { from: table => ({ insert: rows => { sent.push({ table, rows }); return Promise.resolve(replies.shift() || { error: null }); } }) };
  try {
    const sid = Store.newSubmissionId();
    assert.match(sid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const rows = [{ event_key: 'imjin', question_id: 'name_focus', option_id: 'many_names', submission_id: sid, extra: 'x' }];

    let r = await Store.insertChoices(rows);
    assert.ok(r.ok);
    assert.deepEqual(sent[0].rows[0], { event_key: 'imjin', question_id: 'name_focus', option_id: 'many_names', submission_id: sid });

    replies = [{ error: { code: 'PGRST204', message: "Could not find the 'submission_id' column of 'exploration_choices' in the schema cache" } }];
    r = await Store.insertChoices(rows);                                   // SQL 실행 전 → 새 칸 빼고 재전송
    assert.ok(r.ok);
    assert.equal(sent.length, 3);
    assert.deepEqual(Object.keys(sent[2].rows[0]).sort(), ['event_key', 'option_id', 'question_id']);

    r = await Store.insertChoices([{ event_key: 'imjin', question_id: 'q', option_id: 'o', submission_id: 'not-a-uuid' }]);
    assert.ok(r.ok);
    assert.ok(!('submission_id' in sent[3].rows[0]));                      // 형식이 틀린 번호는 보내지 않음

    r = await Store.insertReflection({ eventKey: 'imjin', submissionId: sid, content: '  이름 하나에도 시선이 담겨 있다  ', nickname: '홍길동' });
    assert.ok(r.ok);
    assert.equal(sent[4].table, 'exploration_reflections');
    assert.deepEqual(sent[4].rows[0], { event_key: 'imjin', submission_id: sid, content: '이름 하나에도 시선이 담겨 있다' });

    assert.equal((await Store.insertReflection({ eventKey: 'imjin', submissionId: sid, content: '   ' })).ok, false);       // 빈 소감
    assert.equal((await Store.insertReflection({ eventKey: 'imjin', submissionId: 'x', content: '가' })).ok, false);        // 번호 형식
    assert.equal(sent.length, 5);
    await Store.insertReflection({ eventKey: 'imjin', submissionId: sid, content: '가'.repeat(400) });
    assert.equal(sent[5].rows[0].content.length, 300);                    // 300자로 자름 (DB 제한과 같음)

    replies = [{ error: { code: 'PGRST205', message: "Could not find the table 'public.exploration_reflections' in the schema cache" } }];
    r = await Store.insertReflection({ eventKey: 'imjin', submissionId: sid, content: '가' });
    assert.ok(r.unavailable);                                               // SQL 실행 전: 조용히 넘어감
  } finally {
    delete global.db;
  }
});
