const path=require('node:path');
const { chromium } = require('/home/user/shared-memory-Korea/node_modules/playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1200,height:800},deviceScaleFactor:2});
for(const p of ['9','12','13']){
 await pg.goto('file://'+path.join(__dirname,'panels.html')+'?p='+p);
 await pg.waitForLoadState('networkidle');await pg.evaluate(()=>document.fonts.ready);
 await pg.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));await pg.evaluate(()=>layout());await pg.waitForTimeout(300);
 await pg.locator('#p'+p).screenshot({path:path.join(__dirname,'out','panel'+p+'.png')});}
await b.close();})();
