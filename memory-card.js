/* ============================================================
   Shared Memory Project — memory-card.js
   QR 사건 링크 · My Memory Card (개인 결과 카드)
   ============================================================
   · 카드는 참여자가 이 기기에서 직접 쓴 문장과 고른 항목만으로 만듭니다.
     문장을 고치거나 요약하지 않고, "이해도가 높아졌다" 같은 평가도 만들지 않습니다.
   · 탐구 전/후 비교는 shared-memory-analyzer.js의 compareBeforeAfter 결과(실제 단어·개념 차이)만 씁니다.
   · "새롭게 발견한 관점" 후보는 이 사건의 국가별 서술 NLP 결과(eventNlp)와 사건 데이터에서 만듭니다.
   · 카드 내용은 어디에도 전송·저장하지 않습니다. (이미지 저장·인쇄는 참여자의 기기 안에서만 일어남)
   · 순수 함수는 Node 테스트에서도 그대로 쓰고, 그리기(drawCard)만 브라우저 Canvas를 씁니다.
   ============================================================ */

(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const themes = isNode ? require('./card-themes.js') : root.CardThemes;
  const api = factory(themes);
  if (isNode) module.exports = api;
  else root.MemoryCard = api;
})(typeof self !== 'undefined' ? self : this, function (Themes) {
  'use strict';

  const LIMITS = { before: 500, after: 1000, discovery: 120, question: 120, customDiscovery: 80, choiceQuestion: 60, choiceAnswer: 80 };
  const MAX_CHOICES = 5;
  const MAX_DISCOVERIES = 3;
  const COUNTRY_NAMES = { korea: '한국', japan: '일본', china: '중국' };

  /* ---------- 1. 사건 링크 (QR) ---------- */

  const ROUTE_RE = /^#\/?e\/([A-Za-z0-9_-]{1,40})\/?$/;

  /**
   * 주소에서 사건 id를 찾습니다. 지원 형식: #/e/imjin · #e/imjin · ?e=imjin · ?event=imjin
   * 목록(validIds)에 없는 id는 무시합니다(잘못된 링크 → 첫 화면).
   */
  function parseEventRoute(hash, search, validIds) {
    const ids = Array.isArray(validIds) ? validIds : [];
    let id = null;
    const m = String(hash || '').match(ROUTE_RE);
    if (m) id = m[1];
    if (!id && search) {
      const q = String(search).replace(/^\?/, '').split('&');
      for (const part of q) {
        const [k, v] = part.split('=');
        if ((k === 'e' || k === 'event') && v) { id = decodeURIComponent(v); break; }
      }
    }
    return id && ids.indexOf(id) >= 0 ? id : null;
  }

  function eventHash(eventId) { return '#/e/' + eventId; }

  /** 사건 바로가기 주소. base는 쿼리·해시를 뺀 사이트 주소(location.origin + location.pathname) */
  function eventLink(base, eventId) {
    return String(base || '').replace(/[?#].*$/, '') + eventHash(eventId);
  }

  /* ---------- 2. 입력 정리 ---------- */

  /** 앞뒤 공백·제어 문자만 정리합니다. 길이를 넘으면 자르고 … 를 붙입니다(내용을 바꾸지 않음). */
  function cleanText(value, max) {
    const s = String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!max || s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '…';
  }

  /** 문장 길이에 따라 카드 글자 크기 단계를 고릅니다. (긴 문장도 카드가 깨지지 않도록) */
  function lengthTier(text) {
    const n = String(text || '').length;
    if (n <= 40) return 'short';
    if (n <= 100) return 'medium';
    if (n <= 220) return 'long';
    return 'xlong';
  }

  /* ---------- 3. 새롭게 발견한 관점 — 후보 ---------- */

  function plainTerms(list, n) {
    const out = [];
    (list || []).forEach(x => {
      const t = x && x.term;
      if (t && !x.isPhrase && t.indexOf(' ') < 0 && !/^[0-9]+$/.test(t) && out.indexOf(t) < 0 && out.length < n) out.push(t);
    });
    return out;
  }

  /**
   * 사건 데이터와 국가별 서술 NLP 결과에서 "발견" 후보를 만듭니다. 모든 단어는 실제 계산 결과에서 옵니다.
   * @returns {Array<{id, chip, text, source}>}  chip = 고를 때 보이는 짧은 이름, text = 카드에 적히는 문장
   */
  function discoveryOptions(event, eventNlp) {
    const out = [];
    if (!event) return out;
    const names = [event.title, event.titleJP, event.titleCN].filter(Boolean);
    if (names.length >= 2 && new Set(names).size >= 2) {
      out.push({
        id: 'names',
        chip: '부르는 이름이 다르다',
        text: `같은 사건을 부르는 이름이 다르다 — ${names.join(' · ')}`,
        source: 'event'
      });
    }
    if (eventNlp && eventNlp.distinctive) {
      ['korea', 'japan', 'china'].forEach(c => {
        const terms = plainTerms(eventNlp.distinctive[c], 2);
        if (!terms.length) return;
        out.push({
          id: 'distinct-' + c,
          chip: `${COUNTRY_NAMES[c]} 측: ${terms.join('·')}`,
          text: `${COUNTRY_NAMES[c]} 측 서술은 ‘${terms.join('’·‘')}’을(를) 두드러지게 쓴다`,
          source: 'nlp'
        });
      });
    }
    if (eventNlp && eventNlp.common) {
      const terms = plainTerms(eventNlp.common, 3);
      if (terms.length) {
        out.push({
          id: 'common',
          chip: `세 서술 공통: ${terms.join('·')}`,
          text: `세 서술 모두 ‘${terms.join('’·‘')}’을(를) 쓴다`,
          source: 'nlp'
        });
      }
    }
    return out;
  }

  /* ---------- 4. 탐구 전 → 후 (실제 차이만) ---------- */

  /**
   * compareBeforeAfter 결과에서 카드에 적을 "새로 쓴 말 / 계속 쓴 말"을 고릅니다.
   * 개념(다국어 개념 사전)을 먼저, 그 다음 실제 어휘. 평가 문구는 만들지 않습니다.
   */
  function summarizeChange(result) {
    if (!result) return null;
    const uniq = list => list.filter((x, i) => x && list.indexOf(x) === i);
    const tidy = list => (list || []).filter(t => typeof t === 'string' && !/^[0-9]+$/.test(t) && t.length <= 20);
    return {
      added: uniq(tidy(result.addedConcepts).concat(tidy(result.added))).slice(0, 5),
      kept: uniq(tidy(result.keptConcepts).concat(tidy(result.kept))).slice(0, 4)
    };
  }

  /* ---------- 5. 카드 모델 ---------- */

  /**
   * 다섯 번째 서술자 칸: 참여자 문장이 채운 빈자리(filled)와 비교한 서술 어디에도 없던 요소(fresh).
   * 입력은 narrator-analysis.js placeSentence 결과에 서술자 이름을 붙인 것입니다. 없으면 null(칸을 숨김).
   * @param {{filled: {label, where: string[]}[], fresh: {label}[]}} input
   */
  function fifthNarrator(input) {
    if (!input) return null;
    const label = x => cleanText(x && x.label, 24);
    const filled = (Array.isArray(input.filled) ? input.filled : [])
      .map(x => ({ label: label(x), where: (Array.isArray(x.where) ? x.where : []).map(w => cleanText(w, 20)).filter(Boolean).slice(0, 3) }))
      .filter(x => x.label && x.where.length)
      .slice(0, 3);
    const fresh = (Array.isArray(input.fresh) ? input.fresh : []).map(label).filter(Boolean).slice(0, 2);
    return filled.length || fresh.length ? { filled, fresh } : null;
  }

  function formatDate(d) {
    const date = d instanceof Date ? d : new Date(d || Date.now());
    if (isNaN(date.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`;
  }

  /**
   * 카드에 들어갈 내용을 만듭니다. 입력이 없는 항목은 비워 두고(카드에서 숨김), 지어내지 않습니다.
   * 기본 체험(mode: 'quick')에서는 after = 직접 쓴 '한 줄 소감'(건너뛰면 빈 값), choices = 객관식으로 고른 관점입니다.
   * 두 가지를 섞지 않고 따로 담습니다(카드에서도 따로 표시).
   * @param {{event, mode, choices, before, after, discoveries, customDiscovery, question, change, fifth, flow, published, date}} input
   */
  function buildCardModel(input) {
    const i = input || {};
    const event = i.event || {};
    const quick = i.mode === 'quick';
    const choices = (Array.isArray(i.choices) ? i.choices : [])
      .filter(c => c && !c.skipped && c.answer)
      .map(c => ({ question: cleanText(c.question, LIMITS.choiceQuestion), answer: cleanText(c.answer, LIMITS.choiceAnswer) }))
      .filter(c => c.answer)
      .slice(0, MAX_CHOICES);
    const before = cleanText(i.before, LIMITS.before);
    const after = cleanText(i.after, LIMITS.after);
    const picked = (Array.isArray(i.discoveries) ? i.discoveries : [])
      .map(d => cleanText(typeof d === 'string' ? d : d && d.text, LIMITS.discovery))
      .filter(Boolean);
    const custom = cleanText(i.customDiscovery, LIMITS.customDiscovery);
    if (custom) picked.push(custom);
    const discoveries = picked.filter((d, k) => picked.indexOf(d) === k).slice(0, MAX_DISCOVERIES);
    const flow = i.flow || {};
    const change = before && after ? summarizeChange(i.change) : null;

    return {
      eventId: event.id || '',
      mode: quick ? 'quick' : 'classic',
      choices,
      title: event.title || '',
      era: event.era || '',
      mark: event.mark || '共',
      question: cleanText(event.question, 160),
      before,
      after,
      hasBefore: !!before,
      discoveries,
      myQuestion: cleanText(i.question, LIMITS.question),
      change,
      fifth: after ? fifthNarrator(i.fifth) : null,
      stamps: quick ? [
        { id: 'compare', mark: '讀', label: '세 나라 서술', done: !!flow.viewedCompare },
        { id: 'choices', mark: '擇', label: '관점 고르기', done: choices.length > 0 },
        { id: 'reflect', mark: '書', label: '한 줄 소감', done: !!after },
        { id: 'shared', mark: '共', label: '공개 참여', done: !!i.published }
      ] : [
        { id: 'compare', mark: '讀', label: '세 나라 서술', done: !!flow.viewedCompare },
        { id: 'nlp', mark: '析', label: '비교 분석', done: !!flow.viewedNlp },
        { id: 'sources', mark: '史', label: '사료 확인', done: !!flow.viewedSources },
        { id: 'shared', mark: '共', label: '공개 참여', done: !!i.published }
      ],
      tiers: { before: lengthTier(before), after: lengthTier(after) },
      date: formatDate(i.date),
      // 기본 체험은 소감을 건너뛰어도 고른 관점이 있으면 카드를 만들 수 있습니다.
      ready: quick ? (!!after || choices.length > 0) : !!after
    };
  }

  /* ---------- 6. 줄바꿈 (Canvas 이미지용) ---------- */

  /**
   * 주어진 폭에 맞춰 줄을 나눕니다. 공백에서 먼저 나누고, 한 단어가 폭보다 길면 글자 단위로 나눕니다.
   * maxLines를 넘으면 마지막 줄 끝에 … 을 붙이고 truncated=true를 돌려줍니다.
   * @param {(s: string) => number} measure  글자 폭을 재는 함수 (Canvas measureText 또는 테스트용)
   */
  function wrapText(text, maxWidth, measure, maxLines) {
    const lines = [];
    const limit = maxLines || Infinity;
    const paragraphs = String(text || '').split('\n');
    let truncated = false;

    outer:
    for (const para of paragraphs) {
      const tokens = para.split(/(\s+)/).filter(t => t !== '');
      let line = '';
      const push = l => {
        if (lines.length >= limit) { truncated = true; return false; }
        lines.push(l.replace(/\s+$/, ''));
        return true;
      };
      for (const tok of tokens) {
        const candidate = line + tok;
        if (measure(candidate) <= maxWidth) { line = candidate; continue; }
        if (/^\s+$/.test(tok)) { if (!push(line)) break outer; line = ''; continue; }
        if (line.trim()) { if (!push(line)) break outer; line = ''; }
        if (measure(tok) <= maxWidth) { line = tok; continue; }
        for (const ch of Array.from(tok)) {
          if (measure(line + ch) > maxWidth && line) { if (!push(line)) break outer; line = ''; }
          line += ch;
        }
      }
      if (!push(line)) break;
    }

    if (truncated && lines.length) {
      let last = lines[lines.length - 1];
      while (last && measure(last + '…') > maxWidth) last = Array.from(last).slice(0, -1).join('');
      lines[lines.length - 1] = last.replace(/\s+$/, '') + '…';
    }
    return { lines, truncated };
  }

  /* ---------- 7. Canvas 그리기 (브라우저) ---------- */

  // 그림 장식·색은 card-themes.js가 맡고, 여기서는 글자 배치만 합니다.
  // 서체: 테마별 조합은 card-themes.js(fontsOf). 아래는 card-themes.js 없이 그릴 때의 기본값입니다.
  const SERIF = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const SANS = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  const LATIN = "'Cormorant Garamond', Georgia, serif";
  const DEFAULT_FONTS = {
    title: { family: SERIF, weight: 900 }, quote: { family: SERIF, weight: 700 },
    ui: { family: SANS }, latin: { family: LATIN }, ornament: { family: SERIF, max: 900 }
  };
  function fontsFor(theme) { return Themes && Themes.fontsOf ? Themes.fontsOf(theme.id) : DEFAULT_FONTS; }

  const AFTER_SIZE = { short: 50, medium: 42, long: 36, xlong: 32 };
  const BEFORE_SIZE = { short: 34, medium: 30, long: 28, xlong: 26 };
  /** 스토리에서 '탐구 후 한 문장'에 시도할 글자 크기 (큰 것부터) */
  const STORY_SIZES = [76, 70, 64, 58, 54, 50, 46, 42, 38, 34];
  const CONTENT_INSET = 56;   // 패널 가장자리 → 글자
  const OVERLAY_INSET = 46;   // 이 안쪽으로는 장식이 넘어오지 않음

  const inset = (r, d) => ({ x: r.x + d, y: r.y + d, w: r.w - d * 2, h: r.h - d * 2 });

  function themeOf(id) {
    if (Themes) return Themes.getTheme(id);
    // card-themes.js 없이도 그릴 수 있도록 최소 기본값 (이전 디자인)
    return {
      id: 'classic', noBand: true, feed: { top: 28, bottom: 28, side: 28 }, story: { panel: { x: 56, y: 280, w: 968, h: 1290 } },
      colors: { bg: '#f5f1e8', paper: '#faf7ef', ink: '#1a1a1a', soft: '#4a4a4a', mute: '#6e6964', line: '#d8d2c4', accent: '#8b3a3a', onAccent: '#fff', seal: '#8b3a3a' }
    };
  }
  function paintUnder(c, theme, W, H, o) {
    if (Themes) { Themes.paintUnder(c, theme.id, W, H, o); return; }
    c.fillStyle = theme.colors.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = theme.colors.paper; c.fillRect(o.panel.x, o.panel.y, o.panel.w, o.panel.h);
  }
  function paintOver(c, theme, W, H, o) { if (Themes) Themes.paintOver(c, theme.id, W, H, o); }

  /** 글자를 쌓는 도구: 그리기 명령(ops)을 모아 두었다가 배경 다음에 실행합니다. */
  function composer(ctx) {
    const ops = [];
    const measureWith = font => s => { ctx.font = font; return ctx.measureText(s).width; };
    const text = (str, font, color, x, yy, align) => ops.push(c => {
      c.font = font; c.fillStyle = color; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
      c.fillText(str, x, yy);
    });
    return { ops, measureWith, text };
  }

  function drawSeal(ops, C, cx, cy, size, mark, orn) {
    const o = orn || DEFAULT_FONTS.ornament;
    ops.push(c => {
      c.save();
      c.translate(cx, cy);
      c.rotate(-0.035);
      c.fillStyle = C.seal || C.accent;
      c.fillRect(-size / 2, -size / 2, size, size);
      c.strokeStyle = C.onAccent; c.globalAlpha = 0.55; c.lineWidth = 2;
      c.strokeRect(-size / 2 + 7, -size / 2 + 7, size - 14, size - 14);
      c.globalAlpha = 1;
      c.font = `${o.max} ${Math.round(size * 0.64)}px ${o.family}`; c.fillStyle = C.onAccent; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(mark, 0, size * 0.045);
      c.restore();
    });
  }

  function drawStamps(ops, C, stamps, x0, cy, r, gap, labelSize, ui) {
    const UI = ui || SANS;
    stamps.forEach((st, k) => {
      const cx = x0 + r + k * gap;
      ops.push(c => {
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
        if (st.done) { c.fillStyle = C.accent; c.fill(); }
        else { c.setLineDash([5, 5]); c.strokeStyle = C.line; c.lineWidth = 2; c.stroke(); c.setLineDash([]); }
        c.font = `700 ${Math.round(r * 0.88)}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = st.done ? C.onAccent : C.line; c.fillText(st.mark, cx, cy + 2);
        c.font = `400 ${labelSize}px ${UI}`; c.fillStyle = st.done ? C.soft : C.mute; c.textBaseline = 'alphabetic';
        c.fillText(st.label, cx, cy + r + labelSize + 12);
      });
    });
  }

  /* --- 7-1. 카드 (4:5 · 1080 × 1350~1920) --- */

  // 내용이 길어 1920px을 넘으면 줄 수를 단계적으로 줄여 다시 배치합니다(그림 띠를 침범하지 않도록).
  const FEED_LIMITS = [
    { after: 20, before: 4, item: 2, ask: 3 },
    { after: 15, before: 4, item: 2, ask: 3 },
    { after: 11, before: 3, item: 2, ask: 2 },
    { after: 8, before: 2, item: 1, ask: 2 }
  ];

  function layoutFeed(ctx, model, theme, lim) {
    const W = 1080, f = theme.feed, C = theme.colors;
    const PAD = f.side + CONTENT_INSET, INNER = W - PAD * 2;
    const { ops, measureWith, text } = composer(ctx);
    const F = fontsFor(theme), UI = F.ui.family, LAT = F.latin.family, TF = F.title, QF = F.quote;
    let truncated = false;
    let y = f.top + 80;

    const block = (str, font, color, lineH, maxLines, indent) => {
      const r = wrapText(str, INNER - (indent || 0), measureWith(font), maxLines);
      if (r.truncated) truncated = true;
      r.lines.forEach(l => { y += lineH; text(l, font, color, PAD + (indent || 0), y); });
      return r;
    };
    const label = str => { y += 56; text(str, `600 22px ${UI}`, C.accent, PAD, y); y += 8; };
    const rule = gap => { y += gap || 36; const yy = y; ops.push(c => { c.strokeStyle = C.line; c.lineWidth = 2; c.beginPath(); c.moveTo(PAD, yy); c.lineTo(W - PAD, yy); c.stroke(); }); };
    const bullet = (str, maxLines) => {
      y += 8;
      const startY = y;
      block(str, `400 28px ${UI}`, C.ink, 44, maxLines, 30);
      ops.push(c => { c.fillStyle = C.accent; c.fillRect(PAD, startY + 22, 14, 3); });
    };

    // 머리글
    text('SHARED MEMORY', `600 28px ${LAT}`, C.ink, PAD, y);
    text(`MY MEMORY CARD · ${model.date}`, `400 22px ${LAT}`, C.mute, W - PAD, y, 'right');
    rule(30);

    // 사건 + 도장
    const sealSize = 132;
    const sealY = y + 40;
    drawSeal(ops, C, W - PAD - sealSize / 2, sealY + sealSize / 2, sealSize, model.mark, F.ornament);
    y += 40;
    y += 30; text(model.era, `400 26px ${LAT}`, C.accent, PAD, y);
    const titleFont = `${TF.weight} 64px ${TF.family}`;
    wrapText(model.title, INNER - sealSize - 30, measureWith(titleFont), 2).lines.forEach(l => { y += 78; text(l, titleFont, C.ink, PAD, y); });
    y = Math.max(y, sealY + sealSize);
    if (model.question) {
      y += 18;
      const qFont = `500 28px ${SERIF}`;
      wrapText(model.question, INNER, measureWith(qFont), 3).lines.forEach(l => { y += 42; text(l, qFont, C.soft, PAD, y); });
    }
    rule(40);

    if (model.mode === 'quick') {
      // 기본 체험: 고른 관점(객관식) → 직접 쓴 한 줄 소감. 둘을 다른 칸·다른 이름으로 나눕니다.
      label('내가 고른 관점 · 객관식');
      if (model.choices.length) {
        model.choices.forEach(ch => {
          y += 14;
          block(ch.question, `500 22px ${UI}`, C.mute, 34, 1, 30);
          bullet(ch.answer, lim.item);
        });
      } else {
        block('고른 관점이 없어요. (질문을 모두 건너뜀)', `400 26px ${UI}`, C.mute, 40, 1);
      }
      rule(40);
      label('나의 한 줄 소감 · 직접 쓴 문장');
      if (model.after) {
        const as = AFTER_SIZE[model.tiers.after];
        block(`“${model.after}”`, `${QF.weight} ${as}px ${QF.family}`, C.ink, Math.round(as * 1.5), lim.after);
      } else {
        block('소감은 남기지 않았어요.', `400 26px ${UI}`, C.mute, 40, 1);
      }
    } else {
    // 탐구 전
    label('탐구 전 · 나의 첫 생각');
    if (model.before) {
      const s = BEFORE_SIZE[model.tiers.before];
      block(`“${model.before}”`, `400 ${s}px ${QF.family}`, C.soft, Math.round(s * 1.55), lim.before);
    } else {
      block('탐구 전 문장을 남기지 않았어요.', `400 26px ${UI}`, C.mute, 40, 1);
    }

    y += 30;
    const ay = y;
    ops.push(c => { c.fillStyle = C.accent; c.font = `400 34px ${UI}`; c.textAlign = 'left'; c.fillText('↓', PAD, ay + 10); });

    // 탐구 후 (주인공)
    label('탐구 후 · 나의 한 문장');
    const as = AFTER_SIZE[model.tiers.after];
    block(`“${model.after}”`, `${QF.weight} ${as}px ${QF.family}`, C.ink, Math.round(as * 1.5), lim.after);

    if (model.change && (model.change.added.length || model.change.kept.length)) {
      y += 24;
      const chFont = `400 25px ${UI}`;
      if (model.change.added.length) block(`새로 쓴 말  ${model.change.added.join(' · ')}`, chFont, C.soft, 40, 2);
      if (model.change.kept.length) block(`계속 쓴 말  ${model.change.kept.join(' · ')}`, chFont, C.mute, 40, 2);
    }
    }

    if (model.fifth) {
      rule(40);
      label('다섯 번째 서술자 · 내 문장이 담은 것');
      model.fifth.filled.map(x => `‘${x.label}’ — ${x.where.join('·')}에는 없던 요소`)
        .concat(model.fifth.fresh.map(x => `‘${x}’ — 비교한 서술 어디에도 없던 요소`))
        .forEach(t => bullet(t, lim.item));
    }

    if (model.discoveries.length) {
      rule(40);
      label('탐구하며 새롭게 발견한 관점');
      model.discoveries.forEach(d => bullet(d, lim.item));
    }

    if (model.myQuestion) {
      rule(40);
      label('아직 남은 나의 질문');
      block(model.myQuestion, `400 30px ${QF.family}`, C.ink, 46, lim.ask);
    }

    // 탐구 기록 도장
    rule(48);
    y += 40;
    const stampR = 34;
    const stampsY = y + stampR;
    drawStamps(ops, C, model.stamps, PAD, stampsY, stampR, Math.min(200, (INNER - stampR * 2) / 3), 20, UI);
    y = stampsY + stampR + 32;

    // 하단
    y += 56;
    text(footNote(model), `400 20px ${UI}`, C.mute, PAD, y);
    const noteY = y;
    y += 36;
    text('共  Shared Memory · 동북아 역사 공동 기억 프로젝트', `600 22px ${SERIF}`, C.accent, PAD, y);
    ops.push(c => { if (truncated) { c.font = `400 20px ${UI}`; c.fillStyle = C.mute; c.textAlign = 'right'; c.fillText('(긴 문장은 일부 생략)', W - PAD, y); } });
    return { ops, y, noteY, get truncated() { return truncated; }, PAD };
  }

  function drawFeed(canvas, model, theme) {
    const W = 1080, f = theme.feed;
    const ctx = canvas.getContext('2d');
    let r = null;
    for (const lim of FEED_LIMITS) {
      r = layoutFeed(ctx, model, theme, lim);
      if (r.y + CONTENT_INSET + f.bottom <= 1920) break;
    }
    const overflow = r.y + CONTENT_INSET + f.bottom > 1920;
    const H = Math.min(1920, Math.max(1350, Math.ceil(r.y + CONTENT_INSET + f.bottom)));
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    const panel = Themes ? Themes.feedPanel(theme, W, H) : { x: f.side, y: f.top, w: W - f.side * 2, h: H - f.top - f.bottom };
    const opts = { format: 'feed', seed: model.eventId || 'card', panel, mark: model.mark, inner: inset(panel, OVERLAY_INSET) };
    paintUnder(c, theme, W, H, opts);
    r.ops.forEach(op => op(c));
    paintOver(c, theme, W, H, opts);
    return { width: W, height: H, truncated: r.truncated || overflow, theme: theme.id, format: 'feed', layout: { panel, inner: inset(panel, CONTENT_INSET), contentBottom: r.y } };
  }

  /* --- 7-2. 인스타 스토리 (9:16 · 1080 × 1920) --- */

  /**
   * 스토리의 '탐구 후 한 문장' 글자 크기를 고릅니다. 정해진 높이(avail)에 다 들어가는 가장 큰 크기를 쓰고,
   * 가장 작은 크기로도 넘치면 줄 수를 제한합니다(truncated).
   * @param {(size: number) => (s: string) => number} measureAt  글자 크기별 폭 재기
   * @returns {{size, lineH, lines, truncated}}
   */
  function storyFit(text, width, avail, measureAt, sizes) {
    const list = sizes || STORY_SIZES;
    for (const s of list) {
      const lineH = Math.round(s * 1.42);
      const r = wrapText(text, width, measureAt(s), Infinity);
      if (r.lines.length * lineH <= avail) return { size: s, lineH, lines: r.lines, truncated: false };
    }
    const s = list[list.length - 1];
    const lineH = Math.round(s * 1.42);
    const r = wrapText(text, width, measureAt(s), Math.max(1, Math.floor(avail / lineH)));
    return { size: s, lineH, lines: r.lines, truncated: r.truncated };
  }

  function footNote(model) {
    return model.mode === 'quick'
      ? '고른 관점과 직접 쓴 문장으로 만든 카드예요. 정답이나 점수가 아닙니다.'
      : '참여자가 직접 쓴 문장으로 만든 카드입니다. 정답이나 점수를 뜻하지 않습니다.';
  }

  /**
   * 스토리 가운데 칸 — 기본 체험: 고른 관점(객관식) 목록 → 한 줄 소감(있으면 남은 높이에 맞는 가장 큰 글자).
   * 소감이 없으면 고른 관점을 조금 더 크게 보여줍니다.
   */
  function storyQuick(ops, text, measureWith, model, C, g) {
    const { X, IW, midTop, avail, UI, QF, TF } = g;
    let truncated = false;
    const hasAfter = !!model.after;
    const ansSize = hasAfter ? 34 : 40;
    const ansLH = Math.round(ansSize * 1.4);
    const qFont = `500 23px ${UI}`;
    const ansFont = `600 ${ansSize}px ${QF.family}`;
    const labelH = 52;
    const choiceBlocks = model.choices.map(ch => {
      const a = wrapText(ch.answer, IW - 30, measureWith(ansFont), 2);
      if (a.truncated) truncated = true;
      return { q: ch.question, lines: a.lines };
    });
    const choicesH = labelH + (choiceBlocks.length
      ? choiceBlocks.reduce((sum, b) => sum + 34 + b.lines.length * ansLH + 16, 0)
      : 48);
    const afterLabelH = 52 + 34;
    let fit = null;
    if (hasAfter) {
      fit = storyFit(`“${model.after}”`, IW, Math.max(80, avail - choicesH - afterLabelH), s => measureWith(`${QF.weight} ${s}px ${QF.family}`), STORY_SIZES.slice(2));
      if (fit.truncated) truncated = true;
    }
    const used = choicesH + (hasAfter ? afterLabelH + fit.lines.length * fit.lineH : afterLabelH + 40);
    let m = midTop + Math.max(0, (avail - used) * 0.4);

    m += 30; text('내가 고른 관점 · 객관식', `600 24px ${UI}`, C.accent, X, m);
    m += 22;
    if (choiceBlocks.length) {
      choiceBlocks.forEach(b => {
        m += 34; text(b.q, qFont, C.mute, X + 30, m);
        const top = m + 12;
        ops.push(k => { k.fillStyle = C.accent; k.fillRect(X, top + Math.round(ansLH * 0.45), 16, 4); });
        b.lines.forEach(l => { m += ansLH; text(l, ansFont, C.ink, X + 30, m); });
        m += 16;
      });
    } else {
      m += 48; text('고른 관점이 없어요. (질문을 모두 건너뜀)', `400 26px ${UI}`, C.mute, X, m);
    }

    m += 52; text('나의 한 줄 소감 · 직접 쓴 문장', `600 24px ${UI}`, C.accent, X, m);
    m += 18;
    let afterSize = null;
    if (hasAfter) {
      afterSize = fit.size;
      const quoteY = m;
      ops.push(k => {
        k.save(); k.font = `${TF.weight} 200px ${TF.family}`; k.fillStyle = C.accent; k.globalAlpha = 0.1; k.textAlign = 'left'; k.textBaseline = 'top';
        k.fillText('“', X + IW - 140, quoteY - 30); k.restore();
      });
      const afterFont = `${QF.weight} ${fit.size}px ${QF.family}`;
      fit.lines.forEach(l => { m += fit.lineH; text(l, afterFont, C.ink, X, m - Math.round(fit.size * 0.18)); });
    } else {
      m += 40; text('소감은 남기지 않았어요.', `400 26px ${UI}`, C.mute, X, m);
    }
    return { truncated, afterSize, bottom: m };
  }

  function drawStory(canvas, model, theme) {
    const W = 1080, H = 1920, C = theme.colors;
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    const P = Themes ? Themes.storyPanel(theme) : Object.assign({}, theme.story.panel);
    const X = P.x + CONTENT_INSET + 6, IW = P.w - (CONTENT_INSET + 6) * 2;
    const { ops, measureWith, text } = composer(c);
    const F = fontsFor(theme), UI = F.ui.family, LAT = F.latin.family, TF = F.title, QF = F.quote;
    let truncated = false;
    const rule = yy => ops.push(k => { k.strokeStyle = C.line; k.lineWidth = 2; k.beginPath(); k.moveTo(X, yy); k.lineTo(X + IW, yy); k.stroke(); });

    // 머리글 · 사건
    let y = P.y + 80;
    text('SHARED MEMORY', `600 30px ${LAT}`, C.ink, X, y);
    text(model.date, `400 26px ${LAT}`, C.mute, X + IW, y, 'right');
    y += 28; rule(y);
    const sealSize = 116;
    const sealTop = y + 34;
    drawSeal(ops, C, X + IW - sealSize / 2, sealTop + sealSize / 2, sealSize, model.mark, F.ornament);
    y += 34 + 32;
    text(model.era, `400 30px ${LAT}`, C.accent, X, y);
    const titleFont = `${TF.weight} 62px ${TF.family}`;
    wrapText(model.title, IW - sealSize - 28, measureWith(titleFont), 2).lines.forEach(l => { y += 76; text(l, titleFont, C.ink, X, y); });
    y = Math.max(y, sealTop + sealSize) + 36;
    rule(y);
    const midTop = y + 24;

    // 바닥: 도장 · 안내 · 서명 (패널 아래쪽에 고정)
    const signY = P.y + P.h - 62;
    const noteY = signY - 40;
    const bottomRule = noteY - 46;
    const stampR = 30;
    const stampsCy = bottomRule - 36 - 20 - stampR;
    const gap = Math.min(220, (IW - stampR * 2) / 3);
    drawStamps(ops, C, model.stamps, X + (IW - (gap * 3 + stampR * 2)) / 2, stampsCy, stampR, gap, 21, UI);
    rule(bottomRule);
    const midBottom = stampsCy - stampR - 40;
    const avail = midBottom - midTop;

    if (model.mode === 'quick') {
      const r = storyQuick(ops, text, measureWith, model, C, { X, IW, midTop, avail, UI, QF, TF });
      truncated = r.truncated;
      text(truncated ? '고른 관점과 직접 쓴 문장으로 만든 카드예요. (긴 문장은 일부 생략)' : footNote(model), `400 21px ${UI}`, C.mute, X, noteY);
      text('共  Shared Memory · 동북아 역사 공동 기억 프로젝트', `600 24px ${SERIF}`, C.accent, X, signY);
      const qo = { format: 'story', seed: model.eventId || 'card', panel: P, mark: model.mark, inner: inset(P, OVERLAY_INSET) };
      paintUnder(c, theme, W, H, qo);
      ops.forEach(op => op(c));
      paintOver(c, theme, W, H, qo);
      return { width: W, height: H, truncated, theme: theme.id, format: 'story', layout: { panel: P, inner: { x: X, y: P.y + 40, w: IW, h: signY - P.y - 40 }, afterSize: r.afterSize, contentBottom: Math.max(r.bottom, signY) } };
    }

    // 가운데: 탐구 전(작게) → 탐구 후(크게) → 새로 쓴 말
    const added = model.change && model.change.added ? model.change.added.slice(0, 5) : [];
    const chipFont = `500 26px ${UI}`;
    const chipRows = [];
    if (added.length) {
      let row = [], w = 0;
      added.forEach(t => {
        const cw = measureWith(chipFont)(t) + 40;
        if (w + cw > IW && row.length) { chipRows.push(row); row = []; w = 0; }
        row.push({ t, cw }); w += cw + 12;
      });
      if (row.length) chipRows.push(row);
    }
    let rows = chipRows.slice(0, 2);
    const chipsHeight = () => rows.length ? 46 + rows.length * 62 : 0;
    const beforeFont = `400 32px ${QF.family}`;
    const beforeLH = 48;
    const beforeHeight = lines => model.before ? 40 + lines * beforeLH + 70 : 0;
    const afterLabelH = 52;

    // 주인공은 '탐구 후 한 문장': 넘치면 탐구 전 문장 줄 수 → 새로 쓴 말 줄 수 순으로 양보합니다.
    const fitAfter = beforeLines => {
      const b = model.before ? wrapText(`“${model.before}”`, IW, measureWith(beforeFont), beforeLines) : { lines: [], truncated: false };
      const f = storyFit(`“${model.after}”`, IW, avail - beforeHeight(b.lines.length) - afterLabelH - chipsHeight(), s => measureWith(`${QF.weight} ${s}px ${QF.family}`));
      return { b, f };
    };
    let { b: before, f: fit } = fitAfter(3);
    if (fit.truncated) ({ b: before, f: fit } = fitAfter(2));
    if (fit.truncated) ({ b: before, f: fit } = fitAfter(1));
    if (fit.truncated && rows.length > 1) { rows = rows.slice(0, 1); ({ b: before, f: fit } = fitAfter(1)); }
    if (before.truncated || fit.truncated) truncated = true;
    const used = beforeHeight(before.lines.length) + afterLabelH + fit.lines.length * fit.lineH + chipsHeight();
    let m = midTop + Math.max(0, (avail - used) * 0.42);

    if (model.before) {
      m += 30; text('탐구 전 · 나의 첫 생각', `600 24px ${UI}`, C.accent, X, m);
      m += 10;
      before.lines.forEach(l => { m += beforeLH; text(l, beforeFont, C.soft, X, m); });
      m += 58;
      const ay = m;
      ops.push(k => { k.fillStyle = C.accent; k.font = `400 38px ${UI}`; k.textAlign = 'left'; k.textBaseline = 'alphabetic'; k.fillText('↓', X, ay); });
      m += 12;
    }
    m += 34; text('탐구 후 · 나의 한 문장', `600 24px ${UI}`, C.accent, X, m);
    m += 18;
    const quoteY = m;
    ops.push(k => {
      k.save(); k.font = `${TF.weight} 220px ${TF.family}`; k.fillStyle = C.accent; k.globalAlpha = 0.1; k.textAlign = 'left'; k.textBaseline = 'top';
      k.fillText('“', X + IW - 150, quoteY - 30); k.restore();
    });
    const afterFont = `${QF.weight} ${fit.size}px ${QF.family}`;
    fit.lines.forEach(l => { m += fit.lineH; text(l, afterFont, C.ink, X, m - Math.round(fit.size * 0.18)); });

    if (rows.length) {
      m += 46;
      text('새로 쓴 말', `500 22px ${UI}`, C.mute, X, m);
      m += 14;
      rows.forEach(row => {
        let cx = X;
        const top = m;
        row.forEach(({ t, cw }) => {
          const x0 = cx;
          ops.push(k => {
            k.beginPath();
            if (k.roundRect) k.roundRect(x0, top, cw, 48, 24); else k.rect(x0, top, cw, 48);
            k.fillStyle = Themes ? Themes.rgba(C.accent, 0.1) : 'rgba(0,0,0,0.06)'; k.fill();
            k.strokeStyle = Themes ? Themes.rgba(C.accent, 0.4) : C.line; k.lineWidth = 1.5; k.stroke();
          });
          text(t, chipFont, C.soft, x0 + 20, top + 33);
          cx += cw + 12;
        });
        m += 62;
      });
    }

    text(truncated ? '참여자가 직접 쓴 문장으로 만든 카드입니다. (긴 문장은 일부 생략)' : '참여자가 직접 쓴 문장으로 만든 카드입니다. 정답이나 점수를 뜻하지 않습니다.', `400 21px ${UI}`, C.mute, X, noteY);
    text('共  Shared Memory · 동북아 역사 공동 기억 프로젝트', `600 24px ${SERIF}`, C.accent, X, signY);

    const opts = { format: 'story', seed: model.eventId || 'card', panel: P, mark: model.mark, inner: inset(P, OVERLAY_INSET) };
    paintUnder(c, theme, W, H, opts);
    ops.forEach(op => op(c));
    paintOver(c, theme, W, H, opts);
    return { width: W, height: H, truncated, theme: theme.id, format: 'story', layout: { panel: P, inner: { x: X, y: P.y + 40, w: IW, h: signY - P.y - 40 }, afterSize: fit.size, contentBottom: Math.max(m, signY) } };
  }

  /**
   * 카드를 그리기 전에 불러와야 할 서체와 글자 목록. (브라우저에서 document.fonts.load(font, text)에 그대로 넘깁니다)
   * Google Fonts·Pretendard는 글자 범위별로 파일이 나뉘어 있어, 실제로 그릴 글자를 함께 넘겨야
   * 한글·한자 조각까지 내려받습니다. (글자 없이 부르면 영문 조각만 받아 이미지가 기본 서체로 그려질 수 있음)
   * @returns {Array<{font: string, text: string}>}
   */
  function fontLoads(model, opts) {
    const o = typeof opts === 'string' ? { theme: opts } : (opts || {});
    const theme = themeOf(o.theme);
    const F = fontsFor(theme);
    const m = model || {};
    const uniq = str => Array.from(new Set(Array.from(String(str || '').replace(/\s+/g, '')))).join('') || 'A';
    const stamps = (m.stamps || []).map(x => x.mark + x.label).join('');
    const labels = '탐구전·나의첫생각후한문장새로쓴말계속다섯번째서술자내가담은것하며롭게발견관점아직남은질문참여자직접만든카드입니다정답이나점수를뜻하지않습니다긴일부생략↓고른객관식줄소감남기지았어요없모두건너뜀과()';
    const choiceText = (m.choices || []).map(ch => ch.question + ch.answer).join('');
    const quotes = [m.before, m.after, m.myQuestion, choiceText, '“”'].join('');
    const ui = [labels, stamps, choiceText, (m.discoveries || []).join(''), (m.change ? m.change.added.concat(m.change.kept).join('') : ''),
      m.fifth ? JSON.stringify(m.fifth) : ''].join('');
    const out = [
      { font: `${F.title.weight} 64px ${F.title.family}`, text: uniq((m.title || '') + '“') },
      { font: `${F.quote.weight} 48px ${F.quote.family}`, text: uniq(quotes) },
      { font: `400 30px ${F.quote.family}`, text: uniq(quotes) },
      { font: `500 28px ${SERIF}`, text: uniq((m.question || '') + stamps + '共Shared Memory·동북아역사공동기억프로젝트') },
      { font: `400 24px ${F.ui.family}`, text: uniq(ui) },
      { font: `600 24px ${F.ui.family}`, text: uniq(labels) },
      { font: `400 26px ${F.latin.family}`, text: uniq('SHARED MEMORY MY CARD 0123456789.–·' + (m.era || '') + (m.date || '')) },
      { font: `${F.ornament.max} 40px ${F.ornament.family}`, text: uniq((m.mark || '') + '共同記憶帖確') }
    ];
    return out;
  }

  /**
   * 카드를 그립니다.
   * @param {HTMLCanvasElement} canvas
   * @param {object} model  buildCardModel 결과
   * @param {{theme?: string, format?: 'feed'|'story'} | string} [opts]  테마 id 또는 옵션 (기본: 고문서 테마 · 4:5 카드)
   * @returns {{width, height, truncated, theme, format, layout}}
   */
  function drawCard(canvas, model, opts) {
    const o = typeof opts === 'string' ? { theme: opts } : (opts || {});
    const theme = themeOf(o.theme);
    return o.format === 'story' ? drawStory(canvas, model, theme) : drawFeed(canvas, model, theme);
  }
  return {
    LIMITS,
    MAX_DISCOVERIES,
    MAX_CHOICES,
    parseEventRoute,
    eventHash,
    eventLink,
    cleanText,
    lengthTier,
    discoveryOptions,
    summarizeChange,
    fifthNarrator,
    formatDate,
    buildCardModel,
    wrapText,
    storyFit,
    fontLoads,
    drawCard
  };
});
