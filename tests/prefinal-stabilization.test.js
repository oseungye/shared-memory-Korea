/* 본선 배포 전 안정화 테스트 (사건 순서 · 빈칸 검사 · 출처 체계 · DB 제약/RPC 형식 · 소표본 보호) — 실행: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const eventsData = require('../events-data.js');
const sourcesData = require('../sources-data.js');
const Guide = require('../contribution-guide.js');
const Gen = require('../generation-analysis.js');

global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', '2026-10-prefinal-hardening.sql'), 'utf8');
const SQL_AFTER = fs.readFileSync(path.join(__dirname, '..', 'supabase', '2026-10-after-deploy-hide-age-column.sql'), 'utf8');

/* ---------- 1. 사건 카드 우선순위 ---------- */

test('사건 카드 순서: 임진왜란 → 재일조선인이 먼저, 나머지 사건과 id는 그대로', () => {
  const ids = eventsData.map(e => e.id);
  assert.deepEqual(ids.slice(0, 2), ['imjin', 'zainichi']);
  assert.deepEqual(ids.slice().sort(), ['culture', 'hiroshima', 'imjin', 'modern', 'tribute', 'zainichi']);
  assert.deepEqual(eventsData.filter(e => e.featured).map(e => e.id), ['imjin', 'zainichi']);
});

/* ---------- 2. 문장 틀 빈칸 검사 ---------- */

test('빈칸 검사: 문장 틀을 그대로 두거나 밑줄 일부만 지운 경우를 막는다', () => {
  const t = Guide.TEMPLATES[0].text;
  assert.equal(Guide.findPlaceholderIssues(t, { templateUsed: true }).blocked, true);
  // 6개 중 일부만 지워 3개가 남은 경우 (예전 검사 '______' 는 통과했던 경우)
  const partial = '이 사건은 일본의 침략으로 시작되어, 조선·명·일본이 참여한 ___이었다.';
  assert.equal(partial.indexOf('______'), -1);
  assert.equal(Guide.findPlaceholderIssues(partial, {}).blocked, true);
  // 문장 틀을 쓴 경우에는 2개 연속도 빈칸으로 본다
  assert.equal(Guide.findPlaceholderIssues('조선·명·__가 참여한 전쟁이었다.', { templateUsed: true }).blocked, true);
  // 전각 밑줄
  assert.equal(Guide.findPlaceholderIssues('이 사건은 ＿＿＿로 시작되었다', {}).blocked, true);
});

test('빈칸 검사: 빈칸을 지우기만 하고 채우지 않은 경우도 찾는다', () => {
  const r = Guide.findPlaceholderIssues('이 사건은 로 시작되어, 조선이 참여한 전쟁이었다.', {});
  assert.equal(r.blocked, true);
  assert.equal(r.issues[0].kind, 'emptied');
  assert.match(Guide.placeholderMessage(r), /사건은 로 시작되어/);
});

test('빈칸 검사: 정상 문장과 일반적인 밑줄 1개는 막지 않는다', () => {
  assert.equal(Guide.findPlaceholderIssues('이 사건은 일본의 침략으로 시작되어, 조선과 명이 참여한 국제전쟁이었다.', { templateUsed: true }).blocked, false);
  assert.equal(Guide.findPlaceholderIssues('snake_case 와 a_b 같은 표기는 괜찮다', {}).blocked, false);
  assert.equal(Guide.findPlaceholderIssues('강조를 위한 __두 개__', {}).blocked, false);   // 문장 틀을 쓰지 않았으면 2개는 허용
  assert.equal(Guide.findPlaceholderIssues('', {}).blocked, false);
  assert.equal(Guide.findPlaceholderIssues(null).blocked, false);
});

test('빈칸 검사 메시지는 고칠 위치(주변 문장)를 알려준다', () => {
  const r = Guide.findPlaceholderIssues('조선과 명이 함께 맞선 ____ 전쟁이었다.', {});
  const msg = Guide.placeholderMessage(r);
  assert.match(msg, /함께 맞선 ____ 전쟁/);
  assert.equal(Guide.placeholderMessage({ blocked: false, issues: [] }), '');
});

/* ---------- 3. 역사 용어 확인 · 닉네임 ---------- */

test('역사 용어 확인: 임진왜란 + 대한민국은 안내, 현재 시점 문장·다른 사건은 안내하지 않음', () => {
  assert.equal(Guide.checkHistoricalTerms('1592년 일본이 대한민국을 침략한 전쟁이다.', 'imjin').length, 1);
  assert.equal(Guide.checkHistoricalTerms('Japan invaded South Korea in 1592.', 'imjin').length, 1);
  assert.equal(Guide.checkHistoricalTerms('오늘날 대한민국에서는 이 전쟁을 임진왜란이라 부른다.', 'imjin').length, 0);
  assert.equal(Guide.checkHistoricalTerms('일본이 조선을 침략한 전쟁이다.', 'imjin').length, 0);
  assert.equal(Guide.checkHistoricalTerms('대한민국 국적을 가진 재일 한국인', 'zainichi').length, 0);
  // 공동 기억형 문장 틀 안에서도 안내된다 ("기억"은 면제어가 아님)
  assert.equal(Guide.checkHistoricalTerms('일본의 책임과 대한민국의 피해를 함께 기억하며', 'imjin').length, 1);
});

test('닉네임 확인: 연락처·학교명·학년/반은 막고 일반 별명은 허용', () => {
  ['민지', '익명의 고양이', 'Hana', 'student_01'].forEach(n => assert.equal(Guide.checkNickname(n).ok, true, n));
  ['a@b.com', '010-1234-5678', '서울고등학교 민지', '2학년 3반 15번', '01012345678'].forEach(n => assert.equal(Guide.checkNickname(n).ok, false, n));
  assert.equal(Guide.checkNickname('').ok, true);
});

/* ---------- 4. 출처 체계 ---------- */

const VERIFICATION = ['verified', 'partial', 'unverified'];
const sourceById = id => sourcesData.find(s => s.id === id);

test('사료 검증 단계: 모든 자료에 verification이 있고 reviewed와 일치한다', () => {
  sourcesData.forEach(s => {
    assert.ok(VERIFICATION.includes(s.verification), s.id);
    assert.equal(s.reviewed, s.verification === 'verified', s.id);
    assert.ok(typeof s.whyRead === 'string' && s.whyRead.length > 0, `${s.id}.whyRead`);
    assert.ok(typeof s.verificationNote === 'string' && s.verificationNote.length > 0, `${s.id}.verificationNote`);
  });
});

test('reviewed=true(출처 확인) 자료는 필요한 메타데이터와 해당 자료의 https URL을 갖는다', () => {
  const verified = sourcesData.filter(s => s.reviewed === true);
  assert.ok(verified.length > 0);
  verified.forEach(s => {
    ['title', 'creator', 'year', 'institution', 'url', 'urlNote', 'checkedAt'].forEach(f => assert.ok(s[f], `${s.id}.${f}`));
    assert.match(s.url, /^https:\/\/[^/]+\/.+/, `${s.id}: 기관 대표 페이지(경로 없음)가 아니라 자료 페이지여야 함`);
  });
});

test('서술의 sourceRefs는 존재하는 같은 사건의 자료이며, 확인된(verified/partial) 자료만 가리킨다', () => {
  eventsData.forEach(e => ['korea', 'japan', 'china'].forEach(k => {
    const refs = e[k].sourceRefs;
    assert.ok(Array.isArray(refs), `${e.id}.${k}.sourceRefs`);
    refs.forEach(id => {
      const s = sourceById(id);
      assert.ok(s, `${e.id}.${k}: 없는 자료 ${id}`);
      assert.equal(s.eventId, e.id, `${id}는 다른 사건의 자료`);
      assert.ok(s.verification === 'verified' || s.verification === 'partial', `${id}는 검토 전 자료`);
    });
  }));
});

test('대표 사건(임진왜란·재일조선인)은 출처를 확인한 자료를 갖는다', () => {
  ['imjin', 'zainichi'].forEach(id => {
    const list = sourcesData.filter(s => s.eventId === id && s.verification === 'verified');
    assert.ok(list.length >= 2, id);
  });
});

test('편집자 해설(feature)은 국가 전체를 일반화하지 않고 "이 서술"을 주어로 쓴다', () => {
  eventsData.forEach(e => ['korea', 'japan', 'china'].forEach(k => {
    const f = e[k].feature;
    assert.match(f, /^이 서술/, `${e.id}.${k}`);
    assert.doesNotMatch(f, /경향이 (있다|강하다)/, `${e.id}.${k}`);
  }));
});

/* ---------- 5. DB 제약 · 권한 (SQL 파일과 코드가 어긋나지 않는지) ---------- */

function sqlList(re) {
  const m = SQL.match(re);
  assert.ok(m, String(re));
  return m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('허용 event_key 제약은 사이트의 사건 id와 정확히 같다 (허용되지 않은 event_key는 DB가 거부)', () => {
  const allowed = sqlList(/check \(event_key in \(([^)]+)\)\)/);
  assert.deepEqual(allowed.slice().sort(), eventsData.map(e => e.id).sort());
  assert.ok(!allowed.includes('fake_event'));
});

test('작성 언어·연령대·학습 경험·표현 방식·이유 제약이 사이트 코드값을 모두 허용한다', () => {
  const langs = sqlList(/country_code in \(([^)]+)\)/);
  Store.LANG_CODES.concat(['unknown']).forEach(l => assert.ok(langs.includes(l), l));
  assert.ok(langs.includes('ETC'));      // 기존 기본값 호환
  const tags = sqlList(/reason_tags <@ array\[([^\]]+)\]/);
  assert.deepEqual(tags.slice().sort(), Guide.REASONS.map(r => r.id).sort());
});

test('기존 정상 insert 회귀: 사이트가 보내는 모든 컬럼이 anon INSERT 허용 컬럼 안에 있다', async () => {
  const granted = sqlList(/grant insert \(([^)]+)\)\s+on table public\.shared_expressions/).map(c => c.replace(/\s+/g, ''));
  assert.ok(!granted.includes('id') && !granted.includes('created_at'));   // id·작성 시각은 지정 불가
  const calls = [];
  global.db = {
    from(table) {
      return {
        insert(rows) {
          calls.push({ table, row: rows[0] });
          const p = Promise.resolve({ data: null, error: null });
          p.select = () => Promise.resolve({ data: [{ id: 7 }], error: null });
          return p;
        }
      };
    }
  };
  try {
    const r = await Store.insertExpression({
      eventKey: 'zainichi', author: '별명', lang: 'ko', content: '문장', reason: '이유', style: 'fact',
      selectedConcepts: ['차별'], reasonTags: ['damage'], before: '전', ageGroup: '10s', priorLearning: 'yes',
      milestones: { viewedCompare: true, viewedNlp: true, viewedSources: false, completedFlow: true }
    });
    assert.equal(r.ok, true);
    Object.keys(calls[0].row).forEach(col => assert.ok(granted.includes(col), `허용되지 않은 컬럼: ${col}`));
    const empathyCols = sqlList(/grant insert \(([^)]+)\)\s+on table public\.expression_empathy/);
    assert.deepEqual(empathyCols, ['expression_id', 'voter_key']);
    const partCols = sqlList(/grant insert \(([^)]+)\)\s+on table public\.expression_participants/);
    Object.keys(calls[1].row).forEach(col => assert.ok(partCols.includes(col), col));
  } finally {
    delete global.db;
  }
});

test('SECURITY DEFINER 함수는 search_path 고정 + PUBLIC 회수 후 anon에만 EXECUTE', () => {
  ['participation_summary()', 'empathy_counts(text)', 'age_group_participants(text)', 'public_expressions(text, integer)'].forEach(fn => {
    const esc = fn.replace(/[()]/g, '\\$&');
    assert.match(SQL, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated;`), fn);
    assert.match(SQL, new RegExp(`grant execute on function public\\.${esc} to anon;`), fn);
  });
  const definers = SQL.split('security definer').length - 1;
  const fixedPath = (SQL.match(/security definer\s+set search_path = ''/g) || []).length;
  assert.equal(fixedPath, definers);
  assert.doesNotMatch(SQL, /execute format\([^)]*p_event_key/);       // 동적 SQL에 입력값을 넣지 않음
});

test('소표본 보호 기준은 서버(SQL)와 화면(generation-analysis.js)이 같다 — 5명', () => {
  const m = SQL.match(/sm_min_group_size\(\)[\s\S]*?as \$\$ select (\d+) \$\$/);
  assert.ok(m);
  assert.equal(Number(m[1]), Gen.MIN_GROUP_SIZE);
  assert.equal(Gen.MIN_GROUP_SIZE, 5);
});

test('2단계 SQL은 age_group만 공개 조회에서 빼고, 사이트가 쓰는 공개 컬럼은 모두 남긴다', () => {
  const m = SQL_AFTER.match(/grant select \(([^)]+)\)/);
  const cols = m[1].split(',').map(c => c.trim());
  assert.ok(!cols.includes('age_group'));
  Store.PUBLIC_COLUMNS.split(',').forEach(c => assert.ok(cols.includes(c), c));
});

/* ---------- 6. 집계 RPC 결과 형식 · 하위 호환 ---------- */

function fakeClient(handlers) {
  const calls = [];
  const client = {
    calls,
    rpc(name, args) {
      calls.push({ rpc: name, args });
      return Promise.resolve(handlers.rpc ? handlers.rpc(name, args) : { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    },
    from(table) {
      const q = { table, cols: null };
      const chain = {
        select(cols) { q.cols = cols; calls.push({ select: cols }); return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return Promise.resolve(handlers.select(q.cols)); }
      };
      return chain;
    }
  };
  return client;
}

test('참여 집계 RPC: 합계 형식을 숫자로 읽는다', async () => {
  global.db = fakeClient({ rpc: () => ({ data: [{ participants: '10', completed_participants: 6, expressions: 10 }], error: null }) });
  try {
    const r = await Store.fetchParticipationSummary();
    assert.deepEqual(r, { available: true, participants: 10, completedParticipants: 6, expressions: 10 });
  } finally { delete global.db; }
});

test('소표본 보호: 서버가 null로 가린 연령대는 0명 + suppressed로 처리되어 세부 분석이 숨겨진다', async () => {
  global.db = fakeClient({ rpc: () => ({ data: [{ age_group: '10s', participants: 12 }, { age_group: '30s', participants: null }, { age_group: 'unknown', participants: 4 }], error: null }) });
  try {
    const r = await Store.fetchAgeGroupParticipants('imjin');
    assert.equal(r.available, true);
    assert.equal(r.counts['10s'], 12);
    assert.equal(r.counts['30s'], 0);
    assert.deepEqual(r.suppressed, ['30s']);
    assert.equal(Gen.isSampleSufficient(Gen.sampleSize('30s', { '30s': 2 }, r.counts)), false);
  } finally { delete global.db; }
});

test('공동 표현 불러오기: public_expressions RPC를 먼저 쓰고, 가려진 연령대는 null로 매핑된다', async () => {
  global.db = fakeClient({
    rpc: () => ({ data: [
      { id: 2, event_key: 'imjin', content: '전쟁', country_code: 'ko', age_group: null, age_group_suppressed: true },
      { id: 1, event_key: 'imjin', content: '침략', country_code: 'ETC', age_group: '10s', age_group_suppressed: false }
    ], error: null }),
    select: () => { throw new Error('테이블을 직접 읽으면 안 됨'); }
  });
  try {
    const r = await Store.loadExpressions('imjin');
    assert.equal(r.source, 'rpc');
    assert.equal(global.db.calls[0].rpc, 'public_expressions');
    assert.deepEqual(global.db.calls[0].args, { p_event_key: 'imjin', p_limit: Store.LOAD_LIMIT });
    assert.equal(r.data[0].ageGroup, null);
    assert.equal(r.data[0].ageSuppressed, true);
    assert.equal(r.data[1].ageGroup, '10s');
    assert.equal(r.data[1].lang, 'unknown');           // 기존 기본값 ETC 호환
    assert.equal(Gen.groupCounts(r.data).unknown, 1);  // 가려진 행은 '전체'에만 포함
  } finally { delete global.db; }
});

test('공동 표현 불러오기 하위 호환: RPC가 없으면 공개 컬럼 → 예전 DB면 select("*")', async () => {
  global.db = fakeClient({
    select: cols => cols === '*'
      ? { data: [{ id: 1, event_key: 'imjin', content: '전쟁', country_code: 'ko' }], error: null }
      : { data: null, error: { code: '42703', message: 'column shared_expressions.expression_style does not exist' } }
  });
  try {
    const r = await Store.loadExpressions('imjin');
    assert.equal(r.error, null);
    assert.equal(r.source, 'table');
    assert.deepEqual(global.db.calls.filter(c => c.select).map(c => c.select), [Store.PUBLIC_COLUMNS, '*']);
    assert.equal(r.data[0].text, '전쟁');
  } finally { delete global.db; }
});

test('공개 컬럼 조회 목록에는 age_group이 없다', () => {
  assert.ok(!Store.PUBLIC_COLUMNS.split(',').includes('age_group'));
});
