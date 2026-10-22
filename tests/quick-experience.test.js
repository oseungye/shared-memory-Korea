/* 기본 체험(객관식 관점 고르기 · 한 줄 소감 · 카드) 테스트 — 실행: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Q = require('../choice-questions.js');
const Card = require('../memory-card.js');
const Themes = require('../card-themes.js');
const eventsData = require('../events-data.js');

const ROOT = path.join(__dirname, '..');
const imjin = eventsData.find(e => e.id === 'imjin');
const zainichi = eventsData.find(e => e.id === 'zainichi');

global.self = global.self || {};
require('../shared-store.js');
const Store = global.self.SharedStore;

function fakeCanvas() {
  const texts = [];
  const store = { font: '16px serif' };
  const sizeOf = font => Number((String(font).match(/(\d+(?:\.\d+)?)px/) || [0, 16])[1]);
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(store, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return s => ({ width: Array.from(String(s)).length * sizeOf(target.font) * 0.92 });
      if (key === 'fillText') return (s, x, y) => texts.push({ s: String(s), x, y, font: target.font, align: target.textAlign || 'left' });
      if (/^create.*Gradient$/.test(String(key))) return () => gradient;
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  return { width: 0, height: 0, getContext: () => ctx, texts };
}

const fieldText = (e, f) => f === 'timeline' ? e.timeline.map(t => t.text).join(' ') : String(f.split('.').reduce((o, k) => o && o[k], e) || '');

test('질문: 임진왜란·재일조선인에 2~3개씩, 나머지 사건은 기존 탐구 그대로', () => {
  assert.deepEqual(Object.keys(Q.QUESTIONS).sort(), ['imjin', 'zainichi']);
  ['imjin', 'zainichi'].forEach(id => {
    const qs = Q.questionsFor(id);
    assert.ok(qs.length >= 2 && qs.length <= 3, id);
    assert.equal(Q.hasChoices(id), true);
  });
  eventsData.filter(e => !['imjin', 'zainichi'].includes(e.id)).forEach(e => assert.equal(Q.hasChoices(e.id), false, e.id));
  assert.deepEqual(Q.questionsFor('nope'), []);
});

test('선택지 근거: 모든 선택지의 근거 낱말이 그 사건 데이터(서술·연표·이름)에 실제로 있다', () => {
  Object.keys(Q.QUESTIONS).forEach(id => {
    const e = eventsData.find(x => x.id === id);
    Q.QUESTIONS[id].forEach(q => q.options.forEach(o => {
      assert.ok(Array.isArray(o.basis) && o.basis.length, `${id}.${q.id}.${o.id} 근거 없음`);
      o.basis.forEach(b => b.terms.forEach(t => assert.ok(fieldText(e, b.field).includes(t), `${id}.${q.id}.${o.id}: ${b.field}에 '${t}' 없음`)));
    }));
  });
});

test('선택지 형식: id 규칙(DB 제약과 같음)·중복 없음·질문당 3~5개·문구 길이', () => {
  Object.keys(Q.QUESTIONS).forEach(id => {
    const qids = Q.QUESTIONS[id].map(q => q.id);
    assert.equal(new Set(qids).size, qids.length, id);
    Q.QUESTIONS[id].forEach(q => {
      assert.match(q.id, Q.ID_RE);
      assert.ok(q.prompt.length >= 10 && q.prompt.length <= 80 && /\?$/.test(q.prompt), q.id);
      assert.ok(q.options.length >= 3 && q.options.length <= 5, q.id);
      const oids = q.options.map(o => o.id);
      assert.equal(new Set(oids).size, oids.length, q.id);
      q.options.forEach(o => {
        assert.match(o.id, Q.ID_RE);
        assert.notEqual(o.id, Q.SKIP);
        assert.ok(o.label.length >= 8 && o.label.length <= 60, `${q.id}.${o.id} label`);
        assert.ok(o.card.length >= 4 && o.card.length <= 30, `${q.id}.${o.id} card`);
      });
    });
  });
});

test('중립성: 정답·점수 표현 없음, 선택지에 나라 이름으로 편 가르기 없음, 사실을 부정하는 선택지 없음', () => {
  const all = Object.values(Q.QUESTIONS).flat();
  all.forEach(q => {
    assert.doesNotMatch(q.prompt, /정답|옳은|틀린|맞는 것|점수/, q.id);
    q.options.forEach(o => {
      const txt = o.label + ' ' + o.card;
      assert.doesNotMatch(txt, /정답|옳다|틀렸|점수/, o.id);
      assert.doesNotMatch(txt, /(한국|일본|중국)(의|은|는)? ?(입장|편|시각|관점)/, `${o.id}: 나라 편 가르기`);
      assert.doesNotMatch(txt, /아니었다|없었다|과장|날조/, `${o.id}: 사실 부정`);
    });
  });
});

test('순서 돌리기: 원래 순서를 유지한 채 시작 위치만 바뀌고, 모든 선택지가 그대로 있다', () => {
  const opts = Q.questionsFor('imjin')[0].options;
  for (let k = -5; k <= 9; k++) {
    const r = Q.rotate(opts, k);
    assert.equal(r.length, opts.length);
    assert.deepEqual(r.map(o => o.id).sort(), opts.map(o => o.id).sort());
    const start = opts.indexOf(r[0]);
    r.forEach((o, i) => assert.equal(o, opts[(start + i) % opts.length]));
  }
  assert.deepEqual(Q.rotate([], 3), []);
});

test('응답 검증·정리: 없는 질문/선택지는 거부, 건너뛰기는 유효, 건너뛴 질문은 지어내지 않음', () => {
  assert.equal(Q.isValidAnswer('imjin', 'name_focus', 'many_names'), true);
  assert.equal(Q.isValidAnswer('imjin', 'name_focus', Q.SKIP), true);
  assert.equal(Q.isValidAnswer('imjin', 'name_focus', 'potters'), false);        // 다른 질문의 선택지
  assert.equal(Q.isValidAnswer('imjin', 'nope', 'many_names'), false);
  assert.equal(Q.isValidAnswer('culture', 'name_focus', 'many_names'), false);
  const s = Q.summarize('imjin', { name_focus: 'many_names', remember_scene: Q.SKIP, textbook_line: 'bogus' });
  assert.deepEqual(s.map(r => [r.questionId, r.optionId, r.skipped]), [['name_focus', 'many_names', false], ['remember_scene', null, true], ['textbook_line', null, true]]);
  assert.equal(s[0].answer, '서로 다른 이름을 함께 보여 주는 것');
  assert.equal(s[0].question, '이름에 담고 싶은 것');
  assert.ok(s.slice(1).every(r => r.answer === ''));
});

test('저장 행: 사건·질문·선택지 id만 (건너뛴 질문·문장·닉네임·키 없음)', () => {
  const rows = Q.rowsForStorage('zainichi', { start_point: 'legal_status', whose_history: Q.SKIP, remember_how: 'testimony' });
  assert.deepEqual(rows, [
    { event_key: 'zainichi', question_id: 'start_point', option_id: 'legal_status' },
    { event_key: 'zainichi', question_id: 'remember_how', option_id: 'testimony' }
  ]);
  rows.forEach(r => assert.deepEqual(Object.keys(r).sort(), ['event_key', 'option_id', 'question_id']));
  assert.deepEqual(Q.rowsForStorage('zainichi', {}), []);
  assert.deepEqual(Q.rowsForStorage('culture', { a: 'b' }), []);
});

test('집계: 질문별 응답이 5건 미만이면 비율을 숨기고, 비율 합은 1', () => {
  const rows = [
    { question_id: 'name_focus', option_id: 'many_names', n: 3 },
    { question_id: 'name_focus', option_id: 'responsibility', n: 2 },
    { question_id: 'remember_scene', option_id: 'resistance', n: 4 },
    { question_id: 'name_focus', option_id: 'unknown_option', n: 99 }     // 없는 선택지는 무시
  ];
  const sh = Q.shareOf('imjin', rows);
  assert.equal(sh.length, 3);
  assert.equal(sh[0].total, 5);
  assert.equal(sh[0].hidden, false);
  assert.ok(Math.abs(sh[0].options.reduce((s, o) => s + o.share, 0) - 1) < 1e-9);
  assert.equal(sh[0].options.find(o => o.id === 'many_names').n, 3);
  assert.equal(sh[1].hidden, true);                     // 4건
  assert.equal(sh[2].total, 0);
  assert.equal(sh[2].hidden, true);
  assert.equal(Q.shareOf('imjin', null)[0].total, 0);
});

test('카드 모델(기본 체험): 고른 관점과 직접 쓴 소감을 따로 담고, 소감을 건너뛰어도 카드가 된다', () => {
  const choices = Q.summarize('imjin', { name_focus: 'many_names', remember_scene: Q.SKIP, textbook_line: 'invasion_clear' });
  const m = Card.buildCardModel({ event: imjin, mode: 'quick', choices, after: '', flow: { viewedCompare: true }, date: new Date('2026-10-22') });
  assert.equal(m.mode, 'quick');
  assert.deepEqual(m.choices.map(c => c.answer), ['서로 다른 이름을 함께 보여 주는 것', '침략으로 시작된 전쟁이라는 사실']);
  assert.equal(m.after, '');
  assert.equal(m.before, '');
  assert.equal(m.change, null);
  assert.equal(m.fifth, null);
  assert.equal(m.ready, true);
  assert.deepEqual(m.stamps.map(s => [s.id, s.done]), [['compare', true], ['choices', true], ['reflect', false], ['shared', false]]);
  const withText = Card.buildCardModel({ event: imjin, mode: 'quick', choices: [], after: '  이름에도 시선이 담겨 있다  ' });
  assert.equal(withText.after, '이름에도 시선이 담겨 있다');
  assert.equal(withText.ready, true);
  assert.equal(withText.stamps.find(s => s.id === 'reflect').done, true);
  assert.equal(Card.buildCardModel({ event: imjin, mode: 'quick', choices: [], after: '' }).ready, false);
  // 기존(심화) 카드는 그대로: 탐구 후 문장이 있어야 하고 도장도 같음
  const classic = Card.buildCardModel({ event: imjin, after: '문장', flow: { viewedNlp: true } });
  assert.equal(classic.mode, 'classic');
  assert.deepEqual(classic.stamps.map(s => s.id), ['compare', 'nlp', 'sources', 'shared']);
  assert.equal(Card.buildCardModel({ event: imjin, choices }).ready, false);
});

test('카드 그림(기본 체험): 모든 테마 × 카드/스토리 × 소감 있음/없음/최대 길이 — 고른 관점·소감이 패널 안에, 이름이 구분됨', () => {
  const choices = Q.summarize('zainichi', { start_point: 'colonial_origin', whose_history: 'east_asia', remember_how: 'testimony' });
  const LONG = '재일조선인의 역사는 식민지 지배와 전후 일본 사회의 변화 속에서 만들어졌고 '.repeat(5).slice(0, 300);
  ['', '이 역사는 누구 한 나라의 것이 아니었다.', LONG].forEach(after => {
    const model = Card.buildCardModel({ event: zainichi, mode: 'quick', choices, after, flow: { viewedCompare: true }, date: new Date('2026-10-22') });
    Themes.ORDER.forEach(theme => ['feed', 'story'].forEach(format => {
      const cv = fakeCanvas();
      const info = Card.drawCard(cv, model, { theme, format });
      const all = cv.texts.map(t => t.s).join('\n');
      const where = `${theme}/${format}/${after.length}`;
      assert.match(all, /내가 고른 관점 · 객관식/, where);
      assert.match(all, /나의 한 줄 소감 · 직접 쓴 문장/, where);
      assert.doesNotMatch(all, /탐구 전 · 나의 첫 생각/, where);
      assert.match(all, /식민지 지배와 동원이라는 시작/, where);
      assert.match(all, /당사자의 이야기를 기록하고 듣기/, where);
      if (!after) assert.match(all, /소감은 남기지 않았어요/, where);
      else assert.match(all, /이 역사는|재일조선인의 역사는/, where);
      assert.match(all, /고른 관점과 직접 쓴 문장으로 만든 카드예요/, where);
      // 하단 안내가 본문 폭을 넘지 않음 (가장 긴 하단 문장 기준)
      const foot = cv.texts.filter(t => /만든 카드예요/.test(t.s)).sort((a, b) => b.s.length - a.s.length)[0];
      assert.ok(foot && Array.from(foot.s).length * 21 * 0.92 <= info.layout.inner.w + 1, `${where}: 하단 안내가 넘침`);
      assert.ok(info.height <= 1920 && info.width === 1080, where);
      if (format === 'story') assert.equal(info.height, 1920, where);
      const inner = info.layout.inner;
      cv.texts.filter(t => /고른 관점|소감|“/.test(t.s)).forEach(t => {
        assert.ok(t.x >= inner.x - 1 && t.y <= info.height, `${where}: ${t.s.slice(0, 12)} 패널 밖`);
      });
    }));
  });
});

test('카드 그림(기본 체험): 고른 관점이 없고 소감만 있어도 그려지고, 저장 전 불러올 글자에 선택지 문구가 들어간다', () => {
  const model = Card.buildCardModel({ event: imjin, mode: 'quick', choices: Q.summarize('imjin', {}), after: '세 나라의 기록을 함께 읽어 보니 새로웠다.' });
  const cv = fakeCanvas();
  Card.drawCard(cv, model, { format: 'feed' });
  assert.match(cv.texts.map(t => t.s).join('\n'), /고른 관점이 없어요/);
  const choiceModel = Card.buildCardModel({ event: imjin, mode: 'quick', choices: Q.summarize('imjin', { name_focus: 'many_names' }) });
  const loads = Card.fontLoads(choiceModel, { theme: 'archive' }).map(l => l.text).join('');
  Array.from('서로 다른 이름을 함께 보여 주는 것'.replace(/\s/g, '')).forEach(ch => assert.ok(loads.includes(ch), ch));
});

test('저장 모듈: 객관식은 별도 테이블에 id만 보내고, 테이블이 없으면 unavailable로 진행', async () => {
  const calls = [];
  global.db = {
    from(table) { return { insert(rows) { calls.push({ table, rows }); return Promise.resolve({ error: null }); } }; },
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve({ data: [{ question_id: 'name_focus', option_id: 'many_names', n: 7 }], error: null }); }
  };
  try {
    const ok = await Store.insertChoices([
      { event_key: 'imjin', question_id: 'name_focus', option_id: 'many_names', content: '몰래 넣은 문장' },
      { event_key: 'imjin', question_id: 'Bad Id', option_id: 'x' }
    ]);
    assert.equal(ok.ok, true);
    assert.equal(ok.count, 1);
    assert.equal(calls[0].table, 'exploration_choices');
    assert.deepEqual(calls[0].rows, [{ event_key: 'imjin', question_id: 'name_focus', option_id: 'many_names' }]);
    assert.deepEqual(await Store.insertChoices([]), { ok: true, count: 0 });
    const counts = await Store.fetchChoiceCounts('imjin');
    assert.equal(counts.available, true);
    assert.equal(counts.rows[0].n, 7);
    assert.deepEqual(calls[calls.length - 1], { rpc: 'choice_counts', args: { p_event_key: 'imjin' } });

    global.db = {
      from() { return { insert() { return Promise.resolve({ error: { code: 'PGRST205', message: "Could not find the table 'public.exploration_choices'" } }); } }; },
      rpc() { return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }); }
    };
    assert.deepEqual(await Store.insertChoices([{ event_key: 'imjin', question_id: 'name_focus', option_id: 'many_names' }]), { ok: false, unavailable: true });
    assert.deepEqual(await Store.fetchChoiceCounts('imjin'), { available: false, rows: [] });
  } finally {
    delete global.db;
  }
});

test('SQL: 추가만 하고, anon은 등록만·조회 불가, 집계는 작은 표본을 숨기며, 이름·문장·키 컬럼이 없다', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', '2026-10-exploration-choices.sql'), 'utf8');
  const code = sql.replace(/--.*$/gm, '');
  assert.match(code, /create table if not exists public\.exploration_choices/);
  assert.doesNotMatch(code, /\bdrop table\b|\btruncate\b|\bdelete from\b|alter table public\.shared_expressions/i);
  assert.match(code, /enable row level security/);
  assert.match(code, /grant insert \(event_key, question_id, option_id\) on table public\.exploration_choices to anon/);
  assert.doesNotMatch(code, /for select/i);
  assert.match(code, /check \(event_key in \('imjin', 'zainichi'\)\)/);
  assert.match(code, /\^\[a-z0-9_\]\{1,40\}\$/);
  assert.match(code, /t\.total >= public\.sm_min_group_size\(\)/);
  assert.match(code, /security definer\s+set search_path = ''/);
  assert.match(code, /grant execute on function public\.choice_counts\(text\) to anon/);
  const cols = (code.match(/create table if not exists public\.exploration_choices \(([\s\S]*?)\);/) || [])[1] || '';
  assert.doesNotMatch(cols, /author|content|reason|participant|age_group|voter|ip/i);
  // 사이트의 질문 id·사건이 SQL 제약과 맞는지
  Object.keys(Q.QUESTIONS).forEach(id => assert.match(code, new RegExp(`'${id}'`)));
});

test('index.html: 첫 화면에 두 사건 큰 카드, 객관식·소감 단계, 스크립트 순서', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /data-quick-event="imjin"/);
  assert.match(html, /data-quick-event="zainichi"/);
  assert.match(html, /id="choiceStep"/);
  assert.match(html, /id="reflectStep"/);
  assert.doesNotMatch(html, /data-reflect-skip/);                      // 소감 건너뛰기는 카드 버튼 하나로 (중복 버튼 없음)
  assert.match(html, /id="choiceShareConsent"/);
  assert.doesNotMatch(html, /id="choiceShareConsent"[^>]*checked/);      // 기본은 보내지 않음
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.indexOf('./choice-questions.js') >= 0 && srcs.indexOf('./choice-questions.js') < srcs.indexOf('./script.js'));
});
