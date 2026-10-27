/* '③ 질문하는 AI' — 브라우저 E2E (가짜 Supabase, 실제 DB·AI 접속 없음)
   실행: node tests/e2e/ask-ai.e2e.js   (전체: npm run test:e2e)
   · 1) 폴백 경로: 테스트 실행기가 외부 요청을 모두 막으므로 함수 호출은 항상 실패 → 미리 써 둔 질문으로 끝까지 진행 (CI와 같은 조건)
   · 2) 성공 경로: page.route로 함수 응답을 모의 → 반응·근거 칩·두 번째 질문, 칩 클릭 이동(서술 카드·AI 카드 회차·사료 카드), 마무리 후 입력 잠김, 호출 2회
   · 3) 기본 체험(quick)에서는 보이지 않음 · 4) 모바일 폭 */
'use strict';
const { run } = require('./harness');
const core = require('../../supabase/functions/ask-ai/core.mjs');
const DATA = require('../../supabase/functions/ask-ai/data.json');
const DIALOGUE = require('../../fourth-narrator-data.js').dialogue;
// 브라우저가 보낸 본문이 함수의 입력 검증을 통과하는지
const serverAccepts = body => core.validateInput(body, DATA).error === undefined;

const FN = /functions\/v1\/ask-ai/;
const REPLY_1 = { reply: '일본어 답변은 ‘보냈다’고 썼다는 점을 짚었네요.', question: '그 문장에서 빠진 사람은 누구였나요?',
  evidence: [{ kind: 'narrative', id: 'japan' }, { kind: 'ai', id: 'ja-2' }, { kind: 'source', id: 'imjin-sillok-01' }, { kind: 'ai', id: 'xx-9' }] };
const REPLY_2 = { reply: '백성과 의병이 어디에 있고 없는지 스스로 찾았습니다.', question: null, evidence: [{ kind: 'ai', id: 'zh-1' }] };
// turn 1인데 question이 null → 화면은 사전 두 번째 질문으로 대체해야 함
const REPLY_NO_Q = { reply: '조선인 피해자가 어디에 있는지 짚었네요.', question: null, evidence: [{ kind: 'narrative', id: 'japan' }] };

run('ask-ai', async ({ browser, base, check, mockPage, presetContinue }) => {
  async function openFourth(context, eventId) {
    const page = await mockPage(context);
    await page.goto(base + 'index.html#/e/' + eventId);
    await page.waitForSelector('#flowProgress [data-step-goto="2"]');
    if (await page.$eval('.page--detail', el => el.dataset.mode) === 'quick') await page.click('[data-deep-switch="2"]');
    await page.click('#flowProgress [data-step-goto="2"]');
    await page.click('.tab[data-tab="fourth"]');
    await page.waitForSelector('#askAi .ask-ai');
    return page;
  }
  const calls = page => page.evaluate(() => window.__mockDb.calls.filter(c => c.op === 'invoke').length);
  // 페이지가 부드럽게 스크롤되는 동안 눌러도 어긋나지 않도록, 블록 안 버튼은 먼저 바로 보이게 한 뒤 누릅니다.
  const click = async (page, sel) => { await page.$eval(sel, el => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.click(sel); };
  const answer = async (page, text) => { await page.fill('#askAiInput', text); await click(page, '#askAi button[type="submit"]'); };

  // 1) 폴백 경로 (외부 차단 = CI 조건)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(presetContinue);
  const page = await openFourth(ctx, 'imjin');
  check('블록: 안내 문구와 시작 버튼만', /이 사이트는 답을 저장하지 않습니다\. 답은 AI 서비스\(Anthropic\)로 전송되어/.test(await page.textContent('#askAi')) && await page.isVisible('#askAi [data-ask-start]') && !(await page.$('#askAiInput')));
  check('시작 전 함수 호출 없음', (await calls(page)) === 0);
  check('블록은 기억의 빈자리 아래', await page.evaluate(() => document.getElementById('memoryGaps').compareDocumentPosition(document.getElementById('askAi')) & Node.DOCUMENT_POSITION_FOLLOWING));
  await click(page, '#askAi [data-ask-start]');
  check('첫 질문은 미리 준비한 질문 (호출 없음)', /주어와 동사는 무엇이었나요/.test(await page.textContent('#askAi .ask-turn--ai')) && /미리 준비한 질문/.test(await page.textContent('#askAi')) && (await calls(page)) === 0);
  check('첫 질문에 정적 근거 칩', (await page.$$eval('#askAi .ask-chip', els => els.length)) === 2);
  await click(page, '#askAi button[type="submit"]');
  check('빈 답은 보내지 않음', /한 문장이라도/.test(await page.textContent('#askAiError')) && (await calls(page)) === 0);
  await answer(page, '제 이메일은 kim@school.ac.kr 입니다');
  check('이메일이 든 답은 보내지 않음', /이메일/.test(await page.textContent('#askAiError')) && (await calls(page)) === 0);
  await answer(page, '가'.repeat(601));
  check('600자 초과는 보내지 않음', /600자/.test(await page.textContent('#askAiError')) && (await calls(page)) === 0);
  const t0 = Date.now();
  await answer(page, '일본어 답변은 ‘군대를 보냈다’라고 썼고, 한국어는 ‘침략했다’였어요.');
  await page.waitForSelector('#askAi .ask-turn--note');
  check('호출 실패 → 3초 내 폴백 안내', Date.now() - t0 < 3000 && /AI가 응답하지 않아 준비한 질문으로 이어갑니다/.test(await page.textContent('#askAi .ask-turn--note')), `${Date.now() - t0}ms`);
  check('폴백: 사전 두 번째 질문 + 정적 칩, 다시 답할 수 있음', /백성·의병/.test(await page.textContent('#askAi')) && await page.isVisible('#askAiInput') && (await page.$$eval('#askAi .ask-chip', els => els.length)) === 5);
  check('내 답이 기록에 보임', /군대를 보냈다/.test(await page.textContent('#askAi .ask-turn--student')));
  check('함수 호출 1회 (재시도 없음)', (await calls(page)) === 1);
  await answer(page, '중국어 답변에는 백성과 의병이 없었어요.');
  await page.waitForSelector('#askAi .ask-ai__done');
  check('두 번째도 실패 → 사전 마무리 글(질문 아님), 입력 잠김', /주어가 달랐다는 것 하나를 기억해 두세요/.test(await page.textContent('#askAi')) && /AI의 마무리/.test(await page.textContent('#askAi .ask-turn--ai:last-of-type')) && !(await page.$('#askAiInput')) && /저장되지 않았습니다/.test(await page.textContent('#askAi .ask-ai__done')));
  check('함수 호출은 최대 2회', (await calls(page)) === 2);
  check('폴백 경로의 두 번째 호출 본문도 함수 검증을 통과', serverAccepts(await page.evaluate(() => window.__mockDb.calls.filter(c => c.op === 'invoke')[1].body)));
  check('페이지 오류 없음 (폴백)', page.__errors.length === 0, page.__errors.join(' / '));
  await ctx.close();

  // 2) 성공 경로 (함수 응답 모의)
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addInitScript(presetContinue);
  const page2 = await mockPage(ctx2);
  let n = 0;
  await page2.route(FN, r => { n++; r.fulfill({ contentType: 'application/json', body: JSON.stringify(n === 1 ? REPLY_1 : n === 2 ? REPLY_2 : REPLY_NO_Q) }); });
  await page2.goto(base + 'index.html#/e/imjin');
  await page2.waitForSelector('#flowProgress [data-step-goto="2"]');
  if (await page2.$eval('.page--detail', el => el.dataset.mode) === 'quick') await page2.click('[data-deep-switch="2"]');
  await page2.click('#flowProgress [data-step-goto="2"]');
  await page2.click('.tab[data-tab="fourth"]');
  await click(page2, '#askAi [data-ask-start]');
  await answer(page2, '일본어 답변은 ‘군대를 보냈다’라고 썼어요.');
  await page2.waitForSelector('#askAi .ask-turn--ai:nth-of-type(3)');
  const sent = await page2.evaluate(() => window.__mockDb.calls.filter(c => c.op === 'invoke')[0].body);
  check('함수에 보낸 본문: eventId·turn 1·history 2개(질문·답)', sent.eventId === 'imjin' && sent.turn === 1 && sent.history.length === 2 && sent.history[1].role === 'user' && serverAccepts(sent), JSON.stringify(sent));
  const reply = await page2.$eval('#askAi .ask-turn--ai:nth-of-type(3)', el => ({ text: el.textContent, chips: [...el.querySelectorAll('.ask-chip')].map(c => c.dataset.askEvidence) }));
  check('반응 문장·두 번째 질문 표시', /보냈다’고 썼다는 점/.test(reply.text) && /빠진 사람은 누구였나요/.test(reply.text), reply.text);
  check('근거 칩 3개 (대상 없는 ai:xx-9는 그리지 않음)', reply.chips.join('|') === 'narrative:japan|ai:ja-2|source:imjin-sillok-01', reply.chips.join('|'));
  check('칩 이름', (await page2.$$eval('#askAi .ask-turn--ai:nth-of-type(3) .ask-chip', els => els.map(e => e.textContent))).join('|') === '일본 측 서술|AI · 일본어 2회차 답변|사료 · 조선왕조실록 (선조실록)');
  await click(page2, '#askAi [data-ask-evidence="narrative:japan"]');
  check('서술 칩 → 비교 탭의 일본 측 카드 강조', await page2.isVisible('[data-tab-content="compare"].active') && await page2.$eval('.narrative-card--japan', el => el.classList.contains('is-focused')));
  await page2.click('.tab[data-tab="fourth"]');
  check('탭을 돌아와도 대화 유지', await page2.isVisible('#askAi .ask-turn--ai:nth-of-type(3)'));
  await click(page2, '#askAi [data-ask-evidence="ai:ja-2"]');
  check('AI 칩 → 일본어 카드 2회차로 전환·강조', await page2.$eval('#fourthNarrator [data-ai-card="ja"] [data-ai-run="2"]', el => el.getAttribute('aria-pressed')) === 'true' && await page2.$eval('#fourthNarrator [data-ai-card="ja"]', el => el.classList.contains('is-focused')));
  check('AI 카드를 다시 그려도 대화 유지', await page2.isVisible('#askAiInput'));
  await click(page2, '#askAi [data-ask-evidence="source:imjin-sillok-01"]');
  check('사료 칩 → 사료 탭의 카드 강조', await page2.isVisible('[data-tab-content="sources"].active') && await page2.$eval('[data-source-id="imjin-sillok-01"]', el => el.classList.contains('is-focused')));
  await page2.click('.tab[data-tab="fourth"]');
  await answer(page2, '그 문장에는 조선의 백성이 없었어요.');
  await page2.waitForSelector('#askAi .ask-ai__done');
  const sent2 = await page2.evaluate(() => window.__mockDb.calls.filter(c => c.op === 'invoke')[1].body);
  check('두 번째 호출: turn 2·history 4개(반응+질문 포함)·함수 검증 통과', sent2.turn === 2 && sent2.history.length === 4 && /빠진 사람은 누구였나요/.test(sent2.history[2].content) && serverAccepts(sent2), JSON.stringify(sent2.history.map(h => h.role)));
  check('마무리 표시·입력 잠김·더 이상 호출 없음', /스스로 찾았습니다/.test(await page2.textContent('#askAi')) && !(await page2.$('#askAiInput')) && n === 2 && !(await page2.$('#askAi .ask-turn--note')));
  check('대화 내용이 저장소에 남지 않음', await page2.evaluate(() => !JSON.stringify(Object.assign({}, localStorage, sessionStorage)).includes('군대를 보냈다')));
  check('페이지 오류 없음 (성공 경로)', page2.__errors.length === 0, page2.__errors.join(' / '));
  // 다른 사건으로 바꾸면 대화가 비워짐
  await page2.goto(base + 'index.html#/e/hiroshima');
  await page2.waitForSelector('#flowProgress [data-step-goto="2"]');
  if (await page2.$eval('.page--detail', el => el.dataset.mode) === 'quick') await page2.click('[data-deep-switch="2"]');
  await page2.click('#flowProgress [data-step-goto="2"]');
  await page2.click('.tab[data-tab="fourth"]');
  check('사건을 바꾸면 처음(시작 버튼)으로', await page2.isVisible('#askAi [data-ask-start]') && !(await page2.$('#askAi .ask-turn')));
  // turn 1 응답에 question이 없으면 사전 두 번째 질문으로 이어감 (반응은 AI 것, 질문은 준비한 것)
  await click(page2, '#askAi [data-ask-start]');
  await answer(page2, '일본 측 서술에는 조선인 피해자가 없었어요.');
  await page2.waitForSelector('#askAi .ask-turn--ai:nth-of-type(3)');
  const noQ = await page2.textContent('#askAi .ask-turn--ai:nth-of-type(3)');
  check('question null → AI 반응 + 사전 두 번째 질문', /짚었네요/.test(noQ) && noQ.includes(DIALOGUE.hiroshima[1].q) && await page2.isVisible('#askAiInput') && n === 3, noQ);
  await ctx2.close();

  // 3) 기본 체험(quick)에서는 보이지 않음
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx3.addInitScript(presetContinue);
  const page3 = await mockPage(ctx3);
  await page3.goto(base + 'index.html#/e/imjin');
  await page3.waitForSelector('.page--detail[data-mode="quick"]');
  check('기본 체험: 블록 비노출', !(await page3.isVisible('#askAi')) && !(await page3.isVisible('.tab[data-tab="fourth"]')));
  // 4) 모바일 폭 (심화 전환 후)
  await page3.click('[data-deep-switch="2"]');
  await page3.click('#flowProgress [data-step-goto="2"]');
  await page3.click('.tab[data-tab="fourth"]');
  await page3.waitForSelector('#askAi .ask-ai');
  // 모바일 에뮬레이션에서는 긴 페이지 아래쪽에서 시각 뷰포트가 레이아웃 뷰포트와 어긋나(visualViewport.offsetTop≠0) Playwright의
  // 포인터 판정이 다른 요소를 가리킵니다. 포인터 동작은 위 데스크톱 컨텍스트에서 확인했으므로 여기서는 DOM click으로 흐름·레이아웃만 봅니다.
  await page3.$eval('#askAi [data-ask-start]', el => el.click());
  await page3.fill('#askAiInput', '모바일에서 쓴 답이에요.');
  await page3.$eval('#askAi button[type="submit"]', el => el.click());
  await page3.waitForSelector('#askAi .ask-turn--note');
  const overflow = await page3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('모바일: 폴백 진행·가로 넘침 없음', await page3.isVisible('#askAiInput') && overflow <= 1, `넘침 ${overflow}px`);
  check('모바일: 입력칸이 화면 폭 안', await page3.$eval('#askAiInput', el => el.getBoundingClientRect().right <= window.innerWidth));
  check('페이지 오류 없음 (모바일)', page3.__errors.length === 0, page3.__errors.join(' / '));
  await ctx3.close();
});
