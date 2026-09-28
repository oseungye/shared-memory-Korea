/* 국가별 서술 비교 분석 모듈 테스트 — 실행: npm test  (또는 node --test tests/*.test.js) */
const test = require('node:test');
const assert = require('node:assert/strict');

const NLP = require('../nlp-analyzer.js');
const eventsData = require('../events-data.js');

const imjin = eventsData.find(e => e.id === 'imjin');
const terms = list => list.map(e => e.term);
const simOf = (analysis, key) => analysis.similarity.find(s => s.key === key);

test('조사·어미를 떼어 기본형으로 맞춘다', () => {
  assert.equal(NLP.normalizeToken('일본이'), '일본');
  assert.equal(NLP.normalizeToken('조선을'), '조선');
  assert.equal(NLP.normalizeToken('일본군을'), '일본군');
  assert.equal(NLP.normalizeToken('침략으로부터'), '침략');
  assert.equal(NLP.normalizeToken('희생되었다'), '희생');
  assert.equal(NLP.normalizeToken('왜의'), '왜');
  // 명사의 일부인 끝 글자는 자르지 않는다
  assert.equal(NLP.normalizeToken('국가'), '국가');
  assert.equal(NLP.normalizeToken('한반도'), '한반도');
  assert.equal(NLP.normalizeToken('한반도에서'), '한반도');
});

test('토큰은 원문 위치를 기억하고, 서술어·기능어는 제외된다', () => {
  const text = '명나라가 조선의 요청에 응하여 군대를 보냈다.';
  const tokens = NLP.tokenize(text);
  assert.deepEqual(tokens.map(t => t.term), ['명나라', '조선', '요청', '군대']);
  tokens.forEach(t => assert.equal(text.slice(t.start, t.end), t.surface));
});

test('임진왜란: 국가별 핵심 키워드가 서술 내용을 반영한다', () => {
  const r = NLP.analyzeEventData(imjin, eventsData);
  assert.ok(terms(r.keywords.korea).includes('침략'), '한국: 침략');
  assert.equal(r.keywords.korea[0].term, '침략', '한국 서술 1순위 키워드는 침략(3회)');
  ['진출', '히데요시', '출병'].forEach(t => assert.ok(terms(r.keywords.japan).includes(t), `일본: ${t}`));
  ['의로운', '구원'].forEach(t => assert.ok(terms(r.keywords.china).includes(t), `중국: ${t}`));
  // 점수 = TF × IDF
  r.keywords.korea.forEach(k => assert.ok(Math.abs(k.score - k.tf * k.idf) < 1e-9));
});

test('임진왜란: 세 국가 공통 표현과 두 국가 공유 표현', () => {
  const r = NLP.analyzeEventData(imjin, eventsData);
  const common = terms(r.common);
  ['조선', '명나라', '일본'].forEach(t => assert.ok(common.includes(t), `공통: ${t}`));
  r.common.forEach(e => r.countries.forEach(c => assert.ok(e.counts[c] > 0)));
  // '침략'은 한국·중국 서술에만 있고 일본 서술에는 없다
  assert.ok(terms(r.pairShared['korea-china']).includes('침략'));
  assert.ok(!common.includes('침략'));
});

test('임진왜란: 국가별 특징적 표현', () => {
  const r = NLP.analyzeEventData(imjin, eventsData);
  assert.ok(terms(r.distinctive.korea).includes('침략'));
  assert.ok(terms(r.distinctive.japan).includes('진출'));
  assert.ok(terms(r.distinctive.china).includes('의로운'));
  Object.values(r.distinctive).flat().forEach(d => assert.ok(d.ratio > 1 && d.count > 0));
  const invade = r.distinctive.korea.find(d => d.term === '침략');
  assert.deepEqual([invade.count, invade.otherCounts.japan, invade.otherCounts.china], [3, 0, 1]);
});

test('임진왜란: 유사도는 0~1이며 한국–중국이 한국–일본보다 가깝다', () => {
  const r = NLP.analyzeEventData(imjin, eventsData);
  assert.equal(r.similarity.length, 3);
  r.similarity.forEach(s => {
    assert.ok(s.cosine >= 0 && s.cosine <= 1);
    assert.ok(s.jaccard >= 0 && s.jaccard <= 1);
  });
  assert.ok(simOf(r, 'korea-china').cosine > simOf(r, 'korea-japan').cosine);
});

test('코사인 기여도의 합은 코사인 값과 같다 (설명 가능성)', () => {
  const r = NLP.analyzeEvent(
    { korea: imjin.korea, japan: imjin.japan, china: imjin.china },
    { corpus: NLP.buildCorpusFromEvents(eventsData), topContributions: Infinity }
  );
  r.similarity.forEach(s => {
    const sum = s.contributions.reduce((acc, c) => acc + c.contribution, 0);
    assert.ok(Math.abs(sum - s.cosine) < 1e-9, s.key);
  });
});

test('근거 위치는 원문의 해당 어절을 가리킨다', () => {
  const r = NLP.analyzeEventData(imjin, eventsData);
  const occ = r.occurrences('침략');
  assert.equal(occ.korea.length, 3);
  assert.equal(occ.japan.length, 0);
  occ.korea.forEach(([s, e]) => assert.ok(r.texts.korea.slice(s, e).startsWith('침략')));
});

test('텍스트가 바뀌면 결과도 바뀐다 (하드코딩 아님)', () => {
  const base = NLP.analyzeEventData(imjin, eventsData);

  // 일본 서술을 한국 서술과 똑같이 바꾸면 한국–일본 유사도는 1이 된다
  const same = NLP.analyzeEvent({ korea: imjin.korea, japan: imjin.korea, china: imjin.china });
  assert.ok(Math.abs(simOf(same, 'korea-japan').cosine - 1) < 1e-9);

  // 일본 서술에 '침략'을 넣으면 공통 표현으로 올라온다
  const edited = { ...imjin, japan: { ...imjin.japan, text: imjin.japan.text + ' 이는 조선에 대한 침략이었다.' } };
  const after = NLP.analyzeEventData(edited, eventsData.map(e => (e.id === 'imjin' ? edited : e)));
  assert.ok(!terms(base.common).includes('침략'));
  assert.ok(terms(after.common).includes('침략'));
  assert.ok(simOf(after, 'korea-japan').cosine > simOf(base, 'korea-japan').cosine);
});

test('빈 서술과 모든 사건 데이터를 오류 없이 처리한다', () => {
  const empty = NLP.analyzeEvent({ korea: '', japan: '', china: '' });
  empty.similarity.forEach(s => {
    assert.equal(s.cosine, 0);
    assert.equal(s.jaccard, 0);
  });
  eventsData.forEach(ev => {
    const r = NLP.analyzeEventData(ev, eventsData);
    r.countries.forEach(c => assert.ok(r.keywords[c].length > 0, `${ev.id}/${c}`));
    r.similarity.forEach(s => assert.ok(Number.isFinite(s.cosine) && Number.isFinite(s.jaccard)));
  });
});
