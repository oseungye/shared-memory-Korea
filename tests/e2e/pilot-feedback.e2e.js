/* 11/11 시연 피드백 반영 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/pilot-feedback.e2e.js   (전체: npm run test:e2e)
   · 작성 언어 칩이 '한 한국어'·'中 中文'처럼 두 번 보이지 않음 (카드 화면 입구 · Shared Archive · 번역 보기)
   · 좁은 화면 1단계: 세 나라 서술 제목을 한 줄에 나란히(누르면 그 카드로 이동) · 넓은 화면에서는 숨김
   · 카드 화면 '이어서 해 보기': 다른 사람들이 남긴 문장으로 이동 · 심화 탐구(2단계)로 이동 */
'use strict';
const { run } = require('./harness');

const SEED = [
  ['imjin', '한국어로 쓴 공개 문장입니다', 'ko', 2],
  ['imjin', '日本語で書いた公開の文です', 'ja', 0],
  ['imjin', '用中文写的公开句子', 'zh', 0],
  ['imjin', 'English public sentence', 'en', 0],
  ['imjin', '언어를 알 수 없는 문장', 'xx', 0]
];
const DUP = /^(한|中|日|EN|\?)\s/;

async function seed(page) {
  await page.evaluate(rows => {
    const raw = window.__mockDb.read();
    rows.forEach((r, i) => {
      const id = 950 + i;
      raw.shared_expressions.push({ id, event_key: r[0], author_name: '익명', country_code: r[2], content: r[1], reason: '',
        created_at: new Date(Date.now() - (i + 1) * 60000).toISOString(), is_hidden: false });
      for (let k = 0; k < r[3]; k++) raw.expression_empathy.push({ expression_id: id, voter_key: 'seed-voter-' + k });
    });
    sessionStorage.setItem('__mock_db', JSON.stringify(raw));
  }, SEED);
}

async function quickToCard(page, base) {
  await page.goto(base + 'index.html#/e/imjin');
  await page.waitForSelector('.page--detail.active');
  if (await page.isVisible('#participantGate')) await page.click('[data-gate-choice="continue"]');
  await page.click('[data-step-main="q1"]');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(350);
    if (await page.$eval('.page--detail', el => el.dataset.step) === '3') break;
    await page.click('#choiceStep [data-choice-option]');
    await page.click('[data-step-main="q2"]');
  }
  await page.fill('#reflectInput', '이름 하나에도 보는 눈이 담겨 있다.');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => { const b = document.getElementById('archiveEntry'); return b && !b.hidden && !/불러오는 중/.test(b.textContent); });
}

run('pilot-feedback', async ({ browser, base, check, mockPage }) => {
  for (const vp of [{ width: 390, height: 844, n: '휴대폰', mob: true }, { width: 1280, height: 860, n: 'PC' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mob, hasTouch: !!vp.mob });
    const page = await mockPage(ctx);
    await page.goto(base + 'index.html');
    await seed(page);

    /* 1단계: 세 나라 제목 한눈에 */
    await page.goto(base + 'index.html#/e/imjin');
    await page.waitForSelector('.page--detail.active');
    if (await page.isVisible('#participantGate')) await page.click('[data-gate-choice="continue"]');
    const heads = await page.$$eval('#threeHeads .three-heads__title', els => els.map(e => e.textContent.trim()));
    check(`${vp.n}: 세 나라 제목 3개가 실제 서술 제목과 같음`, heads.length === 3 && await page.evaluate(h =>
      h[0] === eventsData.find(e => e.id === 'imjin').korea.title && h[2] === eventsData.find(e => e.id === 'imjin').china.title, heads), heads.join(' / '));
    check(`${vp.n}: 제목 줄은 ${vp.mob ? '좁은 화면에서만 보임' : '넓은 화면에서 숨김'}`, (await page.isVisible('#threeHeads')) === !!vp.mob);
    if (vp.mob) {
      await page.click('[data-scroll-narrative="china"]');
      await page.waitForTimeout(700);
      const top = await page.$eval('#narrative-china', e => e.getBoundingClientRect().top);
      check('휴대폰: 제목을 누르면 그 나라 카드로 이동', top > -5 && top < 200, String(top));
      check('휴대폰: 1단계 가로 넘침 없음', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    }

    /* 카드 화면: 이어서 해 보기 · 언어 칩 */
    await quickToCard(page, base);
    check(`${vp.n}: 카드 화면에 '이어서 해 보기'가 보임`, await page.isVisible('#cardNext'));
    await page.click('#cardNext [data-card-action="others"]');
    await page.waitForTimeout(800);
    const et = await page.$eval('#archiveEntry', e => e.getBoundingClientRect().top);
    check(`${vp.n}: '다른 사람들이 남긴 문장 보기'로 그 칸이 화면에 들어옴`, et > -5 && et < vp.height * 0.6, String(et));
    check(`${vp.n}: 카드 화면 가로 넘침 없음`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    await page.click('#cardNext [data-card-action="deep"]');
    await page.waitForSelector('.page--detail.active');
    await page.waitForTimeout(300);
    const md = await page.$eval('.page--detail', e => `${e.dataset.mode}/${e.dataset.step}`);
    check(`${vp.n}: '심화 탐구' 버튼 → 심화 탐구 2단계`, md === 'deep/2', md);

    await page.evaluate(() => openArchive('imjin'));
    await page.waitForFunction(() => document.querySelectorAll('#archiveList .shared-item').length > 0);
    const chips = await page.$$eval('#archiveList .lang-chip', els => els.map(e => e.textContent.trim()));
    check(`${vp.n}: Shared Archive 언어 표시가 한 번씩만 (${chips.join(', ')})`,
      chips.length >= 5 && chips.every(t => !DUP.test(t)) && ['한국어', '日本語', '中文', 'English', '미식별'].every(l => chips.includes(l)));
    const anyDup = await page.evaluate(re => [...document.querySelectorAll('.narrative-card__keyword')].some(e => new RegExp(re).test(e.textContent.trim())), DUP.source);
    check(`${vp.n}: 화면 어디에도 '한 한국어' 형태의 칩이 없음`, !anyDup);
    check(`${vp.n}: Shared Archive 가로 넘침 없음`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`${vp.n}: 페이지 오류 없음`, page.__errors.length === 0, page.__errors.join(' | '));
    await ctx.close();
  }
});
