/* 공용 기기 참여자 분리 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/shared-device.e2e.js   (전체: npm run test:e2e) */
'use strict';
const { run } = require('./harness');

const smKeys = page => page.evaluate(() => {
  try { return Object.keys(localStorage).filter(k => k.startsWith('sm_')); } catch (e) { return null; }
});
const gateVisible = page => page.isVisible('#participantGate');
const lastStatus = page => page.$eval('#submitStatus', el => el.textContent);

async function writeAndSubmit(page, before, text) {
  await page.waitForSelector('#beforeInput');
  await page.fill('#beforeInput', before);
  await page.click('[data-before-action="save"]');
  await page.click('.tab[data-tab="shared"]');
  await page.fill('#userNarrative', text);
  await page.check('#publishConsent');   // 공개 등록은 별도 동의
  await page.click('#submitNarrative');
  await page.waitForFunction(() => /등록되었습니다|실패/.test(document.getElementById('submitStatus').textContent));
}

run('shared-device', async ({ browser, base, check, mockPage }) => {
  /* ---------- 1. 학생 A → (같은 창) 다음 학생 → 이어하기 → 새 참여자 B ---------- */
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await mockPage(context);
  await page.goto(base + 'index.html');
  check('처음 온 사람: 안내·선택 창이 보이지 않음', await page.$eval('.page--home [data-newcomer-note]', el => el.hidden) && !(await gateVisible(page)));

  const A = { before: 'A가 쓴 탐구 전 문장', text: '임진왜란은 일본의 침략으로 시작된 국제전쟁이었다는 A의 문장' };
  await page.click('#startButton');
  check('처음 온 사람은 선택 없이 바로 연령대 선택', await page.isVisible('#agePicker') && !(await gateVisible(page)));
  await page.click('#agePicker [data-age-value="10s"]');
  await page.click('#agePickerNextBtn');
  await page.click('.event-card[data-event-id="imjin"]');
  await writeAndSubmit(page, A.before, A.text);
  let db = await page.evaluate(() => window.__mockDb.read());
  const rowA = db.shared_expressions[0];
  const keyA = db.expression_participants[0] && db.expression_participants[0].participant_key;
  check('A의 제출 저장 (A의 탐구 전 문장·연령대 포함)', rowA && rowA.before_content === A.before && rowA.age_group === '10s');
  check('제출 후 탐구 전 문장이 이 기기에서 지워짐', await page.evaluate(() => localStorage.getItem('sm_before_imjin') === null));
  check('제출 후 탐구 전 카드에 A의 문장이 보이지 않음', !(await page.$eval('#beforeCard', el => el.innerText)).includes(A.before));

  // 다음 학생이 같은 창에서 상단 "지금 참여하기" → 첫 화면 사건 카드 → 이어받지 않고 먼저 물어봄
  await page.click('.nav__menu a[data-view="participate"]');
  await page.waitForSelector('.page--home.active');
  await page.click('[data-quick-event="imjin"]');
  check('제출 후 같은 창에서 사건 카드 → 선택 창이 먼저 뜸', await gateVisible(page));
  check('선택 창이 떠 있는 동안 사건 화면·연령대가 진행되지 않음', !(await page.isVisible('.page--detail.active')) && !(await page.isVisible('.page--events.active')));
  await page.keyboard.press('Escape');
  check('Esc로 닫으면 아무것도 지우지 않음', !(await gateVisible(page)) && (await smKeys(page)).includes('sm_age_group'));

  // 새로고침 후 같은 학생이 "이어서 참여하기"
  await page.reload();
  check('새로고침 후 이전 참여 기록 안내 표시', !(await page.$eval('.page--home [data-newcomer-note]', el => el.hidden)));
  await page.click('#startButton');
  check('이전 기록이 있으면 참여하기 버튼 → 선택 창', await gateVisible(page));
  await page.click('[data-gate-choice="continue"]');
  check('이어서 참여하기: 연령대 유지하고 사건 목록으로', !(await gateVisible(page)) && await page.isVisible('.page--events.active') &&
    await page.evaluate(() => localStorage.getItem('sm_age_group') === '10s'));
  check('이어서 참여하기: 참여자 키 유지', await page.evaluate(k => localStorage.getItem('sm_participant_key') === k, keyA));
  await page.click('.event-card[data-event-id="imjin"]');
  check('이어서 참여 중에는 다시 묻지 않음', !(await gateVisible(page)) && await page.isVisible('.page--detail.active'));

  // 15분 동안 조작이 없으면 다음 참여 시작 때 다시 물음
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('sm_session_choice'));
    sessionStorage.setItem('sm_session_choice', JSON.stringify({ choice: s.choice, at: Date.now() - 16 * 60 * 1000 }));
    navigateTo('events');
  });
  await page.click('.event-card[data-event-id="imjin"]');
  check('15분 이상 조작이 없으면 사건을 열 때 다시 물음', await gateVisible(page));

  // 새 참여자 B
  await page.click('[data-gate-choice="new"]');
  check('새 참여자: Shared Memory 키가 남지 않음', (await smKeys(page)).length === 0);
  check('새 참여자: 연령대 선택부터 시작', await page.isVisible('#agePicker') && !(await gateVisible(page)));
  const B = { before: 'B가 쓴 탐구 전 문장', text: '임진왜란은 조선과 명과 일본이 참여한 전쟁이었다는 B의 문장' };
  await page.click('#agePicker [data-age-value="20s"]');
  await page.click('#agePickerNextBtn');
  await page.click('.event-card[data-event-id="imjin"]');
  check('B는 사건을 열 때 다시 묻지 않음', !(await gateVisible(page)));
  await page.waitForSelector('#beforeInput');
  check('B의 탐구 전 입력창이 비어 있음', (await page.inputValue('#beforeInput')) === '');
  check('B 화면에 A의 문장이 보이지 않음', !(await page.$eval('.page--detail', el => el.innerText)).includes(A.before));
  check('B의 진행 표시가 처음 상태', !(await page.$eval('#flowProgress', el => el.innerText)).includes('탐구를 모두 마쳤습니다'));
  await writeAndSubmit(page, B.before, B.text);
  db = await page.evaluate(() => window.__mockDb.read());
  const rowB = db.shared_expressions[1];
  const keyB = db.expression_participants[1] && db.expression_participants[1].participant_key;
  check('B의 제출에는 B의 탐구 전 문장만 포함', rowB && rowB.before_content === B.before && !JSON.stringify(rowB).includes(A.before));
  check('B의 연령대는 B가 고른 값', rowB && rowB.age_group === '20s');
  check('B의 참여자 키가 A와 다름', keyA && keyB && keyA !== keyB, `${keyA} / ${keyB}`);

  // 안전장치: 다음 학생 C가 B의 열린 화면에서 바로 문장을 써서 제출 → 제출 전에 물음
  const C = '세 나라의 서술은 다르지만 전쟁의 피해는 함께 기억해야 한다는 C의 문장';
  await page.fill('#userNarrative', C);
  await page.check('#publishConsent');
  await page.click('#submitNarrative');
  check('선택 없이 제출하면 제출 전에 선택 창 (제출 안내 포함)', await gateVisible(page) && await page.isVisible('[data-gate-submit-note]'));
  check('선택 전에는 저장되지 않음', (await page.evaluate(() => window.__mockDb.read().shared_expressions.length)) === 2);
  await page.click('[data-gate-choice="new"]');
  check('제출 직전 새 참여자 전환: 작성 중인 문장은 남음', (await page.inputValue('#userNarrative')) === C);
  check('제출 직전 새 참여자 전환: 이전 참여자 정보는 지워짐', !(await smKeys(page)).includes('sm_age_group') && /새 참여자로 바꿨습니다/.test(await lastStatus(page)));
  await page.click('#submitNarrative');
  await page.waitForFunction(() => /등록되었습니다/.test(document.getElementById('submitStatus').textContent));
  db = await page.evaluate(() => window.__mockDb.read());
  const rowC = db.shared_expressions[2];
  const keyC = db.expression_participants[2] && db.expression_participants[2].participant_key;
  check('C의 제출에 B의 연령대·탐구 전 문장이 섞이지 않음', rowC && rowC.content === C && rowC.age_group === null && rowC.before_content === null);
  check('C의 참여자 키는 A·B와 다름', keyC && keyC !== keyA && keyC !== keyB);
  check('DB의 A·B 데이터는 유지 (삭제·수정 요청 없음)', db.shared_expressions.length === 3 && db.shared_expressions[0].content === A.text &&
    db.shared_expressions[1].content === B.text && (await page.evaluate(() => window.__mockDb.calls.every(c => c.op === 'insert' || c.op === 'rpc'))));
  await page.reload();
  check('새로고침 후에도 C의 키 유지 (A·B로 돌아가지 않음)', await page.evaluate(k => localStorage.getItem('sm_participant_key') === k, keyC));
  check('A·B·C 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));

  /* ---------- 2. 작성 중인 내용의 의도치 않은 삭제 방지 · 제출 실패 시 보존 ---------- */
  page = await mockPage(context);
  await page.goto(base + 'index.html');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.click('#startButton');
  await page.click('#agePicker [data-age-value="10s"]');
  await page.click('#agePickerNextBtn');
  await page.click('.event-card[data-event-id="imjin"]');
  await page.waitForSelector('#beforeInput');
  await page.fill('#beforeInput', 'D의 탐구 전 문장');
  await page.click('[data-before-action="save"]');
  await page.click('.tab[data-tab="shared"]');
  await page.fill('#userNarrative', 'D가 작성 중인 문장');
  page.__dialogAnswer = false;
  let dialogText = '';
  page.once('dialog', d => { dialogText = d.message(); });
  await page.click('#flowProgress [data-new-participant]');
  check('작성 중이면 초기화 전에 확인 창', /작성 중인 문장/.test(dialogText) && /탐구 전 문장/.test(dialogText), dialogText);
  check('확인 창에서 취소하면 아무것도 지우지 않음', (await page.inputValue('#userNarrative')) === 'D가 작성 중인 문장' &&
    await page.evaluate(() => localStorage.getItem('sm_before_imjin') === 'D의 탐구 전 문장'));
  await page.evaluate(() => { window.__mockDb.failInsert = true; });
  await page.check('#publishConsent');
  await page.click('#submitNarrative');
  await page.waitForFunction(() => /실패/.test(document.getElementById('submitStatus').textContent));
  check('제출 실패 시 작성 중인 문장 유지', (await page.inputValue('#userNarrative')) === 'D가 작성 중인 문장');
  check('제출 실패 시 탐구 전 문장 유지', await page.evaluate(() => localStorage.getItem('sm_before_imjin') === 'D의 탐구 전 문장'));
  // 선택 창에서 "새 참여자"를 눌러도, 제출하지 않은 탐구 전 문장이 있으면 한 번 더 확인
  await page.evaluate(() => { setParticipantChoice(null); navigateTo('events'); });
  await page.click('.event-card[data-event-id="zainichi"]');
  dialogText = '';
  page.once('dialog', d => { dialogText = d.message(); });
  await page.click('[data-gate-choice="new"]');
  check('선택 창의 새 참여자도 미제출 문장이 있으면 확인 창', /탐구 전 문장/.test(dialogText), dialogText);
  check('확인 취소 시 선택 창 유지·데이터 보존', await gateVisible(page) && await page.evaluate(() => localStorage.getItem('sm_before_imjin') === 'D의 탐구 전 문장'));
  page.__dialogAnswer = true;
  await page.click('[data-gate-choice="new"]');
  check('확인 후에는 초기화되고 연령대 선택부터', (await smKeys(page)).length === 0 && await page.isVisible('#agePicker'));
  check('삭제 방지 흐름에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await context.close();

  /* ---------- 3. 저장소(localStorage·sessionStorage)를 쓸 수 없는 환경 · 모바일 ---------- */
  const noStorage = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await noStorage.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, { get() { throw new DOMException('blocked', 'SecurityError'); } });
    }
  });
  page = await mockPage(noStorage);
  await page.goto(base + 'index.html');
  await page.click('#startButton');
  await page.click('#agePicker [data-age-value="10s"]');
  await page.click('#agePickerNextBtn');
  await page.click('.event-card[data-event-id="imjin"]');
  await writeAndSubmit(page, 'E의 문장', '저장소가 막힌 환경에서도 참여할 수 있다는 E의 문장');
  db = await page.evaluate(() => window.__mockDb.read());
  check('저장소가 막혀도 참여·제출 가능 (탐구 전 문장 포함)', db.shared_expressions.length === 1 && db.shared_expressions[0].before_content === 'E의 문장');
  await page.click('.nav__menu a[data-view="participate"]');
  await page.waitForSelector('.page--home.active');
  await page.click('[data-quick-event="imjin"]');
  check('저장소가 막혀도 제출 후 다음 참여 시작 때 선택 창', await gateVisible(page));
  const box = await page.$eval('.participant-gate__card', el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
  check('모바일 폭에서 선택 창이 화면 안에 들어옴', box.l >= 0 && box.r <= box.w, JSON.stringify(box));
  await page.click('[data-gate-choice="new"]');
  await page.waitForSelector('.page--detail.active');
  check('저장소가 막혀도 새 참여자로 시작 가능 (누르던 사건을 기본 체험으로 바로 엶 · 연령대 묻지 않음)',
    (await page.$eval('.page--detail', el => `${el.dataset.mode}:${el.dataset.step}`)) === 'quick:1' && !(await page.isVisible('#agePicker')));
  check('저장소가 막힌 환경에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  check('모바일 폭에서 가로 넘침 없음', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await noStorage.close();
});
