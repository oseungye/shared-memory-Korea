/* 기본 체험(객관식 관점 고르기) — 모바일 중심 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/quick-experience.e2e.js   (전체: npm run test:e2e)
   첫 화면 큰 사건 카드 → 세 나라 비교 → 객관식 질문(한 화면에 하나·정답 없음·건너뛰기) → 한 줄 소감(건너뛰기) → 카드.
   탭 수 · 이전/다음 · 화살표 키 · 답 유지 · 고른 관점과 소감의 구분 · 공개/통계 동의 분리 · 별도 테이블 저장 ·
   소표본 숨김 · SQL 실행 전 · 심화 탐구 전환과 복귀 · 다른 사건은 기존 흐름 · 새 참여자 초기화 · 가로 넘침 · 오류 */
'use strict';
const fs = require('node:fs');
const { run } = require('./harness');

const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const step = page => page.$eval('.page--detail', el => `${el.dataset.mode}:${el.dataset.step}`);
const visibleMains = page => page.$$eval('#stepCta [data-step-main]', els => els.filter(b => !b.hidden && b.offsetParent !== null).map(b => b.dataset.stepMain));
const options = page => page.$$eval('#choiceStep [data-choice-option]', els => els.map(e => e.dataset.choiceOption));
const db = page => page.evaluate(() => window.__mockDb.read());
const pngSize = buf => ({ png: buf.slice(1, 4).toString() === 'PNG', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
const inViewport = (page, sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.width > 0; });

run('quick-experience', async ({ browser, base, check, mockPage }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  let page = await mockPage(mobile);
  let taps = 0;
  const tap = async sel => { taps += 1; await page.click(sel); };

  /* ---------- 1. 첫 화면 → 사건 카드 하나로 바로 시작 ---------- */
  await page.goto(base + 'index.html');
  await page.waitForTimeout(800);
  check('첫 화면: 임진왜란·재일조선인 큰 카드가 스크롤 없이 보임', await inViewport(page, '[data-quick-event="imjin"]') && await inViewport(page, '[data-quick-event="zainichi"]'));
  const pickH = await page.$$eval('.quick-pick', els => els.map(e => e.getBoundingClientRect().height));
  check('사건 카드 터치 높이 48px 이상', pickH.every(h => h >= 48), JSON.stringify(pickH));
  check('첫 화면에 "3–5분 · 익명 · 로그인 없음 · 정답 없음"', /3–5분[\s\S]*익명[\s\S]*로그인 없음[\s\S]*정답 없음/.test(await page.$eval('.hero__meta', el => el.innerText)));
  check('모바일 첫 화면 가로 넘침 없음', await noHScroll(page));
  check('사건 카드 위에 "어떤 역사부터 볼까요?" · 임진왜란에 "처음이라면 여기부터"', await page.isVisible('#quickPicksLabel') &&
    /처음이라면 여기부터/.test(await page.textContent('[data-quick-event="imjin"]')) && !(await page.textContent('[data-quick-event="zainichi"]')).includes('처음이라면'));
  // 상단 "참여하기"는 기본 체험 사건 카드로 (사건 목록·연령대가 아님)
  await page.evaluate(() => navigateTo('archive'));
  await page.click('.nav__menu a[data-view="participate"]');
  await page.waitForSelector('.page--home.active');
  await page.waitForTimeout(700);
  check('상단 "참여하기" → 첫 화면 사건 카드, 첫 카드에 초점 (연령대·사건 목록 아님)',
    await inViewport(page, '[data-quick-event="imjin"]') && await page.evaluate(() => document.activeElement && document.activeElement.dataset.quickEvent === 'imjin') &&
    !(await page.isVisible('#agePicker')) && !(await page.isVisible('.page--events.active')));
  await page.evaluate(() => window.scrollTo(0, 0));

  await tap('[data-quick-event="imjin"]');
  await page.waitForSelector('.page--detail.active');
  check('카드 한 번으로 사건 화면 (연령대 묻지 않음)', !(await page.isVisible('#agePicker')) && (await step(page)) === 'quick:1');
  check('STEP 1 · 세 나라 비교: 서술이 바로 보이고, 탐구 전 문장·탭은 숨김',
    await page.isVisible('#narrativesGrid') && !(await page.isVisible('#beforeCard')) && !(await page.isVisible('.tabs')) &&
    /세 나라 비교/.test(await page.$eval('#flowProgress .flow-progress__step.is-current', el => el.innerText)));
  check('첫 화면 안에서 서술이 시작됨 (스크롤 없이 한국 서술 제목이 보임)', await inViewport(page, '#narrativesGrid .narrative-card__title'));
  check('단계 표시는 위쪽 한 곳만 (아래 버튼의 STEP 글자·중복 제목 숨김)', !(await page.isVisible('#stepCtaStep')) && !(await page.isVisible('#flowProgress .stepper__count')) &&
    !(await page.isVisible('[data-tab-content="compare"] .step-head')));
  check('키워드·근거 자료·연표·NLP 카드는 기본 체험에서 접어 둠 (심화 탐구에 그대로)', !(await page.isVisible('.narrative-card__more')) && !(await page.isVisible('#timelineBox')) &&
    !(await page.isVisible('.sum-card--common')) && await page.isVisible('.sum-card--names') && await page.isVisible('.quick-scope'));
  const s1 = await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
  check('STEP 1 길이 2.5화면 이하', s1 <= 2.5, s1.toFixed(2));
  check('주요 버튼 하나(관점 고르러 가기) · 이전 버튼 없음', JSON.stringify(await visibleMains(page)) === '["q1"]' && !(await page.isVisible('[data-step-back]')));
  check('심화 탐구 입구가 보임 (AI·분석·사료는 그대로)', await page.isVisible('[data-deep-switch="2"]'));
  check('주소에 사건 링크', await page.evaluate(() => location.hash === '#/e/imjin'));

  /* ---------- 2. 관점 고르기: 한 화면에 질문 하나 ---------- */
  await tap('[data-step-main="q1"]');
  await page.waitForTimeout(400);
  check('STEP 2 · 질문 1/3', (await step(page)) === 'quick:2' && /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)));
  check('"정답은 없어요" 안내', /정답은 없어요/.test(await page.$eval('#choiceStep', el => el.textContent)));
  const q1 = await options(page);
  check('선택지 4개, 처음에는 아무것도 선택되지 않음', q1.length === 4 && (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 0);
  check('선택지는 라디오 묶음 · 높이 48px 이상', await page.$eval('#choiceStep .choice-options', el => el.getAttribute('role') === 'radiogroup') &&
    (await page.$$eval('#choiceStep .choice-option', els => els.every(e => e.getBoundingClientRect().height >= 48))));
  check('질문·선택지·다음 버튼이 한 화면에', await inViewport(page, '#choicePrompt') && await inViewport(page, `[data-choice-option="${q1[3]}"]`) && await inViewport(page, '[data-step-main="q2"]'));
  check('고르기 전 아래 버튼은 "이 질문 건너뛰기" (덜 눈에 띄게)', /이 질문 건너뛰기/.test(await page.textContent('[data-step-main="q2"]')) &&
    await page.$eval('[data-step-main="q2"]', el => el.classList.contains('step-cta__main--quiet')));
  // 키보드: 화살표로 둘러볼 때는 넘어가지 않음
  await page.focus(`[data-choice-option="${q1[0]}"]`);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(600);
  check('화살표 키로는 선택만 바뀌고 다음 질문으로 넘어가지 않음', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 1);
  // 누르면 선택 표시 후 바로 다음 질문 ('다음' 버튼을 따로 누르지 않음)
  await tap('[data-choice-option="many_names"]');
  check('누르면 선택 표시(aria-checked)가 먼저 보임', await page.$eval('[data-choice-option="many_names"]', el => el.getAttribute('aria-checked') === 'true'));
  await page.waitForFunction(() => /질문 2\/3/.test(document.getElementById('choiceStep').textContent));
  check('선택지를 누르면 다음 질문으로 바로 넘어감', true);
  await tap('[data-step-main="q2"]');                               // 2번은 고르지 않고 넘어감 (건너뛰기)
  await page.waitForTimeout(300);
  check('질문 3/3 · 마지막 버튼 "이 질문 건너뛰고 소감 쓰기"', /질문 3\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    /이 질문 건너뛰고 소감 쓰기/.test(await page.textContent('[data-step-main="q2"]')));
  await page.click('[data-step-back]');
  await page.click('[data-step-back]');
  check('이전 버튼으로 질문 1로 돌아가도 고른 답 유지 · 버튼 "다음 질문"', /질문 1\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    await page.$eval('[data-choice-option="many_names"]', el => el.getAttribute('aria-checked') === 'true') &&
    (await page.textContent('[data-step-main="q2"]')).trim().startsWith('다음 질문'));
  await page.click('[data-step-main="q2"]');
  await page.click('[data-step-main="q2"]');
  check('관점 고르기 화면 가로 넘침 없음', await noHScroll(page));
  await page.waitForTimeout(400);
  await tap('[data-choice-option="side_by_side"]');                  // 마지막 질문을 고르면 바로 한 줄 소감으로
  await page.waitForFunction(() => document.querySelector('.page--detail').dataset.step === '3');
  await page.waitForTimeout(300);

  /* ---------- 3. 한 줄 소감 (건너뛰기 가능) ---------- */
  check('STEP 3 · 한 줄 소감', (await step(page)) === 'quick:3' && await page.isVisible('#reflectInput'));
  const recap = await page.$eval('#reflectRecap', el => el.innerText);
  check('내가 고른 관점 다시 보기 (건너뛴 질문은 없음)', /서로 다른 이름을 함께 보여 주는 것/.test(recap) && /서로 다른 이름과 시선/.test(recap) && !/꼭 기억할 장면/.test(recap), recap);
  check('통계 동의는 기본 꺼짐', !(await page.isChecked('#choiceShareConsent')));
  check('버튼은 하나: 소감이 비어 있으면 "소감 없이 카드 만들기"', JSON.stringify(await visibleMains(page)) === '["q3"]' &&
    /소감 없이 카드 만들기/.test(await page.textContent('[data-step-main="q3"]')) && !(await page.$('[data-reflect-skip]')));
  await page.fill('#reflectInput', '가');
  const typedLabel = await page.textContent('[data-step-main="q3"]');
  await page.fill('#reflectInput', '');
  check('한 글자라도 쓰면 "My Memory Card 만들기"', /My Memory Card 만들기/.test(typedLabel));
  await tap('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  check(`첫 화면부터 카드까지 탭 ${taps}번 (사용법 설명 없이 · 6번 이하)`, taps <= 6, String(taps));

  /* ---------- 4. 카드: 고른 관점(객관식)과 직접 쓴 소감 구분 ---------- */
  await page.waitForTimeout(500);
  const labels = await page.$$eval('#memoryCard .memory-card__label', els => els.map(e => e.textContent));
  check('카드 칸 이름: "내가 고른 관점 · 객관식" / "나의 한 줄 소감 · 직접 쓴 문장"', labels.includes('내가 고른 관점 · 객관식') && labels.includes('나의 한 줄 소감 · 직접 쓴 문장') &&
    !labels.some(l => /탐구 전/.test(l)), labels.join(' | '));
  const picked = await page.$$eval('#memoryCard .memory-card__choices li span', els => els.map(e => e.textContent));
  check('카드에 고른 관점 2개만 (건너뛴 질문 없음)', JSON.stringify(picked) === JSON.stringify(['서로 다른 이름을 함께 보여 주는 것', '서로 다른 이름과 시선']), JSON.stringify(picked));
  check('소감을 건너뛰면 "소감은 남기지 않았어요" (지어내지 않음)', /소감은 남기지 않았어요/.test(await page.$eval('#memoryCard .memory-card__reflect', el => el.textContent)));
  const stamps = await page.$$eval('#memoryCard .memory-card__stamps li', els => els.map(e => [e.textContent.trim().slice(1, 6), e.classList.contains('is-done')]));
  check('도장: 관점 고르기 ✓, 한 줄 소감 ✗, 공개 ✗', stamps[1][1] === true && stamps[2][1] === false && stamps[3][1] === false, JSON.stringify(stamps));
  let d = await db(page);
  check('동의하지 않으면 객관식도 공동 표현도 서버 저장 0건', d.exploration_choices.length === 0 && d.shared_expressions.length === 0);
  check('카드 화면 가로 넘침 없음', await noHScroll(page));
  const order = await page.evaluate(() => ['#memoryCard', '[data-card-action="png"]', '.card-design'].map(sel => document.querySelector(sel).getBoundingClientRect().top));
  check('카드가 먼저, 저장 버튼, 그다음 디자인 고르기', order[0] < order[1] && order[1] < order[2], JSON.stringify(order.map(Math.round)));
  check('저장 버튼이 스크롤 없이 보임 (휴대폰 아래 고정)', await inViewport(page, '[data-card-action="png"]'));
  check('기본 체험 카드 화면: 진행 표시·심화용 "카드 다듬기"는 숨김, 돌아가기는 "한 줄 소감 고치기"', !(await page.isVisible('#cardProgress')) &&
    !(await page.isVisible('#discoveryOptions')) && /한 줄 소감 고치기/.test(await page.textContent('[data-card-action="back"]')));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-card-action="png"]')]);
  const png = pngSize(fs.readFileSync(await dl.path()));
  check('기본 체험 카드도 PNG 저장 (1080px)', png.png && png.width === 1080 && png.height >= 1350, JSON.stringify(png));

  /* ---------- 5. 소감을 쓰고, 통계 동의 → 별도 테이블에 선택지 id만 ---------- */
  await page.click('[data-card-action="back"]');
  await page.waitForSelector('.page--detail.active');
  check('카드에서 돌아오면 STEP 3, 고른 관점 그대로', (await step(page)) === 'quick:3' && /서로 다른 이름을 함께 보여 주는 것/.test(await page.$eval('#reflectRecap', el => el.innerText)));
  const REFLECT = '이름 하나에도 각 나라가 이 전쟁을 보는 눈이 담겨 있다는 게 새로웠다.';
  await page.fill('#reflectInput', REFLECT);
  await page.check('#choiceShareConsent');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => /익명 통계에 보탰어요/.test(document.getElementById('choiceOthers').textContent));
  check('카드에 직접 쓴 소감이 입력 그대로', (await page.$eval('#memoryCard .memory-card__reflect blockquote', el => el.textContent)) === `“${REFLECT}”`);
  d = await db(page);
  check('동의하면 객관식만 별도 테이블에 (건너뛴 질문 제외)', JSON.stringify(d.exploration_choices.map(r => [r.question_id, r.option_id])) === JSON.stringify([['name_focus', 'many_names'], ['textbook_line', 'side_by_side']]), JSON.stringify(d.exploration_choices));
  check('저장 행에는 사건·질문·선택지 id만 (소감·닉네임·키 없음)', d.exploration_choices.every(r => Object.keys(r).sort().join() === 'event_key,option_id,question_id'));
  check('소감은 공동 표현으로 등록되지 않음 (공개는 별도)', d.shared_expressions.length === 0 && !JSON.stringify(d).includes(REFLECT));
  check('질문별 응답 5명 미만이면 결과 숨김', /5명 미만/.test(await page.$eval('#choiceOthers', el => el.textContent)));
  await page.click('[data-card-action="back"]');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForTimeout(400);
  check('같은 답으로 카드를 다시 만들어도 중복 저장하지 않음', (await db(page)).exploration_choices.length === 2);

  // 다른 참여자들의 응답이 모였을 때 (가짜 DB에 직접 추가 — 서버 집계와 같은 규칙)
  await page.evaluate(() => {
    const raw = JSON.parse(sessionStorage.getItem('__mock_db'));
    ['many_names', 'many_names', 'responsibility', 'suffering'].forEach(o => raw.exploration_choices.push({ event_key: 'imjin', question_id: 'name_focus', option_id: o }));
    sessionStorage.setItem('__mock_db', JSON.stringify(raw));
  });
  await page.evaluate(() => renderChoiceOthers(null));
  await page.waitForFunction(() => /내 선택/.test(document.getElementById('choiceOthers').textContent));
  const others = await page.$eval('#choiceOthers', el => el.innerText);
  check('5명 이상 모인 질문은 비율과 "내 선택" 표시 (이름 질문 5명: 60%)', /\(5명\)/.test(others) && /60%/.test(others) && /내 선택/.test(others), others);
  check('"많이 고른 관점이 옳다는 뜻은 아니에요" 안내', /옳다는 뜻은 아니에요/.test(others));

  /* ---------- 6. 심화 탐구로 전환 → 공동 표현은 기존 공개 동의 그대로 ---------- */
  await page.click('[data-card-action="back"]');
  await page.click('[data-deep-switch="3"]');
  await page.waitForTimeout(300);
  check('심화 탐구 전환: 공동 표현 쓰기(기존 STEP 3), 탭 보임', (await step(page)) === 'deep:3' && await page.isVisible('.tabs') && await page.isVisible('#userNarrative'));
  check('쓴 소감을 공동 표현 칸에 옮겨 줌 (공개 전)', (await page.inputValue('#userNarrative')) === REFLECT && (await db(page)).shared_expressions.length === 0);
  await page.click('#submitNarrative');
  check('공개 등록은 여전히 별도 동의가 있어야 함', (await db(page)).shared_expressions.length === 0 && /동의 상자에 체크/.test(await page.$eval('#submitStatus', el => el.textContent)));
  await page.click('[data-quick-return]');
  await page.waitForTimeout(300);
  check('"기본 체험으로 돌아가기": 관점 고르기로, 고른 답 유지', (await step(page)) === 'quick:2' && (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 1);
  check('모바일 기본 체험 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));

  /* ---------- 7. 새 참여자로 시작 → 선택·소감·동의 지움 ---------- */
  page.__dialogAnswer = true;
  await page.click('#flowProgress [data-new-participant]');
  await page.waitForSelector('.page--home.active');
  check('새 참여자: 고른 답·소감·통계 동의를 지움', await page.evaluate(() => Object.keys(choiceState.answers).length === 0 && choiceState.reflection === '' &&
    !document.getElementById('choiceShareConsent').checked && document.getElementById('reflectInput').value === ''));
  await mobile.close();

  /* ---------- 8. QR 링크 · 다른 사건 · SQL 실행 전 (휴대폰) ---------- */
  const m2 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  page = await mockPage(m2);
  await page.goto(base + 'index.html#/e/zainichi');
  await page.waitForSelector('.page--detail.active');
  check('QR 링크(재일조선인)도 기본 체험 STEP 1', (await step(page)) === 'quick:1');
  await page.click('[data-step-main="q1"]');
  const zq = await page.$eval('#choicePrompt', el => el.textContent);
  check('재일조선인 질문 1', /가장 먼저 다뤄야/.test(zq), zq);
  await page.evaluate(() => { window.__mockDb.noChoiceTable = true; });
  await page.dblclick('[data-choice-option="legal_status"]');          // 두 번 빨리 눌러도 한 질문만 넘어감
  await page.waitForTimeout(700);
  check('선택지를 두 번 눌러도 질문 2/3 (다음 질문을 건너뛰지 않음)', /질문 2\/3/.test(await page.$eval('#choiceStep', el => el.textContent)));
  await page.waitForTimeout(400);
  await page.click('[data-step-back]');
  await page.click('[data-choice-option="legal_status"]');
  await page.waitForFunction(() => /질문 2\/3/.test(document.getElementById('choiceStep').textContent));
  await page.click('#choiceStep [data-choice-option]');               // 넘어가자마자 다시 누른 손가락
  await page.waitForTimeout(500);
  check('새 질문이 뜬 직후의 터치는 무시 (질문 2는 고르지 않은 채)', /질문 2\/3/.test(await page.$eval('#choiceStep', el => el.textContent)) &&
    (await page.$$eval('#choiceStep [aria-checked="true"]', els => els.length)) === 0);
  for (let i = 0; i < 2; i++) await page.click('[data-step-main="q2"]');
  await page.check('#choiceShareConsent');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
  await page.waitForFunction(() => /준비 중/.test(document.getElementById('choiceOthers').textContent));
  check('통계 SQL 실행 전이면 "준비 중" 안내 · 카드는 그대로', /준비 중/.test(await page.$eval('#choiceOthers', el => el.textContent)) &&
    /국적과 법적 지위가 바뀐 과정/.test(await page.$eval('#memoryCard', el => el.textContent)));
  check('작은 화면(360px) 카드 가로 넘침 없음', await noHScroll(page));

  await page.goto(base + 'index.html#/e/culture');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(300);
  check('질문이 없는 사건(문화 교류)은 기존 심화 탐구 그대로 (STEP 1 탐구 전 문장)', (await step(page)) === 'deep:1' && await page.isVisible('#beforeInput') && !(await page.isVisible('[data-quick-return]')));
  check('QR·다른 사건 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await m2.close();

  /* ---------- 9. 사건 목록(전체 탐구)으로 열면 기존 심화 탐구 ---------- */
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await mockPage(desk);
  await page.goto(base + 'index.html');
  await page.evaluate(() => { localStorage.setItem('sm_age_group', '20s'); });
  await page.click('#startButton');
  // 이 기기에 연령대 기록이 있으므로 공용 기기 확인 창이 먼저 뜹니다 → 같은 학생으로 이어서
  if (await page.isVisible('#participantGate')) await page.click('[data-gate-choice="continue"]');
  await page.waitForSelector('.page--events.active');
  await page.click('.event-card[data-event-id="imjin"]');
  await page.waitForSelector('.page--detail.active');
  check('사건 목록에서 고른 임진왜란은 심화 탐구 STEP 1 (기존 흐름)', (await step(page)) === 'deep:1' && await page.isVisible('#beforeInput'));
  check('심화 탐구에서도 기본 체험으로 갈 수 있음', await page.isVisible('[data-quick-return]'));
  check('데스크톱에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await desk.close();
});
