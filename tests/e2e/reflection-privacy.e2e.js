/* 자유 입력 개인정보 확인 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/reflection-privacy.e2e.js   (전체: npm run test:e2e)
   기본 체험 3단계 '내 생각'에 전화번호·이름 등이 있으면 기록(저장·참여 기록·카드) 전에 막고(서버 0건), 지우면 그대로 진행.
   공동 표현 공개 등록 때 함께 공개되는 탐구 전 문장의 연락처도 막는지 확인합니다. */
'use strict';
const { run } = require('./harness');

run('reflection-privacy', async ({ browser, base, check, mockPage, presetContinue }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await mockPage(ctx);
  await page.goto(base + 'index.html#/e/imjin');
  await page.waitForSelector('.page--detail.active');
  await page.click('[data-step-main="q1"]');
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(300);
    await page.click('#choiceStep [data-choice-option]');
    await page.click('[data-step-main="q2"]');
  }
  await page.waitForFunction(() => document.querySelector('.page--detail').dataset.step === '3');
  check('내 생각 칸 아래 안내: 이름·학교·연락처는 쓰지 말 것', /이름·학교·연락처는 쓰지 마세요/.test(await page.textContent('#reflectHint')));

  const saved = () => page.evaluate(() => {
    const d = window.__mockDb.read();
    return { choices: (d.exploration_choices || []).length, reflections: (d.exploration_reflections || []).map(r => r.content), pings: (d.participation_pings || []).length };
  });

  await page.fill('#reflectInput', '제 이름은 홍길동이고 010-1234-5678 입니다');
  await page.click('[data-step-main="q3"]');
  await page.waitForTimeout(600);
  const msg = await page.$eval('#cardStatus', el => el.textContent);
  check('연락처·이름이 있으면 카드를 만들지 않고 안내', /나를 알아볼 수 있는 내용은 지운 뒤/.test(msg) && !(await page.isVisible('.page--card.active')), msg);
  const blocked = await saved();
  check('막힌 동안 서버에 답·내 생각 0건', blocked.choices === 0 && blocked.reflections.length === 0, JSON.stringify(blocked));
  check('쓰던 소감은 그대로 남고 입력 칸에 초점', (await page.inputValue('#reflectInput')).includes('홍길동') &&
    await page.evaluate(() => document.activeElement && document.activeElement.id === 'reflectInput'));

  await page.fill('#reflectInput', '2학년 3반 친구들과 같이 해 봤다');
  await page.click('[data-step-main="q3"]');
  await page.waitForTimeout(400);
  check('학년/반도 막음', !(await page.isVisible('.page--card.active')) && (await saved()).reflections.length === 0);

  await page.fill('#reflectInput', '학교에서 배운 이름과 다른 이름이 있다는 게 새로웠다');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => (window.__mockDb.read().exploration_reflections || []).length === 1);
  const s = await saved();
  check('고치면 카드가 만들어지고 고친 소감만 저장', s.choices === 3 && s.reflections.length === 1 && s.reflections[0].startsWith('학교에서 배운'), JSON.stringify(s));
  check('안내 문구는 지워짐', !(await page.$eval('#cardStatus', el => el.textContent.trim())));
  check('카드에 고친 소감', /학교에서 배운 이름과 다른 이름/.test(await page.$eval('#memoryCard', el => el.textContent)));

  // 소감 없이 카드 만들기는 그대로
  const ctx2 = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const p2 = await mockPage(ctx2);
  await p2.goto(base + 'index.html#/e/zainichi');
  await p2.waitForSelector('.page--detail.active');
  await p2.click('[data-step-main="q1"]');
  for (let i = 0; i < 3; i++) {
    await p2.waitForTimeout(300);
    await p2.click('#choiceStep [data-choice-option]');
    await p2.click('[data-step-main="q2"]');
  }
  await p2.waitForFunction(() => document.querySelector('.page--detail').dataset.step === '3');
  await p2.click('[data-reflect-skip]');
  await p2.waitForSelector('.page--card.active');
  check('건너뛰고 카드 보기는 막지 않음', true);
  check('페이지 오류 없음', page.__errors.length === 0 && p2.__errors.length === 0, page.__errors.concat(p2.__errors).join(' | '));
  await ctx.close();
  await ctx2.close();

  // 심화 공동 표현: 함께 공개되는 탐구 전 문장에 전화번호가 있으면 등록하지 않음
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx3.addInitScript(presetContinue);
  const p3 = await mockPage(ctx3);
  await p3.goto(base + 'index.html');
  await p3.evaluate(() => { localStorage.setItem('sm_age_group', '10s'); openEventDetail('imjin'); setBefore('잘 모르지만 010-1234-5678 로 연락 주세요'); switchTab('shared'); });
  await p3.fill('#userNarrative', '임진왜란은 조선·명·일본 모두에게 큰 상처를 남긴 국제 전쟁이었다.');
  await p3.check('#publishConsent');
  await p3.click('#submitNarrative');
  if (await p3.isVisible('#participantGate').catch(() => false)) await p3.click('[data-gate-choice="continue"]');
  await p3.waitForTimeout(600);
  const st = await p3.$eval('#submitStatus', el => el.textContent);
  check('공개 등록: 탐구 전 문장의 전화번호 때문에 등록하지 않고 위치를 안내', /탐구 전 한 문장/.test(st) &&
    (await p3.evaluate(() => window.__mockDb.read().shared_expressions.length)) === 0, st);
  await p3.evaluate(() => setBefore('잘 모르지만 일본과 조선이 싸운 전쟁'));
  await p3.click('#submitNarrative');
  await p3.waitForFunction(() => /등록되었습니다/.test(document.getElementById('submitStatus').textContent), null, { timeout: 8000 }).catch(() => {});
  check('탐구 전 문장을 고치면 그대로 등록', (await p3.evaluate(() => window.__mockDb.read().shared_expressions.length)) === 1);
  check('공개 등록 화면 페이지 오류 없음', p3.__errors.length === 0, p3.__errors.join(' | '));
  await ctx3.close();
});
