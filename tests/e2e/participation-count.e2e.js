/* 참여자 수: 동의 여부와 관계없이 모든 참여를 셈 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/participation-count.e2e.js   (전체: npm run test:e2e)
   설문만 하고 통계 동의 없이 끝낸 참여 · 같은 사람의 여러 사건/카드 다시 만들기(한 번만) ·
   공동 표현 등록(같은 키라 한 번) · 새 참여자로 시작(따로 셈) · 보내는 칸은 사건 이름·무작위 키뿐 */
'use strict';
const { run } = require('./harness');

const db = page => page.evaluate(() => window.__mockDb.read());
const pings = page => page.evaluate(() => window.__mockDb.calls.filter(c => c.op === 'insert' && c.table === 'participation_pings').flatMap(c => c.rows));
async function shownCount(page) {
  await page.evaluate(() => loadParticipantCount());
  await page.waitForFunction(() => !document.getElementById('participantCount').hidden);
  const m = (await page.$eval('#participantCount', el => el.textContent)).match(/현재 ([\d,]+)명/);
  return m ? Number(m[1].replace(/,/g, '')) : -1;
}

/** 기본 체험: 질문마다 첫 선택지 → 한 줄 소감 단계 (통계 동의는 하지 않음) */
async function quickToReflect(page, base, eventId) {
  await page.goto(base + `index.html#/e/${eventId}`);
  await page.waitForSelector('.page--detail.active');
  if (await page.isVisible('#participantGate')) await page.click('[data-gate-choice="continue"]');
  await page.click('[data-step-main="q1"]');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(600);
    if (await page.$eval('.page--detail', el => el.dataset.step) === '3') break;
    await page.click('#choiceStep [data-choice-option]');
    await page.click('[data-step-main="q2"]');
  }
  await page.waitForFunction(() => document.querySelector('.page--detail').dataset.step === '3');
}

run('participation-count', async ({ browser, base, check, mockPage }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await mockPage(ctx);
  await page.goto(base + 'index.html');

  /* ---------- 1. 설문만 하고 통계 동의 없이 → 1명 ---------- */
  await quickToReflect(page, base, 'imjin');
  await page.waitForFunction(() => window.__mockDb.read().participation_pings.length === 1);
  let sent = await pings(page);
  check('설문을 마치면(소감 단계) 동의 상자 없이 참여 1회 기록', sent.length === 1 && !(await page.$('#choiceShareConsent')));
  check('보내는 칸은 사건 이름·무작위 참여자 키뿐 (답·소감·닉네임·연령대 없음)', Object.keys(sent[0]).sort().join() === 'event_key,participant_key' &&
    sent[0].event_key === 'imjin' && sent[0].participant_key === await page.evaluate(() => localStorage.getItem('sm_participant_key')));
  await page.fill('#reflectInput', '소감은 서버로 가지 않는다');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => window.__mockDb.read().exploration_reflections.length === 1);
  let d = await db(page);
  check('카드를 만들어도 같은 사건은 다시 보내지 않음', (await pings(page)).length === 1);
  check('카드를 만들면 객관식 답과 소감도 저장 (같은 묶음 번호)', d.exploration_choices.length > 0 && d.exploration_reflections.length === 1 &&
    d.exploration_reflections[0].content === '소감은 서버로 가지 않는다' && d.exploration_choices.every(c => c.submission_id === d.exploration_reflections[0].submission_id));
  check('참여 기록과 답·소감은 서로 잇지 않음 (답·소감에 참여자 키 없음)', !JSON.stringify(d.exploration_choices.concat(d.exploration_reflections)).includes(sent[0].participant_key));
  check('첫 화면 참여자 수 = 1', (await shownCount(page)) === 1);

  /* ---------- 2. 같은 사람: 다른 사건 + 공동 표현 공개 등록 → 여전히 1명 ---------- */
  await quickToReflect(page, base, 'zainichi');
  await page.waitForFunction(() => window.__mockDb.read().participation_pings.length === 2);
  check('같은 사람이 다른 사건을 해도 참여자 수는 1 (키가 같음)', (await shownCount(page)) === 1);
  await page.evaluate(() => { openEventDetail('tribute'); });
  await page.waitForSelector('.page--detail.active');
  await page.click('#flowProgress [data-step-goto="3"]');
  await page.fill('#userNarrative', '조공 관계는 시대마다 다르게 이해되어 온 동아시아의 외교 질서였다.');
  await page.check('#publishConsent');
  await page.click('#submitNarrative');
  await page.waitForFunction(() => /등록되었습니다|실패/.test(document.getElementById('submitStatus').textContent));
  d = await db(page);
  check('공동 표현 등록도 같은 키로 한 번 기록 (사건 3개 = 기록 3건)', d.shared_expressions.length === 1 && d.participation_pings.length === 3 &&
    d.expression_participants[0].participant_key === d.participation_pings[0].participant_key);
  check('공동 표현까지 해도 참여자 수는 1 (한 사람 한 번)', (await shownCount(page)) === 1);

  /* ---------- 3. 새 참여자로 시작 → 따로 셈 ---------- */
  page.__dialogAnswer = true;
  await page.evaluate(() => startAsNewParticipant());
  await quickToReflect(page, base, 'imjin');
  await page.waitForFunction(() => window.__mockDb.read().participation_pings.length === 4);
  d = await db(page);
  check('새 참여자는 다른 키로 기록', new Set(d.participation_pings.map(g => g.participant_key)).size === 2);
  check('새 참여자도 동의 없이 셈 → 참여자 수 2', (await shownCount(page)) === 2);
  /* ---------- 4. 답·소감 SQL(2026-10-save-answers) 실행 전: 객관식은 묶음 번호 없이라도 저장 ---------- */
  await page.evaluate(() => { window.__mockDb.noSubmissionColumn = true; });
  const before = (await db(page)).exploration_choices.length;
  await page.fill('#reflectInput', 'SQL 실행 전의 소감');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(n => window.__mockDb.read().exploration_choices.length > n, before);
  d = await db(page);
  const added = d.exploration_choices.slice(before);
  check('SQL 실행 전: 객관식 답은 새 칸만 빼고 저장 (멈추지 않음)', added.length > 0 && added.every(r => !('submission_id' in r)));
  check('SQL 실행 전: 소감은 저장되지 않지만 카드·화면은 그대로 (오류 안내 없음)', !JSON.stringify(d).includes('SQL 실행 전의 소감') &&
    /SQL 실행 전의 소감/.test(await page.$eval('#memoryCard', el => el.textContent)) && !/저장하지 못했어요/.test(await page.$eval('#choiceOthers', el => el.textContent)));
  check('페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await ctx.close();
});
