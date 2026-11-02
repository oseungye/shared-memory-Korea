/* 기본 체험 한 줄 소감 '아카이브에 보태기' — 실행: npm test
   · supabase/2026-11-quick-to-archive.sql: 추가만, entry_source 만 등록 허용, 'quick'은 등록 시 항상 숨김(운영자 확인 후 게시)
   · shared-store.js insertQuickExpression: 익명·소감만 보내고, 등록 결과를 돌려받지 않으며(숨김 행은 조회 정책에 걸림),
     SQL 실행 전(entry_source 칸 없음)이면 칸을 빼고 다시 보내지 않음 → 확인 없이 바로 공개되는 일이 없음
   · 실제 실행은 로컬 PostgreSQL 16에서 확인(anon 등록 → 숨김·공개 함수에 안 보임, is_hidden·reviewed_at 직접 지정 거부,
     RETURNING 거부, 'quick' 외 값 거부, 운영자가 풀면 공개 함수에 보임, 다시 실행해도 안전). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', '2026-11-quick-to-archive.sql'), 'utf8');
const CODE = SQL.replace(/--.*$/gm, '');

test('SQL: 추가만 함 (기존 행·칸·정책을 지우거나 바꾸지 않음), 다시 실행해도 안전', () => {
  assert.doesNotMatch(CODE, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|column|policy)\b|\bupdate\s+public\.|\balter policy\b/i);
  assert.match(CODE, /add column if not exists entry_source text/);
  assert.match(CODE, /add column if not exists reviewed_at timestamptz/);
  assert.match(CODE, /if not exists \(select 1 from pg_constraint where conname = 'shared_expressions_entry_source_chk'\)/);
  assert.match(CODE, /check \(entry_source is null or entry_source in \('quick'\)\)/);
  assert.match(CODE, /create or replace trigger shared_expressions_quick_hold/);
});

test('SQL: anon 은 entry_source 만 더 보낼 수 있고, quick 은 등록 때 항상 숨김', () => {
  assert.match(CODE, /grant insert \(entry_source\) on table public\.shared_expressions to anon, authenticated;/);
  assert.doesNotMatch(CODE, /grant[^;]*(is_hidden|reviewed_at)/i);                 // 숨김·확인 시각은 보낼 수 없음
  assert.doesNotMatch(CODE, /grant\s+(select|update|delete|all)\b/i);
  assert.match(CODE, /if new\.entry_source = 'quick' then\s+new\.is_hidden := true;/);
  assert.match(CODE, /before insert on public\.shared_expressions/);
  assert.match(CODE, /security definer\s+set search_path = ''/);
  assert.match(CODE, /revoke all on function public\.sm_quick_entry_hold\(\) from public, anon, authenticated;/);
  // 운영 안내: 확인 대기열·게시·게시하지 않기 쿼리가 주석으로 있음
  assert.match(SQL, /where entry_source = 'quick' and reviewed_at is null/);
  assert.match(SQL, /set is_hidden = false, reviewed_at = now\(\) where id = <id>/);
});

test('store: 보태기는 익명·소감만, 결과를 돌려받지 않고, SQL 실행 전이면 다시 보내지 않음', async () => {
  global.self = global.self || {};
  delete require.cache[require.resolve('../shared-store.js')];
  require('../shared-store.js');
  const Store = global.self.SharedStore;
  const sent = [];
  let replies = [];
  let selected = 0;
  global.db = {
    from: table => ({
      insert: rows => {
        sent.push({ table, rows });
        const p = Promise.resolve(replies.shift() || { error: null });
        p.select = () => { selected++; return p; };
        return p;
      }
    })
  };
  try {
    let r = await Store.insertQuickExpression({ eventKey: 'imjin', content: '  이름 하나에도 시선이 담겨 있다  ', lang: 'ko', nickname: '홍길동' });
    assert.ok(r.ok && r.pending);
    assert.equal(sent[0].table, 'shared_expressions');
    assert.deepEqual(sent[0].rows[0], {
      event_key: 'imjin', author_name: '익명', country_code: 'ko',
      content: '이름 하나에도 시선이 담겨 있다', reason: '', entry_source: 'quick'
    });
    assert.equal(selected, 0);                                             // 숨김 행이라 등록 결과(id)를 요청하지 않음

    await Store.insertQuickExpression({ eventKey: 'imjin', content: '가'.repeat(400) });
    assert.equal(sent[1].rows[0].content.length, 300);

    assert.equal((await Store.insertQuickExpression({ eventKey: 'imjin', content: '   ' })).ok, false);   // 빈 소감
    assert.equal((await Store.insertQuickExpression({ eventKey: 'Bad Key!', content: '가' })).ok, false); // 사건 이름 형식
    assert.equal(sent.length, 2);

    // SQL 실행 전: entry_source 칸이 없으면 칸을 빼고 다시 보내지 않음 (확인 없이 바로 공개되면 안 됨)
    replies = [{ error: { code: 'PGRST204', message: "Could not find the 'entry_source' column of 'shared_expressions' in the schema cache" } }];
    r = await Store.insertQuickExpression({ eventKey: 'imjin', content: '가' });
    assert.ok(r.unavailable);
    assert.equal(sent.length, 3);

    replies = [{ error: { code: 'P0001', message: 'sm_rate_limited' } }];
    r = await Store.insertQuickExpression({ eventKey: 'imjin', content: '가' });
    assert.ok(!r.ok && !r.unavailable && r.error);
  } finally {
    delete global.db;
  }
});
