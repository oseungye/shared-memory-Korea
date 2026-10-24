/* Shared Memory 홍보물 만들기 — QR(SVG) 생성 · A4 PDF 2장 출력 · 배치 점검
   실행: node promo/build-promo.js
   · QR: vendor/qrcode-generator(앱과 같은 라이브러리)로 배포 주소를 담은 벡터 SVG를 만듭니다.
   · PDF: Playwright(Chromium)로 poster.html · notice.html을 열어 서체를 모두 불러온 뒤 A4로 저장합니다.
     서체는 Google Fonts에서 받으므로 인터넷이 필요합니다(받지 못하면 실패로 끝냄 — 깨진 서체로 PDF를 만들지 않음).
   · 점검: 내용이 A4 한 장을 넘치지 않는지, 그림·QR이 모두 불러와졌는지, 필요한 서체가 실제로 쓰였는지. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SITE_URL = 'https://oseungye.github.io/shared-memory-Korea/';   // 저장소 홈페이지(GitHub Pages) 주소 — 로컬 주소 금지
const DIR = __dirname;
const ROOT = path.join(DIR, '..');

function buildQr() {
  if (!/^https:\/\/[a-z0-9.-]+\.github\.io\//.test(SITE_URL)) throw new Error('배포 주소가 아닙니다: ' + SITE_URL);
  const qrcode = require(path.join(ROOT, 'vendor', 'qrcode-generator', 'qrcode.js'));
  const qr = qrcode(0, 'Q');                 // Q = 오류 복원 25% (벽에 붙인 종이의 얼룩·빛 반사 대비)
  qr.addData(SITE_URL, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;                           // 여백 4칸 (QR 규격 권장)
  const size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<title>Shared Memory — ${SITE_URL}</title><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>\n`;
  fs.writeFileSync(path.join(DIR, 'assets', 'qr-shared-memory.svg'), svg);
  return { modules: n, version: (n - 17) / 4 };
}

async function buildPdfs() {
  const { chromium } = require('playwright');
  const opts = {};
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(opts);
  const results = [];
  try {
    for (const [file, out] of [['poster.html', 'shared-memory-poster-A4.pdf'], ['notice.html', 'shared-memory-notice-A4.pdf']]) {
      const page = await browser.newPage();
      await page.goto('file://' + path.join(DIR, file), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const check = await page.evaluate(() => {
        const sheet = document.querySelector('.sheet');
        const box = sheet.getBoundingClientRect();
        const outside = [...sheet.querySelectorAll('*')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.bottom > box.bottom - 6 || r.right > box.right - 6) && !el.closest('.sheet__vertical');
        }).map(el => el.className || el.tagName);
        const imgs = [...document.images].map(img => ({ src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0 }));
        const used = new Set();
        [...sheet.querySelectorAll('*')].forEach(el => used.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()));
        const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, ''));
        return { overflow: sheet.scrollHeight > sheet.clientHeight + 1, outside, imgs, used: [...used], loaded: [...new Set(loaded)] };
      });
      const need = ['Noto Serif KR', 'Noto Sans KR', 'Cinzel', 'Noto Serif JP', 'Noto Serif SC'];
      const missing = need.filter(f => !check.loaded.includes(f));
      if (missing.length) throw new Error(`${file}: 서체를 불러오지 못했습니다 (${missing.join(', ')}) — 인터넷 연결을 확인하세요`);
      if (check.overflow || check.outside.length) throw new Error(`${file}: 내용이 A4 한 장을 넘칩니다 (${check.outside.slice(0, 5).join(', ')})`);
      const badImg = check.imgs.filter(i => !i.ok);
      if (badImg.length) throw new Error(`${file}: 그림을 불러오지 못했습니다 (${badImg.map(i => i.src).join(', ')})`);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: path.join(DIR, 'dist', out), format: 'A4', printBackground: true, preferCSSPageSize: true });
      results.push({ file, out, fonts: check.loaded });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

(async () => {
  fs.mkdirSync(path.join(DIR, 'dist'), { recursive: true });
  const qr = buildQr();
  console.log(`QR: ${SITE_URL} · 버전 ${qr.version} (${qr.modules}×${qr.modules}칸) · 오류 복원 Q`);
  const pdfs = await buildPdfs();
  pdfs.forEach(r => console.log(`PDF: promo/dist/${r.out}  ← ${r.file}  (서체: ${r.fonts.join(', ')})`));
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
