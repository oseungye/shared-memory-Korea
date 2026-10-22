/* ============================================================
   Shared Memory Project — card-themes.js
   My Memory Card 아트 컬렉션 테마 (동아시아 전통 미술에서 영감을 받은 카드 디자인)
   ============================================================
   · 테마: 고문서 기록첩(기본) · 민화 화조도 · 우키요에 · 청록산수 · 기본 카드(이전 디자인)
   · 모든 장식은 이 파일의 코드가 직접 그리는 '창작 벡터 그림'입니다.
     외부 그림·사진·텍스처 파일을 쓰지 않고, 특정 작품을 베끼거나 따라 그리지 않습니다.
     (전통 양식의 일반적인 특징 — 색감, 윤곽선, 구도 관습 — 만 참고)
   · 화면 카드(HTML 뒤 배경 캔버스)와 저장 이미지(drawCard)가 같은 함수로 그려서 모양이 어긋나지 않습니다.
   · 장식은 카드 가장자리와 위·아래 띠에만 놓고, 참여자의 문장은 무늬 없는 종이(panel) 위에 둡니다.
     패널 위로 넘어오는 장식(overlay)은 글자 영역(inner) 밖으로 잘라서 그려 문장을 가리지 않습니다.
   · 같은 사건·테마면 항상 같은 그림이 나오도록 난수는 시드(seed)로 고정합니다.
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CardThemes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const DEFAULT_THEME = 'archive';
  const ORDER = ['archive', 'minhwa', 'ukiyoe', 'sansu', 'classic'];
  const FORMATS = {
    feed: { id: 'feed', label: '카드', ratio: '4:5', width: 1080, minHeight: 1350, maxHeight: 1920 },
    story: { id: 'story', label: '인스타 스토리', ratio: '9:16', width: 1080, height: 1920 }
  };
  /** 인스타그램 스토리에서 프로필(위)·답장 칸(아래)에 가려지는 영역. 글자는 이 밖에 두지 않습니다. */
  const STORY_SAFE = { top: 250, bottom: 1920 - 320 };
  /**
   * 카드 서체 (모두 SIL OFL 1.1 — index.html에서 공식 배포처로 불러옴). 불러오지 못하면 뒤의 기본 서체로 그려집니다.
   * 카드 제목·문장은 Noto Serif KR / 고운바탕, 안내·라벨은 Pretendard, 영문 라벨은 Cormorant Garamond.
   * 장식 속 한자(제첨·제목 칸·인장)는 테마에 맞춰 Noto Serif KR · Zen Old Mincho(우키요에) · Noto Serif SC(청록산수).
   */
  const FONTS = {
    serif: "'Noto Serif KR', 'Nanum Myeongjo', serif",
    quote: "'Gowun Batang', 'Noto Serif KR', 'Nanum Myeongjo', serif",
    ui: "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
    latin: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
    mincho: "'Zen Old Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif KR', serif",
    song: "'Noto Serif SC', 'Songti SC', 'Noto Serif KR', serif"
  };
  const SERIF = FONTS.serif;
  /** 지금 그리는 테마의 장식용 한자 서체 (paintUnder/paintOver가 정함) */
  let ornament = { family: FONTS.serif, max: 900 };

  /* ---------- 공통 도구 ---------- */

  function hashSeed(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** 시드 고정 난수 (mulberry32) */
  function rng(seed) {
    let a = hashSeed(seed);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexRgb(hex) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  /** WCAG 대비율 */
  function contrast(a, b) {
    const lum = hex => {
      const [r, g, b2] = hexRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  function vgrad(c, y0, y1, stops) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([t, col]) => g.addColorStop(t, col));
    return g;
  }

  /** 세로쓰기 (한 글자씩) */
  function vtext(c, str, x, y, size, color, weight) {
    c.save();
    c.font = `${Math.min(weight || 700, ornament.max)} ${size}px ${ornament.family}`;
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
    Array.from(str).forEach((ch, k) => c.fillText(ch, x, y + size * 0.55 + k * size * 1.08));
    c.restore();
  }

  /** 종이 섬유 (한지) */
  function fibers(c, R, W, H, n, colors) {
    c.save();
    c.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const x = R() * W, y = R() * H, len = 8 + R() * (R() < 0.08 ? 90 : 34), a = R() * TAU;
      c.strokeStyle = colors[k % colors.length];
      c.lineWidth = 0.5 + R() * 1.3;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    }
    c.restore();
  }
  function specks(c, R, W, H, n, color, maxR) {
    c.save(); c.fillStyle = color;
    for (let k = 0; k < n; k++) { c.beginPath(); c.arc(R() * W, R() * H, 0.4 + R() * (maxR || 1.2), 0, TAU); c.fill(); }
    c.restore();
  }

  /** 인장 (백문: 붉은 바탕에 종이색 글자 / 주문: 붉은 테두리와 글자) */
  function seal(c, R, cx, cy, size, text, color, paper, opts) {
    const o = opts || {};
    const chars = Array.from(text);
    c.save();
    c.translate(cx, cy);
    c.rotate(o.rotate || 0);
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const h = size / 2;
    if (o.round) { c.beginPath(); c.arc(0, 0, h, 0, TAU); }
    else { c.beginPath(); c.rect(-h, -h, size, size); }
    if (o.relief) {
      c.lineWidth = Math.max(2, size * 0.07); c.strokeStyle = color; c.stroke();
    } else { c.fillStyle = color; c.fill(); }
    c.fillStyle = o.relief ? color : paper;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (chars.length === 1) {
      c.font = `${ornament.max} ${Math.round(size * 0.64)}px ${ornament.family}`;
      c.fillText(chars[0], 0, size * 0.04);
    } else {
      // 2~4자: 오른쪽 줄부터 위→아래 (전통 인장 배치)
      const cols = chars.length > 2 ? 2 : 1;
      const rows = Math.ceil(chars.length / cols);
      const fs = Math.round(size * (cols === 1 ? 0.4 : 0.38));
      c.font = `${ornament.max} ${fs}px ${ornament.family}`;
      chars.forEach((ch, k) => {
        const col = Math.floor(k / rows), row = k % rows;
        const x = cols === 1 ? 0 : (col === 0 ? size * 0.2 : -size * 0.2);
        const y = (row - (rows - 1) / 2) * fs * 1.05 + size * 0.02;
        c.fillText(ch, x, y);
      });
    }
    // 찍힌 자국: 종이색 작은 반점
    c.globalAlpha = 0.55;
    c.fillStyle = paper;
    for (let k = 0; k < Math.round(size / 3); k++) {
      c.beginPath(); c.arc((R() - 0.5) * size, (R() - 0.5) * size, 0.6 + R() * size * 0.025, 0, TAU); c.fill();
    }
    c.restore();
  }

  /* ---------- 나뭇가지 · 꽃 · 잎 · 새 ---------- */

  /** 나뭇가지 생성: 시드 난수로 갈라지는 가지와 끝점(tips)을 만듭니다. */
  function grow(R, x, y, ang, len, w, depth, o, segs, tips) {
    const bend = (R() - 0.5) * (o.wobble || 0.5);
    const mx = x + Math.cos(ang + bend) * len * 0.5, my = y + Math.sin(ang + bend) * len * 0.5;
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    const w2 = Math.max(w * (o.taper || 0.7), 0.8);
    segs.push({ x, y, mx, my, nx, ny, w, w2, depth });
    if (depth <= 0 || w2 < 1.2) { tips.push({ x: nx, y: ny, ang }); return; }
    const side = R() < 0.5 ? 1 : -1;
    grow(R, nx, ny, ang + (R() - 0.5) * (o.bend || 0.5) + (o.gravity || 0), len * (o.decay || 0.78), w2, depth - 1, o, segs, tips);
    if (R() < (o.branchP == null ? 0.85 : o.branchP)) {
      grow(R, nx, ny, ang + side * (o.spread || 0.7) * (0.6 + R() * 0.6), len * (o.decay || 0.78) * 0.78, w2 * 0.66, depth - 1, o, segs, tips);
    }
  }
  /** 가지 그리기: 굵기가 줄어드는 곡선 띠 */
  function drawBranch(c, segs, fill, edge, edgeW) {
    const path = s => {
      const a = Math.atan2(s.ny - s.y, s.nx - s.x) + Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const wm = (s.w + s.w2) / 4;
      c.beginPath();
      c.moveTo(s.x + ca * s.w / 2, s.y + sa * s.w / 2);
      c.quadraticCurveTo(s.mx + ca * wm, s.my + sa * wm, s.nx + ca * s.w2 / 2, s.ny + sa * s.w2 / 2);
      c.lineTo(s.nx - ca * s.w2 / 2, s.ny - sa * s.w2 / 2);
      c.quadraticCurveTo(s.mx - ca * wm, s.my - sa * wm, s.x - ca * s.w / 2, s.y - sa * s.w / 2);
      c.closePath();
    };
    if (edge) {
      c.save(); c.strokeStyle = edge; c.lineWidth = edgeW || 2; c.lineJoin = 'round';
      segs.forEach(s => { path(s); c.stroke(); });
      c.restore();
    }
    c.fillStyle = fill;
    segs.forEach(s => { path(s); c.fill(); c.beginPath(); c.arc(s.nx, s.ny, s.w2 / 2, 0, TAU); c.fill(); });
  }
  /** 매화 (다섯 꽃잎) */
  function plum(c, x, y, r, rot, p) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = p.sepal;
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 + TAU / 10;
      c.beginPath(); c.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.3, r * 0.16, a, 0, TAU); c.fill();
    }
    c.fillStyle = p.petal; c.strokeStyle = p.edge; c.lineWidth = Math.max(0.8, r * 0.05);
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5;
      c.beginPath(); c.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.48, 0, TAU); c.fill(); c.stroke();
    }
    c.fillStyle = p.petal;
    c.beginPath(); c.arc(0, 0, r * 0.42, 0, TAU); c.fill();
    c.strokeStyle = p.stamen; c.lineWidth = Math.max(0.7, r * 0.04);
    for (let k = 0; k < 9; k++) {
      const a = k * TAU / 9;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); c.stroke();
      c.fillStyle = p.stamen; c.beginPath(); c.arc(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, r * 0.05, 0, TAU); c.fill();
    }
    c.fillStyle = p.center; c.beginPath(); c.arc(0, 0, r * 0.14, 0, TAU); c.fill();
    c.restore();
  }
  function bud(c, x, y, r, rot, fill, edge) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = fill; c.strokeStyle = edge; c.lineWidth = Math.max(0.8, r * 0.08);
    c.beginPath(); c.ellipse(0, 0, r, r * 0.78, 0, 0, TAU); c.fill(); c.stroke();
    c.restore();
  }
  /** 겹꽃 (모란·석류꽃 계열): 꽃잎을 여러 겹으로 겹칩니다. */
  function doubleFlower(c, x, y, r, rot, p) {
    c.save(); c.translate(x, y); c.rotate(rot);
    const layers = [
      { n: 7, rr: 1, col: p.dark, off: 0 },
      { n: 6, rr: 0.8, col: p.mid, off: 0.3 },
      { n: 5, rr: 0.6, col: p.light, off: 0.1 },
      { n: 4, rr: 0.38, col: p.mid, off: 0.5 }
    ];
    c.lineWidth = Math.max(0.8, r * 0.035);
    c.strokeStyle = p.edge;
    layers.forEach(L => {
      for (let k = 0; k < L.n; k++) {
        const a = L.off + k * TAU / L.n;
        const d = r * L.rr * 0.48;
        c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.rotate(a);
        c.beginPath();
        // 끝이 물결진 꽃잎
        const pr = r * L.rr * 0.56, pw = r * L.rr * 0.44;
        c.moveTo(-pr * 0.7, 0);
        c.bezierCurveTo(-pr * 0.5, -pw * 1.1, pr * 0.6, -pw * 1.15, pr * 0.95, -pw * 0.3);
        c.quadraticCurveTo(pr * 1.05, 0, pr * 0.95, pw * 0.3);
        c.bezierCurveTo(pr * 0.6, pw * 1.15, -pr * 0.5, pw * 1.1, -pr * 0.7, 0);
        c.fillStyle = L.col; c.fill(); c.stroke();
        c.restore();
      }
    });
    c.fillStyle = p.center;
    for (let k = 0; k < 9; k++) {
      const a = k * TAU / 9;
      c.beginPath(); c.arc(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1, r * 0.05, 0, TAU); c.fill();
    }
    c.restore();
  }
  function leaf(c, x, y, len, wid, ang, fill, edge, vein) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(len * 0.42, -wid, len, 0);
    c.quadraticCurveTo(len * 0.42, wid, 0, 0);
    c.fillStyle = fill; c.fill();
    c.lineWidth = Math.max(0.8, len * 0.02); c.strokeStyle = edge; c.stroke();
    c.beginPath(); c.moveTo(len * 0.05, 0); c.quadraticCurveTo(len * 0.5, -wid * 0.12, len * 0.9, 0);
    c.strokeStyle = vein || edge; c.lineWidth = Math.max(0.6, len * 0.014); c.stroke();
    c.restore();
  }
  /** 작은 새 (창작 도안). pose: 'perch' | 'fly'. 기본은 오른쪽을 봅니다. */
  function bird(c, x, y, s, p, opts) {
    const o = opts || {};
    c.save(); c.translate(x, y); c.scale(o.flip ? -s : s, s); c.rotate(o.tilt || 0);
    c.lineJoin = 'round';
    c.lineWidth = 0.025; c.strokeStyle = p.edge;
    // 꼬리
    c.fillStyle = p.wing;
    c.beginPath(); c.moveTo(-0.42, 0.02); c.lineTo(-1.1, 0.16); c.lineTo(-1.06, 0.26); c.lineTo(-0.4, 0.14); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = p.body;
    c.beginPath(); c.moveTo(-0.42, 0.02); c.lineTo(-1.02, 0.06); c.lineTo(-1.0, 0.14); c.lineTo(-0.42, 0.12); c.closePath(); c.fill(); c.stroke();
    if (o.pose === 'fly') {
      // 위로 든 날개
      c.fillStyle = p.wing;
      c.beginPath(); c.moveTo(-0.2, -0.12); c.bezierCurveTo(-0.3, -0.6, -0.7, -0.85, -0.95, -0.9);
      c.bezierCurveTo(-0.7, -0.6, -0.5, -0.35, 0.15, -0.12); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = p.wingLine; c.lineWidth = 0.02;
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(-0.15 - k * 0.08, -0.16 - k * 0.02); c.lineTo(-0.55 - k * 0.12, -0.5 - k * 0.1); c.stroke(); }
      c.strokeStyle = p.edge; c.lineWidth = 0.025;
    }
    // 몸
    c.fillStyle = p.body;
    c.beginPath(); c.ellipse(0, 0, 0.52, 0.27, -0.12, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = p.belly;
    c.beginPath(); c.ellipse(0.08, 0.1, 0.38, 0.15, -0.1, 0, Math.PI); c.fill();
    // 접은 날개
    c.fillStyle = p.wing;
    c.beginPath(); c.moveTo(-0.32, -0.08); c.bezierCurveTo(-0.05, -0.2, 0.2, -0.14, 0.18, -0.02);
    c.bezierCurveTo(0.05, 0.1, -0.35, 0.16, -0.62, 0.12); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = p.wingLine; c.lineWidth = 0.02;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(0.08 - k * 0.14, -0.06 + k * 0.03); c.lineTo(-0.2 - k * 0.14, 0.08 + k * 0.01); c.stroke(); }
    // 머리
    c.strokeStyle = p.edge; c.lineWidth = 0.025;
    c.fillStyle = p.cap;
    c.beginPath(); c.arc(0.46, -0.2, 0.19, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = p.cheek;
    c.beginPath(); c.ellipse(0.5, -0.1, 0.1, 0.06, 0.2, 0, TAU); c.fill();
    c.fillStyle = p.eyeRing; c.beginPath(); c.arc(0.52, -0.23, 0.055, 0, TAU); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(0.53, -0.23, 0.03, 0, TAU); c.fill();
    // 부리
    c.fillStyle = p.beak;
    c.beginPath(); c.moveTo(0.62, -0.24); c.lineTo(0.92, -0.17); c.lineTo(0.62, -0.13); c.closePath(); c.fill(); c.stroke();
    if (o.pose !== 'fly') {
      c.strokeStyle = p.edge; c.lineWidth = 0.035;
      c.beginPath(); c.moveTo(0.02, 0.24); c.lineTo(0.0, 0.4); c.moveTo(0.12, 0.23); c.lineTo(0.14, 0.4); c.stroke();
    }
    c.restore();
  }

  /* ---------- 산 · 구름 · 소나무 · 물결 ---------- */

  /** 봉우리 하나의 능선 경로 (가파르고 끝이 둥근 청록산수식 봉우리) */
  function peakPath(c, cx, baseY, w, h, lean, close) {
    const l = cx - w / 2, r = cx + w / 2, top = baseY - h, tx = cx + lean * w;
    if (close) { c.moveTo(l, baseY + 600); c.lineTo(l, baseY); } else c.moveTo(l, baseY);
    c.bezierCurveTo(l + w * 0.22, baseY - h * 0.3, tx - w * 0.3, top + h * 0.18, tx - w * 0.1, top + h * 0.02);
    c.quadraticCurveTo(tx, top - h * 0.03, tx + w * 0.1, top + h * 0.03);
    c.bezierCurveTo(tx + w * 0.32, top + h * 0.2, r - w * 0.2, baseY - h * 0.32, r, baseY);
    if (close) { c.lineTo(r, baseY + 600); c.closePath(); }
  }
  /**
   * 봉우리 무리: 뒤에서 앞으로 겹쳐 그리고, 위(석록·석청)→아래(황토)로 칠합니다.
   * 능선만 먹선으로 긋고, 안쪽에 결 따라 준법(皴法) 선과 태점(苔點)을 더합니다.
   */
  function peaks(c, R, x0, x1, baseY, height, n, p) {
    const out = [];
    const span = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      const w = span * (p.width || 1.3) * (0.8 + R() * 0.5), h = height * (0.65 + R() * 0.35);
      out.push({ cx: x0 + span * (k + 0.5) + (R() - 0.5) * span * 0.5, w, h, lean: (R() - 0.5) * 0.2, base: baseY + R() * height * 0.15 });
    }
    out.sort((a, b) => a.h - b.h);   // 낮은 봉우리를 먼저 (높은 봉우리가 앞에 겹침)
    out.forEach(q => {
      const top = q.base - q.h;
      c.save();
      c.beginPath(); peakPath(c, q.cx, q.base, q.w, q.h, q.lean, true);
      c.fillStyle = vgrad(c, top, q.base + 30, p.stops); c.fill();
      c.clip();
      if (p.texture) {
        c.strokeStyle = p.texture; c.lineWidth = 1.4;
        for (let j = 1; j <= 3; j++) {
          const f = 1 - j * 0.2;
          c.beginPath(); peakPath(c, q.cx + q.lean * q.w * 0.2, q.base + q.h * 0.05 * j, q.w * f, q.h * (f + 0.05), q.lean, false); c.stroke();
        }
        c.lineCap = 'round';
        for (let j = 0; j < 6; j++) {
          const sx = q.cx + (R() - 0.5) * q.w * 0.6, sy = top + q.h * (0.25 + R() * 0.4);
          c.lineWidth = 1 + R();
          c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + (R() - 0.5) * 20, sy + 26, sx + (R() - 0.5) * 30, sy + 50 + R() * 40); c.stroke();
        }
      }
      c.restore();
      if (p.line) { c.strokeStyle = p.line; c.lineWidth = p.lineW || 2.4; c.beginPath(); peakPath(c, q.cx, q.base, q.w, q.h, q.lean, false); c.stroke(); }
      if (p.moss) {
        c.fillStyle = p.moss;
        const tx = q.cx + q.lean * q.w;
        for (let j = 0; j < 7; j++) { c.beginPath(); c.ellipse(tx + (R() - 0.5) * q.w * 0.3, top + 6 + R() * q.h * 0.12, 2.8 + R() * 2, 1.6, R(), 0, TAU); c.fill(); }
      }
      q.top = top; q.tx = q.cx + q.lean * q.w;
    });
    return out;
  }
  /** 구름: 원을 겹친 윤곽 + 말린 구름 꼬리 */
  function cloud(c, R, x, y, s, fill, line, n) {
    const blobs = [];
    const count = n || 5;
    for (let k = 0; k < count; k++) blobs.push({ x: x + (k - (count - 1) / 2) * s * 0.55 + (R() - 0.5) * s * 0.2, y: y + (R() - 0.5) * s * 0.3 - Math.sin(k / (count - 1) * Math.PI) * s * 0.25, r: s * (0.32 + R() * 0.16) });
    c.save();
    c.lineWidth = Math.max(1.5, s * 0.035); c.strokeStyle = line;
    blobs.forEach(b => { c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke(); });
    c.fillStyle = fill;
    blobs.forEach(b => { c.beginPath(); c.arc(b.x, b.y, b.r - c.lineWidth / 2, 0, TAU); c.fill(); });
    // 말린 꼬리 (나선)
    [blobs[0], blobs[count - 1]].forEach((b, k) => {
      c.beginPath();
      const dir = k ? 1 : -1;
      for (let t = 0; t < 1.6 * Math.PI; t += 0.15) {
        const rr = b.r * 0.55 * (1 - t / (2 * Math.PI));
        const px = b.x + dir * Math.cos(t) * rr, py = b.y + Math.sin(t) * rr;
        if (t === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    });
    c.restore();
  }
  /** 소나무: 기운 줄기 + 부채꼴 솔잎 묶음 */
  function pine(c, R, x, y, h, p, lean) {
    const segs = [], tips = [];
    grow(R, x, y, -Math.PI / 2 + (lean || 0), h * 0.32, h * 0.07, 4, { decay: 0.8, spread: 1.0, bend: 0.5, taper: 0.72, branchP: 0.9, wobble: 0.6 }, segs, tips);
    drawBranch(c, segs, p.trunk, p.trunkEdge, 2);
    c.save(); c.strokeStyle = p.trunkEdge; c.lineWidth = 1.2;
    segs.filter(s => s.w > 6).forEach(s => {
      for (let k = 0; k < 3; k++) {
        const t = R(); const px = lerp(s.x, s.nx, t), py = lerp(s.y, s.ny, t);
        c.beginPath(); c.arc(px, py, s.w * 0.18, 0, Math.PI); c.stroke();
      }
    });
    c.restore();
    const clusters = tips.concat(segs.filter(s => s.depth <= 2).map(s => ({ x: s.nx, y: s.ny })));
    clusters.forEach(t => {
      const r = h * (0.07 + R() * 0.04);
      c.save();
      c.fillStyle = p.wash;
      c.beginPath(); c.ellipse(t.x, t.y - r * 0.2, r * 1.15, r * 0.55, 0, 0, TAU); c.fill();
      c.strokeStyle = p.needle; c.lineWidth = 1.3; c.lineCap = 'round';
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI + k * Math.PI / 10;
        c.beginPath(); c.moveTo(t.x, t.y); c.lineTo(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r * 0.55); c.stroke();
      }
      c.restore();
    });
  }
  function waves(c, x0, x1, y0, y1, color, gap) {
    c.save(); c.strokeStyle = color; c.lineWidth = 1.6;
    for (let y = y0; y < y1; y += gap) {
      c.beginPath();
      for (let x = x0; x <= x1; x += 12) {
        const yy = y + Math.sin(x / 38 + y) * 3;
        if (x === x0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.stroke();
    }
    c.restore();
  }

  /** 세 나라 색 띠 (프로젝트 표지) */
  function band(c, x, y, w, h) {
    const cols = ['#c8364b', '#2c3e7e', '#d4a017'];
    cols.forEach((col, k) => { c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(x + w / 3 * k, y, w / 3, h); });
    c.globalAlpha = 1;
  }

  /* ---------- 테마 ---------- */

  const THEMES = {};

  /* 1. 고문서 기록첩 — 한지 섬유, 선장(線裝) 제본, 괘선, 붙인 쪽지, 인장 */
  THEMES.archive = {
    id: 'archive',
    name: '고문서',
    sub: '한지 · 인장 · 기록첩',
    inspiration: '동아시아 고문서·기록첩의 한지 질감, 선장 제본, 괘선, 인장 문화',
    colors: {
      bg: '#e8dcc2', paper: '#f7f0df', ink: '#221d17', soft: '#4a4036', mute: '#655a4c',
      line: '#d2c2a2', accent: '#9e2f26', onAccent: '#fff8ec', seal: '#b3362a', thread: '#6a4a2c'
    },
    // 기록첩: 단단한 명조 제목 + 연필 글씨 같은 고운바탕 문장
    fonts: { title: { family: FONTS.serif, weight: 700 }, quote: { family: FONTS.quote, weight: 700 }, ornament: { family: FONTS.serif, max: 900 } },
    feed: { top: 104, bottom: 92, side: 64 },
    story: { panel: { x: 92, y: 296, w: 914, h: 1258 } },
    paint(c, W, H, x) {
      const C = this.colors, R = rng(x.seed + ':bg');
      c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
      const g = c.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(255,250,235,0.35)'); g.addColorStop(1, 'rgba(120,85,40,0.18)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      fibers(c, R, W, H, Math.round(W * H / 2600), ['rgba(255,252,240,0.55)', 'rgba(140,105,60,0.13)', 'rgba(255,255,250,0.4)']);
      specks(c, R, W, H, Math.round(W * H / 9000), 'rgba(110,80,40,0.16)', 1.1);
      const P = x.panel;
      // 괘선(烏絲欄): 위·아래 띠
      c.save(); c.strokeStyle = rgba(C.accent, 0.2); c.lineWidth = 1.4;
      const ruled = (y0, y1) => { if (y1 - y0 < 50) return; for (let lx = P.x + 24; lx < P.x + P.w - 24; lx += 50) { c.beginPath(); c.moveTo(lx, y0); c.lineTo(lx, y1); c.stroke(); } c.strokeRect(P.x + 24, y0, Math.floor((P.w - 48) / 50) * 50, y1 - y0); };
      ruled(Math.max(24, P.y - (x.format === 'story' ? 230 : 70)), P.y - 22);
      ruled(P.y + P.h + 22, Math.min(H - 24, P.y + P.h + (x.format === 'story' ? 300 : 60)));
      c.restore();
      // 선장 제본: 왼쪽 실 묶음
      const bx = Math.min(36, P.x - 26);
      c.save();
      c.fillStyle = 'rgba(120,90,50,0.10)'; c.fillRect(0, 0, bx + 22, H);
      c.strokeStyle = 'rgba(90,60,30,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx + 22, 0); c.lineTo(bx + 22, H); c.stroke();
      const holes = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => H * t);
      c.strokeStyle = C.thread; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx, 0); c.lineTo(bx, H); c.stroke();
      holes.forEach(hy => {
        c.beginPath(); c.moveTo(0, hy); c.lineTo(bx, hy); c.stroke();
        c.fillStyle = '#5a4128'; c.beginPath(); c.arc(bx, hy, 4.5, 0, TAU); c.fill();
      });
      c.restore();
      if (x.format === 'story') {
        // 제첨(題簽): 위쪽 세로 쪽지에 '共同記憶帖'
        const sx = W - 158, sy = 44, sw = 78, sh = 236;
        c.save();
        c.shadowColor = 'rgba(70,45,15,0.25)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
        c.fillStyle = '#f3ead6'; c.fillRect(sx, sy, sw, sh);
        c.restore();
        c.strokeStyle = rgba(C.ink, 0.55); c.lineWidth = 1.5; c.strokeRect(sx + 7, sy + 7, sw - 14, sh - 14);
        vtext(c, '共同記憶帖', sx + sw / 2, sy + 16, 38, C.ink, 700);
        // 흐린 둥근 장서인 · 붉은 인장
        seal(c, R, W - 250, 110, 74, '共', C.seal, C.bg, { round: true, relief: true, rotate: -0.12, alpha: 0.55 });
        seal(c, R, W - 236, 222, 64, '記憶', C.seal, C.bg, { rotate: 0.06, alpha: 0.85 });
        // 아래: 겹쳐 붙인 쪽지들
        const tones = ['#efe5cf', '#f4ecdb', '#ebe0c6', '#f1e8d4'];
        for (let k = 0; k < 4; k++) {
          const tx = W - 420 + k * 84, ty = P.y + P.h + 40 + (k % 2) * 26, tw = 72;
          c.save(); c.shadowColor = 'rgba(70,45,15,0.18)'; c.shadowBlur = 8; c.shadowOffsetY = 2;
          c.fillStyle = tones[k]; c.fillRect(tx, ty, tw, H - ty - 30);
          c.restore();
          c.strokeStyle = 'rgba(140,110,70,0.35)'; c.lineWidth = 1; c.strokeRect(tx, ty, tw, H - ty - 30);
          c.save(); c.globalAlpha = 0.28; c.strokeStyle = '#7c6a55'; c.lineWidth = 1.5;
          c.beginPath(); c.arc(tx + tw / 2, ty + 36, 22, 0, TAU); c.stroke(); c.beginPath(); c.arc(tx + tw / 2, ty + 36, 15, 0, TAU); c.stroke();
          c.restore();
        }
        seal(c, R, P.x + 130, P.y + P.h + 160, 92, '共', C.seal, C.bg, { rotate: -0.05 });
      } else {
        seal(c, R, W - P.x - 40, Math.max(56, P.y / 2), Math.min(64, P.y - 30), '共', C.seal, C.bg, { round: true, relief: true, rotate: -0.1, alpha: 0.7 });
      }
    },
    panel(c, P, x) {
      const C = this.colors, R = rng(x.seed + ':panel');
      // 손으로 뜯은 듯한 쪽지 가장자리
      const edge = () => {
        c.beginPath();
        const step = 18, j = 2.2;
        c.moveTo(P.x, P.y);
        for (let px = P.x; px <= P.x + P.w; px += step) c.lineTo(px, P.y + (R() - 0.5) * j);
        for (let py = P.y; py <= P.y + P.h; py += step) c.lineTo(P.x + P.w + (R() - 0.5) * j, py);
        for (let px = P.x + P.w; px >= P.x; px -= step) c.lineTo(px, P.y + P.h + (R() - 0.5) * j);
        for (let py = P.y + P.h; py >= P.y; py -= step) c.lineTo(P.x + (R() - 0.5) * j, py);
        c.closePath();
      };
      c.save(); c.shadowColor = 'rgba(70,45,15,0.22)'; c.shadowBlur = 22; c.shadowOffsetY = 6;
      edge(); c.fillStyle = C.paper; c.fill(); c.restore();
      c.save(); edge(); c.clip();
      fibers(c, R, P.w, P.h, Math.round(P.w * P.h / 5200), ['rgba(255,255,250,0.5)', 'rgba(150,115,70,0.07)']);
      c.restore();
      c.strokeStyle = rgba(C.accent, 0.35); c.lineWidth = 1.5;
      c.strokeRect(P.x + 16, P.y + 16, P.w - 32, P.h - 32);
    },
    overlay(c, W, H, x) {
      const C = this.colors, R = rng(x.seed + ':over'), P = x.panel;
      // 쪽지 모서리에 걸쳐 찍힌 인장 (기록첩의 확인 도장)
      seal(c, R, P.x + P.w - 6, P.y + P.h - 8, x.format === 'story' ? 86 : 72, '確', C.seal, C.paper, { rotate: 0.08, alpha: 0.9 });
    }
  };

  /* 2. 민화 화조도 — 살구빛 바탕, 겹꽃 가지, 한 쌍의 새, 또렷한 윤곽선 */
  THEMES.minhwa = {
    id: 'minhwa',
    name: '민화 화조도',
    sub: '꽃과 새 · 따뜻한 색감',
    inspiration: '조선 민화 화조도의 짝지은 새, 꽃가지, 진채(眞彩)와 윤곽선',
    colors: {
      bg: '#f1dcc6', paper: '#fcf5ec', ink: '#2b1d15', soft: '#56443a', mute: '#6b584c',
      line: '#e6d2bc', accent: '#a83a17', onAccent: '#fff8f0', seal: '#b8331d',
      trim: '#41603a'
    },
    // 민화: 제목·문장 모두 부드러운 고운바탕
    fonts: { title: { family: FONTS.quote, weight: 700 }, quote: { family: FONTS.quote, weight: 700 }, ornament: { family: FONTS.serif, max: 900 } },
    feed: { top: 168, bottom: 150, side: 58 },
    story: { panel: { x: 70, y: 318, w: 940, h: 1222 } },
    flower: { dark: '#c8361c', mid: '#e5552a', light: '#f2873b', edge: '#8f2412', center: '#f7c948' },
    leafCols: ['#6f8d3a', '#86a24a', '#5b7a33', '#9bb35c'],
    birdCols: { body: '#a7c240', belly: '#f3d35a', wing: '#2e4775', wingLine: '#8fb0d8', cap: '#1d1d22', cheek: '#fff8e8', eyeRing: '#e8a33a', beak: '#d4682a', edge: '#2d2a22' },
    sprig(c, R, x0, y0, ang, scale, flowers) {
      const segs = [], tips = [];
      grow(R, x0, y0, ang, 190 * scale, 30 * scale, 5, { decay: 0.74, spread: 0.75, bend: 0.55, taper: 0.7, branchP: 0.9, wobble: 0.7 }, segs, tips);
      drawBranch(c, segs, '#77695c', '#3b332c', 2.2);
      c.fillStyle = 'rgba(60,50,40,0.5)';
      segs.filter(s => s.w > 8).forEach(s => { for (let k = 0; k < 3; k++) { const t = R(); c.beginPath(); c.ellipse(lerp(s.x, s.nx, t), lerp(s.y, s.ny, t), s.w * 0.12, s.w * 0.07, R(), 0, TAU); c.fill(); } });
      const L = this.leafCols;
      segs.filter(s => s.depth <= 3).forEach((s, k) => {
        for (let j = 0; j < 2; j++) {
          const a = Math.atan2(s.ny - s.y, s.nx - s.x) + (j ? 0.9 : -0.9) + (R() - 0.5) * 0.5;
          leaf(c, s.nx, s.ny, (46 + R() * 30) * scale, (15 + R() * 6) * scale, a, L[(k + j) % L.length], '#3c5527', '#3c5527');
        }
      });
      const blooms = tips.slice().sort(() => R() - 0.5).slice(0, flowers);
      tips.forEach(t => {
        if (blooms.indexOf(t) >= 0) doubleFlower(c, t.x, t.y, (40 + R() * 16) * scale, R() * TAU, this.flower);
        else if (R() < 0.6) bud(c, t.x, t.y, 10 * scale, t.ang, '#ec7a3a', '#8f2412');
      });
      return tips;
    },
    paint(c, W, H, x) {
      const C = this.colors, R = rng(x.seed + ':bg'), P = x.panel;
      c.fillStyle = vgrad(c, 0, H, [[0, '#f5e4d1'], [0.5, C.bg], [1, '#ecd2b8']]);
      c.fillRect(0, 0, W, H);
      specks(c, R, W, H, Math.round(W * H / 3000), 'rgba(150,100,60,0.10)', 1.3);
      fibers(c, R, W, H, Math.round(W * H / 9000), ['rgba(255,250,240,0.35)']);
      const story = x.format === 'story';
      const s = story ? 1 : 0.72;
      // 위: 오른쪽 위 모서리에서 늘어진 가지와 앉은 새
      this.sprig(c, R, W + 30, story ? 40 : 10, Math.PI * 0.86, s, 3);
      // 아래: 왼쪽 아래에서 올라오는 가지
      this.sprig(c, R, -30, H + 20, -Math.PI * 0.2, s * 1.05, 3);
      if (story) {
        bird(c, W - 360, 214, 92, this.birdCols, { flip: true, pose: 'perch', tilt: 0.06 });
        bird(c, 210, 118, 86, this.birdCols, { pose: 'fly', tilt: -0.18 });
        this.sprig(c, R, W + 20, H - 140, Math.PI * 1.1, 0.75, 2);
      } else {
        bird(c, W - 250, Math.max(90, P.y - 46), 64, this.birdCols, { flip: true, pose: 'perch' });
      }
    },
    panel(c, P) {
      const C = this.colors;
      c.save(); c.shadowColor = 'rgba(120,70,30,0.18)'; c.shadowBlur = 18; c.shadowOffsetY = 4;
      c.fillStyle = C.paper; c.fillRect(P.x, P.y, P.w, P.h); c.restore();
      c.strokeStyle = C.trim; c.lineWidth = 3; c.strokeRect(P.x + 12, P.y + 12, P.w - 24, P.h - 24);
      c.strokeStyle = rgba(C.trim, 0.5); c.lineWidth = 1.2; c.strokeRect(P.x + 20, P.y + 20, P.w - 40, P.h - 40);
    },
    overlay(c, W, H, x) {
      const R = rng(x.seed + ':over'), P = x.panel, s = x.format === 'story' ? 1 : 0.75;
      // 패널 모서리를 살짝 넘어오는 잎과 꽃 (글자 영역 밖으로 잘림)
      leaf(c, P.x + P.w + 10, P.y - 10, 70 * s, 22 * s, Math.PI * 0.75, '#86a24a', '#3c5527');
      leaf(c, P.x + P.w + 10, P.y - 10, 60 * s, 20 * s, Math.PI * 0.95, '#6f8d3a', '#3c5527');
      doubleFlower(c, P.x + P.w - 4, P.y + 6, 34 * s, R() * TAU, this.flower);
      leaf(c, P.x - 6, P.y + P.h + 8, 66 * s, 21 * s, -Math.PI * 0.3, '#86a24a', '#3c5527');
      doubleFlower(c, P.x + 8, P.y + P.h - 4, 30 * s, R() * TAU, this.flower);
    }
  };

  /* 3. 우키요에 — 판화 여백, 굵은 먹 윤곽, 보카시(색 번짐) 하늘, 세로 제목 칸, 가로지르는 매화 가지 */
  THEMES.ukiyoe = {
    id: 'ukiyoe',
    name: '우키요에',
    sub: '목판화 윤곽선 · 색면',
    inspiration: '에도 시대 목판화(우키요에)의 윤곽선, 평평한 색면, 보카시 그러데이션, 세로 제목 칸',
    colors: {
      bg: '#f2e7d2', paper: '#f8f1e3', ink: '#1a1a1a', soft: '#3d3833', mute: '#5f5850',
      line: '#cdbfa6', accent: '#ad1f28', onAccent: '#fff6ee', seal: '#ad1f28',
      sky: '#cf2c35', skyLight: '#f4c3b7', ground: '#1c6650', groundLight: '#94c4a6', trunk: '#3b3b3d', key: '#161616', indigo: '#24376b'
    },
    // 우키요에: 판화의 굵은 윤곽처럼 묵직한 명조, 제목 칸 한자는 Zen Old Mincho
    fonts: { title: { family: FONTS.serif, weight: 900 }, quote: { family: FONTS.serif, weight: 700 }, ornament: { family: FONTS.mincho, max: 700 } },
    feed: { top: 176, bottom: 168, side: 70 },
    story: { panel: { x: 84, y: 330, w: 912, h: 1210 } },
    blossom: { petal: '#fffdf6', edge: '#3a3330', stamen: '#d9a62e', center: '#e9c23e', sepal: '#8e2a26' },
    paint(c, W, H, x) {
      const C = this.colors, R = rng(x.seed + ':bg'), P = x.panel;
      const m = 26;
      c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
      specks(c, R, W, H, Math.round(W * H / 6000), 'rgba(120,90,50,0.12)', 1);
      // 그림 면: 붉은 하늘 → 연분홍 → 종이색 → 연녹 → 짙은 녹색
      const gy0 = m, gy1 = H - m;
      c.fillStyle = vgrad(c, gy0, gy1, [[0, C.sky], [0.16, '#e0646a'], [0.3, C.skyLight], [0.46, '#f7ede0'], [0.62, '#f2efe2'], [0.74, C.groundLight], [0.88, '#3f8a6c'], [1, C.ground]]);
      c.fillRect(m, gy0, W - m * 2, gy1 - gy0);
      // 목판 나뭇결
      c.save(); c.globalAlpha = 0.035; c.strokeStyle = '#000'; c.lineWidth = 1;
      for (let y = gy0; y < gy1; y += 7 + R() * 6) { c.beginPath(); c.moveTo(m, y); c.bezierCurveTo(W * 0.3, y + (R() - 0.5) * 8, W * 0.7, y + (R() - 0.5) * 8, W - m, y + (R() - 0.5) * 4); c.stroke(); }
      c.restore();
      const story = x.format === 'story';
      const s = story ? 1 : 0.62;
      const bottomTop = P.y + P.h;
      c.save(); c.beginPath(); c.rect(m, gy0, W - m * 2, gy1 - gy0); c.clip();
      // 곧게 솟은 가는 잔가지(도장지): 아래에서 하늘까지
      c.strokeStyle = '#2d3b31'; c.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const sx = W - 96 - k * 46 - R() * 16;
        c.lineWidth = 3.2 - k * 0.6;
        c.beginPath(); c.moveTo(sx, H - m); c.quadraticCurveTo(sx - 20, H * 0.5, sx - 36 - R() * 30, m + 10 + k * 40); c.stroke();
      }
      // 아래: 굵은 줄기가 화면을 가로지름 (판화 특유의 굵은 먹 윤곽)
      const segs = [], tips = [];
      grow(R, W + 60, H - (story ? 150 : 70), Math.PI * 1.08, 300 * s, 118 * s, 3, { decay: 0.8, spread: 0.55, bend: 0.25, taper: 0.64, branchP: 0.7, wobble: 0.3, gravity: -0.06 }, segs, tips);
      drawBranch(c, segs, C.trunk, C.key, 4);
      c.fillStyle = '#5c5c5f';
      segs.filter(q => q.w > 26).forEach(q => { for (let k = 0; k < 5; k++) { const t = R(); c.beginPath(); c.ellipse(lerp(q.x, q.nx, t), lerp(q.y, q.ny, t), q.w * 0.2, q.w * 0.05, Math.atan2(q.ny - q.y, q.nx - q.x), 0, TAU); c.fill(); } });
      tips.forEach(t => { if (t.y > bottomTop) plum(c, t.x, t.y, 26 * s, R() * TAU, this.blossom); });
      // 풀포기
      c.strokeStyle = 'rgba(20,70,50,0.55)'; c.lineWidth = 2;
      for (let k = 0; k < (story ? 40 : 22); k++) {
        const gx = m + R() * (W - m * 2), gy = bottomTop + 40 + R() * (H - bottomTop - 60);
        for (let j = -1; j <= 1; j++) { c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + j * 5, gy - 9 - R() * 6); c.stroke(); }
      }
      // 위: 하늘을 가로지르는 매화 가지
      const twig = [], twigTips = [];
      grow(R, m - 30, P.y - (story ? 26 : 10), -Math.PI * (story ? 0.17 : 0.06), 210 * s, 34 * s, 5, { decay: 0.78, spread: 0.85, bend: 0.4, taper: 0.7, branchP: 0.95, wobble: 0.4, gravity: -0.04 }, twig, twigTips);
      drawBranch(c, twig, C.trunk, C.key, 3);
      twig.filter(q => q.depth <= 3 && R() < 0.55).forEach(q => plum(c, q.mx, q.my, (story ? 20 : 15) * (0.8 + R() * 0.4), R() * TAU, this.blossom));
      twigTips.forEach(t => { if (R() < 0.75) plum(c, t.x, t.y, (story ? 27 : 19) * (0.8 + R() * 0.4), R() * TAU, this.blossom); else bud(c, t.x, t.y, story ? 8 : 6, t.ang, '#fbeee4', '#3a3330'); });
      c.restore();
      // 판화 테두리 (먹 윤곽)
      c.strokeStyle = C.key; c.lineWidth = 6; c.strokeRect(m, m, W - m * 2, H - m * 2);
      // 세로 제목 칸 + 색 상자 (창작 문구 '共同記憶')
      if (story) {
        const cx = W - m - 44 - 74, cy = m + 34;
        c.fillStyle = C.accent; c.fillRect(cx, cy, 74, 246);
        c.strokeStyle = C.key; c.lineWidth = 2.5; c.strokeRect(cx, cy, 74, 246);
        c.strokeStyle = 'rgba(255,240,220,0.6)'; c.lineWidth = 1.2; c.strokeRect(cx + 6, cy + 6, 62, 234);
        vtext(c, '共同記憶', cx + 37, cy + 14, 46, '#111', 700);
        const bx = cx - 130, by = cy;
        c.fillStyle = vgrad(c, by, by + 116, [[0, '#4f9c6a'], [0.5, '#8fcf8e'], [1, '#4f9c6a']]);
        c.fillRect(bx, by, 116, 116);
        c.strokeStyle = C.indigo; c.lineWidth = 7;
        [32, 64, 92].forEach((yy, k) => { c.beginPath(); c.moveTo(bx + 6, by + yy); c.bezierCurveTo(bx + 40, by + yy - 12, bx + 70, by + yy + 12, bx + 110, by + yy - 4 + k); c.stroke(); });
        c.strokeStyle = C.key; c.lineWidth = 2.5; c.strokeRect(bx, by, 116, 116);
      } else {
        const lw = 226, lh = 60, lx = W - m - 34 - lw, ly = Math.max(m + 22, P.y / 2 - lh / 2);
        c.fillStyle = C.accent; c.fillRect(lx, ly, lw, lh);
        c.strokeStyle = C.key; c.lineWidth = 2.5; c.strokeRect(lx, ly, lw, lh);
        c.save(); c.font = `700 38px ${ornament.family}`; c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('共同記憶', lx + lw / 2, ly + lh / 2 + 2); c.restore();
      }
    },
    panel(c, P) {
      const C = this.colors;
      c.fillStyle = C.paper; c.fillRect(P.x, P.y, P.w, P.h);
      c.strokeStyle = C.key; c.lineWidth = 5; c.strokeRect(P.x, P.y, P.w, P.h);
      c.strokeStyle = rgba(C.key, 0.35); c.lineWidth = 1.2; c.strokeRect(P.x + 12, P.y + 12, P.w - 24, P.h - 24);
    },
    overlay(c, W, H, x) {
      const R = rng(x.seed + ':over'), P = x.panel, s = x.format === 'story' ? 1 : 0.72;
      // 패널 테두리 위로 넘어오는 매화 (판화의 앞뒤 겹침)
      plum(c, P.x + P.w + 6, P.y + 40 * s, 26 * s, R(), this.blossom);
      plum(c, P.x + P.w - 22 * s, P.y - 8, 20 * s, R(), this.blossom);
      plum(c, P.x - 4, P.y + P.h - 36 * s, 24 * s, R(), this.blossom);
      bud(c, P.x + 26 * s, P.y + P.h + 6, 8 * s, 0.4, '#fbeee4', '#3a3330');
    }
  };

  /* 4. 청록산수 — 비단 바탕, 석청·석록의 봉우리, 구름, 소나무, 물결 */
  THEMES.sansu = {
    id: 'sansu',
    name: '청록산수',
    sub: '산수 · 구름 · 청록색',
    inspiration: '중국 청록산수화의 석청·석록 채색, 겹친 봉우리, 구름과 소나무',
    colors: {
      bg: '#e7dec5', paper: '#f6f2e5', ink: '#1e2421', soft: '#3c4640', mute: '#5b635c',
      line: '#cfd2c0', accent: '#256760', onAccent: '#f6fbf8', seal: '#a8372f',
      azurite: '#2c5c86', malachite: '#3f9079', malachiteLight: '#93c7b1', ochre: '#b98b52', inkLine: '#38372f', mount: '#c4b48a'
    },
    // 청록산수: 문인화처럼 한결 가벼운 명조 제목(500) + 고운바탕 문장, 인장 한자는 Noto Serif SC
    fonts: { title: { family: FONTS.serif, weight: 500 }, quote: { family: FONTS.quote, weight: 700 }, ornament: { family: FONTS.song, max: 700 } },
    feed: { top: 150, bottom: 176, side: 58 },
    story: { panel: { x: 72, y: 308, w: 936, h: 1212 } },
    paint(c, W, H, x) {
      const C = this.colors, R = rng(x.seed + ':bg'), P = x.panel;
      c.fillStyle = vgrad(c, 0, H, [[0, '#ece5cf'], [0.6, C.bg], [1, '#dcd1b2']]);
      c.fillRect(0, 0, W, H);
      // 비단 결
      c.save(); c.globalAlpha = 0.05; c.strokeStyle = '#6b5a3a'; c.lineWidth = 1;
      for (let i = 0; i < W; i += 4) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, H); c.stroke(); }
      for (let j = 0; j < H; j += 4) { c.beginPath(); c.moveTo(0, j); c.lineTo(W, j); c.stroke(); }
      c.restore();
      specks(c, R, W, H, Math.round(W * H / 7000), 'rgba(100,80,40,0.12)', 1.2);
      const story = x.format === 'story';
      const s = story ? 1 : 0.6;
      // 먼 산 (위쪽, 흐린 청색) — 패널 뒤에서 솟아오름
      peaks(c, R, -40, W + 40, P.y + 60, story ? 200 : 100, 6, { stops: [[0, rgba(C.azurite, 0.5)], [1, rgba(C.malachiteLight, 0.2)]], line: rgba(C.inkLine, 0.3), lineW: 1.4 });
      cloud(c, R, story ? 250 : 200, story ? 120 : Math.max(60, P.y * 0.42), story ? 130 : 80, '#fbf8ef', rgba(C.inkLine, 0.5), 5);
      if (story) cloud(c, R, W - 300, 200, 100, '#fbf8ef', rgba(C.inkLine, 0.5), 4);
      // 아래: 겹친 봉우리 (뒤 석청 → 앞 석록)
      const base = P.y + P.h;
      peaks(c, R, -60, W + 60, base + (story ? 170 : 80), story ? 400 : 170, 6, { width: 1.1, stops: [[0, C.azurite], [0.55, '#5d8fa5'], [1, rgba(C.ochre, 0.8)]], line: C.inkLine, texture: rgba(C.inkLine, 0.35), moss: '#1f2a24' });
      const front = peaks(c, R, -80, W + 80, base + (story ? 330 : 170), story ? 330 : 150, 5, { width: 1.05, stops: [[0, C.malachite], [0.4, C.malachiteLight], [1, C.ochre]], line: C.inkLine, texture: rgba(C.inkLine, 0.35), moss: '#1f2a24' });
      // 소나무: 앞 봉우리 위
      const pk = front.filter(q => q.tx > 180 && q.tx < W - 180).sort((a, b) => a.top - b.top)[0];
      if (pk) pine(c, R, pk.tx + pk.w * 0.16, pk.top + pk.h * 0.26, story ? 210 : 110, { trunk: '#7b5a3d', trunkEdge: '#3b2c1f', wash: rgba(C.malachiteLight, 0.6), needle: '#24463f' }, 1.0);
      // 물결 (맨 아래)
      c.fillStyle = vgrad(c, H - (story ? 130 : 50), H, [[0, rgba(C.malachiteLight, 0)], [1, rgba(C.malachiteLight, 0.55)]]);
      c.fillRect(0, H - (story ? 130 : 50), W, story ? 130 : 50);
      waves(c, 0, W, H - (story ? 110 : 40), H - 10, rgba(C.azurite, 0.4), 15);
    },
    panel(c, P) {
      const C = this.colors;
      // 표구처럼: 바깥 비단 테 + 안쪽 종이
      c.save(); c.shadowColor = 'rgba(60,50,20,0.22)'; c.shadowBlur = 16; c.shadowOffsetY = 4;
      c.fillStyle = C.mount; c.fillRect(P.x, P.y, P.w, P.h); c.restore();
      c.fillStyle = C.paper; c.fillRect(P.x + 12, P.y + 12, P.w - 24, P.h - 24);
      c.strokeStyle = rgba(C.inkLine, 0.55); c.lineWidth = 1.4; c.strokeRect(P.x + 12, P.y + 12, P.w - 24, P.h - 24);
    },
    overlay(c, W, H, x) {
      const R = rng(x.seed + ':over'), P = x.panel, C = this.colors, s = x.format === 'story' ? 1 : 0.65;
      cloud(c, R, P.x + P.w - 30 * s, P.y - 6, 96 * s, '#fbf8ef', rgba(C.inkLine, 0.6), 4);
      cloud(c, R, P.x + 40 * s, P.y + P.h + 4, 84 * s, '#fbf8ef', rgba(C.inkLine, 0.6), 4);
    }
  };

  /* 5. 기본 카드 — 이전 디자인 (한지색 + 이중 테두리 + 세 나라 색 띠) */
  THEMES.classic = {
    id: 'classic',
    name: '기본',
    sub: '단정한 박물관 카드',
    inspiration: '',
    colors: {
      bg: '#f5f1e8', paper: '#faf7ef', ink: '#1a1a1a', soft: '#4a4a4a', mute: '#6e6964',
      line: '#d8d2c4', accent: '#8b3a3a', onAccent: '#ffffff', seal: '#8b3a3a'
    },
    fonts: { title: { family: FONTS.serif, weight: 700 }, quote: { family: FONTS.serif, weight: 700 }, ornament: { family: FONTS.serif, max: 900 } },
    feed: { top: 28, bottom: 28, side: 28 },
    story: { panel: { x: 56, y: 280, w: 968, h: 1290 } },
    noBand: true,
    paint(c, W, H) {
      c.fillStyle = this.colors.bg; c.fillRect(0, 0, W, H);
    },
    panel(c, P) {
      const C = this.colors;
      c.fillStyle = C.paper; c.fillRect(P.x, P.y, P.w, P.h);
      c.strokeStyle = C.ink; c.lineWidth = 3; c.strokeRect(P.x, P.y, P.w, P.h);
      c.strokeStyle = C.line; c.lineWidth = 1.5; c.strokeRect(P.x + 16, P.y + 16, P.w - 32, P.h - 32);
      band(c, P.x, P.y, P.w, 8);
    },
    overlay() {}
  };

  /* ---------- 공개 함수 ---------- */

  function getTheme(id) { return THEMES[id] || THEMES[DEFAULT_THEME]; }
  /** 테마의 서체 조합 (제목 · 문장 · 안내 · 영문 · 장식 한자) */
  function fontsOf(id) {
    const f = getTheme(id).fonts;
    return { title: f.title, quote: f.quote, ui: { family: FONTS.ui }, latin: { family: FONTS.latin }, ornament: f.ornament };
  }
  function list() { return ORDER.map(id => THEMES[id]); }
  function normalizeFormat(f) { return f === 'story' ? 'story' : 'feed'; }

  /** 피드 카드의 패널 영역 (그림 띠를 뺀 종이 영역) */
  function feedPanel(theme, W, H) {
    const f = theme.feed;
    return { x: f.side, y: f.top, w: W - f.side * 2, h: H - f.top - f.bottom };
  }
  function storyPanel(theme) {
    return Object.assign({}, (theme.story && theme.story.panel) || { x: 72, y: 300, w: 936, h: 1250 });
  }

  /**
   * 배경 그림 + 종이 패널을 그립니다. (글자보다 먼저)
   * @param {{format, seed, panel, mark}} opts
   */
  function paintUnder(c, themeId, W, H, opts) {
    const t = getTheme(themeId);
    const o = Object.assign({ format: 'feed', seed: 'card' }, opts);
    o.seed = `${o.seed}:${t.id}:${o.format}`;
    ornament = t.fonts.ornament;
    c.save();
    t.paint(c, W, H, o);
    c.restore();
    c.save();
    t.panel(c, o.panel, o);
    if (!t.noBand) band(c, o.panel.x + (o.panel.w - 132) / 2, o.panel.y + 2, 132, 5);
    c.restore();
  }
  /**
   * 패널 위로 넘어오는 장식을 그립니다. (글자 다음) inner(글자 영역) 안쪽은 잘라내 문장을 가리지 않습니다.
   * @param {{format, seed, panel, inner, mark}} opts
   */
  function paintOver(c, themeId, W, H, opts) {
    const t = getTheme(themeId);
    const o = Object.assign({ format: 'feed', seed: 'card' }, opts);
    o.seed = `${o.seed}:${t.id}:${o.format}`;
    const inner = o.inner || o.panel;
    ornament = t.fonts.ornament;
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.rect(inner.x, inner.y, inner.w, inner.h);
    c.clip('evenodd');
    t.overlay(c, W, H, o);
    c.restore();
  }

  /** 디자인 고르기 썸네일 (4:5 카드 축소판: 그림 + 빈 패널 + 글줄 표시) */
  function renderThumb(canvas, themeId, cssW, cssH, dpr) {
    const W = 1080, H = 1350;
    const t = getTheme(themeId);
    const scale = Math.max(1, dpr || 1);
    canvas.width = Math.round(cssW * scale);
    canvas.height = Math.round(cssH * scale);
    const c = canvas.getContext('2d');
    c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    const panel = feedPanel(t, W, H);
    paintUnder(c, t.id, W, H, { format: 'feed', seed: 'thumb', panel });
    const C = t.colors;
    const px = panel.x + 70, pw = panel.w - 140;
    c.fillStyle = C.ink; c.fillRect(px, panel.y + 120, pw * 0.55, 40);
    c.fillStyle = C.seal; c.fillRect(px + pw - 110, panel.y + 90, 110, 110);
    c.fillStyle = rgba(C.soft, 0.5);
    [0.9, 0.7].forEach((k, i) => c.fillRect(px, panel.y + 300 + i * 52, pw * k, 22));
    c.fillStyle = C.ink;
    [1, 0.95, 0.6].forEach((k, i) => c.fillRect(px, panel.y + 480 + i * 74, pw * k, 40));
    paintOver(c, t.id, W, H, { format: 'feed', seed: 'thumb', panel, inner: { x: panel.x + 48, y: panel.y + 48, w: panel.w - 96, h: panel.h - 96 } });
  }

  return {
    DEFAULT_THEME,
    ORDER,
    FORMATS,
    STORY_SAFE,
    THEMES,
    FONTS,
    getTheme,
    fontsOf,
    list,
    normalizeFormat,
    feedPanel,
    storyPanel,
    paintUnder,
    paintOver,
    renderThumb,
    contrast,
    rgba,
    rng
  };
});
