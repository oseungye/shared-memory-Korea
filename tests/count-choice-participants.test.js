/* 참여자 수에 객관식 참여 포함 SQL 검사 — 실행: npm test
   · supabase/2026-10-count-choice-participants.sql 이 participation_summary() 만 바꾸고,
     기존 공동 표현 집계·숨김 처리·권한·반환 형식을 그대로 두는지 확인합니다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8').replace(/--.*$/gm, '');
const CODE = read('2026-10-count-choice-participants.sql');
const PREV = read('2026-10-server-moderation.sql');

const body = sql => sql.match(/create or replace function public\.participation_summary\(\)[\s\S]*?\$\$([\s\S]*?)\$\$;/)[1];
const sig = sql => sql.match(/create or replace function public\.participation_summary\(\)\s*returns table\s*\(([\s\S]*?)\)\s*language/i)[1].replace(/\s+/g, ' ').trim();
const norm = s => s.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();

test('participation_summary 하나만 바꾸고 테이블·행·정책은 건드리지 않는다', () => {
  assert.equal((CODE.match(/create or replace function/g) || []).length, 1);
  assert.doesNotMatch(CODE, /\b(alter|drop|delete|truncate|update|insert)\b|create\s+(table|policy|trigger|index)/i);
});

test('반환 형식·보안 설정·권한은 이전과 같다 (사이트 코드 변경 없음)', () => {
  assert.equal(sig(CODE), sig(PREV));
  assert.match(CODE, /stable security definer\s+set search_path = ''/);
  assert.match(CODE, /revoke all on function public\.participation_summary\(\) from public, anon, authenticated;/);
  assert.match(CODE, /grant execute on function public\.participation_summary\(\) to anon;/);
  assert.doesNotMatch(CODE, /grant execute[^;]*authenticated/);
});

test('participants 에 객관식 응답 묶음 수(event_key, created_at)를 더하고, 나머지 두 값은 그대로', () => {
  const now = body(CODE);
  const before = body(PREV);
  assert.match(now, /\+ \(select count\(\*\) from \(select distinct c\.event_key, c\.created_at\s+from public\.exploration_choices c\) as choice_submissions\)/);
  // 공동 표현 기준 세 식(숨김 제외 포함)은 이전과 글자 그대로 같다
  const strip = s => norm(s.replace(/\+ \(select count\(\*\) from \(select distinct c\.event_key[\s\S]*?as choice_submissions\)/, ''));
  assert.equal(strip(now), norm(before));
  assert.equal((now.match(/not s\.is_hidden/g) || []).length, 4);
});
