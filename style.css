/* ============================================================
   Shared Memory Project — style.css
   ============================================================
   디자인 컨셉:
   - 한지(韓紙) 질감의 따뜻한 베이지 배경 + 먹색 텍스트
   - 한·중·일을 상징하는 3가지 포인트 컬러
   - Noto Serif KR(제목) + Noto Sans KR(본문) 조합
   - 반응형: 데스크탑 / 태블릿 / 모바일 모두 대응
   ============================================================ */


/* ---------- 0. CSS 변수 (한 곳에서 색상 관리) ---------- */
:root {
  /* 기본 색상 */
  --bg-main: #f5f1e8;        /* 한지 베이지 */
  --bg-soft: #faf7ef;        /* 더 밝은 베이지 */
  --bg-card: #ffffff;        /* 카드 배경 */
  --ink: #1a1a1a;            /* 먹색 (본문) */
  --ink-soft: #4a4a4a;       /* 옅은 먹색 */
  --ink-mute: #8a8580;       /* 회색 */
  --line: #d8d2c4;           /* 구분선 */

  /* 국가별 포인트 컬러 (각국 전통색에서 영감) */
  --korea: #c8364b;          /* 한국: 진홍 (태극기 적색) */
  --japan: #2c3e7e;          /* 일본: 남색 (전통 남염색) */
  --china: #d4a017;          /* 중국: 황금색 */

  /* 강조색 */
  --accent: #8b3a3a;         /* 진한 단색 강조 */
  --accent-soft: #e8d5b7;    /* 옅은 강조 */

  /* 간격 */
  --space-xs: 0.5rem;
  --space-sm: 1rem;
  --space-md: 2rem;
  --space-lg: 4rem;
  --space-xl: 6rem;

  /* 모서리/그림자 */
  --radius: 4px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 3px rgba(26, 26, 26, 0.04), 0 1px 2px rgba(26, 26, 26, 0.06);
  --shadow-md: 0 4px 12px rgba(26, 26, 26, 0.06), 0 2px 4px rgba(26, 26, 26, 0.04);
  --shadow-lg: 0 12px 32px rgba(26, 26, 26, 0.08), 0 4px 8px rgba(26, 26, 26, 0.04);
}


/* ---------- 1. 기본 리셋 & 타이포 ---------- */
* { margin: 0; padding: 0; box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  font-family: 'Noto Sans KR', -apple-system, sans-serif;
  font-weight: 400;
  color: var(--ink);
  background: var(--bg-main);
  line-height: 1.7;
  letter-spacing: -0.01em;
  /* 한지 질감을 흉내낸 미세한 노이즈 그라데이션 */
  background-image:
    radial-gradient(circle at 20% 30%, rgba(212, 160, 23, 0.04) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(200, 54, 75, 0.03) 0%, transparent 50%);
  min-height: 100vh;
}

h1, h2, h3, h4 {
  font-family: 'Noto Serif KR', serif;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
}

button { font-family: inherit; cursor: pointer; border: none; background: none; }
a { color: inherit; text-decoration: none; }


/* ---------- 2. 네비게이션 바 ---------- */
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(245, 241, 232, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}

.nav__inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.2rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav__logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav__logo-mark {
  font-family: 'Noto Serif KR', serif;
  font-size: 1.8rem;
  font-weight: 900;
  color: var(--accent);
  /* 한자에 살짝 도장 같은 느낌 */
  background: var(--accent);
  color: white;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  transform: rotate(-2deg);
}

.nav__logo-text strong {
  display: block;
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.1;
}

.nav__logo-text em {
  display: block;
  font-style: normal;
  font-size: 0.75rem;
  color: var(--ink-mute);
  letter-spacing: 0.05em;
}

.nav__menu {
  display: flex;
  gap: 2rem;
}

.nav__menu a {
  font-size: 0.9rem;
  color: var(--ink-soft);
  position: relative;
  padding: 0.25rem 0;
  transition: color 0.2s;
}

.nav__menu a::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--accent);
  transition: width 0.3s;
}

.nav__menu a:hover { color: var(--accent); }
.nav__menu a:hover::after { width: 100%; }


/* ---------- 3. 페이지 공통 (SPA) ---------- */
.page {
  display: none;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-lg) 2rem;
  animation: fadeIn 0.5s ease;
}

.page.active { display: block; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.page__header {
  text-align: center;
  margin-bottom: var(--space-lg);
}

.page__eyebrow {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 1rem;
  color: var(--accent);
  letter-spacing: 0.2em;
  margin-bottom: 0.75rem;
}

.page__title {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  line-height: 1.3;
}

.page__desc {
  color: var(--ink-soft);
  font-size: 1rem;
  max-width: 600px;
  margin: 0 auto;
}


/* ---------- 4. 홈 페이지: 히어로 ---------- */
.hero {
  position: relative;
  min-height: 70vh;
  display: flex;
  align-items: center;
  padding: var(--space-lg) 0;
  overflow: hidden;
}

.hero__map {
  position: absolute;
  right: -5%;
  top: 50%;
  transform: translateY(-50%);
  width: 55%;
  max-width: 700px;
  opacity: 0.5;
  z-index: 0;
  pointer-events: none;
}

.hero__map svg { width: 100%; height: auto; }

/* 동북아 지도: 각국별 색상으로 채움 + 등장 애니메이션 */
.map__china { fill: var(--china); opacity: 0.25; animation: mapDraw 1.2s ease 0.2s both; }
.map__korea { fill: var(--korea); opacity: 0.4; animation: mapDraw 1.2s ease 0.5s both; }
.map__japan { fill: var(--japan); opacity: 0.3; animation: mapDraw 1.2s ease 0.8s both; }

@keyframes mapDraw {
  from { opacity: 0; transform: scale(0.9); }
}

.hero__content {
  position: relative;
  z-index: 1;
  max-width: 700px;
}

.hero__eyebrow {
  font-family: 'Noto Serif KR', serif;
  font-size: 1.1rem;
  color: var(--accent);
  letter-spacing: 0.5em;
  margin-bottom: 1.5rem;
  animation: slideUp 0.6s ease both;
}

.hero__title {
  font-size: clamp(2rem, 5vw, 3.8rem);
  line-height: 1.2;
  margin-bottom: 1.5rem;
  font-weight: 900;
}

.hero__title-line {
  display: block;
  animation: slideUp 0.8s ease both;
}

.hero__title-line:nth-child(1) { animation-delay: 0.2s; }
.hero__title-line:nth-child(2) { animation-delay: 0.4s; }

/* 두 번째 줄에 강조 효과: 글자 아래 색 띠 */
.hero__title-line--accent {
  display: inline-block;
  position: relative;
}

.hero__title-line--accent::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0.1em;
  width: 100%;
  height: 0.15em;
  background: var(--accent);
  opacity: 0.25;
  z-index: -1;
}

.hero__subtitle {
  font-size: 1.1rem;
  color: var(--ink-soft);
  margin-bottom: 2.5rem;
  line-height: 1.8;
  animation: slideUp 0.8s ease 0.6s both;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}


/* ---------- 5. 버튼 공통 ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem 2rem;
  font-size: 0.95rem;
  font-weight: 500;
  border-radius: var(--radius);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn--primary {
  background: var(--ink);
  color: var(--bg-soft);
  animation: slideUp 0.8s ease 0.8s both;
}

.btn--primary:hover {
  background: var(--accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.btn--primary svg { transition: transform 0.3s; }
.btn--primary:hover svg { transform: translateX(4px); }

.btn--ai {
  background: linear-gradient(135deg, var(--accent), #6b2828);
  color: white;
  padding: 1rem 2.5rem;
  font-size: 1rem;
}

.btn--ai:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.btn__icon {
  font-size: 1.3rem;
  display: inline-block;
  animation: spin 8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}


/* ---------- 6. 홈: 프로젝트 소개 카드 ---------- */
.intro {
  margin-top: var(--space-xl);
}

.intro__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.intro__card {
  background: var(--bg-card);
  padding: 2.5rem 2rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.intro__card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.4s ease;
}

.intro__card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.intro__card:hover::before { transform: scaleX(1); }

.intro__num {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.5rem;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 1rem;
  line-height: 1;
}

.intro__card h3 {
  font-size: 1.3rem;
  margin-bottom: 1rem;
}

.intro__card p {
  color: var(--ink-soft);
  font-size: 0.95rem;
  line-height: 1.7;
}


/* ---------- 7. 사건 선택 페이지 ---------- */
.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.8rem;
}

.event-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.event-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-lg);
}

.event-card__visual {
  height: 180px;
  background: linear-gradient(135deg, var(--accent-soft) 0%, #d8c4a3 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Noto Serif KR', serif;
  font-size: 4rem;
  font-weight: 900;
  color: var(--accent);
  position: relative;
  overflow: hidden;
}

/* 카드 비주얼에 도장 같은 한자 워터마크 */
.event-card__visual::before {
  content: attr(data-mark);
  position: absolute;
  right: -10px;
  bottom: -20px;
  font-size: 8rem;
  opacity: 0.12;
  color: var(--ink);
}

.event-card__body { padding: 1.5rem; }

.event-card__era {
  font-family: 'Cormorant Garamond', serif;
  font-size: 0.85rem;
  color: var(--ink-mute);
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
}

.event-card__title {
  font-size: 1.3rem;
  margin-bottom: 0.75rem;
}

.event-card__desc {
  font-size: 0.9rem;
  color: var(--ink-soft);
  line-height: 1.6;
  margin-bottom: 1rem;
}

.event-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.event-card__tag {
  font-size: 0.75rem;
  padding: 0.25rem 0.7rem;
  background: var(--bg-main);
  border-radius: 100px;
  color: var(--ink-soft);
}


/* ---------- 8. 사건 상세 페이지 ---------- */
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ink-soft);
  padding: 0.5rem 0;
  margin-bottom: 2rem;
  font-size: 0.9rem;
  transition: color 0.2s;
}

.back-btn:hover { color: var(--accent); }
.back-btn svg { transition: transform 0.2s; }
.back-btn:hover svg { transform: translateX(-3px); }

.detail__header {
  margin-bottom: 3rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--line);
}

.detail__era {
  font-family: 'Cormorant Garamond', serif;
  color: var(--accent);
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
}

.detail__title {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.detail__desc {
  color: var(--ink-soft);
  font-size: 1.05rem;
  max-width: 800px;
}


/* ---------- 9. 탭 메뉴 ---------- */
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
}

.tab {
  padding: 1rem 1.5rem;
  font-size: 0.95rem;
  color: var(--ink-mute);
  font-weight: 500;
  position: relative;
  white-space: nowrap;
  transition: color 0.2s;
}

.tab::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transition: transform 0.3s;
}

.tab:hover { color: var(--ink); }
.tab.active { color: var(--accent); }
.tab.active::after { transform: scaleX(1); }

.tab-content { display: none; animation: fadeIn 0.4s ease; }
.tab-content.active { display: block; }


/* ---------- 10. 국가별 서술 카드 (핵심!) ---------- */
.narratives {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.narrative-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 2rem;
  border-top: 4px solid var(--line);
  transition: transform 0.3s, box-shadow 0.3s;
  display: flex;
  flex-direction: column;
}

.narrative-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

/* 국가별 색상 */
.narrative-card--korea { border-top-color: var(--korea); }
.narrative-card--japan { border-top-color: var(--japan); }
.narrative-card--china { border-top-color: var(--china); }

.narrative-card__flag {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.narrative-card__flag-mark {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Noto Serif KR', serif;
  font-weight: 700;
  color: white;
  font-size: 0.95rem;
}

.narrative-card--korea .narrative-card__flag-mark { background: var(--korea); }
.narrative-card--japan .narrative-card__flag-mark { background: var(--japan); }
.narrative-card--china .narrative-card__flag-mark { background: var(--china); }

.narrative-card__country {
  font-family: 'Noto Serif KR', serif;
  font-weight: 700;
  font-size: 1rem;
}

.narrative-card__country-en {
  font-size: 0.75rem;
  color: var(--ink-mute);
  letter-spacing: 0.05em;
}

.narrative-card__title {
  font-size: 1.15rem;
  margin-bottom: 1rem;
  line-height: 1.4;
}

.narrative-card__text {
  font-size: 0.92rem;
  color: var(--ink-soft);
  line-height: 1.75;
  margin-bottom: 1.5rem;
  flex: 1;
}

.narrative-card__section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--line);
}

.narrative-card__label {
  font-size: 0.7rem;
  color: var(--ink-mute);
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.narrative-card__keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.narrative-card__keyword {
  font-size: 0.78rem;
  padding: 0.2rem 0.6rem;
  background: var(--bg-main);
  border-radius: 3px;
  color: var(--ink);
  font-weight: 500;
}

.narrative-card__feature {
  font-size: 0.85rem;
  color: var(--ink-soft);
  font-style: italic;
  line-height: 1.6;
}


/* ---------- 11. 타임라인 ---------- */
.timeline {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  margin-top: 2rem;
}

.section-h {
  font-size: 1.3rem;
  margin-bottom: 1.5rem;
  position: relative;
  padding-left: 1rem;
}

.section-h::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.4em;
  width: 3px;
  height: 1em;
  background: var(--accent);
}

.section-h--small { font-size: 1.05rem; }

.timeline__track {
  position: relative;
  padding-left: 2rem;
}

.timeline__track::before {
  content: '';
  position: absolute;
  left: 0.5rem;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
}

.timeline__item {
  position: relative;
  padding-bottom: 1.5rem;
}

.timeline__item::before {
  content: '';
  position: absolute;
  left: -1.8rem;
  top: 0.4rem;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 2px solid var(--accent);
}

.timeline__year {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 0.25rem;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
}

.timeline__text {
  font-size: 0.9rem;
  color: var(--ink-soft);
  line-height: 1.7;
}


/* ---------- 12. AI 분석 박스 ---------- */
.ai-box {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 3rem;
}

.ai-box__intro {
  text-align: center;
  margin-bottom: 2rem;
}

.ai-box__intro p {
  color: var(--ink-soft);
  margin: 1rem 0 2rem;
}

.ai-box__intro small { color: var(--ink-mute); font-size: 0.8rem; }

.ai-result {
  margin-top: 2rem;
  display: none;
}

.ai-result.show {
  display: block;
  animation: fadeIn 0.6s ease;
}

.ai-result__section {
  background: var(--bg-soft);
  padding: 1.5rem 1.8rem;
  border-radius: var(--radius);
  margin-bottom: 1rem;
  border-left: 3px solid var(--accent);
}

.ai-result__heading {
  font-family: 'Noto Serif KR', serif;
  font-weight: 700;
  font-size: 1.05rem;
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ai-result__heading span:first-child {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--accent);
  color: white;
  border-radius: 50%;
  font-size: 0.85rem;
}

.ai-result__list {
  list-style: none;
  padding: 0;
}

.ai-result__list li {
  padding: 0.4rem 0;
  padding-left: 1.2rem;
  position: relative;
  font-size: 0.92rem;
  color: var(--ink-soft);
  line-height: 1.7;
}

.ai-result__list li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: var(--accent);
}

.ai-result__loading {
  text-align: center;
  padding: 2rem;
  color: var(--ink-mute);
}

.ai-result__loading::after {
  content: '...';
  animation: dots 1.5s infinite;
}

@keyframes dots {
  0%, 20% { content: '.'; }
  40% { content: '..'; }
  60%, 100% { content: '...'; }
}


/* ---------- 13. 키워드 차트 ---------- */
.keywords-box {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
}

.keywords-box__desc {
  color: var(--ink-soft);
  margin-bottom: 2rem;
  font-size: 0.95rem;
}

.keywords-chart {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.keyword-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  align-items: center;
  gap: 1rem;
}

.keyword-row__label {
  font-family: 'Noto Serif KR', serif;
  font-weight: 700;
  font-size: 1.05rem;
}

.keyword-row__bars {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.keyword-bar {
  display: grid;
  grid-template-columns: 50px 1fr 40px;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.keyword-bar__country { color: var(--ink-soft); }
.keyword-bar__country--korea { color: var(--korea); font-weight: 600; }
.keyword-bar__country--japan { color: var(--japan); font-weight: 600; }
.keyword-bar__country--china { color: var(--china); font-weight: 600; }

.keyword-bar__track {
  height: 14px;
  background: var(--bg-main);
  border-radius: 100px;
  overflow: hidden;
  position: relative;
}

.keyword-bar__fill {
  height: 100%;
  border-radius: 100px;
  width: 0;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
}

.keyword-bar__fill--korea { background: var(--korea); }
.keyword-bar__fill--japan { background: var(--japan); }
.keyword-bar__fill--china { background: var(--china); }

.keyword-bar__value {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  text-align: right;
  font-size: 0.95rem;
  color: var(--ink-soft);
}


/* ---------- 14. 공동 표현 작성 폼 ---------- */
.shared-box {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
}

.shared-box__desc {
  color: var(--ink-soft);
  margin-bottom: 2.5rem;
  font-size: 0.95rem;
}

.shared-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 3rem;
}

.shared-form__label {
  font-family: 'Noto Serif KR', serif;
  font-weight: 500;
  font-size: 0.95rem;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.shared-form__num {
  color: var(--accent);
  font-family: 'Cormorant Garamond', serif;
  font-weight: 700;
}

.shared-form__input,
.shared-form__textarea {
  width: 100%;
  padding: 0.85rem 1rem;
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--ink);
  resize: vertical;
  transition: border 0.2s, background 0.2s;
}

.shared-form__input:focus,
.shared-form__textarea:focus {
  outline: none;
  border-color: var(--accent);
  background: white;
}

.shared-form .btn--primary { margin-top: 1.5rem; align-self: flex-start; }

.shared-list { border-top: 1px solid var(--line); padding-top: 2rem; }

.shared-item {
  background: var(--bg-soft);
  padding: 1.5rem;
  border-radius: var(--radius);
  margin-bottom: 1rem;
  border-left: 3px solid var(--accent);
  animation: slideUp 0.4s ease;
}

.shared-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.shared-item__user {
  font-weight: 700;
  font-family: 'Noto Serif KR', serif;
}

.shared-item__date {
  font-size: 0.8rem;
  color: var(--ink-mute);
}

.shared-item__text {
  color: var(--ink);
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
  line-height: 1.7;
}

.shared-item__reason {
  font-size: 0.85rem;
  color: var(--ink-soft);
  padding-top: 0.75rem;
  border-top: 1px dashed var(--line);
}

.shared-item__reason strong {
  color: var(--accent);
  margin-right: 0.4rem;
}

.shared-empty {
  text-align: center;
  padding: 2rem;
  color: var(--ink-mute);
  font-size: 0.9rem;
}


/* ---------- 15. ABOUT 페이지 ---------- */
.about__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
  margin-bottom: 4rem;
}

.about__card {
  background: var(--bg-card);
  padding: 2rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
}

.about__card h3 {
  font-size: 1.15rem;
  margin-bottom: 1rem;
}

.about__card p {
  color: var(--ink-soft);
  font-size: 0.95rem;
  line-height: 1.8;
}

.about__card strong { color: var(--accent); font-weight: 700; }

.about__footer {
  text-align: center;
  padding: 3rem 0;
  border-top: 1px solid var(--line);
}

.about__footer p:first-child {
  font-family: 'Noto Serif KR', serif;
  font-style: italic;
  font-size: 1.15rem;
  color: var(--ink-soft);
  margin-bottom: 1.5rem;
}

.about__credit {
  font-family: 'Cormorant Garamond', serif;
  letter-spacing: 0.1em;
  color: var(--ink-mute);
  font-size: 0.85rem;
}


/* ============================================================
   16. 반응형: 태블릿 (1024px 이하)
   ============================================================ */
@media (max-width: 1024px) {
  .intro__grid { grid-template-columns: repeat(2, 1fr); }
  .narratives { grid-template-columns: 1fr; }
  .narratives .narrative-card { max-width: 600px; margin: 0 auto; width: 100%; }
  .about__grid { grid-template-columns: 1fr; }
  .hero__map { width: 70%; opacity: 0.3; }
}

/* ============================================================
   17. 반응형: 모바일 (640px 이하)
   ============================================================ */
@media (max-width: 640px) {
  .nav__inner { padding: 1rem; }
  .nav__menu { gap: 1rem; }
  .nav__menu a { font-size: 0.85rem; }
  .nav__logo-text strong { font-size: 1rem; }
  .nav__logo-text em { font-size: 0.7rem; }
  .nav__logo-mark { width: 36px; height: 36px; font-size: 1.4rem; }

  .page { padding: 2rem 1rem; }
  .page__title { font-size: 1.8rem; }
  .hero { min-height: 60vh; }
  .hero__map { width: 90%; opacity: 0.2; right: -20%; }
  .hero__title { font-size: 2rem; }
  .hero__subtitle { font-size: 1rem; }

  .intro__grid { grid-template-columns: 1fr; gap: 1rem; }
  .intro__card { padding: 2rem 1.5rem; }

  .events-grid { grid-template-columns: 1fr; gap: 1.2rem; }

  .detail__title { font-size: 1.8rem; }
  .ai-box, .keywords-box, .shared-box, .timeline { padding: 1.5rem; }

  .tabs { font-size: 0.85rem; }
  .tab { padding: 0.8rem 1rem; font-size: 0.85rem; }

  .keyword-row { grid-template-columns: 80px 1fr; }
  .keyword-bar { grid-template-columns: 40px 1fr 35px; gap: 0.5rem; font-size: 0.78rem; }
}
