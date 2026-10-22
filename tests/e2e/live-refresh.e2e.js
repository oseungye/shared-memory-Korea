/* 최신 참여 불러오기 · 불러오기 실패 후 다시 시도 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/live-refresh.e2e.js   (전체: npm run test:e2e)
   발표 화면에서 '모두의 기억 보기'·Shared Archive를 띄워 둔 채, 다른 기기(QR)에서 제출한 문장을
   새로고침 없이 불러오는지 확인합니다. (새로고침하면 공용 기기 보호를 위해 첫 화면으로 돌아갑니다) */
'use strict';
const { run } = require('./harness');

const SEED = {
  shared_expressions: [
    { id: 301, event_key: 'imjin', author_name: '하늘', country_code: 'ko', content: '침략의 피해와 저항을 함께 기억하는 전쟁', created_at: '2026-10-17T03:00:00Z' }
  ],
  expression_participants: [],
  expression_empathy: [],
  nextId: 400
};

/** 다른 기기에서 누군가 제출한 것처럼 가짜 DB에 한 건을 더합니다. */
function addFromAnotherDevice(page, row) {
  return page.evaluate(r => {
    const db = window.__mockDb.read();
    db.shared_expressions.push(r);
    sessionStorage.setItem('__mock_db', JSON.stringify(db));
  }, row);
}

run('live-refresh', async ({ browser, base, check, mockPage, presetContinue }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(presetContinue);
  await context.addInitScript(seed => {
    if (!sessionStorage.getItem('__mock_db')) sessionStorage.setItem('__mock_db', JSON.stringify(seed));
  }, SEED);
  const page = await mockPage(context);
  await page.goto(base + 'index.html');

  // 모두의 기억 보기 — 발표 화면
  await page.evaluate(() => { openEventDetail('imjin'); switchTab('memory'); });
  await page.waitForFunction(() => !/불러오는 중/.test(document.getElementById('memoryResult').textContent));
  const memoryText = () => page.$eval('#memoryResult', el => el.innerText);
  check('처음에는 1건으로 분석', /1건|1개/.test(await memoryText()));
  check('불러온 시각 표시', /기준/.test(await page.$eval('#memoryLoadedAt', el => el.textContent)));

  await addFromAnotherDevice(page, { id: 302, event_key: 'imjin', author_name: '바다', country_code: 'ko', content: '조선과 명, 일본 모두에게 큰 상처를 남긴 국제 전쟁', created_at: '2026-10-22T03:00:00Z' });
  check('누르기 전에는 화면이 바뀌지 않음', !/바다|큰 상처/.test(await page.$eval('#sharedList', el => el.textContent)));
  await page.click('.memory-box [data-shared-refresh]');
  await page.waitForFunction(() => /큰 상처/.test(document.getElementById('sharedList').textContent));
  check('최신 참여 불러오기: 다른 기기의 제출이 목록에 반영', true);
  check('최신 참여 불러오기: 공동 기억 지도도 다시 계산', /2건|2개/.test(await memoryText()));
  check('새로고침 없이 같은 사건·같은 탭 유지', await page.isVisible('[data-tab-content="memory"].active') || await page.$eval('.tab[data-tab="memory"]', el => el.classList.contains('active')));

  // 불러오기 실패 → 다시 시도
  await page.evaluate(() => { window.__mockDb.failLoad = true; });
  await page.click('.memory-box [data-shared-refresh]');
  await page.waitForFunction(() => /불러오지 못/.test(document.getElementById('memoryResult').textContent));
  check('실패하면 안내 문구 (영원히 "불러오는 중"이 아님)', /서버 응답이 늦어/.test(await memoryText()));
  check('실패 안내에 다시 시도 버튼', (await page.$$('#memoryResult [data-shared-refresh]')).length === 1);
  await page.evaluate(() => { window.__mockDb.failLoad = false; });
  await page.click('#memoryResult [data-shared-refresh]');
  await page.waitForFunction(() => !/불러오지 못|불러오는 중/.test(document.getElementById('memoryResult').textContent));
  check('다시 시도하면 정상 표시', /2건|2개/.test(await memoryText()));

  // Shared Archive
  await page.click('.nav__menu a[data-page="archive"]');
  await page.waitForFunction(() => document.querySelectorAll('#archiveList .archive-card').length > 0);
  const cards = () => page.$$eval('#archiveList .archive-card', els => els.length);
  check('아카이브 처음 2건', (await cards()) === 2, String(await cards()));
  await addFromAnotherDevice(page, { id: 303, event_key: 'imjin', author_name: '별', country_code: 'ja', content: '東アジア全体に深い傷を残した戦争', created_at: '2026-10-22T04:00:00Z' });
  await page.click('[data-archive-refresh]');
  await page.waitForFunction(() => document.querySelectorAll('#archiveList .archive-card').length === 3);
  check('아카이브 최신 표현 불러오기', true);
  check('아카이브 불러온 시각 표시', /기준/.test(await page.$eval('#archiveEventHead', el => el.textContent)));
  await page.evaluate(() => { window.__mockDb.failLoad = true; });
  await page.click('[data-archive-refresh]');
  await page.waitForFunction(() => /불러오지 못/.test(document.getElementById('archiveList').textContent));
  check('아카이브 실패 시 다시 시도 버튼', (await page.$$('#archiveList [data-archive-refresh]')).length === 1);
  await page.evaluate(() => { window.__mockDb.failLoad = false; });
  await page.click('#archiveList [data-archive-refresh]');
  await page.waitForFunction(() => document.querySelectorAll('#archiveList .archive-card').length === 3);
  check('아카이브 다시 시도 후 정상 표시', true);
  check('페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();

  // 휴대폰 폭
  const mobile = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await mobile.addInitScript(presetContinue);
  const m = await mockPage(mobile);
  await m.goto(base + 'index.html');
  await m.evaluate(() => { openEventDetail('imjin'); switchTab('memory'); });
  await m.waitForTimeout(200);
  check('모바일: 불러오기 버튼이 보임', await m.isVisible('.memory-box [data-shared-refresh]'));
  check('모바일: 가로 넘침 없음', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await mobile.close();
});
