/* 서버 단 숨김 · 등록 빈도 제한 SQL 검사 — 실행: npm test
   · supabase/2026-10-server-moderation.sql 이 숨긴 행을 모든 공개 경로에서 빼고, 기존 보안 구성을 유지하는지 확인합니다.
   · 실제 DB 동작(RLS·트리거)은 운영 반영 때 확인합니다 (README 9장). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', '2026-10-server-moderation.sql'), 'utf8');
const HARDENING = fs.readFileSync(path.join(__dirname, '..', 'supabase', '2026-10-prefinal-hardening.sql'), 'utf8');
const CODE = SQL.replace(/--.*$/gm, '');   // 주석 제외

/** create or replace function public.<name> … $$ … $$; 본문 */
function functionBody(name) {
  const m = CODE.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  assert.ok(m, name);
  return m[1];
}

test('숨김 컬럼: 기본 false, 행을 지우거나 기존 값을 바꾸지 않는다', () => {
  assert.match(CODE, /add column if not exists is_hidden boolean not null default false/);
  assert.doesNotMatch(CODE, /\bdelete\s+from\b|\btruncate\b|\bdrop table\b/i);
  assert.doesNotMatch(CODE, /\bupdate\s+public\./i);            // 숨김 처리는 운영자가 직접 (주석의 안내만)
});

test('숨김 컬럼은 공개 등록으로 지정할 수 없다 (INSERT·UPDATE 권한 없음)', () => {
  assert.doesNotMatch(CODE, /grant\s+(insert|update)[^;]*is_hidden/i);
  assert.doesNotMatch(CODE, /grant\s+(insert|update|all)\s+on\s+table\s+public\.shared_expressions/i);
  assert.match(CODE, /grant select \(is_hidden\) on table public\.shared_expressions to anon, authenticated;/);
  // 사이트가 보내는 등록 컬럼에도 없음
  assert.doesNotMatch(Store.PUBLIC_COLUMNS, /is_hidden/);
});

test('숨긴 행은 테이블 직접 조회·목록·공감·참여자 수·연령대 집계 어디에도 포함되지 않는다', () => {
  assert.match(CODE, /alter policy "공동 표현 조회 허용" on public\.shared_expressions\s+to anon, authenticated\s+using \(not is_hidden\);/);
  assert.doesNotMatch(CODE, /\bdrop\s+(policy|trigger|function|table|column)\b/i);   // 지우고 다시 만들지 않음
  const list = functionBody('public_expressions');
  assert.equal((list.match(/not s\.is_hidden/g) || []).length, 2, '목록과 소표본 크기 계산 모두');
  assert.match(functionBody('empathy_counts'), /not s\.is_hidden/);
  assert.match(functionBody('age_group_participants'), /not s\.is_hidden/);
  const summary = functionBody('participation_summary');
  assert.equal((summary.match(/not s\.is_hidden/g) || []).length, 4, '참여자·키 없는 제안·완료 참여자·제안 수');
});

test('공개 함수의 반환 형식은 하드닝 SQL과 같다 (사이트 호환)', () => {
  const sig = (sql, name) => {
    const m = sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)\\s*returns table\\s*\\(([\\s\\S]*?)\\)\\s*language`, 'i'));
    assert.ok(m, name);
    return m.slice(1).map(x => x.replace(/\s+/g, ' ').trim());
  };
  ['public_expressions', 'empathy_counts', 'age_group_participants', 'participation_summary'].forEach(fn => {
    assert.deepEqual(sig(CODE, fn), sig(HARDENING, fn), fn);
  });
});

test('SECURITY DEFINER 함수는 search_path 고정 + PUBLIC 회수, 공개 함수만 anon EXECUTE', () => {
  const definers = CODE.split('security definer').length - 1;
  const fixed = (CODE.match(/security definer\s+set search_path = ''/g) || []).length;
  assert.equal(definers, 5);
  assert.equal(fixed, definers);
  ['public_expressions\\(text, integer\\)', 'empathy_counts\\(text\\)', 'age_group_participants\\(text\\)', 'participation_summary\\(\\)'].forEach(fn => {
    assert.match(CODE, new RegExp(`revoke all on function public\\.${fn}\\s+from public, anon, authenticated;`), fn);
    assert.match(CODE, new RegExp(`grant execute on function public\\.${fn}\\s+to anon;`), fn);
  });
  assert.match(CODE, /revoke all on function public\.sm_insert_guard\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(CODE, /grant execute on function public\.sm_insert_guard/);
  assert.doesNotMatch(CODE, /execute format|execute '/i);      // 동적 SQL 없음
});

test('등록 빈도 제한 트리거: 같은 제안 5분 내 재등록·1분 120건 이상을 막는다', () => {
  assert.match(CODE, /create or replace trigger shared_expressions_insert_guard\s+before insert on public\.shared_expressions\s+for each row execute function public\.sm_insert_guard\(\);/);
  const guard = functionBody('sm_insert_guard');
  assert.match(guard, /interval '5 minutes'/);
  assert.match(guard, /raise exception 'sm_duplicate'/);
  assert.match(guard, /interval '1 minute'\) >= 120/);
  assert.match(guard, /raise exception 'sm_rate_limited'/);
  // 같은 문장 틀을 쓴 다른 학생은 막지 않도록 내용 외 여러 항목이 모두 같을 때만 중복
  ['author_name', 'reason', 'before_content', 'selected_concepts', 'reason_tags', 'age_group'].forEach(col => {
    assert.match(guard, new RegExp(`s\\.${col} is not distinct from new\\.${col}`), col);
  });
});

test('사이트는 서버 빈도 제한 오류를 안내 문구로 보여 주고 문장을 다시 보내지 않는다', async () => {
  const cases = [
    ['sm_duplicate', /같은 제안이 방금 등록/],
    ['sm_rate_limited', /등록이 몰려/]
  ];
  for (const [message, expected] of cases) {
    let inserts = 0;
    global.db = {
      from() {
        return {
          insert() {
            inserts++;
            return { select: () => Promise.resolve({ data: null, error: { code: 'P0001', message, hint: '' } }) };
          }
        };
      }
    };
    try {
      const r = await Store.insertExpression({ eventKey: 'imjin', content: '문장', lang: 'ko' });
      assert.equal(r.ok, false);
      assert.match(r.error, expected);
      assert.equal(inserts, 1, '컬럼 없음으로 오인해 줄인 컬럼으로 다시 보내지 않음');
    } finally {
      delete global.db;
    }
  }
});
