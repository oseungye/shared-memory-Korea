// 슬라이드 9·12·13용 실제 화면 캡처 — 가짜 Supabase(tests/e2e/mock-supabase.js), 운영 DB 접속 없음. 입력 문장은 예시.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('/home/user/shared-memory-Korea/node_modules/playwright');
const ROOT = '/home/user/shared-memory-Korea';
const MOCK = fs.readFileSync(ROOT + '/tests/e2e/mock-supabase.js', 'utf8');
const OUT = path.join(__dirname, 'raw2');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\/orioncactus|hangeul\.pstatic\.net/;
const REFLECT = '같은 전쟁도 부르는 이름에 따라 보이는 것이 달라진다는 걸 알게 됐다.';

async function setup(ctx, base) {
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  page.on('dialog', d => d.dismiss());
  await page.route(u => !u.href.startsWith(base) && !FONT_HOSTS.test(u.href), r => r.abort());
  await page.route(/supabase-js|vendor\/supabase/, r => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
  return page;
}
async function closeGuide(page) {
  // 처음 들어오면 뜨는 '진행 안내'(#flowGuide)를 닫습니다
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    if (await page.isVisible('#flowGuide')) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); if (!(await page.isVisible('#flowGuide'))) return; }
  }
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  /* ---------- 휴대폰: 기본 체험 (슬라이드 9·13) ---------- */
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  let page = await setup(mob, base);
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name); };
  await page.goto(base + 'index.html');
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200);
  await shot('m-home');
  await page.click('[data-quick-event="imjin"]');
  await page.waitForSelector('.page--detail.active');
  await closeGuide(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('m-step1');
  await page.click('[data-step-main="q1"]'); await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('m-q1');
  const picks = ['many_names', 'alliance', null];
  for (let q = 0; q < 3; q++) {
    const opts = await page.$$eval('#choiceStep [data-choice-option]', els => els.map(e => e.dataset.choiceOption));
    const id = picks[q] && opts.includes(picks[q]) ? picks[q] : opts[0];
    await page.click(`[data-choice-option="${id}"]`); await page.waitForTimeout(300);
    if (q === 0) { await page.evaluate(() => { const p = document.getElementById('choicePrompt'); window.scrollTo(0, p.getBoundingClientRect().top + window.scrollY - 70); }); await page.mouse.move(1, 1); await shot('m-q1-picked'); }
    await page.click('[data-step-main="q2"]'); await page.waitForTimeout(600);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.fill('#reflectInput', REFLECT);
  await shot('m-reflect');
  await page.click('[data-step-main="q3"]');
  await page.waitForSelector('.page--card.active'); await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('m-card-page');
  await page.locator('#memoryCard').screenshot({ path: path.join(OUT, 'm-card.png') }); console.log('shot m-card');
  let db = await page.evaluate(() => window.__mockDb.read());
  console.log('가짜 DB(휴대폰):', Object.entries(db).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.length : '-')).join(' '));

  /* ---------- 데스크톱: 히로시마 기억의 빈자리 (슬라이드 12) ---------- */
  const desk = await browser.newContext({ viewport: { width: 860, height: 1000 }, deviceScaleFactor: 2 });
  page = await setup(desk, base);
  await page.goto(base + 'index.html#/e/hiroshima');
  await page.waitForSelector('#flowProgress');
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1000);
  await closeGuide(page);
  if (await page.$eval('.page--detail', e => e.dataset.mode) === 'quick') await page.click('[data-deep-switch="2"]');
  await page.waitForTimeout(500);
  if (await page.$('#flowProgress [data-step-goto="2"]')) await page.click('#flowProgress [data-step-goto="2"]');
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: '#stepCta,.step-cta,.nav,header.site-header,.site-nav{display:none!important}' });
  await page.click('.tab[data-tab="fourth"]'); await page.waitForTimeout(900);
  const gaps = page.locator('#memoryGaps');
  await gaps.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await gaps.screenshot({ path: path.join(OUT, 'hiroshima-gaps.png') });
  const gb = await gaps.evaluate(e => { const r = e.getBoundingClientRect(); return { y: r.y, h: r.height }; });
  const marks = await page.$$eval('#memoryGaps tr, #memoryGaps p, #memoryGaps li, #memoryGaps h3, #memoryGaps h4', els => els.map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, y: Math.round(r.y), b: Math.round(r.bottom), t: e.innerText.replace(/\s+/g, ' ').slice(0, 50) }; }));
  require('node:fs').writeFileSync(require('node:path').join(OUT, 'gaps-layout.json'), JSON.stringify({ gb, marks }, null, 1));
  const info = await page.$$eval('#memoryGaps *', els => els.filter(e => /조선인 피해자/.test(e.textContent) && e.children.length === 0).map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, text: e.textContent.trim().slice(0, 40), y: Math.round(r.y), h: Math.round(r.height) }; }));
  const top = await gaps.evaluate(e => Math.round(e.getBoundingClientRect().y));
  console.log('gaps top', top, JSON.stringify(info));
  const rows = await page.$$eval('#memoryGaps tr', trs => trs.map(t => { const r = t.getBoundingClientRect(); return { y: Math.round(r.y), h: Math.round(r.height), text: t.innerText.replace(/\s+/g, ' ').slice(0, 90) }; }));
  console.log(JSON.stringify(rows, null, 1));
  db = await page.evaluate(() => window.__mockDb.read());
  console.log('가짜 DB(데스크톱):', Object.entries(db).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.length : '-')).join(' '));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
