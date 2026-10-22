/* My Memory Card 아트 컬렉션 테마 · 인스타 스토리 배치 테스트 — 실행: npm test
   Canvas가 없는 Node에서는 그리기 명령을 기록하는 가짜 2D 컨텍스트로 배치(글자 위치)를 확인합니다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Themes = require('../card-themes.js');
const Card = require('../memory-card.js');
const eventsData = require('../events-data.js');

const ROOT = path.join(__dirname, '..');
const imjin = eventsData.find(e => e.id === 'imjin');

/** 그리기 명령을 기록하는 가짜 캔버스. 글자 폭 = 글자 수 × 글자 크기 × 0.92 (한글 기준 넉넉하게) */
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

function model(after, before, extra) {
  return Card.buildCardModel(Object.assign({
    event: imjin,
    before,
    after,
    discoveries: ['같은 사건을 부르는 이름이 다르다'],
    question: '일본 교과서에는 실제로 어떻게 쓰여 있을까?',
    change: { addedConcepts: ['기억', '이름'], added: ['차이'], keptConcepts: ['전쟁'], kept: [] },
    flow: { viewedCompare: true },
    date: new Date('2026-10-20')
  }, extra));
}

const SHORT = '같은 전쟁을 세 나라는 서로 다른 이름과 기억으로 남겼다.';
const LONG = ('임진왜란은 동아시아 세 나라가 모두 관여한 국제 전쟁이었고 많은 사람이 피해를 입었다. ').repeat(14).trim().slice(0, 1000);

test('테마: 5종 (고문서 기본 · 민화 · 우키요에 · 청록산수 · 기본 카드), 고문서가 첫 번째', () => {
  assert.equal(Themes.DEFAULT_THEME, 'archive');
  assert.deepEqual(Themes.ORDER, ['archive', 'minhwa', 'ukiyoe', 'sansu', 'classic']);
  Themes.list().forEach(t => {
    assert.ok(t.name && t.sub, t.id);
    ['bg', 'paper', 'ink', 'soft', 'mute', 'line', 'accent', 'onAccent'].forEach(k => assert.match(t.colors[k], /^#[0-9a-f]{6}$/i, `${t.id}.${k}`));
    assert.ok(t.feed.top >= 28 && t.feed.bottom >= 28 && t.feed.side >= 28, t.id);
    ['paint', 'panel', 'overlay'].forEach(fn => assert.equal(typeof t[fn], 'function', `${t.id}.${fn}`));
    if (t.id !== 'classic') assert.ok(t.inspiration.length > 10, `${t.id}: 영감 출처 문구`);
  });
  assert.equal(Themes.getTheme('nope').id, 'archive', '없는 테마는 기본값');
});

test('테마: 문장이 주인공 — 종이 위 글자 대비 WCAG AA 이상 (본문 7:1, 작은 글자·강조 4.5:1)', () => {
  Themes.list().forEach(t => {
    const C = t.colors;
    assert.ok(Themes.contrast(C.ink, C.paper) >= 7, `${t.id} ink ${Themes.contrast(C.ink, C.paper).toFixed(2)}`);
    ['soft', 'mute', 'accent'].forEach(k => assert.ok(Themes.contrast(C[k], C.paper) >= 4.5, `${t.id} ${k} ${Themes.contrast(C[k], C.paper).toFixed(2)}`));
    assert.ok(Themes.contrast(C.onAccent, C.accent) >= 4.5, `${t.id} 도장 글자`);
    assert.ok(Themes.contrast(C.onAccent, C.seal || C.accent) >= 4.5, `${t.id} 인장 글자`);
  });
});

test('스토리: 패널(글자 영역)은 인스타그램 화면 요소에 가려지는 위·아래를 피한다', () => {
  Themes.list().forEach(t => {
    const p = Themes.storyPanel(t);
    assert.ok(p.y >= Themes.STORY_SAFE.top, `${t.id} 위 ${p.y}`);
    assert.ok(p.y + p.h <= Themes.STORY_SAFE.bottom, `${t.id} 아래 ${p.y + p.h}`);
    assert.ok(p.x >= 40 && p.x + p.w <= 1040, `${t.id} 좌우`);
  });
});

test('그리기: 모든 테마 × 형식에서 오류 없이 크기 규칙을 지킨다 (짧은 문장 · 최대 길이)', () => {
  for (const t of Themes.ORDER) {
    for (const format of ['feed', 'story']) {
      for (const [after, before] of [[SHORT, '일본이 조선을 침략한 전쟁'], [LONG, '탐구 전 '.repeat(120)], [SHORT, '']]) {
        const cv = fakeCanvas();
        const info = Card.drawCard(cv, model(after, before), { theme: t, format });
        assert.equal(info.theme, t);
        assert.equal(info.format, format);
        assert.equal(info.width, 1080);
        if (format === 'story') assert.equal(info.height, 1920);
        else assert.ok(info.height >= 1350 && info.height <= 1920, `${t} feed ${info.height}`);
        assert.equal(cv.width, info.width);
        assert.equal(cv.height, info.height);
        if (after === LONG) assert.equal(info.truncated, true, `${t} ${format}: 긴 문장은 생략 표시`);
      }
    }
  }
});

test('그리기: 탐구 후 문장 전체가 패널 안에 그려진다 (스토리는 인스타 안전 영역 안)', () => {
  for (const t of Themes.ORDER) {
    for (const format of ['feed', 'story']) {
      const cv = fakeCanvas();
      const info = Card.drawCard(cv, model(SHORT, '일본이 조선을 침략한 전쟁'), { theme: t, format });
      assert.equal(info.truncated, false);
      const P = info.layout.panel;
      // 탐구 후 문장 줄: 첫 줄은 “로 시작, 마지막 줄은 ”로 끝남 — 이어 붙이면 원문과 같아야 함
      const start = cv.texts.findIndex(x => x.s.startsWith('“같은 전쟁'));
      assert.ok(start >= 0, `${t} ${format}: 문장 첫 줄`);
      const lines = [];
      for (let k = start; k < cv.texts.length; k++) { lines.push(cv.texts[k]); if (cv.texts[k].s.endsWith('”')) break; }
      assert.equal(lines.map(l => l.s).join(' ').replace(/\s+/g, ' '), `“${SHORT}”`.replace(/\s+/g, ' '));
      lines.forEach(l => {
        assert.ok(l.x >= P.x + 40 && l.y > P.y && l.y < P.y + P.h, `${t} ${format}: 줄 위치 (${l.x}, ${l.y})`);
        if (format === 'story') assert.ok(l.y > Themes.STORY_SAFE.top && l.y < Themes.STORY_SAFE.bottom);
      });
      if (format === 'story') assert.ok(info.layout.afterSize >= 50, `${t}: 짧은 문장은 크게 (${info.layout.afterSize}px)`);
    }
  }
});

test('스토리: 글자 크기 맞추기 — 들어가는 가장 큰 크기, 안 들어가면 가장 작은 크기로 줄 수 제한', () => {
  const measureAt = s => str => Array.from(str).length * s;
  const big = Card.storyFit('짧은 문장', 900, 600, measureAt);
  assert.equal(big.size, 76);
  assert.equal(big.truncated, false);
  const mid = Card.storyFit('가'.repeat(60), 900, 400, measureAt);
  assert.ok(mid.size < 76 && mid.lines.length * mid.lineH <= 400 && !mid.truncated, JSON.stringify(mid));
  const tiny = Card.storyFit('가'.repeat(2000), 900, 300, measureAt);
  assert.equal(tiny.size, 34);
  assert.equal(tiny.truncated, true);
  assert.ok(tiny.lines.length * tiny.lineH <= 300);
});

test('그림은 시드로 고정: 같은 사건·테마면 같은 그림', () => {
  const a = Themes.rng('imjin:archive:story'), b = Themes.rng('imjin:archive:story'), c = Themes.rng('tribute:archive:story');
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('저작권: 장식은 코드로 직접 그린 창작 그림 — 외부 이미지·텍스처 파일을 불러오지 않는다', () => {
  for (const f of ['card-themes.js', 'memory-card.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/drawImage|new Image\(|https?:\/\/|url\(|\.(png|jpe?g|webp|svg)\b/i.test(src), `${f}: 외부 이미지 참조 없음`);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('card-themes.js') > 0 && html.indexOf('card-themes.js') < html.indexOf('memory-card.js'), 'card-themes.js를 memory-card.js보다 먼저 불러옴');
});

/* ---------- 서체 (타이포그래피) ---------- */

const familyNames = stack => (String(stack).match(/'([^']+)'/g) || []).map(x => x.slice(1, -1));

test('서체: 테마별 조합 — 제목·문장은 Noto Serif KR / 고운바탕, 장식 한자는 테마에 맞는 서체', () => {
  const first = f => familyNames(f.family)[0];
  const expect = {
    archive: ['Noto Serif KR', 'Gowun Batang', 'Noto Serif KR'],
    minhwa: ['Gowun Batang', 'Gowun Batang', 'Noto Serif KR'],
    ukiyoe: ['Noto Serif KR', 'Noto Serif KR', 'Zen Old Mincho'],
    sansu: ['Noto Serif KR', 'Gowun Batang', 'Noto Serif SC'],
    classic: ['Noto Serif KR', 'Noto Serif KR', 'Noto Serif KR']
  };
  Themes.ORDER.forEach(id => {
    const f = Themes.fontsOf(id);
    assert.deepEqual([first(f.title), first(f.quote), first(f.ornament)], expect[id], id);
    assert.equal(first(f.ui), 'Pretendard Variable');
    assert.equal(first(f.latin), 'Cormorant Garamond');
    // 불러오지 못해도 그려지도록 모든 서체 묶음은 일반 서체(serif/sans-serif)로 끝남
    [f.title, f.quote, f.ui, f.latin, f.ornament].forEach(x => assert.match(x.family, /(sans-serif|serif)\s*$/));
  });
});

test('서체: 카드 그림에 쓰는 서체는 모두 페이지가 공식 배포처에서 불러온다 (굵기 포함)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const gf = (html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/) || [''])[0];
  const googleWeights = {};
  gf.replace(/family=([^:&]+):(?:ital,)?wght@([^&]+)/g, (_, fam, w) => { googleWeights[decodeURIComponent(fam.replace(/\+/g, ' '))] = w.split(';').map(x => Number(x.split(',').pop())); });
  assert.ok(/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard@v[\d.]+\/dist\/web\/variable\/pretendardvariable-dynamic-subset\.min\.css/.test(html), 'Pretendard 공식 배포본');
  assert.ok(/font-family: 'MaruBuri'[\s\S]*?hangeul\.pstatic\.net\/hangeul_static\/webfont\/MaruBuri\/MaruBuri-Bold\.woff2/.test(css), '마루부리 공식 웹폰트');
  assert.ok(!/Noto\+Sans\+KR/.test(gf), 'Noto Sans KR은 Pretendard로 대체 (내려받는 파일 줄임)');
  Themes.ORDER.forEach(id => {
    const f = Themes.fontsOf(id);
    [[f.title, f.title.weight], [f.quote, f.quote.weight], [f.ornament, f.ornament.max]].forEach(([x, w]) => {
      const name = familyNames(x.family)[0];
      assert.ok(googleWeights[name], `${id}: ${name}를 Google Fonts에서 불러옴`);
      assert.ok(googleWeights[name].includes(w), `${id}: ${name} ${w} 굵기를 불러옴 (${googleWeights[name]})`);
    });
  });
  assert.ok(/display=swap/.test(gf), '글꼴을 기다리는 동안 글자를 숨기지 않음 (display=swap)');
});

test('서체: 저장 전 불러올 목록에 테마 서체와 실제로 그릴 글자(탐구 전·후 문장)가 모두 들어간다', () => {
  const m = model('같은 전쟁을 세 나라는 다르게 기억했다', '일본이 침략한 전쟁');
  Themes.ORDER.forEach(id => {
    const loads = Card.fontLoads(m, { theme: id, format: 'story' });
    const f = Themes.fontsOf(id);
    const families = loads.map(l => familyNames(l.font)[0]);
    [f.title, f.quote, f.ui, f.latin, f.ornament].forEach(x => assert.ok(families.includes(familyNames(x.family)[0]), `${id}: ${x.family}`));
    const quoteText = loads.filter(l => l.font.startsWith(`${f.quote.weight} `) && l.font.includes(f.quote.family)).map(l => l.text).join('');
    for (const ch of '같은전쟁세나라다르게기억했일본침략') assert.ok(quoteText.includes(ch), `${id}: '${ch}'`);
    loads.forEach(l => assert.ok(l.text.length > 0 && !/\s/.test(l.text), '빈 글자·공백 없음'));
  });
});

test('서체: 카드 이미지의 탐구 후 문장은 테마의 문장 서체로 그려진다', () => {
  Themes.ORDER.forEach(id => {
    for (const format of ['feed', 'story']) {
      const cv = fakeCanvas();
      Card.drawCard(cv, model(SHORT, '처음 생각'), { theme: id, format });
      const line = cv.texts.find(x => x.s.startsWith('“같은 전쟁'));
      assert.ok(line.font.includes(Themes.fontsOf(id).quote.family), `${id} ${format}: ${line.font}`);
      const title = cv.texts.find(x => x.s === imjin.title);
      assert.ok(title && title.font.includes(Themes.fontsOf(id).title.family), `${id} ${format}: 제목 서체`);
    }
  });
});
