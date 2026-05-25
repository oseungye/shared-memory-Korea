/* ============================================================
   Shared Memory Project — script.js
   ============================================================
   이 파일이 하는 일:
   1. 역사 사건 데이터(한·중·일 서술) 관리
   2. 페이지 전환 (SPA 방식)
   3. 사건 카드 동적 생성
   4. 국가별 서술 비교 카드 렌더링
   5. AI 분석 시뮬레이션 (실제 자연어 처리의 단순화 버전)
   6. 키워드 빈도 자동 계산 및 시각화
   7. 공동 표현 작성/등록 (브라우저 메모리)

   ※ 학습용으로 주석을 자세히 달았습니다.
   ============================================================ */


/* ============================================================
   📚 1. 데이터: 5개 사건 × 한·중·일 서술
   ============================================================
   실제 한·중·일 교과서 서술의 일반적 경향을 참고하되,
   고2 수준에서 핵심 차이를 명확히 볼 수 있도록 정리했습니다.
*/
const eventsData = [
  // ----- 사건 1: 임진왜란 -----
  {
    id: 'imjin',
    title: '임진왜란',
    titleJP: '文禄·慶長の役',
    titleCN: '万历朝鲜战争',
    era: '1592 – 1598',
    mark: '壬',
    shortDesc: '일본의 한반도 침공으로 시작된 7년간의 동북아 국제 전쟁. 한·중·일 모두 막대한 피해를 입은 사건이지만, 부르는 이름과 강조하는 측면이 가장 극명하게 갈린다.',
    tags: ['16세기', '국제전쟁', '명·청 교체기'],

    // 한국 서술
    korea: {
      title: '왜의 침략에 맞선 7년 항쟁',
      text: '1592년 일본이 명나라 침략의 길을 빌린다는 명목으로 조선을 침공한 침략 전쟁이다. 이순신 장군의 해전 승리와 의병들의 항전, 그리고 명나라의 원군이 결합되어 일본군을 격퇴했다. 전쟁으로 국토는 황폐화되었고 수많은 백성이 희생되었다.',
      keywords: ['침략', '항쟁', '의병', '이순신', '왜군'],
      feature: '"침략"·"왜"라는 표현을 통해 일본의 부당성을 명확히 하고, 자발적 저항(의병)과 영웅 서사를 강조한다.'
    },
    // 일본 서술
    japan: {
      title: '대륙 진출과 두 차례의 출병',
      text: '도요토미 히데요시가 명나라 정복을 목표로 추진한 대륙 진출 정책으로, 조선을 경유지로 삼아 두 차례 군대를 보냈다. 명·조선 연합군의 저항과 히데요시의 사망으로 철수했으며, 일본 사회에는 조선에서 들여온 도자기 기술과 활자 인쇄술 등 문화적 영향을 남겼다.',
      keywords: ['出兵', '進出', '경유', '히데요시', '문화 전파'],
      feature: '"침략" 대신 "출병(出兵)"·"진출"이라는 중립적·외교적 표현을 사용하며, 전쟁의 결과로 얻은 문화적 교류 측면을 부각한다.'
    },
    // 중국 서술
    china: {
      title: '조선을 도와 왜를 막은 의로운 전쟁',
      text: '명나라가 조선의 요청에 응하여 군대를 보내 일본의 침략으로부터 번방(藩邦)인 조선을 구원한 전쟁이다. 동아시아 조공 질서를 수호한 의로운 전쟁이었으나, 막대한 군사비 지출은 명조 국력 약화의 한 원인이 되었다.',
      keywords: ['抗倭援朝', '번방', '의병(義兵)', '조공질서', '구원'],
      feature: '"왜에 맞서 조선을 도왔다"는 종주국(宗主國)적 관점에서 서술하며, 명나라의 정당성과 책임감을 강조한다.'
    },

    // 타임라인
    timeline: [
      { year: '1592.4', text: '일본군 부산 상륙. 한 달 만에 한양 함락.' },
      { year: '1592.5', text: '이순신, 옥포해전에서 첫 승리. 제해권 장악.' },
      { year: '1593.1', text: '조·명 연합군, 평양성 탈환.' },
      { year: '1597.1', text: '정유재란 발발 (일본의 2차 침공).' },
      { year: '1598.11', text: '노량해전. 이순신 전사. 일본군 철수.' }
    ],

    // 키워드 빈도 (각국이 이 단어를 평균 몇 번 사용하는가 — 시뮬레이션 값)
    keywordFreq: {
      '침략': { korea: 9, japan: 0, china: 4 },
      '진출/출병': { korea: 0, japan: 8, china: 1 },
      '구원/도움': { korea: 3, japan: 1, china: 9 },
      '문화 교류': { korea: 2, japan: 7, china: 2 }
    }
  },

  // ----- 사건 2: 한중일 문화 교류 -----
  {
    id: 'culture',
    title: '한중일 문화 교류',
    titleJP: '東アジア文化交流',
    titleCN: '东亚文化交流',
    era: '4 – 19세기',
    mark: '文',
    shortDesc: '불교·한자·유교·도자기 등 동북아 삼국이 1500여 년에 걸쳐 주고받은 문화의 흐름. 누가 "전수자"이고 누가 "수용자"인가에 대한 시각이 갈린다.',
    tags: ['장기지속사', '문화사', '문명 전파'],

    korea: {
      title: '문화 전파의 교량 역할',
      text: '한국은 중국 대륙의 선진 문물을 받아들여 자체적으로 발전시킨 후 일본에 전파하는 중계 역할을 했다. 백제의 왕인 박사가 일본에 한자와 천자문을 전했고, 고구려 승려 담징이 종이·먹·맷돌 제작 기술을 일본에 전수했다. 단순 통로가 아닌 능동적 변용자였다.',
      keywords: ['전파', '교량', '왕인', '담징', '능동적 수용'],
      feature: '"전수자"로서의 자부심과 단순 수용이 아닌 "창조적 변용"을 강조한다.'
    },
    japan: {
      title: '대륙 문화의 주체적 수용',
      text: '일본은 견수사·견당사를 파견하여 중국 문화를 직접 수용하기도 했으며, 한반도 도래인(渡来人)을 통해 다양한 기술과 학문을 받아들였다. 이를 일본 풍토에 맞게 변용하여 독자적 문화를 완성했다. 헤이안 시대의 가나 문자가 대표 사례다.',
      keywords: ['도래인', '견당사', '주체적 수용', '국풍문화', '변용'],
      feature: '"전해 받았다"가 아니라 "주체적으로 받아들였다"는 능동적 표현을 일관되게 사용한다.'
    },
    china: {
      title: '동아시아 문명의 중심',
      text: '중국은 한자, 유교, 율령 제도, 불교(한역) 등 동아시아 문명의 핵심 요소를 발신한 중심지였다. 주변국들은 중국 문화를 수용하여 한자문화권을 형성했으며, 이는 동아시아 공동의 문화적 토대가 되었다.',
      keywords: ['중심', '발신', '한자문화권', '율령', '문명 전수'],
      feature: '"중화(中華)"적 세계관에 기반해 중국을 문명의 중심·발신자로 위치시킨다.'
    },

    timeline: [
      { year: '372', text: '고구려에 불교 전래 (중국 전진에서).' },
      { year: '538', text: '백제, 일본에 불교 전수.' },
      { year: '630', text: '일본, 제1차 견당사 파견 시작.' },
      { year: '1592', text: '임진왜란을 통한 도자기·인쇄술 전래.' }
    ],

    keywordFreq: {
      '전파/전수': { korea: 8, japan: 2, china: 7 },
      '수용/도입': { korea: 4, japan: 9, china: 2 },
      '변용/창조': { korea: 6, japan: 8, china: 3 },
      '중심': { korea: 1, japan: 1, china: 9 }
    }
  },

  // ----- 사건 3: 조공 관계 -----
  {
    id: 'tribute',
    title: '조공 관계',
    titleJP: '朝貢関係',
    titleCN: '朝贡体制',
    era: '7 – 19세기',
    mark: '貢',
    shortDesc: '동아시아 천년의 국제 질서. 같은 제도를 두고 한국은 "실리 외교", 중국은 "천하 질서", 일본은 "전근대적 굴종"으로 다르게 평가한다.',
    tags: ['국제관계사', '제도사', '동아시아 질서'],

    korea: {
      title: '실리를 위한 사대(事大) 외교',
      text: '조공은 중국 중심 국제질서 안에서 안보를 보장받고 선진 문물을 수입하기 위한 외교적 선택이었다. 조선은 명·청에 조공을 보냈으나 내정의 자주성을 유지했으며, 이는 굴종이 아닌 실용적 외교 전략이었다.',
      keywords: ['사대', '실리', '자주성', '외교 전략', '문물 수입'],
      feature: '조공을 굴종이 아닌 "실리적 선택"으로 재해석하며 내정 자주성을 강조한다.'
    },
    japan: {
      title: '중화 질서에서 벗어난 일본',
      text: '일본은 헤이안 시대 견당사 폐지(894년) 이후 중국 중심 조공 체제에서 사실상 이탈하였다. 무로마치 막부의 일시적 감합무역을 제외하면 조공국이 아닌 독자적 위치를 유지했고, 이는 근대 일본이 동아시아에서 빠르게 변화할 수 있었던 배경이 되었다.',
      keywords: ['이탈', '독자성', '감합무역', '비조공국', '근대화 기반'],
      feature: '조공을 부정적·전근대적 체제로 보고, "이탈"한 일본의 독자성을 강조한다.'
    },
    china: {
      title: '천하의 조화로운 질서',
      text: '조공 체제는 중국을 중심으로 한 동아시아의 평화적·문화적 국제 질서였다. 조공국에 후한 답례를 내리는 "후왕박래(厚往薄來)" 원칙으로 운영되었으며, 단순한 지배-종속이 아닌 의례적·문화적 관계였다.',
      keywords: ['천하', '예치(禮治)', '후왕박래', '책봉', '조화'],
      feature: '"조화로운 질서"라는 긍정적·이상화된 시각으로 조공을 묘사한다.'
    },

    timeline: [
      { year: '7세기', text: '신라, 당과 조공·책봉 관계 수립.' },
      { year: '894', text: '일본, 견당사 파견 중단.' },
      { year: '1401', text: '조선·명, 조공 관계 공식화.' },
      { year: '1894', text: '청일전쟁 → 조공 체제 붕괴.' }
    ],

    keywordFreq: {
      '사대/조공': { korea: 7, japan: 3, china: 9 },
      '자주/독자': { korea: 8, japan: 9, china: 1 },
      '질서/평화': { korea: 2, japan: 1, china: 8 },
      '굴종/종속': { korea: 1, japan: 6, china: 0 }
    }
  },

  // ----- 사건 4: 근대화 과정 -----
  {
    id: 'modern',
    title: '근대화 과정',
    titleJP: '近代化',
    titleCN: '近代化',
    era: '1840 – 1910',
    mark: '近',
    shortDesc: '서구 열강의 충격 앞에서 한·중·일이 걸어간 서로 다른 길. 같은 시대를 한 국가는 "성공", 한 국가는 "치욕", 한 국가는 "좌절"로 기억한다.',
    tags: ['19세기', '근대화', '제국주의'],

    korea: {
      title: '좌절된 자주 근대화',
      text: '갑신정변·갑오개혁·광무개혁 등 자주적 근대화 시도가 있었으나, 일본의 침략과 열강의 간섭으로 좌절되었다. 동학농민운동에서 보이듯 민중의 근대화 열망도 강했으나, 결국 1910년 국권을 상실하는 비극적 결말을 맞이했다.',
      keywords: ['자주 개혁', '좌절', '동학', '국권 상실', '저항'],
      feature: '"좌절된 자주성"을 핵심으로 하여 외세 책임론을 강조한다.'
    },
    japan: {
      title: '메이지 유신과 동양 유일의 근대 국가',
      text: '1868년 메이지 유신을 통해 일본은 동양에서 가장 빠르게 서구식 근대 국가를 수립했다. "탈아입구(脱亜入欧)"의 기치 아래 산업화·헌법 제정·의회 설립을 이루었고, 청일·러일 전쟁의 승리로 열강 반열에 올랐다.',
      keywords: ['메이지 유신', '탈아입구', '문명개화', '부국강병', '성공'],
      feature: '근대화의 "성공 모델"로서 일본을 자리매김하고, 침략 측면은 축소·생략하는 경향.'
    },
    china: {
      title: '백 년의 치욕(百年國恥)',
      text: '아편전쟁(1840)부터 시작된 서구 열강의 침략은 중국에게 "백 년의 치욕"이었다. 양무운동·무술변법·신해혁명 등 자강 노력이 있었으나, 반식민지 상태에서 벗어나지 못했다. 이 시기는 중국 민족 부흥 서사의 출발점이다.',
      keywords: ['百年國恥', '반식민지', '자강', '아편전쟁', '민족 부흥'],
      feature: '"치욕"이라는 강한 감정 어휘로 서구·일본의 침략 책임을 부각하고, 부흥 서사로 연결한다.'
    },

    timeline: [
      { year: '1840', text: '아편전쟁 발발 → 중국 근대 시작.' },
      { year: '1868', text: '일본 메이지 유신.' },
      { year: '1876', text: '강화도조약 → 조선 개항.' },
      { year: '1894', text: '청일전쟁 → 동아시아 질서 재편.' },
      { year: '1910', text: '한일강제병합.' }
    ],

    keywordFreq: {
      '자주/자강': { korea: 8, japan: 2, china: 7 },
      '개화/문명': { korea: 4, japan: 9, china: 3 },
      '침략/치욕': { korea: 8, japan: 0, china: 9 },
      '성공/발전': { korea: 1, japan: 8, china: 2 }
    }
  },

  // ----- 사건 5: 독도 문제 -----
  {
    id: 'dokdo',
    title: '독도 / 다케시마 문제',
    titleJP: '竹島問題',
    titleCN: '独岛问题',
    era: '512 – 현재',
    mark: '島',
    shortDesc: '현재진행형의 영토 문제. 양국 모두 자국 영토임을 주장하며, 사용하는 명칭 자체가 입장을 드러낸다. 제3자인 중국의 시각도 함께 살펴본다.',
    tags: ['영토 문제', '현재진행형', '역사 인식'],

    korea: {
      title: '역사·지리적으로 명백한 한국 영토',
      text: '독도는 512년 신라 이사부의 우산국 정벌 이래 한국 고유의 영토이다. 조선시대 안용복의 활동, "삼국접양지도" 등 일본 측 사료에도 한국 영토로 표기되어 있다. 1905년 일본의 시마네현 편입은 침략 과정의 일부로 무효이다.',
      keywords: ['고유 영토', '이사부', '안용복', '시마네현 편입', '실효 지배'],
      feature: '역사적 연속성과 사료의 일관성, 그리고 일본 측 자료까지 활용한 입증 강조.'
    },
    japan: {
      title: '국제법상 일본의 고유 영토',
      text: '다케시마는 17세기 중반부터 일본이 영유권을 확립한 고유 영토이다. 1905년 시마네현 고시로 영유 의사를 재확인했으며, 한국의 실효 지배는 국제법 위반이다. 평화적 해결을 위해 국제사법재판소(ICJ) 회부를 제안한다.',
      keywords: ['고유 영토', '시마네현 고시', '국제법', '실효지배', 'ICJ'],
      feature: '국제법·국제사회의 틀에서 해결을 주장하며, 한국의 영유를 "불법 점거"로 표현.'
    },
    china: {
      title: '한일 간 양자 문제로 인식',
      text: '중국은 독도/다케시마 문제를 한국과 일본 양국 간 영토 분쟁으로 인식하며, 공식적 입장 표명을 자제하는 경향을 보인다. 다만 일본의 영토 주장이 센카쿠/댜오위다오 문제와 연결될 수 있다는 점에서 일본의 우경화를 비판적으로 본다.',
      keywords: ['양자 문제', '우경화 비판', '중립적 입장', '센카쿠', '역사 수정주의'],
      feature: '직접 당사자가 아닌 제3자의 관점이지만, 일본 우경화 견제라는 자국 이해와 연결.'
    },

    timeline: [
      { year: '512', text: '신라, 우산국(독도 포함) 복속.' },
      { year: '1696', text: '안용복, 일본에 도해 항의.' },
      { year: '1905', text: '일본, 시마네현 고시 40호로 편입.' },
      { year: '1952', text: '한국, "평화선" 선언 후 실효 지배 시작.' },
      { year: '현재', text: '한국 실효 지배, 일본 영유권 주장 지속.' }
    ],

    keywordFreq: {
      '고유 영토': { korea: 9, japan: 9, china: 2 },
      '실효 지배': { korea: 8, japan: 5, china: 1 },
      '국제법': { korea: 4, japan: 9, china: 3 },
      '침략/불법': { korea: 7, japan: 6, china: 2 }
    }
  }
];


/* ============================================================
   🧭 2. 페이지 전환 (SPA Router)
   ============================================================ */
let currentEventId = null;        // 현재 보고 있는 사건 ID
let sharedNarratives = [];        // 사용자가 작성한 공동 표현 저장소

/**
 * 페이지 전환 함수
 * @param {string} pageName - 'home' | 'events' | 'detail' | 'about'
 */
function navigateTo(pageName) {
  // 1. 모든 페이지 숨기기
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // 2. 지정한 페이지만 보이기
  const targetPage = document.querySelector(`[data-page-name="${pageName}"]`);
  if (targetPage) targetPage.classList.add('active');

  // 3. 페이지 맨 위로 스크롤
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ============================================================
   🗂 3. 사건 카드 동적 생성
   ============================================================ */
function renderEventCards() {
  const grid = document.getElementById('eventsGrid');
  if (!grid) return;

  // 각 사건에 대해 카드 HTML을 만들어 grid에 추가
  grid.innerHTML = eventsData.map(event => `
    <div class="event-card" data-event-id="${event.id}">
      <div class="event-card__visual" data-mark="${event.mark}">
        ${event.mark}
      </div>
      <div class="event-card__body">
        <div class="event-card__era">${event.era}</div>
        <h3 class="event-card__title">${event.title}</h3>
        <p class="event-card__desc">${event.shortDesc}</p>
        <div class="event-card__tags">
          ${event.tags.map(tag => `<span class="event-card__tag">${tag}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');

  // 각 카드에 클릭 이벤트 등록
  grid.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.eventId;
      openEventDetail(id);
    });
  });
}


/* ============================================================
   📖 4. 사건 상세 페이지 렌더링 (국가별 서술 카드)
   ============================================================ */
function openEventDetail(eventId) {
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;

  currentEventId = eventId;

  // --- 4-1. 헤더(제목, 시기, 설명) 렌더링 ---
  document.getElementById('detailHeader').innerHTML = `
    <div class="detail__era">${event.era}</div>
    <h2 class="detail__title">${event.title}</h2>
    <p class="detail__desc">${event.shortDesc}</p>
  `;

  // --- 4-2. 국가별 서술 카드 3개 ---
  const countries = [
    { key: 'korea', name: '대한민국', en: 'KOREA', flag: '韓', titleField: event.title },
    { key: 'japan', name: '일본', en: 'JAPAN', flag: '日', titleField: event.titleJP },
    { key: 'china', name: '중국', en: 'CHINA', flag: '中', titleField: event.titleCN }
  ];

  document.getElementById('narrativesGrid').innerHTML = countries.map(c => {
    const n = event[c.key];   // event.korea, event.japan, event.china
    return `
      <div class="narrative-card narrative-card--${c.key}">
        <div class="narrative-card__flag">
          <div class="narrative-card__flag-mark">${c.flag}</div>
          <div>
            <div class="narrative-card__country">${c.name}</div>
            <div class="narrative-card__country-en">${c.en} · ${c.titleField}</div>
          </div>
        </div>
        <h4 class="narrative-card__title">${n.title}</h4>
        <p class="narrative-card__text">${n.text}</p>

        <div class="narrative-card__section">
          <div class="narrative-card__label">핵심 키워드</div>
          <div class="narrative-card__keywords">
            ${n.keywords.map(k => `<span class="narrative-card__keyword">${k}</span>`).join('')}
          </div>
        </div>

        <div class="narrative-card__section">
          <div class="narrative-card__label">표현 특징</div>
          <p class="narrative-card__feature">${n.feature}</p>
        </div>
      </div>
    `;
  }).join('');

  // --- 4-3. 타임라인 렌더링 ---
  document.getElementById('timelineTrack').innerHTML = event.timeline.map(t => `
    <div class="timeline__item">
      <div class="timeline__year">${t.year}</div>
      <div class="timeline__text">${t.text}</div>
    </div>
  `).join('');

  // --- 4-4. AI 결과/탭 초기화 ---
  document.getElementById('aiResult').classList.remove('show');
  document.getElementById('aiResult').innerHTML = '';
  switchTab('compare');

  // --- 4-5. 키워드 차트 그리기 ---
  renderKeywordChart(event);

  // --- 4-6. 공동 표현 목록 렌더링 ---
  renderSharedList();

  // 페이지 이동
  navigateTo('detail');
}


/* ============================================================
   🔘 5. 탭 전환
   ============================================================ */
function switchTab(tabName) {
  // 모든 탭 비활성화
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  // 선택한 탭 활성화
  document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.querySelector(`[data-tab-content="${tabName}"]`)?.classList.add('active');
}


/* ============================================================
   🤖 6. AI 분석 시뮬레이션
   ============================================================
   실제 자연어 처리(NLP)는 복잡하지만, 여기서는 학습용으로
   핵심 원리만 단순화하여 구현합니다:

   ① 키워드 빈도 비교 → 공통 키워드 / 고유 키워드 추출
   ② 텍스트 길이·문장 구조 분석 → 표현 특징 도출
   ③ 사전 정의된 표현 특징을 종합 → 결과 출력
*/
function runAIAnalysis() {
  const event = eventsData.find(e => e.id === currentEventId);
  if (!event) return;

  const resultBox = document.getElementById('aiResult');

  // --- 6-1. 로딩 표시 (실제 AI 같은 느낌) ---
  resultBox.innerHTML = `<div class="ai-result__loading">AI가 세 국가의 서술을 분석하고 있습니다</div>`;
  resultBox.classList.add('show');

  // 1.5초 후 결과 출력 (실제 분석되는 듯한 효과)
  setTimeout(() => {
    // --- 6-2. 키워드 집합 만들기 ---
    const k = new Set(event.korea.keywords);
    const j = new Set(event.japan.keywords);
    const c = new Set(event.china.keywords);

    // 공통 키워드: 두 국가 이상에서 등장하는 단어
    const commonKeywords = [...k].filter(x => j.has(x) || c.has(x))
      .concat([...j].filter(x => c.has(x) && !k.has(x)));

    // --- 6-3. 텍스트 분석 (길이, 어휘) ---
    const textK = event.korea.text;
    const textJ = event.japan.text;
    const textC = event.china.text;

    // --- 6-4. 사건별 핵심 분석 포인트 (전문가 사전 정의) ---
    // 실제 AI 분석에서도 도메인 지식(domain knowledge)이 매우 중요합니다.
    const analysisMap = {
      'imjin': {
        common: [
          '세 국가 모두 1592–1598년의 사건임에는 일치하며, 일본의 군사 행동이 시작이었다는 사실 자체는 부정하지 않는다.',
          '명나라(중국)의 참전이 전쟁의 향방을 바꾼 중요 변수였다는 점도 공통적으로 인정한다.'
        ],
        diff: [
          '한국: "침략"이라는 가치 평가가 들어간 용어를 사용 → 일본의 부당성 명시',
          '일본: "출병(出兵)"·"진출"이라는 군사 행동의 가치중립적 표현 사용 → 행위의 정당/부당 판단을 유보',
          '중국: "왜에 맞서 조선을 도왔다(抗倭援朝)" → 자국을 정의의 수호자로 위치시킴'
        ],
        feature: [
          '한국 서술: 감정적·서사적 표현 + 영웅(이순신, 의병) 중심 구조',
          '일본 서술: 외교적·중립적 어휘 + 결과(문화 교류)에 무게',
          '중국 서술: 종주국(宗主國)적 시선 + 도덕적 정당성 강조'
        ]
      },
      'culture': {
        common: [
          '문화 교류가 일방향이 아닌 다방향이었다는 사실은 세 국가 모두 인정한다.',
          '한자·불교·유교가 동아시아 공통 문화 기반이라는 점에 합의한다.'
        ],
        diff: [
          '한국: "전파의 교량" — 적극적 중계자 역할 강조',
          '일본: "주체적 수용" — 받았다는 표현 대신 능동성 강조',
          '중국: "문명의 중심" — 발신자로서의 정체성 강조'
        ],
        feature: [
          '동일한 "교류"라는 단어 안에 세 가지 다른 자기 위치 짓기가 공존한다.',
          '한국은 "왕인·담징" 같은 인물명, 일본은 "도래인" 같은 추상명사, 중국은 "한자문화권" 같은 체제 용어를 선호한다.'
        ]
      },
      'tribute': {
        common: [
          '동아시아에 중국 중심의 국제 질서가 존재했다는 사실 자체는 부정되지 않는다.',
          '조공 체제가 19세기 말 서구의 충격으로 붕괴되었다는 결말에도 일치한다.'
        ],
        diff: [
          '한국: 조공을 "굴종이 아닌 실리"로 재해석 → 사대(事大)의 능동적 측면 강조',
          '일본: "이탈"한 비조공국으로 자기 위치 짓기 → 동아시아와의 거리두기',
          '중국: "조화로운 천하 질서"로 이상화 → 평화적·문화적 성격 부각'
        ],
        feature: [
          '같은 제도를 두고 "실리적 외교"(한국), "전근대적 굴종"(일본), "조화로운 질서"(중국)으로 평가가 갈린다.',
          '평가 어휘의 차이가 곧 국제 질서를 보는 관점의 차이를 드러낸다.'
        ]
      },
      'modern': {
        common: [
          '19세기 서구 열강의 충격이 동아시아 근대화의 출발점이었다는 점에 일치한다.',
          '각국이 자강(自强)을 위한 개혁을 시도했다는 사실도 공통적이다.'
        ],
        diff: [
          '한국: "좌절" — 자주적 시도가 외세에 의해 막혔다는 서사',
          '일본: "성공" — 메이지 유신의 모범 사례화, 침략 측면 축소',
          '중국: "치욕(國恥)" — 강한 감정적 평가, 부흥 서사로 연결'
        ],
        feature: [
          '같은 시대를 한국은 비극, 일본은 성공, 중국은 굴욕으로 기억한다.',
          '특히 "탈아입구(脱亜入欧)"와 "百年國恥"는 정반대 방향의 자기 인식을 보여주는 거울 같은 표현이다.'
        ]
      },
      'dokdo': {
        common: [
          '한국과 일본 모두 "고유 영토"라는 동일한 표현을 사용하지만, 정반대의 결론을 도출한다.',
          '1905년 시마네현 편입이 역사적 분기점이라는 점은 공유된다.'
        ],
        diff: [
          '한국: 역사적·실효적 지배 강조 (이사부, 안용복, 실효 지배)',
          '일본: 국제법·국제기구 활용 강조 (시마네현 고시, ICJ 회부)',
          '중국: 직접 당사자가 아닌 입장에서 일본 우경화 견제 시각'
        ],
        feature: [
          '"고유 영토"라는 같은 용어를 사용하면서도, 그 근거(역사 vs 국제법)와 시간(고대부터 vs 17세기부터)에서 차이가 난다.',
          '명칭 선택(독도/다케시마) 자체가 입장 표명이 된다는 점에서 가장 첨예한 갈등 영역이다.'
        ]
      }
    };

    const data = analysisMap[currentEventId];

    // --- 6-5. 결과 HTML 출력 ---
    resultBox.innerHTML = `
      <div class="ai-result__section">
        <div class="ai-result__heading">
          <span>✓</span>
          <span>1. 세 국가 서술의 공통점</span>
        </div>
        <ul class="ai-result__list">
          ${data.common.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>

      <div class="ai-result__section">
        <div class="ai-result__heading">
          <span>≠</span>
          <span>2. 핵심 차이점</span>
        </div>
        <ul class="ai-result__list">
          ${data.diff.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>

      <div class="ai-result__section">
        <div class="ai-result__heading">
          <span>※</span>
          <span>3. 표현 특징 분석</span>
        </div>
        <ul class="ai-result__list">
          ${data.feature.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>

      <div class="ai-result__section" style="background: #f5f1e8; border-left-color: #8b3a3a;">
        <div class="ai-result__heading">
          <span>💡</span>
          <span>4. AI의 종합 제언</span>
        </div>
        <ul class="ai-result__list">
          <li>같은 사실을 다르게 표현하는 어휘 선택은 역사 인식의 출발점이자 결과물이다.</li>
          <li>공동 표현을 만들기 위해서는 가치 평가 어휘를 줄이고, 검증 가능한 사실 어휘를 늘려야 한다.</li>
          <li>"공동 표현 작성" 탭에서 직접 중립적 서술을 제안해 보세요.</li>
        </ul>
      </div>

      ${renderMultilingualSection()}
    `;
  }, 1500);
}

/**
 * [확장 기능] AI 분석 결과에 덧붙는 "사용자 다국어 입력 분석" 섹션 생성
 * - 사용자가 한·일·영 어떤 언어로 공동 표현을 작성했든
 *   언어별 통계와 공통 키워드를 비교 분석합니다.
 * - 기존 .ai-result__section 클래스를 그대로 재사용해
 *   디자인의 일관성을 유지합니다.
 */
function renderMultilingualSection() {
  const result = runMultilingualAnalysis();

  // 등록된 사용자 입력이 없는 경우 안내 메시지만 표시
  if (result.empty) {
    return `
      <div class="ai-result__section">
        <div class="ai-result__heading">
          <span>🌐</span>
          <span>5. 다국어 공동 표현 분석</span>
        </div>
        <ul class="ai-result__list">
          <li>${result.message}</li>
        </ul>
      </div>
    `;
  }

  // 언어별 통계 HTML 만들기
  const langOrder = ['ko', 'ja', 'en'];
  const statRows = langOrder.map(lang => {
    const s = result.stats[lang];
    const badge = getLangBadge(lang);
    if (!s) {
      return `<li>${badge.flag} ${badge.label} — 입력 없음</li>`;
    }
    // 감정 분포 → 가장 많이 등장한 카테고리 찾기
    const e = s.emotion;
    const dominant = e.negative > e.positive && e.negative > e.neutral ? '부정·갈등 어휘 우세'
                   : e.positive > e.negative && e.positive > e.neutral ? '긍정·화해 어휘 우세'
                   : e.neutral > 0 ? '중립·사실 어휘 우세'
                   : '감정 어휘 미검출';
    return `
      <li>
        ${badge.flag} ${badge.label} —
        제안 ${s.count}건, 평균 ${s.avgLen}자,
        <strong style="color: var(--accent);">${dominant}</strong>
        (부정 ${e.negative} · 중립 ${e.neutral} · 긍정 ${e.positive})
      </li>
    `;
  }).join('');

  // 다국어를 가로지르는 공통 키워드
  const commonKwHtml = result.commonHits.length > 0
    ? result.commonHits.map(k => `<li>"${k.keyword}" — ${k.count}건의 제안에서 등장</li>`).join('')
    : '<li>아직 사건 표준 키워드와 일치하는 표현이 충분히 등장하지 않았습니다.</li>';

  return `
    <div class="ai-result__section">
      <div class="ai-result__heading">
        <span>🌐</span>
        <span>5. 다국어 공동 표현 분석 (총 ${result.totalCount}건)</span>
      </div>
      <ul class="ai-result__list">
        ${statRows}
      </ul>
    </div>

    <div class="ai-result__section">
      <div class="ai-result__heading">
        <span>🔗</span>
        <span>6. 언어를 가로지르는 공통 키워드</span>
      </div>
      <ul class="ai-result__list">
        ${commonKwHtml}
      </ul>
    </div>
  `;
}


/* ============================================================
   📊 7. 키워드 빈도 차트 그리기
   ============================================================ */
function renderKeywordChart(event) {
  const chart = document.getElementById('keywordsChart');
  if (!chart) return;

  // 각 키워드에 대해 한·일·중 빈도를 막대그래프로 표시
  // 최대값 10 기준으로 % 환산
  chart.innerHTML = Object.entries(event.keywordFreq).map(([keyword, freqs]) => {
    return `
      <div class="keyword-row">
        <div class="keyword-row__label">${keyword}</div>
        <div class="keyword-row__bars">
          <div class="keyword-bar">
            <div class="keyword-bar__country keyword-bar__country--korea">한국</div>
            <div class="keyword-bar__track">
              <div class="keyword-bar__fill keyword-bar__fill--korea" data-width="${freqs.korea * 10}"></div>
            </div>
            <div class="keyword-bar__value">${freqs.korea}</div>
          </div>
          <div class="keyword-bar">
            <div class="keyword-bar__country keyword-bar__country--japan">일본</div>
            <div class="keyword-bar__track">
              <div class="keyword-bar__fill keyword-bar__fill--japan" data-width="${freqs.japan * 10}"></div>
            </div>
            <div class="keyword-bar__value">${freqs.japan}</div>
          </div>
          <div class="keyword-bar">
            <div class="keyword-bar__country keyword-bar__country--china">중국</div>
            <div class="keyword-bar__track">
              <div class="keyword-bar__fill keyword-bar__fill--china" data-width="${freqs.china * 10}"></div>
            </div>
            <div class="keyword-bar__value">${freqs.china}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 막대그래프 애니메이션: 살짝 늦게 width를 채워줌
  setTimeout(() => {
    chart.querySelectorAll('.keyword-bar__fill').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
    });
  }, 100);
}


/* ============================================================
   ✍️ 8. 공동 표현 작성 기능
   ============================================================
   ※ 실제 서버가 없으므로 브라우저 메모리(변수)에만 저장됩니다.
     새로고침하면 사라집니다. (실 서비스라면 데이터베이스 연동 필요)
*/
function submitSharedNarrative() {
  const name = document.getElementById('userName').value.trim();
  const text = document.getElementById('userNarrative').value.trim();
  const reason = document.getElementById('userReason').value.trim();

  // 유효성 검사
  if (!name || !text) {
    alert('닉네임과 공동 표현은 필수 입력 항목입니다.');
    return;
  }

  // [확장] 입력 텍스트의 언어 자동 감지
  const detectedLang = detectLanguage(text);

  // 저장 (lang, translationOpen 필드 추가)
  sharedNarratives.unshift({
    user: name,
    text: text,
    reason: reason,
    date: new Date().toLocaleDateString('ko-KR'),
    eventId: currentEventId,
    lang: detectedLang,        // ← 감지된 언어 코드 ('ko' | 'ja' | 'en' | 'unknown')
    translationOpen: false     // ← '번역 보기'가 열려있는지 여부
  });

  // 입력창 비우기
  document.getElementById('userName').value = '';
  document.getElementById('userNarrative').value = '';
  document.getElementById('userReason').value = '';

  // 목록 다시 렌더링
  renderSharedList();
}

function renderSharedList() {
  const list = document.getElementById('sharedList');
  if (!list) return;

  // 현재 사건에 해당하는 제안만 필터링
  // (인덱스 보존을 위해 원본 배열의 인덱스를 함께 들고 다닙니다)
  const items = sharedNarratives
    .map((item, idx) => ({ item, idx }))
    .filter(pair => pair.item.eventId === currentEventId);

  if (items.length === 0) {
    list.innerHTML = `<div class="shared-empty">아직 등록된 제안이 없습니다. 첫 번째 제안을 작성해 보세요!</div>`;
    return;
  }

  list.innerHTML = items.map(({ item, idx }) => {
    // [확장] 언어 배지 만들기
    const badge = getLangBadge(item.lang || 'unknown');
    const badgeHtml = `
      <span class="narrative-card__keyword" style="font-size: 0.72rem;">
        ${badge.flag} ${badge.label}
      </span>
    `;

    // [확장] 번역 영역: 열려있을 때만 렌더링
    let translationHtml = '';
    if (item.translationOpen) {
      const trans = buildTranslation(item);
      if (trans) {
        // 입력 언어 외의 두 언어로 번역 결과를 보여줌
        const translatedRows = Object.entries(trans).map(([lang, txt]) => {
          const b = getLangBadge(lang);
          return `
            <div style="margin-top: 0.6rem;">
              <span class="narrative-card__keyword" style="font-size: 0.7rem;">${b.flag} ${b.label}</span>
              <div style="margin-top: 0.4rem; font-size: 0.88rem; color: var(--ink-soft); line-height: 1.7;">
                ${escapeHtml(txt)}
              </div>
            </div>
          `;
        }).join('');

        translationHtml = `
          <div class="shared-item__reason">
            <strong>참고 번역:</strong>
            ${translatedRows}
            <div style="margin-top: 0.6rem; font-size: 0.75rem; color: var(--ink-mute);">
              ※ 본 번역은 학습용 예시 매핑이며, 실제 자동 번역 API를 대체할 자리입니다.
            </div>
          </div>
        `;
      }
    }

    // 번역 보기 버튼 텍스트 (열림/닫힘에 따라 변경)
    const toggleText = item.translationOpen ? '번역 닫기' : '번역 보기';

    return `
      <div class="shared-item">
        <div class="shared-item__header">
          <div class="shared-item__user">
            ${escapeHtml(item.user)}
            ${badgeHtml}
          </div>
          <div class="shared-item__date">${item.date}</div>
        </div>
        <div class="shared-item__text">"${escapeHtml(item.text)}"</div>
        ${item.reason ? `
          <div class="shared-item__reason">
            <strong>작성 이유:</strong>${escapeHtml(item.reason)}
          </div>
        ` : ''}

        <!-- [확장] 번역 보기 버튼: 기존 폼 input의 옅은 베이지 톤을 그대로 활용 -->
        <button
          class="narrative-card__keyword"
          style="margin-top: 0.9rem; cursor: pointer; border: 1px solid var(--line); background: white;"
          data-translate-index="${idx}">
          🌐 ${toggleText}
        </button>

        ${translationHtml}
      </div>
    `;
  }).join('');

  // [확장] 번역 보기 버튼에 이벤트 등록 (동적 생성된 버튼이므로 매번 새로 바인딩)
  list.querySelectorAll('[data-translate-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.translateIndex, 10);
      toggleTranslation(i);
    });
  });
}

// XSS 방지용 (사용자가 <script> 같은 걸 입력해도 그냥 글자로 표시)
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


/* ============================================================
   🌐 [확장 기능] 10. 언어 자동 감지
   ============================================================
   원리: 유니코드(Unicode) 문자 범위로 언어를 식별합니다.

   각 언어는 고유한 유니코드 영역을 가지고 있어요:
   - 한글:     U+AC00 ~ U+D7A3 (가 ~ 힣) → 정규식 [가-힣]
   - 히라가나: U+3040 ~ U+309F (あ ~ ん)  → 정규식 [\u3040-\u309F]
   - 가타카나: U+30A0 ~ U+30FF (ア ~ ン)  → 정규식 [\u30A0-\u30FF]
   - 한자:    U+4E00 ~ U+9FFF (一 ~ 龥)  → 정규식 [\u4E00-\u9FFF]

   판별 우선순위:
   1) 한글이 있으면 → 한국어 (한자와 섞여도 한국어로 판단)
   2) 히라가나/가타카나가 있으면 → 일본어 (가나는 일본 고유)
   3) 한자만 있으면 → 중국어로 분류 (단, 본 플랫폼은 한·일·영만 입력받음)
   4) 알파벳이 있으면 → 영어
   5) 그 외 → 'unknown'

   ※ 한자는 한·중·일 모두 사용하므로 단독으로는 언어 판별이 어렵습니다.
     따라서 한글/가나의 유무를 우선 검사합니다.
*/
function detectLanguage(text) {
  if (!text || !text.trim()) return 'unknown';

  // 1) 한글 정규식
  const hangulRegex = /[가-힣]/;
  // 2) 일본어 가나 정규식 (히라가나 + 가타카나)
  const kanaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  // 3) 영문자 정규식
  const latinRegex = /[A-Za-z]/;

  if (hangulRegex.test(text)) return 'ko';   // 한국어
  if (kanaRegex.test(text))   return 'ja';   // 일본어
  if (latinRegex.test(text))  return 'en';   // 영어

  return 'unknown';
}

/**
 * 언어 코드 → 배지 정보 변환
 * 디자인을 해치지 않도록 기존 .narrative-card__keyword 와 유사한
 * 작은 태그 스타일로 표시할 때 사용합니다.
 */
function getLangBadge(code) {
  const map = {
    'ko':      { flag: '🇰🇷', label: '한국어' },
    'ja':      { flag: '🇯🇵', label: '日本語' },
    'en':      { flag: '🇺🇸', label: 'English' },
    'unknown': { flag: '🌐', label: '미식별' }
  };
  return map[code] || map['unknown'];
}


/* ============================================================
   🔁 [확장 기능] 11. 번역 보조 기능 (예시 매핑)
   ============================================================
   실제 번역 API(Papago, DeepL, Google) 없이 작동시키기 위해,
   "사건별 + 언어별" 대표 표현을 사전에 매핑해 둡니다.

   구조:
     translationSamples[eventId][srcLang] = {
       ko: '한국어 번역',
       ja: '일본어 번역',
       en: '영어 번역'
     }

   사용자의 입력이 정확히 원문과 일치하지 않을 경우,
   해당 언어의 "대표 예시 번역"을 보여주는 방식으로 동작합니다.
   → 실제 서비스라면 외부 번역 API 연결 자리.
*/
const translationSamples = {
  'imjin': {
    ko: {
      ja: '1592年から始まった日本軍の朝鮮半島侵攻と、それに対する朝鮮・明連合軍の7年間の戦争。',
      en: 'A seven-year war beginning in 1592, marked by the Japanese invasion of the Korean peninsula and the resistance of the Joseon-Ming allied forces.'
    },
    ja: {
      ko: '1592년에 시작된 두 차례의 대륙 출병으로, 도요토미 히데요시의 대륙 진출 정책의 결과였다.',
      en: 'Two military campaigns launched in 1592, resulting from Toyotomi Hideyoshi\'s continental expansion policy.'
    },
    en: {
      ko: '1592년부터 1598년까지 동북아 삼국이 모두 관여한 국제 전쟁으로, 막대한 인적·물적 피해를 남겼다.',
      ja: '1592年から1598年まで東アジア三国すべてが関与した国際戦争で、莫大な人的・物的被害を残した。'
    }
  },
  'culture': {
    ko: {
      ja: '韓・中・日三国は1500年以上にわたって文字・宗教・技術を相互に交流させ、東アジア共通の文化的基盤を形成した。',
      en: 'Korea, China, and Japan exchanged scripts, religions, and technologies for over 1,500 years, forming a shared East Asian cultural foundation.'
    },
    ja: {
      ko: '동아시아 삼국은 한자·불교·유교 등을 상호 변용하며 각자의 독자적 문화를 발전시켰다.',
      en: 'The three East Asian nations adapted Chinese characters, Buddhism, and Confucianism in their own ways, developing distinctive cultures.'
    },
    en: {
      ko: '동북아 문화 교류는 단방향이 아닌 다방향의 흐름이었으며, 세 국가 모두 발신자이자 수용자였다.',
      ja: '東アジアの文化交流は一方向ではなく多方向の流れであり、三国すべてが発信者であり受容者でもあった。'
    }
  },
  'tribute': {
    ko: {
      ja: '東アジアの朝貢体制は単なる支配-従属関係ではなく、儀礼的・文化的・経済的な複合的国際秩序であった。',
      en: 'The East Asian tributary system was not merely a hierarchy of dominance but a complex international order combining ritual, culture, and trade.'
    },
    ja: {
      ko: '동아시아 조공 체제는 의례·문화·경제가 결합된 복합적 국제 질서였다.',
      en: 'The East Asian tributary system was a multi-layered international order encompassing ritual, culture, and commerce.'
    },
    en: {
      ko: '조공 관계는 19세기 서구 충격으로 붕괴되기 전까지 천 년 이상 동아시아 국제 질서의 기본 틀이었다.',
      ja: '朝貢関係は19世紀の西欧の衝撃で崩壊するまで、千年以上にわたり東アジア国際秩序の基本枠組みであった。'
    }
  },
  'modern': {
    ko: {
      ja: '19世紀後半、東アジア三国はそれぞれ異なる経路で近代化を試み、その結果も大きく分岐した。',
      en: 'In the late 19th century, the three East Asian nations pursued modernization along divergent paths, with starkly different outcomes.'
    },
    ja: {
      ko: '19세기 후반 동아시아 삼국은 각기 다른 경로로 근대화를 시도했고, 그 결과 또한 크게 갈렸다.',
      en: 'Each of the three East Asian states attempted modernization through different paths in the late 19th century, leading to divergent results.'
    },
    en: {
      ko: '근대화 과정은 한국에게는 좌절, 일본에게는 성공, 중국에게는 치욕으로 각기 다르게 기억된다.',
      ja: '近代化の過程は、韓国には挫折、日本には成功、中国には屈辱として、それぞれ異なって記憶されている。'
    }
  },
  'dokdo': {
    ko: {
      ja: '独島/竹島は現在も韓日両国が領有権を主張する島であり、それぞれ歴史的・国際法的根拠を提示している。',
      en: 'Dokdo/Takeshima remains a contested island, with both Korea and Japan presenting historical and international-legal claims.'
    },
    ja: {
      ko: '독도/다케시마는 한일 양국이 영유권을 주장하는 섬으로, 명칭 선택 자체가 입장의 표명이 된다.',
      en: 'Dokdo/Takeshima is contested by Korea and Japan, where even the choice of name signals one\'s position.'
    },
    en: {
      ko: '독도 영토 문제는 단순한 영유권 분쟁이 아니라 근대사 인식 차이가 응축된 상징적 쟁점이다.',
      ja: '独島領土問題は単なる領有権紛争ではなく、近代史認識の差異が凝縮された象徴的争点である。'
    }
  }
};

/**
 * 번역 보기 토글
 * 카드에 붙은 "번역 보기" 버튼이 누르면 호출됩니다.
 * @param {number} index - sharedNarratives 배열 안의 위치
 */
function toggleTranslation(index) {
  const item = sharedNarratives[index];
  if (!item) return;

  // 이미 번역이 표시되어 있으면 숨기기 (토글)
  item.translationOpen = !item.translationOpen;
  renderSharedList();
}

/**
 * 입력 언어에 따라 어떤 언어로 번역해 보여줄지 결정
 * 규칙: 한국어 입력 → 일본어 + 영어
 *      일본어 입력 → 한국어 + 영어
 *      영어 입력   → 한국어 + 일본어
 *      미식별      → 한국어 예시
 */
function buildTranslation(item) {
  const samples = translationSamples[item.eventId];
  if (!samples) return null;

  const src = item.lang;
  const srcKey = (src === 'ko' || src === 'ja' || src === 'en') ? src : 'ko';
  const map = samples[srcKey];
  if (!map) return null;

  // 결과: { 언어코드: 번역문 } 형태로 반환
  const result = {};
  Object.keys(map).forEach(targetLang => {
    result[targetLang] = map[targetLang];
  });
  return result;
}


/* ============================================================
   🤖 [확장 기능] 12. 다국어 공동 표현 AI 분석
   ============================================================
   기존 AI 분석은 "한·중·일 교과서 서술"을 비교했지만,
   이 새 기능은 "사용자들이 직접 작성한 공동 표현"을 언어별로 비교합니다.

   분석 절차 (학습용 단순화):
   ① 언어별로 분류 (이미 detectLanguage로 표시되어 있음)
   ② 평균 길이 비교 → 어느 언어가 더 함축적/서술적인가
   ③ 공통 키워드 추출 → 다국어를 가로지르는 공통 어휘
   ④ 감정 표현 사전(emotionLex) 기반 분류 → 어조 차이 도출
   ⑤ 종합 결론 출력
*/

// 감정·평가 어휘 사전 (각 언어별 대표 표현)
// 실제 NLP에서는 이런 사전을 "감성 어휘 사전(Sentiment Lexicon)"이라 부릅니다.
const emotionLex = {
  // 부정·갈등 어휘
  negative: {
    ko: ['침략', '치욕', '굴종', '비극', '좌절', '불법', '강제', '왜곡'],
    ja: ['侵略', '屈辱', '挫折', '不法', '強制', '悲劇'],
    en: ['invasion', 'humiliation', 'illegal', 'forced', 'tragedy', 'aggression']
  },
  // 중립·사실 어휘
  neutral: {
    ko: ['전쟁', '출병', '진출', '교류', '관계', '제도', '편입', '시기'],
    ja: ['戦争', '出兵', '進出', '交流', '関係', '制度'],
    en: ['war', 'campaign', 'exchange', 'relation', 'system', 'period']
  },
  // 긍정·화해 어휘
  positive: {
    ko: ['공동', '평화', '협력', '화해', '대화', '이해', '공존', '상호'],
    ja: ['共同', '平和', '協力', '和解', '対話', '理解'],
    en: ['shared', 'peace', 'cooperation', 'reconciliation', 'dialogue', 'mutual']
  }
};

/**
 * 텍스트의 감정 분포 계산
 * 사전에 등록된 단어가 텍스트에 몇 번 등장하는지 세어서
 * { negative: n, neutral: n, positive: n } 형태로 반환합니다.
 */
function analyzeEmotion(text, lang) {
  const counts = { negative: 0, neutral: 0, positive: 0 };
  if (lang === 'unknown') return counts;

  ['negative', 'neutral', 'positive'].forEach(category => {
    const words = emotionLex[category][lang] || [];
    words.forEach(word => {
      let count;
      if (lang === 'en') {
        // 영어는 단어 경계(\b)를 적용해 부분 일치 방지
        const re = new RegExp('\\b' + word + '\\b', 'gi');
        count = (text.match(re) || []).length;
      } else {
        // 한국어/일본어는 그대로 substring 검색
        count = text.split(word).length - 1;
      }
      counts[category] += count;
    });
  });
  return counts;
}

/**
 * 다국어 공동 표현 분석 메인 함수
 * 현재 사건(currentEventId)에 등록된 모든 사용자 입력을 분석합니다.
 */
function runMultilingualAnalysis() {
  const items = sharedNarratives.filter(s => s.eventId === currentEventId);

  if (items.length === 0) {
    return {
      empty: true,
      message: '아직 등록된 공동 표현 제안이 없습니다. "공동 표현 작성" 탭에서 먼저 한·일·영 어떤 언어로든 표현을 등록해 주세요.'
    };
  }

  // 1) 언어별로 분류
  const byLang = { ko: [], ja: [], en: [], unknown: [] };
  items.forEach(it => {
    const arr = byLang[it.lang] || byLang.unknown;
    arr.push(it);
  });

  // 2) 언어별 통계
  const stats = {};
  ['ko', 'ja', 'en'].forEach(lang => {
    const arr = byLang[lang];
    if (arr.length === 0) { stats[lang] = null; return; }

    const avgLen = Math.round(
      arr.reduce((sum, x) => sum + x.text.length, 0) / arr.length
    );

    const emotion = { negative: 0, neutral: 0, positive: 0 };
    arr.forEach(x => {
      const e = analyzeEmotion(x.text, lang);
      emotion.negative += e.negative;
      emotion.neutral  += e.neutral;
      emotion.positive += e.positive;
    });

    stats[lang] = { count: arr.length, avgLen, emotion };
  });

  // 3) 공통 키워드 추출 (사건별 표준 어휘와 사용자 입력의 교집합)
  const event = eventsData.find(e => e.id === currentEventId);
  const allKeywords = [
    ...event.korea.keywords,
    ...event.japan.keywords,
    ...event.china.keywords
  ];
  const commonHits = [];
  allKeywords.forEach(kw => {
    const hits = items.filter(it => it.text.includes(kw)).length;
    if (hits > 0) commonHits.push({ keyword: kw, count: hits });
  });
  commonHits.sort((a, b) => b.count - a.count);

  return {
    empty: false,
    totalCount: items.length,
    stats,
    commonHits: commonHits.slice(0, 6)
  };
}


/* ============================================================
   🚀 9. 페이지 로드 시 초기화 (이벤트 등록)
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  // --- 9-1. 페이지 카드 렌더링 ---
  renderEventCards();

  // --- 9-2. 네비게이션 클릭 이벤트 ---
  // data-page 속성을 가진 모든 요소에 클릭 이벤트 등록
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const page = el.dataset.page;
      navigateTo(page);
    });
  });

  // --- 9-3. 탭 클릭 이벤트 ---
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // --- 9-4. AI 분석 버튼 ---
  document.getElementById('aiAnalyzeBtn')?.addEventListener('click', runAIAnalysis);

  // --- 9-5. 공동 표현 등록 버튼 ---
  document.getElementById('submitNarrative')?.addEventListener('click', submitSharedNarrative);

  console.log('🎌 Shared Memory Project 로드 완료');
  console.log(`📚 등록된 사건: ${eventsData.length}개`);
});
