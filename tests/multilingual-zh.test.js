/* 한국어·중국어·일본어·영어 4개 언어 공동 표현 분석 테스트 — 실행: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');

const SM = require('../shared-memory-analyzer.js');
const Lex = require('../concept-lexicon.js');
const Store = require('../shared-store.js').SharedStore;
const eventsData = require('../events-data.js');

const imjin = eventsData.find(e => e.id === 'imjin');
const narratives = { korea: imjin.korea, japan: imjin.japan, china: imjin.china };
const inRange = v => Number.isFinite(v) && v >= -1e-9 && v <= 1 + 1e-9;
const ids = t => SM.findConcepts(t).map(c => c.id);

test('지원 언어 목록은 ko · zh · ja · en 순서다', () => {
  assert.deepEqual(SM.LANGS, ['ko', 'zh', 'ja', 'en']);
  assert.deepEqual(Store.LANG_CODES, SM.LANGS);
});

test('1~4. 언어 판별: 한글 → ko, 가나 → ja, 일반 중국어 → zh, 영어 → en', () => {
  assert.equal(SM.detectLanguage('일본의 침략으로 시작된 동아시아 국제전쟁'), 'ko');
  assert.equal(SM.detectLanguage('日本による朝鮮侵略で始まった東アジアの国際戦争'), 'ja');
  assert.equal(SM.detectLanguage('An international war that began with the Japanese invasion'), 'en');

  const zh = SM.detectLanguageDetail('这是一场由日本发动的侵略战争，给朝鲜和中国人民带来了巨大的灾难。');
  assert.equal(zh.lang, 'zh');
  assert.equal(zh.confident, true);
  assert.equal(SM.detectLanguage('我们应该共同记住历史，追求和平与相互理解。'), 'zh');
  assert.equal(SM.detectLanguage('戰爭與和平'), 'zh');                     // 번체
  // 한글이 섞이면 ko, 가나가 섞이면 ja
  assert.equal(SM.detectLanguage('임진왜란(壬辰倭亂)은 국제 전쟁이다'), 'ko');
  assert.equal(SM.detectLanguage('戦争と平和'), 'ja');
});

test('3-1. 가나 없는 짧은 한자 표현은 zh로 확정하지 않는다 (사용자 선택으로 보완)', () => {
  const d = SM.detectLanguageDetail('朝鮮侵略');
  assert.equal(d.lang, 'zh');
  assert.equal(d.confident, false);
  assert.deepEqual(d.candidates, ['zh', 'ja']);
  // 일본 신자체만 있는 한자 표현은 일본어 후보
  const j = SM.detectLanguageDetail('戦争責任');
  assert.equal(j.lang, 'ja');
  assert.equal(j.confident, false);
  assert.ok(j.candidates.includes('zh'));
});

test('5. 사용자가 직접 고른 작성 언어가 자동 감지보다 우선한다', () => {
  assert.equal(SM.resolveLanguage('ja', '朝鮮侵略'), 'ja');
  assert.equal(SM.resolveLanguage('zh', '日本の侵略'), 'zh');
  assert.equal(SM.resolveLanguage('EN', '일본의 침략'), 'en');          // 대소문자 무관
  assert.equal(SM.resolveLanguage(null, '朝鮮侵略'), 'zh');             // 선택 없으면 자동 감지
  assert.equal(SM.resolveLanguage('fr', 'Japanese invasion'), 'en');    // 지원하지 않는 값은 무시
  assert.equal(SM.resolveLanguage('unknown', '일본의 침략'), 'ko');

  // 실시간 분석에서도 선택한 언어가 우선합니다.
  const ctx = SM.createDraftContext({ narratives, existing: [] });
  const auto = ctx.analyze('朝鮮侵略');
  assert.equal(auto.lang, 'zh');
  assert.equal(auto.langSource, 'auto');
  assert.equal(auto.detected.confident, false);
  const chosen = ctx.analyze('朝鮮侵略', { lang: 'ja' });
  assert.equal(chosen.lang, 'ja');
  assert.equal(chosen.langSource, 'selected');

  // 분석 시에도 저장된(선택된) 언어를 그대로 씁니다.
  const r = SM.analyzeExpressions([{ id: 1, text: '朝鮮侵略', lang: 'ja' }, { id: 2, text: '朝鮮侵略' }]);
  assert.equal(r.items[0].lang, 'ja');
  assert.equal(r.items[1].lang, 'zh');
});

test('6. 중국어 침략·전쟁·평화 등이 개념 사전에 연결된다 (간체·번체)', () => {
  assert.ok(ids('日本侵略朝鲜').includes('invasion'));
  assert.ok(ids('外敌入侵').includes('invasion'));
  assert.ok(ids('一场残酷的战争').includes('war'));
  assert.ok(ids('戰爭的記憶').includes('war'));
  assert.ok(ids('戰爭的記憶').includes('memory'));
  assert.ok(ids('追求和平').includes('peace'));
  assert.ok(ids('承担历史责任').includes('responsibility'));
  assert.ok(ids('强制动员').includes('coercion'));
  assert.ok(ids('东亚国际秩序').includes('international'));
  assert.ok(ids('原子弹爆炸').includes('nuclear'));
  // 모든 개념이 zh 표현을 갖고, 한자만으로 이루어져 있다
  Lex.CONCEPTS.forEach(c => {
    assert.ok(Array.isArray(c.forms.zh) && c.forms.zh.length > 0, c.id + ' zh 표현 없음');
    c.forms.zh.forEach(f => assert.match(f, /^[㐀-䶿一-鿿]+$/, c.id + ': ' + f));
    assert.deepEqual(Object.keys(c.forms), ['ko', 'zh', 'ja', 'en']);
  });
  // '在日本(일본에서)'은 재일(이주) 개념으로 잘못 세지 않는다
  assert.ok(!ids('在日本的中国留学生').includes('migration'));
  assert.ok(ids('在日朝鲜人的历史').includes('migration'));
});

test('중국어 토큰화: 기능어 경계 분리 + 사전 최장 일치, 일반 기능 표현은 제외', () => {
  const terms = SM.tokenizeExpression('我们应该共同记住历史，追求和平与相互理解。', 'zh');
  assert.ok(terms.includes('和平'), '和 가 기능어여도 和平은 하나의 단어');
  assert.ok(terms.includes('历史'));
  assert.ok(terms.includes('共同'));
  assert.ok(!terms.includes('我们'));
  assert.ok(!terms.includes('应该'));
  assert.ok(terms.every(t => t.length >= 2 || ['明', '清', '唐', '宋', '元', '倭', '汉', '漢', '秦', '隋'].includes(t)));
  assert.deepEqual(SM.tokenizeExpression('日本侵略朝鲜引发的东亚国际战争', 'zh'),
    ['日本', '侵略', '朝鲜', '引发', '东亚', '国际', '战争']);
  // 라틴 문자도 함께 처리
  assert.ok(SM.tokenizeExpression('东亚和平 peace', 'zh').includes('peace'));
});

test('7. 중국어와 한국어 문장이 같은 개념을 쓰면 개념 특징으로 연결된다', () => {
  const zh = '日本侵略朝鲜引发的东亚国际战争';
  const ko = '일본의 조선 침략으로 시작된 동아시아 국제전쟁';
  const other = '도자기와 인쇄술이 전해진 문화 교류';
  const fz = SM.featurize(zh);
  const fk = SM.featurize(ko);
  ['c:invasion', 'c:war', 'c:international'].forEach(k => {
    assert.ok(fz.features.has(k), 'zh ' + k);
    assert.ok(fk.features.has(k), 'ko ' + k);
  });
  assert.ok(SM.textSimilarity(zh, ko) > SM.textSimilarity(zh, other));
  assert.ok(SM.textSimilarity(zh, ko) >= SM.DEFAULTS.clusterThreshold);
  // 중국어 문자 2-gram은 기능어가 낀 조합을 만들지 않는다
  assert.ok(!fz.features.has('g:的东'));
  assert.ok(fz.features.has('g:侵略'));
});

test('8. 중국어 표현이 섞여도 공동 표현 분석·군집화가 오류 없이 동작한다', () => {
  const r = SM.analyzeExpressions([
    { id: 1, text: '일본의 조선 침략으로 시작된 동아시아 국제전쟁' },
    { id: 2, text: '日本侵略朝鲜引发的东亚国际战争' },
    { id: 3, text: '日本による朝鮮侵略で始まった東アジアの国際戦争' },
    { id: 4, text: 'An international war in East Asia that began with the Japanese invasion of Joseon' },
    { id: 5, text: '陶瓷和印刷术传入日本的文化交流' },
    { id: 6, text: '。，！' },
    { id: 7, text: '的了是在' }
  ], { narratives });
  assert.equal(r.total, 7);
  assert.equal(r.byLanguage.zh, 3);
  const big = r.clusters[0];
  assert.ok(big, '표현군이 있어야 함');
  assert.deepEqual(big.members, [0, 1, 2, 3]);
  assert.deepEqual(Object.keys(big.languages).sort(), ['en', 'ja', 'ko', 'zh']);
  const invasion = r.topConcepts.find(c => c.id === 'invasion');
  assert.equal(invasion.count, 4);
  assert.deepEqual(invasion.langs.slice().sort(), ['en', 'ja', 'ko', 'zh']);
  assert.ok(inRange(r.similarity.mean));
  r.clusters.forEach(c => assert.ok(inRange(c.cohesion)));
  r.links.forEach(l => assert.ok(inRange(l.score)));
  assert.ok(r.framing.byLanguage.zh.count >= 1);
  // 국가별 서술(한국어)과의 연결도 계산된다
  assert.ok(r.narrativeLink);
  Object.values(r.narrativeLink.averageSimilarity).forEach(v => assert.ok(inRange(v)));
  // 공감 비교·탐구 전후 비교도 중국어에서 동작
  assert.ok(SM.compareEmpathy(r, { 2: 3 }).top[0].item.id === 2);
  const ba = SM.compareBeforeAfter('战争', '日本侵略朝鲜引发的战争与和平', { narratives });
  assert.ok(ba.addedConcepts.includes('침략'));
  assert.ok(ba.keptConcepts.includes('전쟁'));
});

test('9. 기존 ko/ja/en 데이터는 그대로 분석된다', () => {
  const r = SM.analyzeExpressions([
    { id: 1, text: '일본의 조선 침략으로 시작된 동아시아 국제전쟁', lang: 'ko' },
    { id: 2, text: '日本による朝鮮侵略で始まった東アジアの国際戦争', lang: 'ja' },
    { id: 3, text: 'An international war in East Asia that began with the Japanese invasion of Joseon', lang: 'en' }
  ], { narratives });
  assert.deepEqual(r.byLanguage, { ko: 1, zh: 0, ja: 1, en: 1, unknown: 0 });
  assert.deepEqual(r.items.map(it => it.lang), ['ko', 'ja', 'en']);
  assert.equal(r.clusters.length, 1);
  assert.deepEqual(SM.tokenizeExpression('東アジアの国際的な戦争', 'ja'), ['アジア', '国際', '戦争']);
});

test('10. 기존 unknown 데이터는 zh 등으로 재분류하지 않는다', () => {
  const r = SM.analyzeExpressions([
    { id: 1, text: '朝鮮侵略戰爭', lang: 'unknown' },
    { id: 2, text: '일본의 침략 전쟁', lang: 'unknown' },
    { id: 3, text: '日本侵略朝鲜的战争', lang: 'ETC' },      // DB 기본값
    { id: 4, text: '朝鮮侵略戰爭' }                          // 언어 정보가 없는 새 입력 → 자동 감지
  ]);
  assert.deepEqual(r.items.map(it => it.lang), ['unknown', 'unknown', 'unknown', 'zh']);
  assert.equal(r.byLanguage.unknown, 3);
  assert.equal(r.byLanguage.zh, 1);
  // unknown 한자 문장은 이전과 같은 방식(한자 구간 그대로)으로, 한글 문장은 한국어 규칙으로 토큰화
  assert.equal(r.items[0].analysisLang, 'unknown');
  assert.equal(r.items[1].analysisLang, 'ko');
  assert.ok(r.topConcepts.find(c => c.id === 'invasion').count === 4);
  // 저장소 정규화: 지원 언어 외의 값은 모두 unknown
  assert.equal(Store.normalizeLang('ETC'), 'unknown');
  assert.equal(Store.normalizeLang(null), 'unknown');
  assert.equal(Store.normalizeLang('unknown'), 'unknown');
  assert.equal(Store.normalizeLang('ZH'), 'zh');
  assert.equal(Store.mapRow({ id: 1, content: 'x', country_code: 'zh' }).lang, 'zh');
  assert.equal(Store.mapRow({ id: 2, content: 'x', country_code: 'ETC' }).lang, 'unknown');
  assert.equal(Store.mapRow({ id: 3, content: 'x', country_code: 'ko' }).lang, 'ko');
});

test('11. 공동 표현 목록 언어 필터: zh', () => {
  const list = [
    { id: 1, lang: 'ko', text: 'a' }, { id: 2, lang: 'zh', text: 'b' }, { id: 3, lang: 'ja', text: 'c' },
    { id: 4, lang: 'en', text: 'd' }, { id: 5, lang: 'unknown', text: 'e' }, { id: 6, lang: 'ZH', text: 'f' }
  ];
  assert.deepEqual(SM.filterByLanguage(list, 'zh').map(x => x.id), [2, 6]);
  assert.deepEqual(SM.filterByLanguage(list, 'ko').map(x => x.id), [1]);
  assert.deepEqual(SM.filterByLanguage(list, 'all').map(x => x.id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(SM.filterByLanguage(null, 'zh'), []);
  // unknown은 언어 탭에서 강조하지 않지만 '전체'에는 포함된다
  assert.ok(SM.filterByLanguage(list, 'all').some(x => x.lang === 'unknown'));
});

test('12. 4개 언어가 섞인 데이터의 분석 결과는 결정적이다', () => {
  const data = [
    { id: 1, text: '일본의 조선 침략으로 시작된 동아시아 국제전쟁' },
    { id: 2, text: '日本侵略朝鲜引发的东亚国际战争' },
    { id: 3, text: '日本による朝鮮侵略で始まった東アジアの国際戦争' },
    { id: 4, text: 'An international war in East Asia that began with the Japanese invasion' },
    { id: 5, text: '我们应该共同记住历史，追求和平与相互理解。' },
    { id: 6, text: '평화와 상호 이해를 위해 함께 기억해야 할 역사' },
    { id: 7, text: '平和と相互理解のために共に記憶する歴史' },
    { id: 8, text: 'A shared memory for peace and mutual understanding' }
  ];
  const snap = r => JSON.stringify({
    byLanguage: r.byLanguage, topTerms: r.topTerms, topConcepts: r.topConcepts,
    clusters: r.clusters.map(c => ({ label: c.label, members: c.members, rep: c.representative, kw: c.keywords, cohesion: c.cohesion })),
    links: r.links, mean: r.similarity.mean, framing: r.framing
  });
  const a = snap(SM.analyzeExpressions(data, { narratives }));
  const b = snap(SM.analyzeExpressions(data.map(x => Object.assign({}, x)), { narratives }));
  assert.equal(a, b);
  const r = SM.analyzeExpressions(data, { narratives });
  assert.deepEqual(r.byLanguage, { ko: 2, zh: 2, ja: 2, en: 2, unknown: 0 });
  assert.ok(r.clusters.length >= 2);
});
