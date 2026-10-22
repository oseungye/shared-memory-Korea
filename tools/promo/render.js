/* 홍보 영상 2단계: compose.html을 시각 t마다 그려 30fps 프레임(frames/)으로 저장한 뒤 ffmpeg로 docs/promo/shared-memory-promo.mp4를 만듭니다.
   node render.js 2,12.5 처럼 초를 주면 그 시각의 확인용 프레임만 만듭니다. */
const path=require('node:path'),fs=require('node:fs');
const { chromium } = require('playwright');
const FPS=30, DUR=25, OUT=path.join(__dirname,'frames');
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const b=await chromium.launch({args:['--allow-file-access-from-files']});
  const p=await b.newPage({viewport:{width:1080,height:1920}});
  p.on('pageerror',e=>console.log('err',e.message));
  await p.goto('file://'+path.join(__dirname,'compose.html'));
  await p.evaluate(()=>document.fonts.ready);
  // 모든 캡처 미리 읽기
  await p.evaluate(async()=>{const names=['04-detail-top','08-narr-1','08-narr-2','08-narr-3','09-compare-sum','10-discovery-empty','11-discovery-1','12-discovery-2','13-type-0','13-type-1','13-type-2','13-type-3','14-card-page','15-card'];
    await Promise.all(names.map(n=>{const i=new Image();i.src='shots2/'+n+'.png';return i.decode()}));});
  await p.waitForTimeout(800);
  const only=process.argv[2]?process.argv[2].split(',').map(Number):null;
  const frames=only?only.map(s=>Math.round(s*FPS)):[...Array(FPS*DUR).keys()];
  for(const f of frames){
    await p.evaluate(t=>render(t),f/FPS);
    await p.evaluate(()=>Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode().catch(()=>{}))));
    await p.screenshot({path:path.join(OUT,(only?'check-':'')+String(f).padStart(4,'0')+'.jpg'),type:'jpeg',quality:95});
  }
  await b.close();
  if (!only) {
    const { execFileSync } = require('node:child_process');
    const mp4 = path.join(__dirname, '..', '..', 'docs', 'promo', 'shared-memory-promo.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, '%04d.jpg'),
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    console.log('저장:', mp4);
  }
})();
