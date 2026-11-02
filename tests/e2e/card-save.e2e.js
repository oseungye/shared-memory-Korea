/* My Memory Card 이미지 저장 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/card-save.e2e.js   (전체: npm run test:e2e)
   미리 만든 이미지로 바로 내려받기 · 연달아 눌러도 한 번 · 디자인을 바꾸면 새 이미지 · 이미지로 열기(길게 눌러 저장) ·
   이미지 생성 실패 처리 · 새 참여자로 시작하면 미리 만든 이미지 삭제 · PC(Chrome)·Android(Chrome) 화면 */
'use strict';
const fs = require('node:fs');
const { run } = require('./harness');

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const pngInfo = buf => ({ png: buf.slice(1, 4).toString() === 'PNG', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length });

/** 기본 체험으로 카드 화면까지: 시작 → 질문마다 첫 선택지 → 한 줄 소감 → 카드 */
async function toCard(page, base, reflect) {
  await page.goto(base + 'index.html#/e/imjin');
  await page.waitForSelector('.page--detail.active');
  await page.click('[data-step-main="q1"]');
  // 질문이 넘어가는 효과 중에 누른 탭은 무시되므로(두 번 넘어감 방지) STEP 3이 될 때까지 다시 고릅니다.
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(600);
    if (await page.$eval('.page--detail', el => el.dataset.step) === '3') break;
    await page.click('#choiceStep [data-choice-option]');
    await page.click('[data-step-main="q2"]');                       // 고른 뒤 '다음 질문'으로 이동 (#32)
  }
  await page.waitForFunction(() => document.querySelector('.page--detail').dataset.step === '3');
  await page.fill('#reflectInput', reflect);
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active');
}

const imageReady = page => page.waitForFunction(() => cardImage.blob && cardImage.key === cardImageKey(), null, { timeout: 10000 });

run('card-save', async ({ browser, base, check, mockPage, presetContinue }) => {
  for (const [name, opts] of [
    ['PC', { viewport: { width: 1280, height: 900 } }],
    ['Android', { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: ANDROID_UA }]
  ]) {
    const ctx = await browser.newContext(Object.assign({ acceptDownloads: true }, opts));
    await ctx.addInitScript(presetContinue);
    const page = await mockPage(ctx);
    const REFLECT = '같은 전쟁을 서로 다른 이름으로 부른다는 것을 <알게> 되었다.';
    await toCard(page, base, REFLECT);

    await imageReady(page);
    check(`${name}: 카드 화면에 들어오면 저장용 이미지를 미리 만듦`, true);

    // 1) 미리 만든 이미지로 바로 내려받기
    const t0 = Date.now();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-card-action="png"]')]);
    const ms = Date.now() - t0;
    const file = await dl.path();
    const info = pngInfo(fs.readFileSync(file));
    check(`${name}: 누르면 바로 내려받기 시작 (1초 안)`, ms < 1000, `${ms}ms`);
    check(`${name}: PNG 1080px 폭, 4:5 이상 높이`, info.png && info.width === 1080 && info.height >= 1350, JSON.stringify(info));
    check(`${name}: 파일 이름에 사건·디자인`, /^shared-memory-card-imjin-\d{8}-[a-z]+\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const status = await page.textContent('#cardActionStatus');
    check(`${name}: 안내는 '저장했습니다'가 아니라 '내려받기를 시작했습니다'`, /내려받기를 시작했습니다/.test(status) && !/저장했습니다/.test(status), status);
    check(`${name}: 저장 뒤 '이미지로 열기' 안내 표시`, await page.isVisible('[data-card-action="open-image"]'));

    // 2) 연달아 눌러도 한 번만
    let extra = 0;
    const count = () => { extra++; };
    page.on('download', count);
    await page.click('[data-card-action="png"]');
    await page.click('[data-card-action="png"]');
    await page.click('[data-card-action="png"]');
    await page.waitForTimeout(1200);
    page.off('download', count);
    check(`${name}: 같은 카드를 연달아 눌러도 파일을 또 내려받지 않음`, extra === 0, `추가 ${extra}건`);
    check(`${name}: 연달아 누르면 '방금 내려받기를 시작했어요' 안내`, /방금 내려받기를 시작했어요/.test(await page.textContent('#cardActionStatus')));

    // 3) 디자인을 바꾸면 그 디자인의 새 이미지
    const themes = await page.$$eval('[data-card-theme]', els => els.map(e => e.dataset.cardTheme));
    const other = themes.find(t => !dl.suggestedFilename().includes(`-${t}.png`));
    await page.click(`[data-card-theme="${other}"]`);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-card-action="png"]')]);
    const info2 = pngInfo(fs.readFileSync(await dl2.path()));
    check(`${name}: 디자인을 바꾸면 그 디자인으로 다시 내려받음`, dl2.suggestedFilename().includes(`-${other}.png`) && info2.png && info2.width === 1080, dl2.suggestedFilename());
    await page.click('[data-card-format="story"]');
    const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('[data-card-action="png"]')]);
    const info3 = pngInfo(fs.readFileSync(await dl3.path()));
    check(`${name}: 인스타 스토리 형식은 1080×1920`, info3.width === 1080 && info3.height === 1920 && /-story\.png$/.test(dl3.suggestedFilename()), JSON.stringify(info3));
    await page.click('[data-card-format="feed"]');

    // 4) 이미지로 열기 (내려받기가 막힌 브라우저용)
    await page.click('[data-card-action="open-image"]');
    await page.waitForSelector('#cardSaveSheet');
    await page.waitForFunction(() => document.querySelector('#cardSaveSheet img').naturalWidth > 0);
    const sheet = await page.evaluate(() => {
      const img = document.querySelector('#cardSaveSheet img');
      const a = document.querySelector('#cardSaveSheet [data-card-sheet-download]');
      return { w: img.naturalWidth, src: img.src.slice(0, 5), dl: a.getAttribute('download'), href: a.href.slice(0, 5), focus: document.activeElement.hasAttribute('data-card-sheet-close') };
    });
    check(`${name}: 이미지 창에 1080px 카드 이미지 · 파일로 내려받기 링크`, sheet.w === 1080 && sheet.src === 'blob:' && /\.png$/.test(sheet.dl) && sheet.href === 'blob:', JSON.stringify(sheet));
    check(`${name}: 이미지 창이 열리면 닫기 버튼에 초점`, sheet.focus);
    const inView = await page.$eval('#cardSaveSheet .card-save-sheet__box', el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
    check(`${name}: 이미지 창이 화면 안에 들어옴`, inView);
    await page.keyboard.press('Escape');
    check(`${name}: Esc로 이미지 창 닫힘`, !(await page.$('#cardSaveSheet')));

    // 5) 이미지 생성 실패 → 안내하고 다시 누를 수 있음
    await page.evaluate(() => {
      window.__toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb) { setTimeout(() => cb(null), 0); };
    });
    const third = themes.find(t => t !== other && !dl.suggestedFilename().includes(`-${t}.png`));
    await page.click(`[data-card-theme="${third}"]`);
    let failDownloads = 0;
    const onFail = () => { failDownloads++; };
    page.on('download', onFail);
    await page.click('[data-card-action="png"]');
    await page.waitForFunction(() => /만들지 못했습니다/.test(document.getElementById('cardActionStatus').textContent));
    await page.waitForTimeout(500);
    page.off('download', onFail);
    check(`${name}: 이미지 생성 실패 시 안내하고 파일을 내려받지 않음`, failDownloads === 0);
    check(`${name}: 실패 뒤 버튼이 다시 눌림 상태 (aria-busy=false)`, await page.$eval('[data-card-action="png"]', el => el.getAttribute('aria-busy')) === 'false');
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__toBlob; });
    const [dl4] = await Promise.all([page.waitForEvent('download'), page.click('[data-card-action="png"]')]);
    check(`${name}: 실패 뒤 다시 누르면 내려받기 성공`, dl4.suggestedFilename().includes(`-${third}.png`));

    // 6) 새 참여자로 시작하면 미리 만든 이미지 삭제 (공용 기기)
    await page.click('.page--card [data-new-participant]');
    await page.waitForFunction(() => !document.querySelector('.page--card.active'));
    check(`${name}: 새 참여자로 시작하면 미리 만든 카드 이미지를 지움`, await page.evaluate(() => cardImage.blob === null && cardImage.key === ''));
    check(`${name}: 페이지 오류 없음`, page.__errors.length === 0, page.__errors.join(' / '));
    await ctx.close();
  }

  /* ---------- 글꼴이 늦게 오는 첫 방문: 기본 서체로 임시 이미지 → 글꼴이 오면 다시 만듦 ---------- */
  const slow = await browser.newContext({ acceptDownloads: true, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
  await slow.addInitScript(presetContinue);
  await slow.addInitScript(() => {
    window.__slowFonts = true;
    const load = document.fonts.load.bind(document.fonts);
    document.fonts.load = (...a) => window.__slowFonts ? new Promise(r => setTimeout(() => r([]), 4000)) : load(...a);
  });
  const sp = await mockPage(slow);
  await toCard(sp, base, '글꼴이 늦게 오는 상황에서도 저장되어야 한다.');
  await sp.waitForFunction(() => cardImage.blob && cardImage.provisional === true, null, { timeout: 15000 });
  check('글꼴이 3초 안에 오지 않으면 기본 서체로 임시 이미지를 만들어 둠 (바로 저장 가능)', true);
  const [early] = await Promise.all([sp.waitForEvent('download'), sp.click('[data-card-action="png"]')]);
  check('임시 이미지도 바로 내려받을 수 있음', pngInfo(fs.readFileSync(await early.path())).width === 1080);
  await sp.evaluate(() => { window.__slowFonts = false; document.fonts.dispatchEvent(new Event('loadingdone')); });
  await sp.waitForFunction(() => cardImage.blob && cardImage.provisional === false, null, { timeout: 15000 });
  check('글꼴이 도착하면 저장용 이미지를 다시 만듦', true);
  check('페이지 오류 없음 (글꼴 지연)', sp.__errors.length === 0, sp.__errors.join(' / '));
  await slow.close();
});
