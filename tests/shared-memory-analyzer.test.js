/* 참여자 공동 표현 분석 모듈 테스트 — 실행: npm test  (또는 node --test tests/*.test.js) */
const test = require('node:test');
const assert = require('node:assert/strict');

const SM = require('../shared-memory-analyzer.js');
const eventsData = require('../events-data.js');
const sourcesData = require('../sources-data.js');
const Guide = require('../contribution-guide.js');
const MemoryMap = require('../memory-map.js');

const imjin = eventsData.find(e => e.id === 'imjin');
const narratives = { korea: imjin.korea, japan: imjin.japan, china: imjin.china };
const items = texts => texts.map((text, i) => ({ id: i + 1, text, user: 'u' + i }));
const inRange = v => Number.isFinite(v) && v >= -1e-9 && v <= 1 + 1e-9;

test('빈 배열·잘못된 입력은 오류 없이 빈 결과를 돌려준다', () => {
  [[], null, undefined, 'text', 42, [null, 3, {}, { text: '   ' }, { text: null }]].forEach(input => {
    const r = SM.analyzeExpressions(input, { narratives });
    assert.equal(r.total, 0);
    assert.deepEqual(r.clusters, []);
    assert.deepEqual(r.topTerms, []);
    assert.equal(r.similarity.mean, 0);
  });
  assert.equal(SM.detectLanguage(''), 'unknown');
  assert.equal(SM.detectLanguage(null), 'unknown');
  assert.deepEqual(SM.tokenizeExpression(undefined), []);
  assert.deepEqual(SM.findConcepts(''), []);
  assert.equal(SM.compareBeforeAfter('', '문장'), null);
  assert.equal(SM.compareEmpathy(null, {}), null);
});

test('한 개의 표현: 표현군 없이 개별 제안으로 남는다', () => {
  const r = SM.analyzeExpressions(items(['동아시아 여러 국가가 참여한 국제전쟁']), { narratives });
  assert.equal(r.total, 1);
  assert.equal(r.clusters.length, 0);
  assert.deepEqual(r.unclustered, [0]);
  assert.equal(r.byLanguage.ko, 1);
  assert.ok(r.topTerms.some(t => t.term === '국제전쟁'));
  assert.ok(r.topConcepts.some(c => c.id === 'international'));
});

test('거의 같은 표현 여러 개는 하나의 표현군으로 묶인다', () => {
  const r = SM.analyzeExpressions(items([
    '일본의 침략으로 시작된 동아시아 국제전쟁',
    '일본의 침략으로 시작된 동아시아의 국제전쟁이다',
    '일본 침략으로 시작된 동아시아 국제 전쟁',
    '일본의 침략으로 시작된 동아시아 국제전쟁이었다'
  ]), { narratives });
  assert.equal(r.clusters.length, 1);
  assert.equal(r.clusters[0].size, 4);
  assert.equal(r.clusters[0].share, 1);
  assert.ok(r.clusters[0].cohesion > 0.5);
  assert.ok(r.similarity.mean > 0.5);
});

test('완전히 다른 표현들은 서로 묶이지 않는다', () => {
  const r = SM.analyzeExpressions(items([
    '도자기와 인쇄술이 전해진 문화 교류',
    '이순신 장군의 해전 승리',
    'Hiroshima nuclear weapons and peace',
    '조공 책봉 외교 질서'
  ]), { narratives });
  assert.equal(r.clusters.length, 0);
  assert.equal(r.unclustered.length, 4);
});

test('표현이 달라도 뜻이 가까운 문장은 문자 n-gram과 개념 사전으로 가깝게 계산된다', () => {
  const a = '동아시아 여러 국가가 참여한 국제전쟁';
  const b = '조선·명·일본이 얽힌 국제적인 전쟁';
  const c = '도자기와 인쇄술이 전해진 문화 교류';
  assert.ok(SM.textSimilarity(a, b) > SM.textSimilarity(a, c));
  assert.ok(SM.textSimilarity(a, b) >= SM.DEFAULTS.clusterThreshold);
});

test('한국어·일본어·영어가 섞여도 언어를 구분하고, 같은 개념이면 함께 묶일 수 있다', () => {
  const r = SM.analyzeExpressions(items([
    '일본의 조선 침략으로 시작된 동아시아 국제전쟁',
    '日本による朝鮮侵略で始まった東アジアの国際戦争',
    'An international war in East Asia that began with the Japanese invasion of Joseon',
    '도자기와 인쇄술이 전해진 문화 교류'
  ]), { narratives });
  assert.deepEqual(r.byLanguage, { ko: 2, ja: 1, en: 1, unknown: 0 });
  const big = r.clusters[0];
  assert.ok(big, '표현군이 있어야 함');
  assert.deepEqual(big.members, [0, 1, 2]);
  assert.deepEqual(Object.keys(big.languages).sort(), ['en', 'ja', 'ko']);
  assert.ok(big.concepts.some(c => c.id === 'invasion' && c.count === 3));
  const invasion = r.topConcepts.find(c => c.id === 'invasion');
  assert.equal(invasion.count, 3);
  assert.deepEqual(invasion.langs.sort(), ['en', 'ja', 'ko']);
});

test('언어 판별과 언어별 토큰화', () => {
  assert.equal(SM.detectLanguage('일본의 침략'), 'ko');
  assert.equal(SM.detectLanguage('日本の侵略'), 'ja');
  assert.equal(SM.detectLanguage('Japanese invasion'), 'en');
  assert.equal(SM.detectLanguage('朝鮮侵略'), 'unknown');     // 가나 없는 한자만: 중국어와 구분 불가
  assert.equal(SM.detectLanguage('임진왜란 is a war'), 'ko');
  assert.deepEqual(SM.tokenizeExpression('The wars of the invaders', 'en'), ['war', 'invader']);
  assert.deepEqual(SM.tokenizeExpression('東アジアの国際的な戦争', 'ja'), ['アジア', '国際', '戦争']);
});

test('개념 사전: 짧은 영어 표현은 온전한 단어만, 한국어는 활용형까지 찾는다', () => {
  const ids = t => SM.findConcepts(t).map(c => c.id);
  assert.ok(ids('a war of aggression').includes('war'));
  assert.ok(!ids('a warm welcome').includes('war'));
  assert.ok(ids('침략적인 전쟁').includes('invasion'));
  const m = SM.matchForms('침략과 침공, 그리고 침략', ['침략', '침공']);
  assert.equal(m.count, 3);
  m.spans.forEach(([s, e]) => assert.ok(e > s));
});

test('유사도 값은 모두 0~1 범위이다', () => {
  const texts = [
    '일본의 침략으로 시작된 동아시아 국제전쟁', '日本の侵略', 'peace and dialogue', '문화 교류',
    '침략의 책임과 백성의 희생', '', '!!!', '1592'
  ];
  const r = SM.analyzeExpressions(items(texts), { narratives });
  for (let i = 0; i < r.total; i++) {
    for (let j = 0; j < r.total; j++) assert.ok(inRange(r.similarityOf(i, j)), `${i},${j}`);
  }
  r.clusters.forEach(c => assert.ok(inRange(c.cohesion)));
  r.links.forEach(l => assert.ok(inRange(l.score)));
  Object.values(r.narrativeLink.averageSimilarity).forEach(v => assert.ok(inRange(v)));
  assert.ok(inRange(r.similarity.mean));
});

test('군집 결과: 크기순 정렬, 비율 합, 대표 제안과 키워드가 실제 데이터에서 나온다', () => {
  const texts = [
    '동아시아 여러 국가가 참여한 국제전쟁',
    '조선·명·일본이 얽힌 국제적인 전쟁',
    '임진왜란은 일본의 조선 침략으로 시작되어 조선·명·일본이 참여한 16세기 동아시아 국제전쟁이었다.',
    '일본의 침략과 조선 민중의 피해를 함께 기억해야 한다',
    '침략의 책임과 백성의 희생을 잊지 않는 전쟁',
    '도자기와 인쇄술이 전해진 문화 교류의 계기',
    '전쟁 속에서도 문화와 기술이 오간 교류'
  ];
  const r = SM.analyzeExpressions(items(texts), { narratives });
  assert.ok(r.clusters.length >= 2);
  for (let i = 1; i < r.clusters.length; i++) assert.ok(r.clusters[i - 1].size >= r.clusters[i].size);

  const clustered = r.clusters.reduce((s, c) => s + c.size, 0);
  assert.equal(clustered + r.unclustered.length, r.total);
  assert.equal(r.meta.clustered, clustered);

  const seen = new Set();
  r.clusters.forEach(c => {
    assert.ok(c.size >= 2);
    assert.ok(Math.abs(c.share - c.size / r.total) < 1e-9);
    assert.ok(c.members.includes(c.representative));
    c.members.forEach(m => { assert.ok(!seen.has(m)); seen.add(m); });
    // 대표 키워드는 실제로 군집 제안에 등장한 어휘
    c.keywords.forEach(k => assert.ok(c.members.some(m => SM.tokenizeExpression(texts[m]).includes(k.term)), k.term));
    assert.ok(/중심 표현군$/.test(c.label));
  });

  // 문화 교류 두 문장은 같은 표현군
  const culture = r.clusters.find(c => c.members.includes(5));
  assert.ok(culture && culture.members.includes(6));
});

test('데이터가 바뀌면 군집도 바뀐다 (하드코딩 아님)', () => {
  const base = ['문화와 기술이 오간 교류', '도자기와 인쇄술이 전해진 문화 교류', '침략의 책임'];
  const r1 = SM.analyzeExpressions(items(base), { narratives });
  const r2 = SM.analyzeExpressions(items(base.concat(['침략의 책임과 피해', '침략 책임을 기억하는 표현', '침략 책임'])), { narratives });
  assert.equal(r1.clusters[0].size, 2);
  assert.equal(r2.clusters[0].size, 4);
  assert.notEqual(r1.clusters[0].label, r2.clusters[0].label);
  assert.equal(r2.total, 6);
});

test('같은 입력이면 항상 같은 결과가 나온다 (결정적)', () => {
  const texts = ['국제전쟁', '동아시아 국제전쟁', '문화 교류', '문화 교류와 기술', '침략'];
  const a = SM.analyzeExpressions(items(texts), { narratives });
  const b = SM.analyzeExpressions(items(texts), { narratives });
  assert.deepEqual(a.clusters.map(c => [c.label, c.members]), b.clusters.map(c => [c.label, c.members]));
});

test('제안이 많아도 상한을 넘기면 나머지를 가장 가까운 군집에 배정한다', () => {
  const texts = [];
  for (let i = 0; i < 30; i++) texts.push(i % 2 ? `일본의 침략과 조선의 피해 ${i}` : `문화 교류와 기술 전파 ${i}`);
  const r = SM.analyzeExpressions(items(texts), { narratives, maxClusterItems: 10 });
  assert.equal(r.meta.capped, true);
  assert.equal(r.total, 30);
  assert.equal(r.clusters.reduce((s, c) => s + c.size, 0) + r.unclustered.length, 30);
  assert.ok(r.clusters.length >= 2);
});

test('국가별 서술과의 연결: 참여자 어휘의 출처(공통/일부/새로 등장)를 표시한다', () => {
  const r = SM.analyzeExpressions(items(['조선과 일본의 국제전쟁', '조선 일본 국제전쟁과 공존']), { narratives });
  const link = r.narrativeLink;
  const byTerm = Object.fromEntries(link.terms.map(t => [t.term, t]));
  assert.equal(byTerm['조선'].origin, 'common');
  assert.equal(byTerm['국제전쟁'].origin, 'new');
  assert.equal(link.summary.common + link.summary.partial + link.summary.new, link.terms.length);
});

test('표현 프레이밍: 갈등·책임 / 사실·기술 / 화해·협력 어휘를 센다', () => {
  const f = SM.frameProfile('침략의 책임과 피해를 기억하며 평화와 공존을 위한 대화');
  assert.ok(f.counts.conflict >= 3);
  assert.ok(f.counts.cooperation >= 3);
  assert.equal(SM.frameProfile('').dominant, null);
  const r = SM.analyzeExpressions(items(['침략과 강제 동원', '평화와 공존', 'xyz']), { narratives });
  assert.equal(r.framing.noHit, 1);
  assert.ok(r.framing.overall.conflict >= 2);
});

test('탐구 전/후 비교: 새롭게 등장·유지·사라진 표현과 유사도', () => {
  const r = SM.compareBeforeAfter(
    '일본이 조선을 침략한 전쟁',
    '일본의 조선 침략으로 시작되어 조선·명·일본이 참여한 동아시아 국제전쟁',
    { narratives }
  );
  assert.ok(r.added.includes('동아시아'));
  assert.ok(r.added.includes('국제전쟁'));
  assert.ok(r.kept.includes('침략'));
  assert.ok(r.removed.includes('전쟁'));
  assert.ok(r.addedConcepts.includes('국제·동아시아'));
  assert.ok(r.keptConcepts.includes('침략'));
  assert.ok(inRange(r.similarity));
  ['korea', 'japan', 'china'].forEach(c => {
    assert.ok(inRange(r.narrativeShift[c].before) && inRange(r.narrativeShift[c].after));
  });
  const agg = SM.aggregateBeforeAfter([
    { text: '동아시아 국제전쟁', before: '침략 전쟁' },
    { text: '국제전쟁과 공존', before: '' },
    { text: '동아시아 국제전쟁과 피해', before: '일본의 침략' }
  ], { narratives });
  assert.equal(agg.count, 2);
  assert.equal(agg.addedConcepts[0].label, '국제·동아시아');
  assert.equal(SM.aggregateBeforeAfter([]).count, 0);
});

test('작성 중 분석: 선택 요소 포함 여부, 국가별·기존 제안 유사도', () => {
  const ctx = SM.createDraftContext({
    narratives,
    existing: items(['동아시아 국제전쟁', '문화 교류']),
    eventKeywords: ['조선', '명나라', '침략']
  });
  const r = ctx.analyze('일본의 조선 침략으로 시작된 동아시아 국제전쟁', {
    selected: [
      { conceptId: 'invasion', label: '침략' },
      { conceptId: 'damage', label: '피해·희생' },
      { term: '조선', label: '조선' }
    ],
    before: '일본이 조선을 침략한 전쟁'
  });
  assert.deepEqual(r.selected.map(s => s.included), [true, false, true]);
  assert.deepEqual(r.keywords.map(k => k.included), [true, false, true]);
  assert.equal(r.similarExisting[0].item.text, '동아시아 국제전쟁');
  Object.values(r.narrativeSimilarity).forEach(v => assert.ok(inRange(v)));
  assert.ok(r.beforeAfter && r.beforeAfter.added.includes('동아시아'));

  const empty = ctx.analyze('', {});
  assert.equal(empty.chars, 0);
  assert.deepEqual(empty.similarExisting, []);
  // 일본어 입력도 개념 사전으로 포함 여부를 판단한다
  assert.equal(ctx.analyze('日本の侵略', { selected: [{ conceptId: 'invasion', label: '침략' }] }).selected[0].included, true);
});

test('키워드 차트 값은 서술 원문에서 계산되며, 서술이 바뀌면 달라진다', () => {
  const rows = SM.keywordGroupCounts(imjin);
  const invade = rows.find(r => r.label === '침략');
  assert.deepEqual(invade.counts, { korea: 4, japan: 0, china: 1 });   // 침략 3 + 침공 1 / 0 / 침략 1
  const edited = Object.assign({}, imjin, { japan: Object.assign({}, imjin.japan, { text: imjin.japan.text + ' 이는 침략이었다.' }) });
  assert.equal(SM.keywordGroupCounts(edited).find(r => r.label === '침략').counts.japan, 1);
  eventsData.forEach(ev => {
    assert.ok(ev.keywordGroups, `${ev.id}: keywordGroups`);
    assert.equal(ev.keywordFreq, undefined, `${ev.id}: 수동 숫자(keywordFreq)가 남아 있으면 안 됨`);
    SM.keywordGroupCounts(ev).forEach(r => Object.values(r.counts).forEach(v => assert.ok(Number.isInteger(v) && v >= 0)));
  });
});

test('서술 강조점 비교: 수준은 0~3이며 언급이 있으면 최소 1이다', () => {
  eventsData.forEach(ev => {
    const p = SM.emphasisProfile({ korea: ev.korea, japan: ev.japan, china: ev.china });
    assert.ok(p.rows.length > 0, ev.id);
    p.rows.forEach(r => ['korea', 'japan', 'china'].forEach(c => {
      assert.ok(r.levels[c] >= 0 && r.levels[c] <= 3);
      assert.equal(r.levels[c] === 0, r.counts[c] === 0);
    }));
  });
  const imjinRows = SM.emphasisProfile(narratives).rows;
  const invade = imjinRows.find(r => r.id === 'invasion');
  assert.deepEqual([invade.levels.korea, invade.levels.japan], [3, 0]);
});

test('작성 가이드 후보는 사건 데이터·NLP 결과에서 만들어진다', () => {
  const NLP = require('../nlp-analyzer.js');
  eventsData.forEach(ev => {
    const c = SM.candidateElements(ev, NLP.analyzeEventData(ev, eventsData));
    assert.ok(c.concepts.length > 0, ev.id);
    const labels = c.concepts.concat(c.terms, c.general).map(x => x.label);
    assert.equal(new Set(labels).size, labels.length, `${ev.id}: 중복 없음`);
    c.terms.forEach(t => assert.ok(!/[0-9]/.test(t.term)));
  });
  const imjinC = SM.candidateElements(imjin, null);
  assert.ok(imjinC.concepts.some(c => c.conceptId === 'invasion'));
  assert.deepEqual(imjinC.terms, []);
});

test('공감과 표현군 비교', () => {
  const r = SM.analyzeExpressions(items(['동아시아 국제전쟁', '동아시아의 국제전쟁', '문화 교류']), { narratives });
  const e1 = SM.compareEmpathy(r, { 1: 3, 3: 1 });
  assert.equal(e1.top[0].item.id, 1);
  assert.equal(e1.topInLargest, true);
  const e2 = SM.compareEmpathy(r, { 3: 5 });
  assert.equal(e2.topInLargest, false);
  assert.equal(SM.compareEmpathy(r, {}).top.length, 0);
});

test('사료 데이터: 필수 필드·사건 연결·안전한 링크', () => {
  const ids = new Set();
  const eventIds = new Set(eventsData.map(e => e.id));
  sourcesData.forEach(s => {
    assert.ok(!ids.has(s.id), `중복 id ${s.id}`);
    ids.add(s.id);
    assert.ok(eventIds.has(s.eventId), s.id);
    assert.ok(['korea', 'japan', 'china', 'other'].includes(s.country), s.id);
    assert.ok(['primary', 'secondary', 'memorial'].includes(s.sourceType), s.id);
    ['title', 'year', 'creator', 'description', 'perspective'].forEach(f => assert.ok(s[f], `${s.id}.${f}`));
    assert.ok(Array.isArray(s.relatedTerms) && s.relatedTerms.length > 0, s.id);
    assert.ok(s.url === null || /^https:\/\//.test(s.url), s.id);
  });
  eventIds.forEach(id => assert.ok(sourcesData.some(s => s.eventId === id), `${id}에 자료 없음`));
});

test('작성 가이드 데이터: 저장용 코드가 고유하다', () => {
  ['STYLES', 'TEMPLATES', 'REASONS'].forEach(k => {
    const ids = Guide[k].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, k);
  });
  assert.deepEqual(Guide.STYLES.map(s => s.id), ['fact', 'perspective', 'shared', 'future']);
  Guide.TEMPLATES.forEach(t => assert.ok(t.text.includes('______')));
});

test('지도 배치: 원이 화면 안에 있고 결정적으로 계산된다', () => {
  const clusters = [9, 5, 3, 2, 2, 2, 2, 2, 2, 2].map((size, i) => ({ id: 'c' + i, size }));
  [{ width: 640, height: 371 }, { width: 320, height: 448 }].forEach(box => {
    const a = MemoryMap.layout(clusters, box);
    const b = MemoryMap.layout(clusters, box);
    assert.deepEqual(a, b);
    a.forEach(n => {
      assert.ok(n.x - n.r >= 0 && n.x + n.r <= box.width, `x ${n.id}`);
      assert.ok(n.y - n.r >= 0 && n.y + n.r <= box.height, `y ${n.id}`);
    });
    assert.ok(a[0].r > a[1].r && a[1].r > a[2].r);
  });
  assert.deepEqual(MemoryMap.layout([], { width: 300, height: 300 }), []);
});
