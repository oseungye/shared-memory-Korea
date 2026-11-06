// node docs/presentation/slides-16-tech/source/render.js → ../slide16-*.png (1920×1080의 2배)
const path = require('node:path');
const { chromium } = require(path.join(__dirname, '../../../../node_modules/playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  for (const [s, name] of [['a', 'slide16-structure'], ['b', 'slide16b-verification']]) {
    for (const nt of [0, 1]) {
      await p.goto('file://' + path.join(__dirname, 'tech.html') + '?s=' + s + (nt ? '&notitle=1' : ''));
      await p.waitForLoadState('networkidle'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(__dirname, '..', name + (nt ? '-notitle' : '') + '.png') });
    }
  }
  await b.close();
})();
