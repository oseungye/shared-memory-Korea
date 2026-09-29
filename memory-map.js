/* ============================================================
   Shared Memory Project — memory-map.js
   Shared Memory Map (공동 기억 지도) 시각화
   ============================================================
   · 외부 그래프 라이브러리 없이 SVG로 직접 그립니다. (의존성 0, GitHub Pages 그대로 동작)
   · 원 = 표현군, 원의 크기 = 제안 수, 선 = 표현군 사이의 텍스트 유사도(굵을수록 가까움)
   · 배치는 무작위가 아닌 고정 규칙(가장 큰 표현군을 가운데, 나머지는 순서대로 둘레에)이라
     같은 데이터면 항상 같은 그림이 나옵니다. 원 사이의 거리 자체에는 의미가 없습니다.
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SharedMemoryMap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * 표현군 원의 위치와 크기를 계산합니다.
   * @param {Array<{id, size}>} clusters  크기 내림차순
   * @param {{width, height, extraNode?}} box
   */
  function layout(clusters, box) {
    const W = box.width;
    const H = box.height;
    const cx = W / 2;
    const cy = H / 2;
    const n = clusters.length;
    const maxSize = n ? Math.max.apply(null, clusters.map(c => c.size)) : 1;
    const short = Math.min(W, H);
    const rMax = Math.max(34, Math.min(76, short * 0.17));
    const rMin = Math.max(18, rMax * 0.42);

    const nodes = clusters.map((c, i) => ({
      id: c.id,
      index: i,
      r: rMin + (rMax - rMin) * Math.sqrt(c.size / maxSize),
      x: cx,
      y: cy
    }));

    if (n > 1) {
      // 가장 큰 표현군은 가운데, 나머지는 한 겹(최대 7개) 또는 두 겹의 둘레에 순서대로
      const ringCap = 7;
      const others = nodes.slice(1);
      others.forEach((node, k) => {
        const ring = k < ringCap ? 0 : 1;
        const inRing = ring === 0 ? Math.min(others.length, ringCap) : others.length - ringCap;
        const pos = ring === 0 ? k : k - ringCap;
        // 시작 각도를 반 칸 돌려, 둘레가 2개일 때 좌우·3개일 때 삼각형으로 놓이게 합니다.
        // 세로로 긴 화면(모바일)에서는 위·아래로 놓이도록 반 칸 돌리지 않습니다.
        const turn = W >= H ? Math.PI / inRing : 0;
        const angle = -Math.PI / 2 + turn + (2 * Math.PI * pos) / inRing + (ring ? Math.PI / inRing : 0);
        const rx = (W / 2 - rMax * 0.9) * (ring ? 0.95 : 0.62);
        const ry = (H / 2 - rMax * 0.9) * (ring ? 0.95 : 0.62);
        node.x = cx + rx * Math.cos(angle);
        node.y = cy + ry * Math.sin(angle);
      });
      relax(nodes, W, H, box.labelHalf || 0);
    }
    return nodes;
  }

  /** 겹치는 원을 조금씩 밀어내고 화면 안에 머물게 합니다. (결정적 반복) */
  function relax(nodes, W, H, labelHalf) {
    const pad = 10;
    for (let iter = 0; iter < 80; iter++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.sqrt(dx * dx + dy * dy);
          const min = a.r + b.r + pad + 28;       // 28: 원 아래 라벨 공간
          if (d < min) {
            if (d < 0.01) { dx = 1; dy = 0; d = 1; }
            const push = (min - d) / 2;
            const ux = dx / d, uy = dy / d;
            if (i === 0) { b.x += ux * push * 2; b.y += uy * push * 2; }   // 가운데 원은 고정
            else { a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
            moved = true;
          }
        }
      }
      nodes.forEach(nd => {
        const half = Math.min(W / 2, Math.max(nd.r + 4, labelHalf));   // 원 아래 라벨이 잘리지 않도록
        nd.x = Math.min(W - half, Math.max(half, nd.x));
        nd.y = Math.min(H - nd.r - 22, Math.max(nd.r + 4, nd.y));
      });
      if (!moved) break;
    }
  }

  function el(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(k => node.setAttribute(k, attrs[k]));
    if (text != null) node.textContent = text;
    return node;
  }

  function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /**
   * 지도를 container 안에 그립니다. 텍스트는 모두 textContent로 넣어 XSS를 막습니다.
   * @param {HTMLElement} container
   * @param {object} analysis      shared-memory-analyzer.js analyzeExpressions 결과
   * @param {{selectedId?, onSelect?}} options
   */
  function render(container, analysis, options) {
    const opts = options || {};
    container.innerHTML = '';
    const clusters = analysis.clusters || [];
    if (!clusters.length) return null;

    const width = Math.max(300, Math.min(820, container.clientWidth || 640));
    const narrow = width < 520;
    const height = narrow ? Math.round(width * 1.4) : Math.round(width * 0.58);
    const nodes = layout(clusters, { width, height, labelHalf: narrow ? 64 : 80 });
    const byId = {};
    nodes.forEach(nd => { byId[nd.id] = nd; });

    const svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      role: 'group',
      'aria-label': `공동 기억 지도: 표현군 ${clusters.length}개`,
      class: 'memory-map__svg'
    });

    // 연결선
    const maxLinks = 2 * clusters.length;
    (analysis.links || []).slice(0, maxLinks).forEach(link => {
      const a = byId[link.source], b = byId[link.target];
      if (!a || !b) return;
      const line = el('line', {
        x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1),
        class: 'memory-map__link',
        'stroke-width': (1 + link.score * 6).toFixed(2),
        'stroke-opacity': Math.min(0.75, 0.25 + link.score).toFixed(2)
      });
      line.appendChild(el('title', {}, `표현군 ${a.index + 1} – 표현군 ${b.index + 1} 텍스트 유사도 ${link.score.toFixed(2)}`));
      svg.appendChild(line);
    });

    // 표현군 원
    clusters.forEach((c, i) => {
      const nd = nodes[i];
      const selected = c.id === opts.selectedId;
      const g = el('g', {
        class: 'memory-map__node' + (i === 0 ? ' is-largest' : '') + (selected ? ' is-selected' : ''),
        tabindex: '0',
        role: 'button',
        'data-cluster-id': c.id,
        'aria-pressed': selected ? 'true' : 'false',
        'aria-label': `표현군 ${i + 1}: ${c.labelParts.join(', ')} — ${c.size}건, 전체의 ${Math.round(c.share * 100)}%`
      });
      g.appendChild(el('circle', { cx: nd.x.toFixed(1), cy: nd.y.toFixed(1), r: nd.r.toFixed(1), class: 'memory-map__circle' }));
      g.appendChild(el('text', { x: nd.x.toFixed(1), y: (nd.y - 2).toFixed(1), class: 'memory-map__count', 'text-anchor': 'middle' }, `${c.size}건`));
      g.appendChild(el('text', { x: nd.x.toFixed(1), y: (nd.y + 14).toFixed(1), class: 'memory-map__share', 'text-anchor': 'middle' }, `${Math.round(c.share * 100)}%`));
      g.appendChild(el('text', {
        x: nd.x.toFixed(1), y: (nd.y + nd.r + 16).toFixed(1), class: 'memory-map__label', 'text-anchor': 'middle'
      }, truncate(c.labelParts.join(' · '), narrow ? 12 : 18)));
      g.appendChild(el('title', {}, c.label));
      svg.appendChild(g);
    });

    const pick = target => {
      const g = target.closest && target.closest('[data-cluster-id]');
      if (g && typeof opts.onSelect === 'function') opts.onSelect(g.getAttribute('data-cluster-id'));
    };
    svg.addEventListener('click', e => pick(e.target));
    svg.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e.target); }
    });

    container.appendChild(svg);
    return { nodes, width, height };
  }

  return { layout, render };
});
