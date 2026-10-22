/* 4단계 탐구 경험 · 첫 화면 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/explore-steps.e2e.js   (전체: npm run test:e2e)
   첫 화면 3초 안 핵심 메시지·시작 버튼 · QR 진입 STEP 1/4 · 단계마다 주요 버튼 하나 · 미완료 안내 ·
   이전 단계 이동 시 입력 유지 · 형광펜은 실제 NLP 계산 표현에만 · 결과 카드까지 끊김 없는 흐름 · 터치 영역 · 대비 */
'use strict';
const { run } = require('./harness');

const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const step = page => page.$eval('.page--detail', el => el.dataset.step);
/** 지금 보이는 주요 행동 버튼 (화면 아래 고정 영역) */
const visibleMains = page => page.$$eval('#stepCta [data-step-main]', els => els.filter(b => !b.hidden && b.offsetParent !== null).map(b => b.textContent.trim()));
const inViewport = (page, sel) => page.$eval(sel, el => {
  const r = el.getBoundingClientRect();
  return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.width > 0;   // 1px: 소수점 반올림 여유
});

/* WCAG 대비 계산 (style.css의 색 그대로) */
function lum(hex) {
  const c = hex.replace('#', '').match(/../g).map(h => parseInt(h, 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

run('explore-steps', async ({ browser, base, check, mockPage }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let page = await mockPage(mobile);

  /* ---------- 1. 첫 화면: 3초 안에 핵심 카피·시작 버튼 ---------- */
  await page.goto(base + 'index.html');
  await page.waitForTimeout(1000);
  const hero = await page.evaluate(() => {
    const t = document.querySelector('.hero__title');
    // 기본 체험: 첫 화면의 주요 시작 버튼은 큰 사건 카드 두 개입니다 (아래쪽 카드 기준으로 재요).
    const picks = [...document.querySelectorAll('.quick-pick')];
    const b = picks[picks.length - 1];
    const op = el => Number(getComputedStyle(el).opacity);
    const r = b.getBoundingClientRect();
    return { title: t.innerText.replace(/\s+/g, ' '), titleOp: Math.min(...[...t.querySelectorAll('.hero__title-line')].map(op)), btnOp: Math.min(...picks.map(op)), btnBottom: r.bottom, btnH: Math.min(...picks.map(p => p.getBoundingClientRect().height)), vh: window.innerHeight };
  });
  check('첫 화면 메인 카피: 같은 전쟁, 세 개의 이름 · 우리는 정말 같은 역사를 기억하고 있을까?', /같은 전쟁, 세 개의 이름\. 우리는 정말 같은 역사를 기억하고 있을까\?/.test(hero.title), hero.title);
  const heroNames = await page.$$eval('.hero-names__item span', els => els.map(e => e.textContent.trim()));
  check('첫 화면에 같은 전쟁의 세 이름과 AI', heroNames.join('|') === '임진왜란|文禄・慶長の役|万历朝鲜战争|?', heroNames.join('|'));
  const picks = await page.$$eval('.quick-pick', els => els.map(e => [e.dataset.quickEvent, e.querySelector('.quick-pick__title').textContent.trim()].join(':')));
  check('시작 버튼: 임진왜란·재일조선인 큰 사건 카드 두 개', picks.join('|') === 'imjin:임진왜란|zainichi:재일조선인', picks.join('|'));
  check('1초 안에 제목·시작 버튼이 완전히 보임 (긴 등장 지연 없음)', hero.titleOp === 1 && hero.btnOp === 1, JSON.stringify(hero));
  check('모바일 첫 화면(스크롤 없이)에 시작 버튼', hero.btnBottom <= hero.vh, JSON.stringify(hero));
  check('시작 버튼 터치 영역 48px 이상', hero.btnH >= 48, String(hero.btnH));
  check('첫 화면에 Memory Card 미리보기가 "예시"로 표시', /예시/.test(await page.$eval('.hero-card', el => el.innerText)));
  check('첫 화면 4단계 이름이 사건 화면 단계와 같음', (await page.$$eval('.hero__steps--v2 li', els => els.length)) === 4);
  check('모바일 첫 화면: 가로 스크롤 없음', await noHScroll(page));

  /* ---------- 2. 사건 목록(전체 탐구)으로 진입 → 심화 탐구 STEP 1/4 ----------
     (QR 링크·첫 화면 큰 카드는 기본 체험으로 열립니다 → tests/e2e/quick-experience.e2e.js) */
  await page.goto(base + 'index.html');
  await page.evaluate(() => openEventDetail('imjin'));
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(500);
  check('사건 목록 진입 시 STEP 1/4 표시', /STEP\s*1\s*\/\s*4/.test(await page.$eval('#flowProgress .stepper__count', el => el.innerText)) && (await step(page)) === '1');
  check('STEP 1: 질문·입력창·주요 버튼이 첫 화면 안에 보임',
    await inViewport(page, '.detail__question') && await inViewport(page, '#beforeInput') && await inViewport(page, '#stepCta [data-step-main="1"]'));
  check('STEP 1: 탭·서술은 아직 숨김 (한 가지 행동에 집중)', !(await page.isVisible('.tabs')) && !(await page.isVisible('#narrativesGrid')));
  check('STEP 1: 주요 버튼 하나만 보임 · 이전 버튼 없음', (await visibleMains(page)).length === 1 && !(await page.isVisible('[data-step-back]')));
  check('진행 표시: 지금 단계 aria-current', await page.$eval('#flowProgress [aria-current="step"]', el => el.dataset.stepGoto) === '1');

  // 미완료 입력: 막지 않고 이유를 알려줌
  await page.click('#stepCta [data-step-main="1"]');
  check('빈 칸으로 누르면 넘어가지 않고 버튼 위에 이유 안내', (await step(page)) === '1' && /아직 한 문장을 적지 않았어요/.test(await page.$eval('#stepCtaHint', el => el.textContent)) &&
    await page.isVisible('#stepCtaHint'));
  check('안내 후 버튼 문구가 "적지 않고 …"로 바뀜', /적지 않고/.test((await visibleMains(page))[0] || ''));
  const BEFORE = '일본과 조선이 싸운 전쟁';
  await page.fill('#beforeInput', BEFORE);
  await page.click('#stepCta [data-step-main="1"]');
  await page.waitForTimeout(400);
  check('저장하면 STEP 2로 자연스럽게 이동', (await step(page)) === '2' && await page.isVisible('#narrativesGrid'));
  check('STEP 1 완료 표시 (✓)', await page.$eval('#flowProgress .flow-progress__step:nth-child(1)', el => el.classList.contains('is-done')));

  /* ---------- 3. STEP 2: 형광펜은 실제 계산된 표현에만 ---------- */
  const marks = await page.evaluate(() => {
    const g = computeGlance(eventNlp);
    const allowed = new Set(g.common.concat(...['korea', 'japan', 'china'].map(k => g.distinct[k])));
    const list = [...document.querySelectorAll('#narrativesGrid mark.hl')].map(m => ({ term: (m.title.match(/: (.+) \(NLP 계산\)$/) || [])[1], text: m.firstChild.textContent }));
    return { n: list.length, ok: list.every(m => allowed.has(m.term) && m.text.includes(m.term.slice(0, 1))), perCard: [...document.querySelectorAll('.narrative-card')].map(c => c.querySelectorAll('mark.hl').length) };
  });
  check('형광펜: 모든 강조가 NLP 계산 결과(공통·특징 표현)에서 옴', marks.n > 0 && marks.ok, JSON.stringify(marks));
  check('형광펜: 선택적 강조 (서술마다 4개 이하)', marks.perCard.every(n => n <= 4), JSON.stringify(marks.perCard));
  check('형광펜 범례에 "자동 계산(NLP)" 안내', /자동 계산\(NLP\)/.test(await page.$eval('#hlLegend', el => el.textContent)));
  const sum = await page.$$eval('#compareSummary .sum-card', els => els.map(e => e.className));
  check('공통점·차이점 카드: 이름 · 공통 · 국가별 3개', sum.length === 5 && sum.some(c => /common/.test(c)) && sum.some(c => /names/.test(c)), sum.join(' | '));
  check('편집자 해설은 접어 둠 (자세히 보기)', (await page.$$eval('.narrative-card__more:not([open])', els => els.length)) === 3);
  check('STEP 2: 주요 버튼 하나 + 이전 버튼', (await visibleMains(page)).length === 1 && await page.isVisible('[data-step-back]'));

  /* ---------- 4. STEP 3 · 이전 단계 이동 시 입력 유지 ---------- */
  await page.click('#stepCta [data-step-main="2"]');
  await page.waitForTimeout(300);
  check('STEP 3: 핵심 질문 표시 · 탐구 전 문장 다시 보기', (await step(page)) === '3' && /어떻게 기억하고/.test(await page.$eval('[data-tab-content="shared"] .step-head__q', el => el.textContent)) &&
    (await page.$eval('#afterRecall', el => el.textContent)).includes(BEFORE));
  await page.click('#makeCardButton');
  check('문장 없이 카드를 만들면 버튼 위에 이유 안내 · 입력창으로 초점', /나의 최종 표현/.test(await page.$eval('#cardStatus', el => el.textContent)) &&
    await page.isVisible('#cardStatus') && await page.evaluate(() => document.activeElement.id === 'userNarrative'));
  const AFTER = '같은 전쟁이지만 세 나라는 서로 다른 이름과 기억으로 남겼다.';
  await page.fill('#userNarrative', AFTER);
  await page.click('[data-discovery-step="names"]');
  check('STEP 3에서 발견한 관점 선택', await page.$eval('[data-discovery-step="names"]', el => el.getAttribute('aria-pressed') === 'true'));
  const area = await page.evaluate(() => {
    const t = document.getElementById('userNarrative'); t.focus(); t.scrollIntoView({ block: 'end' });
    return { bottom: t.getBoundingClientRect().bottom, ctaTop: document.getElementById('stepCta').getBoundingClientRect().top };
  });
  await page.waitForTimeout(300);
  const area2 = await page.evaluate(() => ({ bottom: document.getElementById('userNarrative').getBoundingClientRect().bottom, ctaTop: document.getElementById('stepCta').getBoundingClientRect().top }));
  check('입력창으로 스크롤해도 하단 버튼이 입력창을 가리지 않음 (scroll-padding)', area2.bottom <= area2.ctaTop + 1, JSON.stringify({ area, area2 }));

  await page.click('[data-step-back]');
  await page.waitForTimeout(200);
  check('이전 → STEP 2', (await step(page)) === '2');
  await page.click('[data-step-back]');
  await page.waitForTimeout(400);
  check('이전 → STEP 1: 저장한 탐구 전 문장 그대로', (await step(page)) === '1' && (await page.$eval('#beforeCard', el => el.innerText)).includes(BEFORE));
  await page.click('#flowProgress [data-step-goto="3"]');
  check('다시 STEP 3: 작성 중 문장·선택한 관점 유지', (await page.inputValue('#userNarrative')) === AFTER &&
    await page.$eval('[data-discovery-step="names"]', el => el.getAttribute('aria-pressed') === 'true'));

  /* ---------- 5. STEP 4: 결과 카드까지 ---------- */
  await page.click('#makeCardButton');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => window.scrollY === 0);     // 화면 맨 위로 부드럽게 이동이 끝날 때까지
  check('카드 화면 STEP 4/4 표시', /STEP\s*4\s*\/\s*4/.test(await page.$eval('#cardProgress .stepper__count', el => el.innerText)));
  check('카드에 탐구 전·후 문장과 STEP 3에서 고른 관점', (await page.$eval('.memory-card__quote--before', el => el.textContent)) === `“${BEFORE}”` &&
    (await page.$eval('.memory-card__quote--after', el => el.textContent)) === `“${AFTER}”` &&
    /부르는 이름이 다르다/.test(await page.$eval('.memory-card__list', el => el.textContent)));
  check('카드 화면 주요 버튼(이미지로 저장)이 첫 화면 안에 보임', await inViewport(page, '[data-card-action="png"]'));
  check('카드 화면 다듬기에도 같은 선택 반영', await page.$eval('[data-discovery="names"]', el => el.getAttribute('aria-pressed') === 'true'));
  await page.click('#cardProgress [data-step-goto="3"]');
  await page.waitForSelector('.page--detail.active');
  check('카드 화면 진행 표시로 STEP 3에 돌아가 고칠 수 있음 (문장 유지)', (await step(page)) === '3' && (await page.inputValue('#userNarrative')) === AFTER);
  check('카드 없이 공개 등록 0건 (서버 저장 없음)', (await page.evaluate(() => window.__mockDb.read().shared_expressions.length)) === 0);

  /* ---------- 6. 터치 영역 · 가로 넘침 · 대비 · 오류 ---------- */
  const small = await page.evaluate(() => [...document.querySelectorAll('#stepCta button:not([hidden]), #flowProgress .flow-progress__step button')]
    .filter(b => b.offsetParent !== null).map(b => b.getBoundingClientRect().height).filter(h => h < 40));
  check('주요·단계 버튼 터치 높이 40px 이상', small.length === 0, JSON.stringify(small));
  for (const s of ['1', '2', '3']) {
    await page.click(`#flowProgress [data-step-goto="${s}"]`);
    await page.waitForTimeout(150);
    if (!(await noHScroll(page))) check(`STEP ${s} 가로 넘침 없음`, false);
  }
  check('모든 단계: 가로 넘침 없음', await noHScroll(page));
  const mute = (require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'style.css'), 'utf8').match(/--ink-mute:\s*(#[0-9a-f]{6})/i) || [])[1];
  check('색 대비: 보조 회색(--ink-mute)/한지 ≥ 4.5 (작은 안내 글씨)', mute && contrast(mute, '#f5f1e8') >= 4.5, `${mute} ${mute && contrast(mute, '#f5f1e8').toFixed(2)}`);
  check('색 대비: 본문 먹색/한지 ≥ 7, 흰 글자/강조색 버튼 ≥ 4.5, 강조색 글자/한지 ≥ 4.5, 흰 글자/금색 국기 ≥ 3',
    contrast('#1a1a1a', '#f5f1e8') >= 7 && contrast('#ffffff', '#8b3a3a') >= 4.5 && contrast('#8b3a3a', '#f5f1e8') >= 4.5 && contrast('#ffffff', '#a87c0b') >= 3,
    [contrast('#1a1a1a', '#f5f1e8'), contrast('#ffffff', '#8b3a3a'), contrast('#8b3a3a', '#f5f1e8'), contrast('#ffffff', '#a87c0b')].map(v => v.toFixed(2)).join(','));
  check('모바일 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await mobile.close();

  /* ---------- 7. 키보드만으로: 첫 화면 → 시작 ---------- */
  const desk = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  page = await mockPage(desk);
  await page.goto(base + 'index.html');
  await page.focus('#startButton');
  await page.keyboard.press('Enter');
  check('키보드(Enter)로 시작 → 연령대 선택이 열리고 첫 칩에 초점', await page.isVisible('#agePicker') &&
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('[data-age-value]'), null, { timeout: 2000 }).then(() => true, () => false));
  check('데스크톱 첫 화면: 카드 미리보기가 시작 버튼 옆(첫 화면 안)에 보임', await inViewport(page, '.hero-card__paper') && await inViewport(page, '.quick-pick--zainichi'));
  await page.evaluate(() => openEventDetail('zainichi'));
  await page.waitForSelector('.page--detail.active');
  await page.focus('#beforeInput');
  await page.keyboard.type('재일 한국인');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('키보드: 입력 후 Enter로 저장하고 STEP 2', (await step(page)) === '2');
  check('데스크톱 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await desk.close();
});
