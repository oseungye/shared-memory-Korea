/* 홍보 영상 1단계: 실제 사이트를 휴대폰 크기(400x600, 2.7배 = 1080px 폭)로 열어 단계별 화면을 shots2/에 캡처합니다.
   가짜 Supabase(tests/e2e/mock-supabase.js)를 써서 실제 DB에 접속하지 않고, 입력 문장은 모두 예시입니다.
   실행: node tools/promo/capture.js → node tools/promo/render.js (ffmpeg 필요) */
// 실제 Shared Memory 화면을 휴대폰 크기로 열어 단계별 캡처 (가짜 Supabase, 실제 DB 접속 없음)
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const MOCK = fs.readFileSync(ROOT + '/tests/e2e/mock-supabase.js', 'utf8');
const OUT = path.join(__dirname, 'shots2');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const BEFORE = '일본이 조선을 침략한 전쟁';
const AFTER = '같은 전쟁을 세 나라는 서로 다른 이름으로 기억한다. 침략의 피해와 명의 참전을 함께 기억하고 싶다.';
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 600 }, deviceScaleFactor: 2.7, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.route(u => !u.href.startsWith(base) && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), r => r.abort());
  await page.route(/supabase-js|vendor\/supabase/, r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  const boxes = {};
  const rect = sel => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const shot = async (name, opts = {}) => { await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, name + '.png'), ...opts }); console.log('shot', name); };
  const scrollTo = async (sel, offset = 0) => { await page.evaluate(([s, o]) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o); }, [sel, offset]); await page.waitForTimeout(400); };

  await page.goto(base + 'index.html');
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200);
  await shot('01-home');
  await page.click('#startButton');
  await page.click('#agePicker [data-age-value="10s"]');
  await shot('02-age');
  await page.click('#agePickerNextBtn');
  await page.waitForSelector('.page--events.active');
  await scrollTo('.event-card[data-event-id="imjin"]', 64);
  await shot('03-events');
  for (const id of ['imjin', 'zainichi']) await page.locator(`.event-card[data-event-id="${id}"]`).screenshot({ path: path.join(OUT, `03-card-${id}.png`) });
  boxes.imjin = await rect('.event-card[data-event-id="imjin"]');
  boxes.zainichi = await rect('.event-card[data-event-id="zainichi"]');
  await page.click('.event-card[data-event-id="imjin"]');
  await page.waitForSelector('.page--detail.active');
  await page.waitForTimeout(600);
  await scrollTo('#detailHeader', 60);
  await shot('04-detail-top');
  // STEP 1: 객관식(이전에 배운 경험) 고르기 + 탐구 전 한 문장
  await page.fill('#beforeInput', BEFORE);
  await scrollTo('#beforeCard', 70);
  await shot('05-before-typed');
  await page.click('[data-before-action="save"]');
  await page.waitForTimeout(500);
  // STEP 2: 세 나라 서술
  await scrollTo('#narrativesGrid', 80);
  await shot('08-narr-1');
  const cards = await page.$$('#narrativesGrid > *');
  for (let i = 1; i < Math.min(3, cards.length); i++) {
    await page.evaluate(i => { const el = document.querySelectorAll('#narrativesGrid > *')[i]; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80); }, i);
    await shot('08-narr-' + (i + 1));
  }
  await scrollTo('#compareSummary', 80);
  await shot('09-compare-sum');
  // STEP 3: 발견한 관점(객관식 칩) + 한 문장
  await page.click('.tab[data-tab="shared"]');
  await page.waitForTimeout(500);
  await scrollTo('#discoveryStepLabel', 90);
  await shot('10-discovery-empty');
  const ids = await page.$$eval('#discoveryStep [data-discovery-step]', els => els.map(e => e.dataset.discoveryStep));
  console.log('chips', ids);
  const pick = [ids[0], ids[2] || ids[1]];
  for (let k = 0; k < 2; k++) {
    boxes['chip' + k] = await rect(`[data-discovery-step="${pick[k]}"]`);
    await page.click(`[data-discovery-step="${pick[k]}"]`);
    await shot('1' + (1 + k) + '-discovery-' + (k + 1));
  }
  await scrollTo('.core-step--main', 90);
  for (const [i, n] of [[0, 0], [1, 14], [2, 30], [3, AFTER.length]]) {
    await page.fill('#userNarrative', AFTER.slice(0, n));
    await shot('13-type-' + i);
  }
  boxes.make = await rect('#makeCardButton');
  await page.click('#makeCardButton');
  await page.waitForSelector('.page--card.active');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('14-card-page');
  await page.$eval('#memoryCard', el => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.locator('#memoryCard').screenshot({ path: path.join(OUT, '15-card.png') });
  fs.writeFileSync(path.join(OUT, 'boxes.json'), JSON.stringify(boxes, null, 1));
  console.log('card done', boxes);
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
