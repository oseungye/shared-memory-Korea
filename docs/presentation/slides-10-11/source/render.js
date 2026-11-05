const path=require('node:path');
const { chromium } = require('/home/user/shared-memory-Korea/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
for(const [s,nt] of [['10',0],['11',0],['10',1],['11',1]]){
 await p.goto('file://'+path.join(__dirname,'slides.html')+'?s='+s+(nt?'&notitle=1':''));
 await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
 await p.screenshot({path:path.join(__dirname,'out',`slide${s}${nt?'-notitle':''}.png`)});}
await b.close();})();
