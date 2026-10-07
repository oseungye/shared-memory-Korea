/* 세대(연령대)별 분석·탐구 진행 기준 테스트 — 실행: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');

const Gen = require('../generation-analysis.js');
const SM = require('../shared-memory-analyzer.js');
const eventsData = require('../events-data.js');

const imjin = eventsData.find(e => e.id === 'imjin');
const narratives = { korea: imjin.korea, japan: imjin.japan, china: imjin.china };

// shared-store.js의 mapRow는 브라우저 전역(self)에 붙으므로 Node에서 불러와 사용합니다.
global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;

const TEXTS = [
  '일본의 침략으로 시작된 동아시아 국제전쟁',
  '조선과 명나라가 함께 맞선 전쟁으로 큰 피해를 남겼다',
  '세 나라 모두 피해를 입은 국제전쟁이었다',
  '침략과 피해를 함께 기억하며 평화를 이야기해야 한다',
  '일본군의 침략과 조선 백성의 피해',
  '동아시아 삼국이 관여한 전쟁',
  '국가마다 다르게 부르는 전쟁이지만 피해의 사실은 같다'
];
const mk = (ages, prior) => ages.map((age, i) => ({
  id: i + 1, text: TEXTS[i % TEXTS.length] + (i >= TEXTS.length ? ` (${i})` : ''), user: 'u' + i,
  ageGroup: age, priorLearning: prior ? prior[i] : null
}));
const strip = a => JSON.parse(JSON.stringify(a));   // 함수(similarityOf) 제외하고 비교

test('기존 행(age_group·prior_learning 컬럼 없음)도 오류 없이 매핑된다', () => {
  const legacy = Store.mapRow({ id: 1, event_key: 'imjin', author_name: null, country_code: 'ko', content: '전쟁', reason: null, created_at: null });
  assert.equal(legacy.ageGroup, null);
  assert.equal(legacy.priorLearning, null);
  assert.equal(legacy.viewedCompare, null);
  assert.equal(legacy.completedFlow, null);
  assert.equal(legacy.user, '익명');

  const bad = Store.mapRow({ id: 2, content: 'x', age_group: '35', prior_learning: 'maybe', viewed_compare: 'yes' });
  assert.equal(bad.ageGroup, null);
  assert.equal(bad.priorLearning, null);
  assert.equal(bad.viewedCompare, null);

  const ok = Store.mapRow({ id: 3, content: 'x', age_group: '40s', prior_learning: 'yes', viewed_compare: true, completed_flow: false });
  assert.equal(ok.ageGroup, '40s');
  assert.equal(ok.priorLearning, 'yes');
  assert.equal(ok.viewedCompare, true);
  assert.equal(ok.completedFlow, false);
});

test('age_group이 없는 기존 데이터도 분석되고, 연령대 집계에서는 unknown으로 분류된다', () => {
  const items = mk([undefined, null, '', '20s', 'no_answer']);
  const counts = Gen.groupCounts(items);
  assert.equal(counts.unknown, 3);
  assert.equal(counts['20s'], 1);
  assert.equal(counts.no_answer, 1);
  const a = SM.analyzeExpressions(items, { narratives });
  assert.equal(a.total, 5);
  assert.equal(Gen.filterByAgeGroup(items, '20s').length, 1);
  assert.equal(Gen.filterByAgeGroup(items, '30s').length, 0);
});

test('연령대 필터는 해당 연령대만 남기고, 결과는 기존 분석 함수로 다시 계산된다', () => {
  const items = mk(['10s', '10s', '40s', '10s', '40s', '50s', '10s']);
  const teens = Gen.filterByAgeGroup(items, '10s');
  assert.deepEqual(teens.map(x => x.id), [1, 2, 4, 7]);
  assert.ok(teens.every(x => x.ageGroup === '10s'));
  const direct = SM.analyzeExpressions(teens, { narratives });
  const viaFilter = SM.analyzeExpressions(Gen.filterByAgeGroup(items, '10s'), { narratives });
  assert.deepEqual(strip(viaFilter), strip(direct));
  assert.equal(viaFilter.total, 4);
  // 알 수 없는 값은 어떤 연령대에도 속하지 않는다
  assert.equal(Gen.normalizeAgeGroup('70s'), null);
  assert.equal(Gen.normalizeAgeGroup('60plus'), '60plus');
});

test('전체(all) 필터 결과는 기존 analyzeExpressions 결과와 같다', () => {
  const items = mk(['10s', null, '40s', undefined, 'no_answer', '20s', '60plus']);
  assert.equal(Gen.filterByAgeGroup(items, 'all'), items);
  assert.equal(Gen.filterByAgeGroup(items, undefined), items);
  const before = SM.analyzeExpressions(items, { narratives });
  const after = SM.analyzeExpressions(Gen.filterByAgeGroup(items, 'all'), { narratives });
  assert.deepEqual(strip(after), strip(before));
  assert.deepEqual(Gen.filterByAgeGroup(null, 'all'), []);
});

test('prior_learning이 null이어도 처리된다', () => {
  assert.equal(Gen.normalizePriorLearning(null), null);
  assert.equal(Gen.normalizePriorLearning(undefined), null);
  assert.equal(Gen.normalizePriorLearning('nope'), null);
  assert.equal(Gen.normalizePriorLearning('unsure'), 'unsure');
  assert.equal(Gen.priorLabel(null), '');
  assert.equal(Gen.priorLabel('yes'), '있다');
  const items = mk(['30s', '30s', '30s'], [null, 'yes', undefined]);
  const a = SM.analyzeExpressions(items, { narratives });
  assert.equal(a.total, 3);
});

test('소수 표본 숨김 기준: MIN_GROUP_SIZE 미만인 연령대는 세부 분석이 없다', () => {
  assert.equal(Gen.MIN_GROUP_SIZE, 5);
  assert.equal(Gen.isSampleSufficient(4), false);
  assert.equal(Gen.isSampleSufficient(5), true);
  assert.equal(Gen.isSampleSufficient(2, 2), true);

  const items = mk(['20s', '20s', '20s', '20s', '20s', '50s', '50s']);
  const r = Gen.compareAgeGroups(items, { narratives });
  const twenties = r.groups.find(g => g.id === '20s');
  const fifties = r.groups.find(g => g.id === '50s');
  assert.equal(twenties.sufficient, true);
  assert.ok(twenties.analysis && twenties.analysis.total === 5);
  assert.equal(fifties.sufficient, false);
  assert.equal(fifties.analysis, undefined);
  assert.equal(fifties.topConcepts, undefined);
  assert.equal(r.comparable, false);
  assert.equal(r.verdict, 'insufficient');
});

test('서버 참여자 수가 제안 수보다 적으면 더 작은 값을 표본 크기로 쓴다', () => {
  const items = mk(['40s', '40s', '40s', '40s', '40s', '40s']);    // 제안 6건
  const counts = Gen.groupCounts(items);
  assert.equal(Gen.sampleSize('40s', counts, null), 6);
  assert.equal(Gen.sampleSize('40s', counts, { '40s': 3 }), 3);     // 한 사람이 여러 건 → 3명
  const r = Gen.compareAgeGroups(items, { narratives, participantCounts: { '40s': 3 } });
  assert.equal(r.groups.find(g => g.id === '40s').sufficient, false);
});

test('세대 비교: 같은 표현을 쓴 두 연령대는 "차이가 크지 않음"으로 표시된다', () => {
  const same = TEXTS.slice(0, 5);
  const items = same.map((t, i) => ({ id: 'a' + i, text: t, ageGroup: '10s' }))
    .concat(same.map((t, i) => ({ id: 'b' + i, text: t, ageGroup: '50s' })));
  const r = Gen.compareAgeGroups(items, { narratives });
  assert.equal(r.comparable, true);
  assert.deepEqual(r.eligible, ['10s', '50s']);
  assert.equal(r.verdict, 'small');
  assert.ok(r.differences.frameShare < 1e-9);
  assert.ok(r.differences.similarity < 1e-9);
  assert.equal(r.differences.sameTopConcept, true);
});

test('세대 비교: 표현이 크게 다르면 "일부 차이"로 표시되며 값은 0~1 범위다', () => {
  const conflict = ['일본의 침략과 강제 동원 책임', '침략 전쟁의 책임과 피해', '강제 동원 피해와 차별', '침략과 학살의 책임', '피해자에 대한 책임'];
  const coop = ['평화와 화해를 위한 대화', '공존과 협력의 미래', '서로 이해하는 평화', '함께 대화하는 공동의 기억', '화해와 협력'];
  const items = conflict.map((t, i) => ({ id: 'c' + i, text: t, ageGroup: '20s' }))
    .concat(coop.map((t, i) => ({ id: 'p' + i, text: t, ageGroup: '60plus' })));
  const r = Gen.compareAgeGroups(items, { narratives });
  assert.equal(r.comparable, true);
  assert.equal(r.verdict, 'some');
  assert.ok(r.differences.frameShare >= Gen.DIFF_THRESHOLDS.frameShare);
  r.groups.filter(g => g.sufficient).forEach(g => {
    Object.values(g.frameShare).forEach(v => assert.ok(v >= 0 && v <= 1));
    assert.ok(g.meanNarrativeSimilarity >= 0 && g.meanNarrativeSimilarity <= 1);
  });
});

test('completed_flow: 사건 선택 + 탐구 시작 + 서술 확인 + 제출을 모두 충족해야 true', () => {
  const full = { eventSelected: true, startedExploration: true, viewedCompare: true, submitted: true };
  assert.equal(Gen.computeCompletedFlow(full), true);
  assert.equal(Gen.computeCompletedFlow(Object.assign({}, full, { viewedCompare: false })), false);
  assert.equal(Gen.computeCompletedFlow(Object.assign({}, full, { submitted: false })), false);
  assert.equal(Gen.computeCompletedFlow(Object.assign({}, full, { eventSelected: false })), false);
  // 탐구 시작 기록이 없어도 탐구 전 문장을 썼다면 시작한 것으로 본다
  assert.equal(Gen.computeCompletedFlow(Object.assign({}, full, { startedExploration: false, beforeWritten: true })), true);
  assert.equal(Gen.computeCompletedFlow(Object.assign({}, full, { startedExploration: false })), false);
  // NLP·사료 열람은 완료 조건이 아니다
  assert.equal(Gen.computeCompletedFlow(Object.assign({}, full, { viewedNlp: false, viewedSources: false })), true);
  assert.equal(Gen.computeCompletedFlow(null), false);
  assert.equal(Gen.computeCompletedFlow(undefined), false);
});

test('insertExpression은 새 컬럼이 없는 DB에서 단계적으로 기존 컬럼만 저장한다', async () => {
  const calls = [];
  const fakeDb = {
    from(table) {
      return {
        insert(rows) {
          calls.push({ table, row: rows[0] });
          return {
            select() {
              const row = rows[0];
              if ('age_group' in row) return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'age_group' column" } });
              if ('expression_style' in row) return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'expression_style' column" } });
              return Promise.resolve({ data: [{ id: 9 }], error: null });
            }
          };
        }
      };
    }
  };
  global.db = fakeDb;
  try {
    const r = await Store.insertExpression({ eventKey: 'imjin', author: '', content: '문장', ageGroup: '30s', priorLearning: null, milestones: { viewedCompare: true } });
    assert.equal(r.ok, true);
    assert.equal(r.legacy, true);
    assert.equal(r.level, 2);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].row.age_group, '30s');
    assert.equal(calls[0].row.prior_learning, null);
    assert.equal(calls[0].row.author_name, '익명');            // 닉네임은 선택 항목
    assert.ok(!('age_group' in calls[2].row));
    assert.ok(calls.every(c => c.table === 'shared_expressions'));   // 기존 DB에서는 참여자 연결을 시도하지 않음
  } finally {
    delete global.db;
  }
});

test('insertExpression: 새 컬럼이 있으면 한 번에 저장하고 비공개 참여자 테이블에 연결한다', async () => {
  const calls = [];
  global.db = {
    from(table) {
      return {
        insert(rows) {
          calls.push({ table, row: rows[0] });
          const p = Promise.resolve({ data: null, error: null });
          p.select = () => Promise.resolve({ data: [{ id: 42 }], error: null });
          return p;
        }
      };
    }
  };
  try {
    const r = await Store.insertExpression({ eventKey: 'imjin', author: '김', content: '문장', ageGroup: 'bogus', priorLearning: 'no', milestones: { viewedCompare: true, completedFlow: true } });
    assert.equal(r.ok, true);
    assert.equal(r.legacy, false);
    assert.equal(calls[0].row.age_group, null);                // 허용되지 않은 값은 저장하지 않음
    assert.equal(calls[0].row.prior_learning, 'no');
    assert.equal(calls[0].row.completed_flow, true);
    assert.equal(calls[0].row.viewed_nlp, false);
    assert.equal(calls[1].table, 'expression_participants');
    assert.equal(calls[1].row.expression_id, 42);
    assert.ok(calls[1].row.participant_key.length >= 8);
  } finally {
    delete global.db;
  }
});
