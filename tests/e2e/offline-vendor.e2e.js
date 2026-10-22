/* Supabase JS 저장소 내 보관 — 브라우저 E2E (외부 CDN 차단, 실제 DB 접속 없음)
   실행: node tests/e2e/offline-vendor.e2e.js   (전체: npm run test:e2e)
   · 같은 주소(로컬 서버) 밖으로 나가는 요청은 모두 막습니다. → 학교망에서 CDN이 차단된 상황
   · Supabase API 요청은 가짜 응답으로 바꾸거나(정상 경로) 실패시킵니다(네트워크 장애 경로).
   · 여기서는 mock-supabase.js를 쓰지 않고, 저장소의 실제 vendor 라이브러리를 그대로 불러옵니다. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, ROOT } = require('./harness');

const SUPABASE = /^https:\/\/[a-z0-9]+\.supabase\.co\//;
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'supabase-js', 'VERSION.json'), 'utf8'));
const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function openPage(browser, base, presetContinue, apiHandler, viewport) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  await context.addInitScript(presetContinue);       // 한 사람이 계속 참여하는 상황 (선택 창이 없는 버전에서는 영향 없음)
  const page = await context.newPage();
  page.__errors = [];
  page.__external = [];
  page.__api = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  // 1) 같은 주소 밖 요청은 모두 차단 (CDN·폰트 포함) — Supabase API는 아래에서 따로 처리
  await page.route(url => !url.href.startsWith(base) && !SUPABASE.test(url.href), r => { page.__external.push(r.request().url()); r.abort(); });
  // 2) Supabase API: 실제 서버로 보내지 않음
  await page.route(SUPABASE, r => {
    const req = r.request();
    page.__api.push({ method: req.method(), url: req.url(), body: req.postData() });
    return apiHandler(r, req);
  });
  return { context, page };
}

run('offline-vendor', async ({ browser, base, check, presetContinue }) => {
  /* ---------- 1. CDN 차단 + 정상 API (가짜 응답) ---------- */
  const rows = [];
  const ok = await openPage(browser, base, presetContinue, (r, req) => {
    const u = req.url();
    if (u.includes('/rpc/public_expressions')) return json(r, 200, rows);
    if (u.includes('/rpc/empathy_counts')) return json(r, 200, []);
    if (u.includes('/rpc/participation_summary')) return json(r, 200, [{ participants: rows.length, completed_participants: 0, expressions: rows.length }]);
    if (u.includes('/rpc/age_group_participants')) return json(r, 200, []);
    if (u.includes('/rest/v1/shared_expressions') && req.method() === 'POST') {
      const body = JSON.parse(req.postData())[0];
      const row = Object.assign({ id: 1000 + rows.length, created_at: new Date().toISOString(), age_group_suppressed: false }, body);
      rows.unshift(row);
      return json(r, 201, [{ id: row.id }]);
    }
    if (u.includes('/rest/v1/expression_participants')) return r.fulfill({ status: 201, body: '' });
    return json(r, 404, { message: 'not mocked' });
  });
  let page = ok.page;
  // 응답 대기를 goto 전에 걸어 두어, 본문 해시를 확인하기 전에 검사가 먼저 실행되지 않게 합니다.
  const vendorResponse = page.waitForResponse(res => /\/vendor\/supabase-js\/supabase\.js$/.test(res.url()));
  await page.goto(base + 'index.html');
  const vendor = await vendorResponse.then(async res => ({
    url: res.url(), status: res.status(),
    sha256: crypto.createHash('sha256').update(await res.body()).digest('hex')
  })).catch(e => ({ error: e.message }));
  check('supabase-js를 같은 주소의 vendor 파일에서 받음 (HTTP 200)', vendor && vendor.status === 200 && vendor.url.startsWith(base), JSON.stringify(vendor));
  check(`받은 vendor 파일이 기록된 ${VERSION.version} 파일과 같음 (sha256)`, vendor && vendor.sha256 === VERSION.fileSha256);
  check('외부 CDN 없이 supabase-js가 로드됨 (window.supabase.createClient)', await page.evaluate(() => !!(window.supabase && typeof window.supabase.createClient === 'function')));
  check('Supabase 클라이언트(db)가 만들어짐', await page.evaluate(() => typeof db !== 'undefined' && db !== null && typeof db.from === 'function'));
  // 서체(Pretendard CSS·woff2, Google Fonts)는 공식 배포처에서 받고 실패해도 기본 서체로 동작하므로 스크립트 검사에서 제외합니다.
  const isFontAsset = u => /\.(css|woff2?)(\?|$)/.test(u) || /fonts\.googleapis\.com|fonts\.gstatic\.com|hangeul\.pstatic\.net/.test(u);
  check('외부 스크립트 요청이 없음 (CDN 시도 0건)', !page.__external.some(u => !isFontAsset(u) && (/\.js(\?|$)/.test(u) || /jsdelivr|unpkg|cdnjs/.test(u))), page.__external.join(', '));
  check('서체를 불러오지 못해도(외부 차단) 화면 글자는 기본 서체로 표시', await page.evaluate(() => {
    const t = document.querySelector('.hero__title');
    return !!t && t.getBoundingClientRect().height > 0 && /MaruBuri/.test(getComputedStyle(t).fontFamily) && /Noto Serif KR|serif/.test(getComputedStyle(t).fontFamily);
  }));
  check('페이지 기본 JS 동작 (사건 카드 6개 렌더)', (await page.$$eval('.event-card', els => els.length)) === 6);
  await page.evaluate(() => { localStorage.setItem('sm_age_group', '10s'); openEventDetail('imjin'); switchTab('shared'); });
  await page.waitForFunction(() => /첫 번째 제안|아직 등록된/.test(document.getElementById('sharedList').textContent));
  check('실제 라이브러리로 목록 조회 요청 (public_expressions RPC)', page.__api.some(a => a.method === 'POST' && /\/rpc\/public_expressions$/.test(a.url)));
  await page.fill('#userNarrative', '임진왜란은 일본의 침략으로 시작되어 조선과 명이 함께 맞선 전쟁이었다.');
  await page.check('#publishConsent');   // 공개 등록은 별도 동의
  await page.click('#submitNarrative');
  await page.waitForFunction(() => /등록되었습니다|실패/.test(document.getElementById('submitStatus').textContent));
  check('실제 라이브러리로 등록 성공 (가짜 응답)', /등록되었습니다/.test(await page.$eval('#submitStatus', el => el.textContent)));
  const insert = page.__api.find(a => a.method === 'POST' && /\/rest\/v1\/shared_expressions\?/.test(a.url));
  const cols = insert ? decodeURIComponent((insert.url.match(/columns=([^&]+)/) || [])[1] || '').replace(/"/g, '').split(',') : [];
  check('등록 요청에 id·created_at을 보내지 않음 (DB 허용 컬럼과 호환)', insert && cols.length > 0 && !cols.includes('id') && !cols.includes('created_at'), cols.join(','));
  check('등록 후 목록에 반영', (await page.$$eval('#sharedList .shared-item', els => els.length)) === 1);
  check('정상 경로에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await ok.context.close();

  /* ---------- 2. 네트워크 장애 (Supabase API 연결 실패) ---------- */
  const down = await openPage(browser, base, presetContinue, r => r.abort('internetdisconnected'), { width: 390, height: 844 });
  page = down.page;
  await page.goto(base + 'index.html');
  check('API 장애여도 페이지가 열림 (사건 카드 6개)', (await page.$$eval('.event-card', els => els.length)) === 6);
  check('API 장애 시 참여자 수 문구는 숨김', await page.$eval('#participantCount', el => el.hidden));
  await page.evaluate(() => { localStorage.setItem('sm_age_group', '10s'); openEventDetail('imjin'); switchTab('shared'); });
  await page.waitForFunction(() => /불러오지 못했습니다/.test(document.getElementById('sharedList').textContent));
  const listMsg = await page.$eval('#sharedList', el => el.textContent);
  check('목록 실패 시 네트워크 안내 표시', /네트워크에 연결할 수 없습니다/.test(listMsg), listMsg);
  await page.fill('#userNarrative', '네트워크가 끊긴 상태에서 쓴 문장입니다.');
  await page.check('#publishConsent');
  await page.click('#submitNarrative');
  await page.waitForFunction(() => /실패/.test(document.getElementById('submitStatus').textContent));
  const saveMsg = await page.$eval('#submitStatus', el => el.textContent);
  check('등록 실패 시 네트워크 안내 표시', /네트워크에 연결할 수 없습니다/.test(saveMsg), saveMsg);
  check('등록 실패 시 작성한 문장 유지', (await page.inputValue('#userNarrative')) === '네트워크가 끊긴 상태에서 쓴 문장입니다.');
  await page.click('.tab[data-tab="memory"]');
  check('공동 기억 지도 탭도 오류 안내로 표시', /불러오지 못해/.test(await page.$eval('#memoryResult', el => el.textContent)));
  await page.click('.tab[data-tab="ai"]');
  check('API 장애와 무관하게 서술 비교 분석 동작', (await page.$$eval('#aiGlance [data-glance-term]', els => els.length)) > 3);
  check('네트워크 장애 경로에서 페이지 오류 없음', page.__errors.length === 0, page.__errors.join(' | '));
  await down.context.close();
});
