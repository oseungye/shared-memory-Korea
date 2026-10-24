/* 학교 부착용 QR 포스터 — 브라우저 E2E (가짜 Supabase 사용, 실제 DB 접속 없음)
   실행: node tests/e2e/qr-poster.e2e.js   (전체: npm run test:e2e)
   사건별·첫 화면 링크 · 사건 데이터에서 온 이름 · 맨 아래 문구(이스케이프·저장 안 함) · A4 한 장 인쇄 ·
   QR 시트 인쇄와 분리 · 휴대폰 화면 */
'use strict';
const { run } = require('./harness');

run('qr-poster', async ({ browser, base, check, mockPage }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await mockPage(ctx);
  const external = [];
  page.on('request', r => { if (!r.url().startsWith(base)) external.push(r.url()); });
  await page.goto(base + 'index.html');
  await page.click('a[data-page="qr"]');
  await page.waitForSelector('.page--qr.active #qrPoster svg');

  const poster = () => page.$eval('#qrPoster', el => ({ text: el.innerText, target: el.dataset.target, url: el.querySelector('.qr-poster__url')?.textContent }));
  const site = base + 'index.html';
  let p = await poster();
  check('첫 화면 링크로 QR 페이지 → 포스터 미리보기 (기본: 임진왜란)', p.target === 'imjin' && p.url === site + '#/e/imjin', JSON.stringify(p.url));
  const names = await page.evaluate(() => { const e = eventsData.find(x => x.id === 'imjin'); return [e.title, e.titleJP, e.titleCN]; });
  check('세 나라 이름은 사건 데이터에서 (한국·일본·중국 명칭 + AI ?)',
    names.every(n => n && p.text.includes(n)) && /AI\s*\?/.test(p.text), names.join(' / '));
  check('일본어·중국어 이름에 lang 표시 (서체)', await page.$$eval('#qrPoster [lang="ja"], #qrPoster [lang="zh-Hans"]', els => els.length) === 2);
  check('질문·단계·참여 조건·개인정보 안내', /같은 전쟁을, 세 나라는 왜 서로 다른 이름으로 부를까요\?/.test(p.text) &&
    /나만의 Memory Card/.test(p.text) && /3–5분 · 익명 · 로그인 없음 · 정답 없음/.test(p.text) && /이름·연락처는 묻지 않아요/.test(p.text));
  const sameQr = await page.evaluate(() => {
    const url = document.querySelector('#qrPoster .qr-poster__url').textContent;
    const make = level => { const d = document.createElement('div'); d.innerHTML = qrSvg(url, level); return d.innerHTML; };
    const shown = document.querySelector('#qrPoster .qr-poster__code').innerHTML;
    return shown === make('Q') && shown !== make('M');
  });
  check('QR은 인쇄된 주소를 그대로 담음 (오류 복원 Q)', sameQr);

  await page.click('[data-poster-target="zainichi"]');
  p = await poster();
  check('재일조선인 바로 시작으로 바꾸면 링크·제목이 바뀜', p.target === 'zainichi' && p.url === site + '#/e/zainichi' && /누구의 역사일까/.test(p.text));
  check('선택 표시(aria-checked)가 따라감', await page.$eval('[data-poster-target="zainichi"]', el => el.getAttribute('aria-checked') === 'true') &&
    await page.$eval('[data-poster-target="imjin"]', el => el.getAttribute('aria-checked') === 'false'));
  await page.click('[data-poster-target="home"]');
  p = await poster();
  check('첫 화면 포스터: 사이트 주소 · 두 사건 함께 표시', p.url === site && /임진왜란/.test(p.text) && /재일조선인/.test(p.text));

  await page.fill('#posterFooter', '<b>역사 동아리 기억</b> · 11월 한 달간');
  p = await poster();
  check('맨 아래 문구는 글자 그대로 표시 (HTML로 해석하지 않음)', p.text.includes('<b>역사 동아리 기억</b> · 11월 한 달간') &&
    await page.$$eval('#qrPoster .qr-poster__org b', els => els.length) === 0);
  check('맨 아래 문구는 저장하지 않음 (브라우저 저장소에 없음)', await page.evaluate(() => !JSON.stringify(Object.assign({}, localStorage, sessionStorage)).includes('역사 동아리')));
  check('맨 아래 문구는 60자까지', await page.$eval('#posterFooter', el => el.maxLength === 60));

  // 인쇄: 포스터만 A4 한 장 / QR 시트 인쇄에는 포스터가 빠짐
  await page.click('[data-poster-target="imjin"]');
  await page.evaluate(() => document.body.classList.add('printing-poster'));
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const a4 = /\/MediaBox\s*\[\s*0 0 59[45](\.\d+)? 84[12](\.\d+)?\s*\]/.test(pdf.toString('latin1'));
  check('포스터 인쇄: A4 한 장', pages === 1 && a4, `pages=${pages} a4=${a4}`);
  check('포스터 인쇄 중에는 QR 시트·안내·버튼이 숨겨짐', await page.evaluate(() =>
    getComputedStyle(document.getElementById('qrGrid')).display === 'none' &&
    getComputedStyle(document.querySelector('.qr-guide')).display === 'none' &&
    getComputedStyle(document.querySelector('.qr-poster-controls')).display === 'none' &&
    getComputedStyle(document.getElementById('qrPoster')).display !== 'none'));
  await page.evaluate(() => document.body.classList.remove('printing-poster'));
  check('QR 시트 인쇄에는 포스터가 빠짐', await page.evaluate(() =>
    getComputedStyle(document.getElementById('qrPosterWrap')).display === 'none' && getComputedStyle(document.getElementById('qrGrid')).display !== 'none'));
  await page.emulateMedia({ media: 'screen' });
  // 인쇄 버튼: 포스터 인쇄 상태로 바꿨다가 인쇄 창이 닫히면 원래대로
  await page.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.body.classList.contains('printing-poster')); });
  await page.click('[data-qr-action="print-poster"]');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check('포스터 인쇄 버튼: 인쇄하는 순간에만 포스터 모드', await page.evaluate(() => window.__printed.length === 1 && window.__printed[0] === true && !document.body.classList.contains('printing-poster')));
  check('QR 시트 인쇄 버튼은 포스터 모드가 아님', await page.evaluate(() => { document.querySelector('[data-qr-action="print"]').click(); return window.__printed[1] === false; }));
  check('외부 QR 서비스·이미지 요청 없음', external.filter(u => !/fonts\.(googleapis|gstatic)|cdn\.jsdelivr|hangeul\.pstatic/.test(u)).length === 0, external.join(' '));
  check('페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await ctx.close();

  // 휴대폰
  const mctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const m = await mockPage(mctx);
  await m.goto(base + 'index.html');
  await m.evaluate(() => navigateTo('qr'));
  await m.waitForSelector('#qrPoster svg');
  check('휴대폰 360px: 가로 넘침 없음', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const box = await m.$eval('#qrPoster', el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check('휴대폰 미리보기도 A4 비율', Math.abs(box.h / box.w - 297 / 210) < 0.02, JSON.stringify(box));
  check('포스터 선택 버튼 터치 높이 44px 이상', await m.$$eval('[data-poster-target]', els => els.every(e => e.getBoundingClientRect().height >= 44)));
  await mctx.close();
});
