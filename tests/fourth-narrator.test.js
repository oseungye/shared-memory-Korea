/* 네 번째 서술자 · 기억의 빈자리 테스트 — 실행: npm test
   · 아래 FAKE_ 로 시작하는 답변은 계산 규칙을 확인하기 위한 테스트 전용 문장입니다. 실제 AI 답변이 아니며 화면에 나오지 않습니다. */
const test = require('node:test');
const assert = require('node:assert/strict');

const NA = require('../narrator-analysis.js');
const data = require('../fourth-narrator-data.js');
const aiData = require('../ai-narratives-data.js');
const eventsData = require('../events-data.js');

const LANGS = ['ko', 'ja', 'zh'];
const byId = id => eventsData.find(e => e.id === id);

function fakeRecord(eventId, lang, run, answer) {
  return {
    eventId, lang, run, answer,
    prompt: data.questions[eventId][lang],
    translationKo: lang === 'ko' ? null : 'FAKE_참고 번역',
    model: 'test-model', collectedAt: '2026-10-22T00:00:00Z', params: {}
  };
}

test('모든 사건에 세 언어 질문이 있다', () => {
  eventsData.forEach(e => {
    LANGS.forEach(l => {
      const q = data.questions[e.id] && data.questions[e.id][l];
      assert.ok(typeof q === 'string' && q.trim().length > 20, `${e.id}/${l} 질문 없음`);
    });
  });
});

test('질문에는 사건 이름을 넣지 않는다 (AI가 스스로 고른 이름을 관찰하기 위해)', () => {
  Object.keys(data.names).forEach(eventId => {
    LANGS.forEach(l => {
      const q = data.questions[eventId][l];
      data.names[eventId].forEach(name => name.forms.forEach(f => {
        assert.ok(q.indexOf(f) < 0, `${eventId}/${l} 질문에 이름 '${f}'이 들어 있음`);
      }));
    });
  });
});

test('히로시마 질문은 조선인 피해자를 미리 언급하지 않는다 (답을 유도하지 않음)', () => {
  const forms = data.focus.hiroshima.find(f => f.id === 'korean-victims').forms;
  LANGS.forEach(l => forms.forEach(f => {
    assert.ok(data.questions.hiroshima[l].indexOf(f) < 0, `hiroshima/${l} 질문에 '${f}'`);
  }));
});

test('사건별 요소·이름에는 한 글자 한자 표현을 쓰지 않는다 (다른 낱말 속 오탐 방지)', () => {
  const all = [];
  Object.values(data.focus).forEach(list => list.forEach(x => all.push(...x.forms)));
  Object.values(data.names).forEach(list => list.forEach(x => all.push(...x.forms)));
  all.forEach(f => assert.ok(f.replace(/^=/, '').length >= 2, `너무 짧은 표현: ${f}`));
});

test('저장된 AI 기록은 모두 형식이 맞고 질문 원문이 같다 (기록이 없으면 통과)', () => {
  aiData.records.forEach((r, i) => {
    assert.deepEqual(NA.validateRecord(r, data.questions), [], `records[${i}]`);
  });
  if (aiData.records.length) assert.equal(aiData.questionsVersion, data.questionsVersion, '질문 버전이 다름');
});

test('형식 검사: 질문이 바뀌거나 정보가 빠진 기록을 잡는다', () => {
  const ok = fakeRecord('imjin', 'ja', 1, 'FAKE_答え');
  assert.deepEqual(NA.validateRecord(ok, data.questions), []);
  assert.ok(NA.validateRecord(Object.assign({}, ok, { prompt: '다른 질문' }), data.questions).length > 0);
  assert.ok(NA.validateRecord(Object.assign({}, ok, { model: '' }), data.questions).length > 0);
  assert.ok(NA.validateRecord(Object.assign({}, ok, { run: 0 }), data.questions).length > 0);
  assert.ok(NA.validateRecord(Object.assign({}, ok, { lang: 'en' }), data.questions).length > 0);
  assert.ok(NA.validateRecord(Object.assign({}, ok, { answer: '  ' }), data.questions).length > 0);
});

test('AI 기록이 없으면 세 나라만 비교한다', () => {
  const r = NA.analyzeEvent(byId('imjin'), [], data);
  assert.deepEqual(r.narrators.map(n => n.key), ['korea', 'japan', 'china']);
  assert.equal(r.hasAi, false);
});

test('현재 히로시마 요약 서술: 조선인 피해자는 일본 측 요약에만 없다 (빈자리)', () => {
  const r = NA.analyzeEvent(byId('hiroshima'), [], data);
  const row = r.rows.find(x => x.id === 'focus:korean-victims');
  assert.deepEqual(row.presentKeys, ['korea', 'china']);
  assert.deepEqual(row.gapKeys, ['japan']);
  assert.equal(r.gaps[0].rowId, 'focus:korean-victims', '사건별 확인 요소의 빈자리가 먼저');
});

test('AI 기록이 있는 언어만 서술자로 추가되고, 같은 질문을 여러 번 물은 결과는 절반 이상일 때 있음', () => {
  const recs = [
    fakeRecord('imjin', 'ja', 1, 'FAKE_豊臣秀吉が朝鮮に出兵した。'),
    fakeRecord('imjin', 'ja', 2, 'FAKE_豊臣秀吉の朝鮮出兵。侵略とも呼ばれる。'),
    fakeRecord('imjin', 'ja', 3, 'FAKE_秀吉による出兵である。'),
    fakeRecord('zainichi', 'ko', 1, 'FAKE_다른 사건 기록은 섞이지 않는다')
  ];
  const r = NA.analyzeEvent(byId('imjin'), recs, data);
  assert.deepEqual(r.narrators.map(n => n.key), ['korea', 'japan', 'china', 'ai-ja']);
  const ai = r.narrators.find(n => n.key === 'ai-ja');
  assert.equal(ai.texts.length, 3);
  const invasion = r.rows.find(x => x.id === 'concept:invasion').cells['ai-ja'];
  assert.equal(invasion.hits, 1);
  assert.equal(invasion.runs, 3);
  assert.equal(invasion.present, false, '3회 중 1회는 없음으로 본다');
  const dispatch = r.rows.find(x => x.id === 'concept:dispatch').cells['ai-ja'];
  assert.equal(dispatch.present, true);
  assert.equal(dispatch.hits, 3);
  const names = r.names.byNarrator['ai-ja'].map(x => x.label);
  assert.deepEqual(names, ['朝鮮出兵']);
});

test('빈자리 기준: 다른 서술자 중 max(2, 절반 이상)에게 있고 이 서술자에게 없을 때', () => {
  const narrators = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => ({ key: k }));
  const cell = present => ({ present });
  const rows = NA.markGaps([
    { id: 'x', cells: { a: cell(false), b: cell(true), c: cell(true), d: cell(true), e: cell(false), f: cell(false) } },
    { id: 'y', cells: { a: cell(false), b: cell(true), c: cell(true), d: cell(false), e: cell(false), f: cell(false) } }
  ], narrators);
  assert.deepEqual(rows[0].gapKeys, ['a', 'e', 'f'], '다섯 중 셋에게 있으면 빈자리');
  assert.deepEqual(rows[1].gapKeys, [], '다섯 중 둘에게만 있으면 빈자리가 아님');
});

test('편집자 핵심 빈자리는 계산 결과와 맞을 때만 강조한다', () => {
  const custom = Object.assign({}, data, { keyGaps: { hiroshima: [
    { element: 'focus:korean-victims', narrator: 'japan', note: '맞는 항목' },
    { element: 'focus:korean-victims', narrator: 'korea', note: '계산과 다른 항목' }
  ] } });
  const r = NA.analyzeEvent(byId('hiroshima'), [], custom);
  assert.deepEqual(r.keyGaps.map(g => g.narrator), ['japan']);
});

test('같은 입력이면 같은 결과 (결정적)', () => {
  const a = NA.analyzeEvent(byId('modern'), [], data);
  const b = NA.analyzeEvent(byId('modern'), [], data);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('수집 스크립트 미리 보기: API를 부르지 않고 계획만 출력한다', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const script = path.join(__dirname, '..', 'tools', 'collect-ai-narratives.mjs');
  const env = Object.assign({}, process.env, { ANTHROPIC_API_KEY: '' });
  const all = spawnSync(process.execPath, [script, '--dry-run'], { encoding: 'utf8', env });
  assert.equal(all.status, 0, all.stderr);
  const expected = 6 * 3 * 3 - aiData.records.length;
  assert.match(all.stdout, new RegExp(`새로 물을 답변 ${expected}건`));
  const part = spawnSync(process.execPath, [script, '--dry-run', '--events=imjin', '--langs=ja', '--runs=2'], { encoding: 'utf8', env });
  assert.equal(part.status, 0, part.stderr);
  const already = aiData.records.filter(r => r.eventId === 'imjin' && r.lang === 'ja' && r.run <= 2).length;
  assert.match(part.stdout, new RegExp(`새로 물을 답변 ${2 - already}건`));
  const bad = spawnSync(process.execPath, [script, '--dry-run', '--events=unknown'], { encoding: 'utf8', env });
  assert.notEqual(bad.status, 0, '없는 사건은 거부');
});

test('다섯 번째 서술자: 참여자 문장이 채운 빈자리와 새로 쓴 요소', () => {
  const r = NA.analyzeEvent(byId('hiroshima'), [], data);
  const p = NA.placeSentence(r, '히로시마에는 강제 동원된 조선인 피해자도 있었고, 평화를 위해 함께 기억해야 한다.');
  const victims = p.filled.find(f => f.id === 'focus:korean-victims');
  assert.ok(victims, '조선인 피해자를 채움');
  assert.deepEqual(victims.missingIn, ['japan']);
  assert.ok(!p.filled.some(f => f.id === 'concept:peace'), '이미 일부 서술에 있고 빈자리가 아닌 요소는 채운 빈자리가 아님');
  assert.ok(p.fresh.some(f => f.id === 'concept:memory'), '어느 서술에도 없던 요소는 새로 쓴 요소');
  assert.deepEqual(NA.placeSentence(r, ''), { filled: [], fresh: [] });
  assert.deepEqual(NA.placeSentence(r, '아무 관련 없는 문장'), { filled: [], fresh: [] });
});

test('카드 모델: 다섯 번째 서술자 칸은 내용이 있을 때만, 개수 제한', () => {
  const Card = require('../memory-card.js');
  const event = byId('hiroshima');
  const base = { event, before: '처음 생각', after: '조선인 피해자도 함께 기억하자' };
  assert.equal(Card.buildCardModel(Object.assign({}, base, { fifth: null })).fifth, null);
  assert.equal(Card.buildCardModel(Object.assign({}, base, { fifth: { filled: [], fresh: [] } })).fifth, null);
  const many = { filled: [1, 2, 3, 4].map(n => ({ label: '요소' + n, where: ['일본 측 서술'] })), fresh: [1, 2, 3].map(n => ({ label: '새' + n })) };
  const m = Card.buildCardModel(Object.assign({}, base, { fifth: many }));
  assert.equal(m.fifth.filled.length, 3);
  assert.equal(m.fifth.fresh.length, 2);
  assert.equal(Card.buildCardModel(Object.assign({}, base, { after: '', fifth: many })).fifth, null, '탐구 후 문장이 없으면 칸 없음');
  assert.equal(Card.fifthNarrator({ filled: [{ label: '이름만', where: [] }] }), null, '어느 서술에 없었는지 모르면 표시하지 않음');
});

test('실제 기록(2026-10-22): 편집자 핵심 빈자리는 모두 계산 결과와 맞고, 사건마다 관찰이 있다', () => {
  eventsData.forEach(e => {
    const keys = data.keyGaps[e.id] || [];
    const r = NA.analyzeEvent(e, aiData.records, data);
    assert.ok(keys.length >= 1 && keys.length <= 2, `${e.id}: 핵심 빈자리는 1~2개`);
    assert.equal(r.keyGaps.length, keys.length, `${e.id}: 계산상 빈자리가 아닌 keyGaps가 있음`);
    assert.ok((data.observations[e.id] || []).length >= 1, `${e.id}: 관찰 없음`);
    (data.observations[e.id] || []).forEach(t => assert.doesNotMatch(t, /편향|왜곡|거짓말/, `${e.id}: 판정어 대신 사실형으로`));
  });
});

test('가장 먼저 쓴 이름: 글에서 가장 앞에 나온 사건 이름을 센다', () => {
  const names = data.names.imjin;
  assert.equal(NA.firstNameIn('FAKE_文禄・慶長の役(韓国では壬辰倭乱)', names), 'bunroku-keicho');
  assert.equal(NA.firstNameIn('FAKE_韓国では壬辰倭乱、日本では文禄・慶長の役', names), 'imjin-waeran');
  assert.equal(NA.firstNameIn('FAKE_이름 없음', names), null);
  const r = NA.analyzeEvent(byId('imjin'), aiData.records, data);
  const first = key => r.names.byNarrator[key].filter(x => x.first === 3).map(x => x.id);
  assert.deepEqual(first('ai-ko'), ['imjin-waeran']);
  assert.deepEqual(first('ai-ja'), ['bunroku-keicho']);
  assert.deepEqual(first('ai-zh'), ['wanli-war']);
});

test('거짓 빈자리 보정: 개념 사전에 없는 실제 표기(conceptExtraForms)·사건 요소 표기를 찾는다', () => {
  const imjin = NA.analyzeEvent(byId('imjin'), [1, 2, 3].map(n => fakeRecord('imjin', 'zh', n, 'FAKE_朝鲜遭受了严重破坏。')), data);
  assert.equal(imjin.rows.find(x => x.id === 'concept:damage').cells['ai-zh'].hits, 3);
  const modern = NA.analyzeEvent(byId('modern'), [1, 2, 3].map(n => fakeRecord('modern', 'ja', n, 'FAKE_1910年に日本に併合されました。')), data);
  assert.equal(modern.rows.find(x => x.id === 'focus:annexation').cells['ai-ja'].hits, 3);
  // 공동 표현 분석이 쓰는 개념 사전은 그대로 (보정 표기는 이 화면에서만)
  const lexDamage = require('../shared-memory-analyzer.js').CONCEPTS.find(c => c.id === 'damage');
  assert.ok(Object.values(lexDamage.forms).every(list => list.indexOf('严重破坏') < 0));
});
