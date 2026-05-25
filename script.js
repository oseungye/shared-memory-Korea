/* ============================================================
   Shared Memory Project — script.js
   ============================================================ */

const eventsData = [
  {
    id: 'imjin',
    title: '임진왜란',
    titleJP: '文禄·慶長の役',
    titleCN: '万历朝鲜战争',
    era: '1592 – 1598',
    mark: '壬',
    shortDesc: '일본의 한반도 침공으로 시작된 7년간의 동북아 국제 전쟁. 한·중·일 모두 막대한 피해를 입은 사건이지만, 부르는 이름과 강조하는 측면이 가장 극명하게 갈린다.',
    tags: ['16세기', '국제전쟁', '명·청 교체기'],

    korea: {
      title: '왜의 침략에 맞선 7년 항쟁',
      text: '1592년 일본이 명나라 침략의 길을 빌린다는 명목으로 조선을 침공한 침략 전쟁이다. 이순신 장군의 해전 승리와 의병들의 항전, 그리고 명나라의 원군이 결합되어 일본군을 격퇴했다. 전쟁으로 국토는 황폐화되었고 수많은 백성이 희생되었다.',
      keywords: ['침략', '항쟁', '의병', '이순신', '왜군'],
      feature: '"침략"·"왜"라는 표현을 통해 일본의 부당성을 명확히 하고, 자발적 저항과 영웅 서사를 강조한다.'
    },
    japan: {
      title: '대륙 진출과 두 차례의 출병',
      text: '도요토미 히데요시가 명나라 정복을 목표로 추진한 대륙 진출 정책으로, 조선을 경유지로 삼아 두 차례 군대를 보냈다. 명·조선 연합군의 저항과 히데요시의 사망으로 철수했으며, 일본 사회에는 조선에서 들여온 도자기 기술과 활자 인쇄술 등 문화적 영향을 남겼다.',
      keywords: ['出兵', '進出', '경유', '히데요시', '문화 전파'],
      feature: '"침략" 대신 "출병"·"진출"이라는 중립적 표현을 사용하며, 문화적 교류 측면을 부각한다.'
    },
    china: {
      title: '조선을 도와 왜를 막은 의로운 전쟁',
      text: '명나라가 조선의 요청에 응하여 군대를 보내 일본의 침략으로부터 조선을 구원한 전쟁이다. 동아시아 조공 질서를 수호한 의로운 전쟁이었으나, 막대한 군사비 지출은 명조 국력 약화의 한 원인이 되었다.',
      keywords: ['抗倭援朝', '번방', '의병', '조공질서', '구원'],
      feature: '"왜에 맞서 조선을 도왔다"는 종주국적 관점에서 서술하며, 명나라의 정당성과 책임감을 강조한다.'
    },

    timeline: [
      { year: '1592.4', text: '일본군 부산 상륙. 한 달 만에 한양 함락.' },
      { year: '1592.5', text: '이순신, 옥포해전에서 첫 승리. 제해권 장악.' },
      { year: '1593.1', text: '조·명 연합군, 평양성 탈환.' },
      { year: '1597.1', text: '정유재란 발발.' },
      { year: '1598.11', text: '노량해전. 이순신 전사. 일본군 철수.' }
    ],

    keywordFreq: {
      '침략': { korea: 9, japan: 0, china: 4 },
      '진출/출병': { korea: 0, japan: 8, china: 1 },
      '구원/도움': { korea: 3, japan: 1, china: 9 },
      '문화 교류': { korea: 2, japan: 7, china: 2 }
    }
  },

  {
    id: 'culture',
    title: '한중일 문화 교류',
    titleJP: '東アジア文化交流',
    titleCN: '东亚文化交流',
    era: '4 – 19세기',
    mark: '文',
    shortDesc: '불교·한자·유교·도자기 등 동북아 삼국이 오랜 시간 주고받은 문화의 흐름. 누가 전수자이고 누가 수용자인가에 대한 시각이 갈린다.',
    tags: ['장기지속사', '문화사', '문명 전파'],

    korea: {
      title: '문화 전파의 교량 역할',
      text: '한국은 중국 대륙의 선진 문물을 받아들여 자체적으로 발전시킨 후 일본에 전파하는 중계 역할을 했다. 백제의 왕인 박사가 일본에 한자와 천자문을 전했고, 고구려 승려 담징이 종이·먹·맷돌 제작 기술을 일본에 전수했다.',
      keywords: ['전파', '교량', '왕인', '담징', '능동적 수용'],
      feature: '"전수자"로서의 자부심과 단순 수용이 아닌 창조적 변용을 강조한다.'
    },
    japan: {
      title: '대륙 문화의 주체적 수용',
      text: '일본은 견수사·견당사를 파견하여 중국 문화를 직접 수용하기도 했으며, 한반도 도래인을 통해 다양한 기술과 학문을 받아들였다. 이를 일본 풍토에 맞게 변용하여 독자적 문화를 완성했다.',
      keywords: ['도래인', '견당사', '주체적 수용', '국풍문화', '변용'],
      feature: '"전해 받았다"가 아니라 "주체적으로 받아들였다"는 능동적 표현을 사용한다.'
    },
    china: {
      title: '동아시아 문명의 중심',
      text: '중국은 한자, 유교, 율령 제도, 불교 등 동아시아 문명의 핵심 요소를 발신한 중심지였다. 주변국들은 중국 문화를 수용하여 한자문화권을 형성했으며, 이는 동아시아 공동의 문화적 토대가 되었다.',
      keywords: ['중심', '발신', '한자문화권', '율령', '문명 전수'],
      feature: '중국을 문명의 중심이자 발신자로 위치시킨다.'
    },

    timeline: [
      { year: '372', text: '고구려에 불교 전래.' },
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

  {
    id: 'tribute',
    title: '조공 관계',
    titleJP: '朝貢関係',
    titleCN: '朝贡体制',
    era: '7 – 19세기',
    mark: '貢',
    shortDesc: '동아시아 천년의 국제 질서. 같은 제도를 두고 한국은 실리 외교, 중국은 천하 질서, 일본은 전근대적 굴종으로 다르게 평가한다.',
    tags: ['국제관계사', '제도사', '동아시아 질서'],

    korea: {
      title: '실리를 위한 사대 외교',
      text: '조공은 중국 중심 국제질서 안에서 안보를 보장받고 선진 문물을 수입하기 위한 외교적 선택이었다. 조선은 명·청에 조공을 보냈으나 내정의 자주성을 유지했으며, 이는 굴종이 아닌 실용적 외교 전략이었다.',
      keywords: ['사대', '실리', '자주성', '외교 전략', '문물 수입'],
      feature: '조공을 굴종이 아닌 실리적 선택으로 재해석하며 내정 자주성을 강조한다.'
    },
    japan: {
      title: '중화 질서에서 벗어난 일본',
      text: '일본은 헤이안 시대 견당사 폐지 이후 중국 중심 조공 체제에서 사실상 이탈하였다. 무로마치 막부의 일시적 감합무역을 제외하면 조공국이 아닌 독자적 위치를 유지했다.',
      keywords: ['이탈', '독자성', '감합무역', '비조공국', '근대화 기반'],
      feature: '조공을 부정적·전근대적 체제로 보고, 이탈한 일본의 독자성을 강조한다.'
    },
    china: {
      title: '천하의 조화로운 질서',
      text: '조공 체제는 중국을 중심으로 한 동아시아의 평화적·문화적 국제 질서였다. 후왕박래 원칙으로 운영되었으며, 단순한 지배-종속이 아닌 의례적·문화적 관계였다.',
      keywords: ['천하', '예치', '후왕박래', '책봉', '조화'],
      feature: '조화로운 질서라는 긍정적 시각으로 조공을 묘사한다.'
    },

    timeline: [
      { year: '7세기', text: '신라, 당과 조공·책봉 관계 수립.' },
      { year: '894', text: '일본, 견당사 파견 중단.' },
      { year: '1401', text: '조선·명, 조공 관계 공식화.' },
      { year: '1894', text: '청일전쟁 이후 조공 체제 붕괴.' }
    ],

    keywordFreq: {
      '사대/조공': { korea: 7, japan: 3, china: 9 },
      '자주/독자': { korea: 8, japan: 9, china: 1 },
      '질서/평화': { korea: 2, japan: 1, china: 8 },
      '굴종/종속': { korea: 1, japan: 6, china: 0 }
    }
  },

  {
    id: 'modern',
    title: '근대화 과정',
    titleJP: '近代化',
    titleCN: '近代化',
    era: '1840 – 1910',
    mark: '近',
    shortDesc: '서구 열강의 충격 앞에서 한·중·일이 걸어간 서로 다른 길. 같은 시대를 한 국가는 성공, 한 국가는 치욕, 한 국가는 좌절로 기억한다.',
    tags: ['19세기', '근대화', '제국주의'],

    korea: {
      title: '좌절된 자주 근대화',
      text: '갑신정변·갑오개혁·광무개혁 등 자주적 근대화 시도가 있었으나, 일본의 침략과 열강의 간섭으로 좌절되었다. 동학농민운동에서 보이듯 민중의 근대화 열망도 강했으나, 결국 1910년 국권을 상실하는 비극적 결말을 맞이했다.',
      keywords: ['자주 개혁', '좌절', '동학', '국권 상실', '저항'],
      feature: '좌절된 자주성을 핵심으로 하여 외세 책임론을 강조한다.'
    },
    japan: {
      title: '메이지 유신과 동양 유일의 근대 국가',
      text: '1868년 메이지 유신을 통해 일본은 동양에서 가장 빠르게 서구식 근대 국가를 수립했다. 탈아입구의 기치 아래 산업화·헌법 제정·의회 설립을 이루었고, 청일·러일 전쟁의 승리로 열강 반열에 올랐다.',
      keywords: ['메이지 유신', '탈아입구', '문명개화', '부국강병', '성공'],
      feature: '근대화의 성공 모델로서 일본을 자리매김하고, 침략 측면은 축소하는 경향이 있다.'
    },
    china: {
      title: '백 년의 치욕',
      text: '아편전쟁부터 시작된 서구 열강의 침략은 중국에게 백 년의 치욕이었다. 양무운동·무술변법·신해혁명 등 자강 노력이 있었으나, 반식민지 상태에서 벗어나지 못했다.',
      keywords: ['百年國恥', '반식민지', '자강', '아편전쟁', '민족 부흥'],
      feature: '치욕이라는 강한 감정 어휘로 서구·일본의 침략 책임을 부각하고 부흥 서사로 연결한다.'
    },

    timeline: [
      { year: '1840', text: '아편전쟁 발발.' },
      { year: '1868', text: '일본 메이지 유신.' },
      { year: '1876', text: '강화도조약으로 조선 개항.' },
      { year: '1894', text: '청일전쟁으로 동아시아 질서 재편.' },
      { year: '1910', text: '한일강제병합.' }
    ],

    keywordFreq: {
      '자주/자강': { korea: 8, japan: 2, china: 7 },
      '개화/문명': { korea: 4, japan: 9, china: 3 },
      '침략/치욕': { korea: 8, japan: 0, china: 9 },
      '성공/발전': { korea: 1, japan: 8, china: 2 }
    }
  },

  {
    id: 'zainichi',
    title: '재일조선인',
    titleJP: '在日朝鮮人',
    titleCN: '在日朝鲜人',
    era: '1910 – 현재',
    mark: '在',
    shortDesc: '일제강점기와 전후 일본 사회 속에서 형성된 한반도 출신 주민 공동체. 강제성, 생활 기반, 국적, 차별 문제를 어떻게 바라보는지에 따라 서술 관점이 갈린다.',
    tags: ['식민지 지배', '이주', '소수자'],

    korea: {
      title: '식민지 지배가 남긴 이주와 차별의 역사',
      text: '재일조선인은 일제강점기 노동 이주, 강제 동원, 전쟁 수행 과정 속에서 일본에 거주하게 된 조선인과 그 후손을 가리킨다. 해방 이후에도 많은 이들이 일본에 남았지만, 국적·교육·취업·사회적 차별 문제를 겪었다.',
      keywords: ['식민지 지배', '강제 동원', '차별', '국적', '정체성'],
      feature: '식민지 지배의 책임과 전후 차별 문제를 중심으로 서술하며, 피해와 권리 회복의 관점을 강조한다.'
    },
    japan: {
      title: '전후 일본 사회의 외국인 주민 문제',
      text: '재일조선인은 일본의 식민지 지배 시기 일본으로 이주하거나 동원된 조선인과 그 후손으로, 전후 일본 사회에 남아 생활 기반을 형성했다. 일본 서술에서는 이들을 외국인 주민 또는 특별영주자 문제로 다루며, 교육·복지·지역사회 통합의 관점에서 설명하는 경향이 있다.',
      keywords: ['在日', '외국인 주민', '특별영주자', '지역사회', '통합'],
      feature: '식민지 책임보다는 전후 제도와 사회 통합 문제로 설명하는 경향이 강하다.'
    },
    china: {
      title: '일본 제국주의와 동아시아 이주 문제',
      text: '중국의 시각에서는 재일조선인 문제가 일본 제국주의가 동아시아에 남긴 구조적 문제 중 하나로 이해된다. 조선인 이주와 차별은 식민지 지배, 전쟁 동원, 전후 처리의 불완전성과 연결되며, 동아시아 역사 인식 갈등의 사례로 해석된다.',
      keywords: ['제국주의', '전쟁 동원', '동아시아', '역사 인식', '차별'],
      feature: '일본 제국주의의 책임과 동아시아 전체의 역사 문제라는 틀에서 바라본다.'
    },

    timeline: [
      { year: '1910', text: '한일강제병합 이후 조선인의 일본 이주 증가.' },
      { year: '1930년대', text: '일본 산업화와 전시 체제 속 조선인 노동자 증가.' },
      { year: '1945', text: '해방 이후 다수는 귀국했으나 일부는 일본에 잔류.' },
      { year: '1952', text: '재일조선인의 법적 지위 변화.' },
      { year: '현재', text: '차별, 정체성, 권리 문제가 계속 논의됨.' }
    ],

    keywordFreq: {
      '식민지 지배': { korea: 9, japan: 3, china: 8 },
      '외국인 주민': { korea: 2, japan: 8, china: 2 },
      '차별/권리': { korea: 8, japan: 5, china: 6 },
      '정체성': { korea: 7, japan: 6, china: 4 }
    }
  },

  {
    id: 'hiroshima',
    title: '히로시마 원폭과 조선인 피해자',
    titleJP: '広島原爆と朝鮮人被害者',
    titleCN: '广岛原爆与朝鲜人受害者',
    era: '1945 – 현재',
    mark: '爆',
    shortDesc: '1945년 히로시마 원자폭탄 투하와 그 속에 포함된 조선인 피해자 문제. 전쟁 피해, 식민지 동원, 기억의 사각지대를 함께 보여주는 사건이다.',
    tags: ['제2차 세계대전', '원폭', '기억과 추모'],

    korea: {
      title: '해방과 피해가 겹친 조선인 원폭 피해',
      text: '히로시마 원폭 피해자 중에는 일제강점기 일본으로 이주하거나 강제 동원된 조선인들이 포함되어 있었다. 이들은 일본 제국주의의 전쟁 동원 피해자이면서 동시에 원폭 피해자였다.',
      keywords: ['조선인 피해자', '강제 동원', '원폭 피해', '해방', '기억'],
      feature: '원폭 피해를 단순한 전쟁 피해가 아니라 식민지 지배와 강제 동원의 결과로 연결해 설명한다.'
    },
    japan: {
      title: '전쟁과 핵무기의 비극',
      text: '히로시마 원폭은 제2차 세계대전 말기 미국이 일본에 투하한 핵무기로, 수많은 민간인이 희생된 비극적 사건이다. 일본 서술은 핵무기의 참혹성과 평화의 중요성을 강조하는 경향이 강하다.',
      keywords: ['原爆', '전쟁 피해', '핵무기', '평화', '히바쿠샤'],
      feature: '핵 피해와 평화 담론을 중심으로 서술하며, 식민지 피해자의 위치는 약해질 수 있다.'
    },
    china: {
      title: '일본 군국주의와 전쟁 피해의 복합성',
      text: '중국의 시각에서는 히로시마 원폭이 일본 군국주의와 태평양 전쟁의 결과 속에서 발생한 사건으로 이해된다. 조선인 피해자의 존재는 일본 제국주의가 식민지 주민까지 전쟁 체제에 동원했음을 보여준다.',
      keywords: ['군국주의', '전쟁 책임', '조선인 피해', '반전', '식민지 동원'],
      feature: '일본의 전쟁 책임과 식민지 동원을 함께 강조하며, 원폭 피해만을 분리해 보지 않는다.'
    },

    timeline: [
      { year: '1910–1945', text: '일제강점기 조선인의 일본 이주와 강제 동원 발생.' },
      { year: '1945.8.6', text: '미국, 히로시마에 원자폭탄 투하.' },
      { year: '1945.8.15', text: '일본 패전과 조선 해방.' },
      { year: '전후', text: '조선인 원폭 피해자 상당수가 귀국하거나 일본에 잔류.' },
      { year: '현재', text: '피해 보상, 기억, 추모 방식 논의 지속.' }
    ],

    keywordFreq: {
      '원폭 피해': { korea: 8, japan: 9, china: 6 },
      '강제 동원': { korea: 9, japan: 2, china: 7 },
      '평화/반전': { korea: 5, japan: 9, china: 7 },
      '전쟁 책임': { korea: 7, japan: 3, china: 9 }
    }
  }
];

let currentEventId = null;
let sharedNarratives = [];

function navigateTo(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.querySelector(`[data-page-name="${pageName}"]`);
  if (targetPage) targetPage.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderEventCards() {
  const grid = document.getElementById('eventsGrid');
  if (!grid) return;

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

  grid.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      openEventDetail(card.dataset.eventId);
    });
  });
}

function openEventDetail(eventId) {
  const event = eventsData.find(e => e.id === eventId);
  if (!event) return;

  currentEventId = eventId;

  document.getElementById('detailHeader').innerHTML = `
    <div class="detail__era">${event.era}</div>
    <h2 class="detail__title">${event.title}</h2>
    <p class="detail__desc">${event.shortDesc}</p>
  `;

  const countries = [
    { key: 'korea', name: '대한민국', en: 'KOREA', flag: '韓', titleField: event.title },
    { key: 'japan', name: '일본', en: 'JAPAN', flag: '日', titleField: event.titleJP },
    { key: 'china', name: '중국', en: 'CHINA', flag: '中', titleField: event.titleCN }
  ];

  document.getElementById('narrativesGrid').innerHTML = countries.map(c => {
    const n = event[c.key];
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

  document.getElementById('timelineTrack').innerHTML = event.timeline.map(t => `
    <div class="timeline__item">
      <div class="timeline__year">${t.year}</div>
      <div class="timeline__text">${t.text}</div>
    </div>
  `).join('');

  document.getElementById('aiResult').classList.remove('show');
  document.getElementById('aiResult').innerHTML = '';

  switchTab('compare');
  renderKeywordChart(event);
  renderSharedList();
  navigateTo('detail');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.querySelector(`[data-tab-content="${tabName}"]`)?.classList.add('active');
}

function runAIAnalysis() {
  const event = eventsData.find(e => e.id === currentEventId);
  if (!event) return;

  const resultBox = document.getElementById('aiResult');

  resultBox.innerHTML = `<div class="ai-result__loading">AI가 세 국가의 서술을 분석하고 있습니다</div>`;
  resultBox.classList.add('show');

  setTimeout(() => {
    const analysisMap = {
      'imjin': {
        common: [
          '세 국가 모두 1592–1598년의 사건임에는 일치하며, 일본의 군사 행동이 시작이었다는 사실 자체는 부정하지 않는다.',
          '명나라의 참전이 전쟁의 향방을 바꾼 중요 변수였다는 점도 공통적으로 인정한다.'
        ],
        diff: [
          '한국: "침략"이라는 가치 평가가 들어간 용어를 사용한다.',
          '일본: "출병"·"진출"이라는 비교적 중립적인 표현을 사용한다.',
          '중국: "왜에 맞서 조선을 도왔다"는 구원자적 위치를 강조한다.'
        ],
        feature: [
          '한국은 저항과 피해의 서사를 강조한다.',
          '일본은 군사 행동과 문화 교류의 결과를 강조한다.',
          '중국은 동아시아 질서 수호와 명나라의 역할을 강조한다.'
        ]
      },
      'culture': {
        common: [
          '문화 교류가 일방향이 아닌 다방향이었다는 사실은 세 국가 모두 인정한다.',
          '한자·불교·유교가 동아시아 공통 문화 기반이라는 점에 합의한다.'
        ],
        diff: [
          '한국: 문화 전파의 교량 역할을 강조한다.',
          '일본: 주체적 수용과 변용을 강조한다.',
          '중국: 문명의 중심이자 발신자 역할을 강조한다.'
        ],
        feature: [
          '같은 문화 교류를 두고 각국은 자신을 서로 다른 위치에 놓는다.',
          '한국은 중계자, 일본은 수용자이자 변용자, 중국은 발신자로 서술한다.'
        ]
      },
      'tribute': {
        common: [
          '동아시아에 중국 중심의 국제 질서가 존재했다는 사실 자체는 부정되지 않는다.',
          '조공 체제가 19세기 말 서구의 충격으로 붕괴되었다는 점도 공통적으로 나타난다.'
        ],
        diff: [
          '한국: 조공을 실리 외교로 재해석한다.',
          '일본: 조공 체제에서 벗어난 독자성을 강조한다.',
          '중국: 조공을 조화로운 천하 질서로 설명한다.'
        ],
        feature: [
          '같은 제도를 두고 실리, 이탈, 조화라는 서로 다른 평가가 나타난다.',
          '평가 어휘의 차이가 국제 질서를 보는 관점의 차이를 드러낸다.'
        ]
      },
      'modern': {
        common: [
          '19세기 서구 열강의 충격이 동아시아 근대화의 출발점이었다는 점에 일치한다.',
          '각국이 자강을 위한 개혁을 시도했다는 사실도 공통적이다.'
        ],
        diff: [
          '한국: 자주적 근대화의 좌절을 강조한다.',
          '일본: 메이지 유신의 성공을 강조한다.',
          '중국: 백 년의 치욕과 민족 부흥 서사를 강조한다.'
        ],
        feature: [
          '같은 시대를 한국은 비극, 일본은 성공, 중국은 굴욕으로 기억한다.',
          '근대화 서술은 각국의 현재 역사 인식과 깊게 연결된다.'
        ]
      },
      'zainichi': {
        common: [
          '세 국가 모두 재일조선인이 일본 제국주의 시기와 전후 일본 사회의 변화 속에서 형성된 집단이라는 점은 인정한다.',
          '국적, 정체성, 차별 문제가 재일조선인 서술의 핵심 쟁점이라는 점도 공통적으로 나타난다.'
        ],
        diff: [
          '한국: 식민지 지배와 강제 동원의 결과로 보며 피해와 권리 회복을 강조한다.',
          '일본: 전후 일본 사회의 외국인 주민 문제로 보며 제도와 통합을 강조한다.',
          '중국: 일본 제국주의가 남긴 동아시아 문제로 보며 역사 책임을 강조한다.'
        ],
        feature: [
          '한국 서술은 식민지 지배와 차별이라는 역사적 책임의 언어를 사용한다.',
          '일본 서술은 특별영주자·지역사회처럼 행정적 표현을 선호한다.',
          '중국 서술은 재일조선인을 동아시아 반제국주의 역사 인식의 사례로 연결한다.'
        ]
      },
      'hiroshima': {
        common: [
          '세 국가 모두 히로시마 원폭이 대규모 민간인 피해를 낳은 사건이라는 점은 인정한다.',
          '조선인 피해자의 존재는 전쟁 피해와 식민지 동원을 함께 보게 만드는 중요한 지점이다.'
        ],
        diff: [
          '한국: 조선인 피해자를 강제 동원과 식민지 지배의 맥락에서 설명한다.',
          '일본: 핵무기의 참혹성과 평화의 중요성을 중심으로 설명한다.',
          '중국: 일본 군국주의와 전쟁 책임의 결과로 해석한다.'
        ],
        feature: [
          '한국 서술은 해방과 피해가 동시에 존재한 복합적 기억을 강조한다.',
          '일본 서술은 반핵·평화 담론이 강하지만 식민지 피해자의 위치는 약해질 수 있다.',
          '중국 서술은 원폭 피해를 일본의 전쟁 책임과 분리하지 않고 해석한다.'
        ]
      }
    };

    const data = analysisMap[currentEventId];

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

function renderMultilingualSection() {
  const result = runMultilingualAnalysis();

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

  const langOrder = ['ko', 'ja', 'en'];
  const statRows = langOrder.map(lang => {
    const s = result.stats[lang];
    const badge = getLangBadge(lang);

    if (!s) return `<li>${badge.flag} ${badge.label} — 입력 없음</li>`;

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

function renderKeywordChart(event) {
  const chart = document.getElementById('keywordsChart');
  if (!chart) return;

  chart.innerHTML = Object.entries(event.keywordFreq).map(([keyword, freqs]) => `
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
  `).join('');

  setTimeout(() => {
    chart.querySelectorAll('.keyword-bar__fill').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
    });
  }, 100);
}

function submitSharedNarrative() {
  const name = document.getElementById('userName').value.trim();
  const text = document.getElementById('userNarrative').value.trim();
  const reason = document.getElementById('userReason').value.trim();

  if (!name || !text) {
    alert('닉네임과 공동 표현은 필수 입력 항목입니다.');
    return;
  }

  const detectedLang = detectLanguage(text);

  sharedNarratives.unshift({
    user: name,
    text: text,
    reason: reason,
    date: new Date().toLocaleDateString('ko-KR'),
    eventId: currentEventId,
    lang: detectedLang,
    translationOpen: false
  });

  document.getElementById('userName').value = '';
  document.getElementById('userNarrative').value = '';
  document.getElementById('userReason').value = '';

  renderSharedList();
}

function renderSharedList() {
  const list = document.getElementById('sharedList');
  if (!list) return;

  const items = sharedNarratives
    .map((item, idx) => ({ item, idx }))
    .filter(pair => pair.item.eventId === currentEventId);

  if (items.length === 0) {
    list.innerHTML = `<div class="shared-empty">아직 등록된 제안이 없습니다. 첫 번째 제안을 작성해 보세요!</div>`;
    return;
  }

  list.innerHTML = items.map(({ item, idx }) => {
    const badge = getLangBadge(item.lang || 'unknown');

    let translationHtml = '';
    if (item.translationOpen) {
      const trans = buildTranslation(item);
      if (trans) {
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

    const toggleText = item.translationOpen ? '번역 닫기' : '번역 보기';

    return `
      <div class="shared-item">
        <div class="shared-item__header">
          <div class="shared-item__user">
            ${escapeHtml(item.user)}
            <span class="narrative-card__keyword" style="font-size: 0.72rem;">
              ${badge.flag} ${badge.label}
            </span>
          </div>
          <div class="shared-item__date">${item.date}</div>
        </div>

        <div class="shared-item__text">"${escapeHtml(item.text)}"</div>

        ${item.reason ? `
          <div class="shared-item__reason">
            <strong>작성 이유:</strong> ${escapeHtml(item.reason)}
          </div>
        ` : ''}

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

  list.querySelectorAll('[data-translate-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleTranslation(parseInt(btn.dataset.translateIndex, 10));
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function detectLanguage(text) {
  if (!text || !text.trim()) return 'unknown';

  const hangulRegex = /[가-힣]/;
  const kanaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  const latinRegex = /[A-Za-z]/;

  if (hangulRegex.test(text)) return 'ko';
  if (kanaRegex.test(text)) return 'ja';
  if (latinRegex.test(text)) return 'en';

  return 'unknown';
}

function getLangBadge(code) {
  const map = {
    'ko': { flag: '🇰🇷', label: '한국어' },
    'ja': { flag: '🇯🇵', label: '日本語' },
    'en': { flag: '🇺🇸', label: 'English' },
    'unknown': { flag: '🌐', label: '미식별' }
  };
  return map[code] || map['unknown'];
}

const translationSamples = {
  'imjin': {
    ko: {
      ja: '1592年から始まった日本軍の朝鮮半島侵攻と、それに対する朝鮮・明連合軍の7年間の戦争。',
      en: 'A seven-year war beginning in 1592, marked by the Japanese invasion of the Korean peninsula and the resistance of the Joseon-Ming allied forces.'
    },
    ja: {
      ko: '1592년에 시작된 일본군의 조선 침공과 조선·명 연합군의 저항으로 이어진 7년간의 전쟁이다.',
      en: 'A seven-year war beginning in 1592, involving Japanese military campaigns and resistance by Joseon and Ming forces.'
    },
    en: {
      ko: '1592년부터 1598년까지 동북아 삼국이 모두 관여한 국제 전쟁으로, 막대한 피해를 남겼다.',
      ja: '1592年から1598年まで東アジア三国が関与した国際戦争で、莫大な被害を残した。'
    }
  },
  'culture': {
    ko: {
      ja: '韓・中・日三国は文字・宗教・技術を相互に交流させ、東アジア共通の文化的基盤を形成した。',
      en: 'Korea, China, and Japan exchanged scripts, religions, and technologies, forming a shared East Asian cultural foundation.'
    },
    ja: {
      ko: '동아시아 삼국은 한자·불교·유교 등을 상호 변용하며 각자의 독자적 문화를 발전시켰다.',
      en: 'The three East Asian nations adapted Chinese characters, Buddhism, and Confucianism in their own ways.'
    },
    en: {
      ko: '동북아 문화 교류는 단방향이 아닌 다방향의 흐름이었으며, 세 국가 모두 발신자이자 수용자였다.',
      ja: '東アジアの文化交流は一方向ではなく多方向の流れであり、三国すべてが発信者であり受容者でもあった。'
    }
  },
  'tribute': {
    ko: {
      ja: '東アジアの朝貢体制は、儀礼・文化・経済が結びついた複合的な国際秩序であった。',
      en: 'The East Asian tributary system was a complex international order combining ritual, culture, and trade.'
    },
    ja: {
      ko: '동아시아 조공 체제는 의례·문화·경제가 결합된 복합적 국제 질서였다.',
      en: 'The East Asian tributary system was a multi-layered international order encompassing ritual, culture, and commerce.'
    },
    en: {
      ko: '조공 관계는 19세기 서구 충격으로 붕괴되기 전까지 동아시아 국제 질서의 기본 틀이었다.',
      ja: '朝貢関係は19世紀の西欧の衝撃で崩壊するまで、東アジア国際秩序の基本枠組みであった。'
    }
  },
  'modern': {
    ko: {
      ja: '19世紀後半、東アジア三国はそれぞれ異なる経路で近代化を試み、その結果も大きく分岐した。',
      en: 'In the late 19th century, the three East Asian nations pursued modernization along divergent paths.'
    },
    ja: {
      ko: '19세기 후반 동아시아 삼국은 각기 다른 경로로 근대화를 시도했고, 그 결과 또한 크게 갈렸다.',
      en: 'Each of the three East Asian states attempted modernization through different paths in the late 19th century.'
    },
    en: {
      ko: '근대화 과정은 한국에게는 좌절, 일본에게는 성공, 중국에게는 치욕으로 각기 다르게 기억된다.',
      ja: '近代化の過程は、韓国には挫折、日本には成功、中国には屈辱として記憶されている。'
    }
  },
  'zainichi': {
    ko: {
      ja: '在日朝鮮人は、植民地支配と戦後日本社会の変化の中で形成された朝鮮半島出身者とその子孫の共同体である。',
      en: 'Zainichi Koreans are a community of people from the Korean peninsula and their descendants, shaped by colonial rule and postwar Japanese society.'
    },
    ja: {
      ko: '재일조선인은 식민지 지배와 전후 일본 사회의 변화 속에서 형성된 한반도 출신 주민과 그 후손의 공동체이다.',
      en: 'Zainichi Koreans are a community formed through colonial migration, wartime mobilization, and postwar residence in Japan.'
    },
    en: {
      ko: '재일조선인 문제는 식민지 지배, 전후 국적 문제, 차별, 정체성이 겹쳐 있는 역사적 쟁점이다.',
      ja: '在日朝鮮人問題は、植民地支配、戦後の国籍問題、差別、アイデンティティが重なる歴史的課題である。'
    }
  },
  'hiroshima': {
    ko: {
      ja: '広島原爆の被害には、植民地支配や戦時動員によって日本にいた朝鮮人被害者も含まれていた。',
      en: 'The victims of the Hiroshima atomic bombing included Koreans who were in Japan due to colonial rule, migration, or wartime mobilization.'
    },
    ja: {
      ko: '히로시마 원폭 피해에는 식민지 지배와 전쟁 동원으로 일본에 있던 조선인 피해자도 포함되어 있었다.',
      en: 'The Hiroshima atomic bombing caused massive civilian suffering, including among Korean victims who had been brought to or lived in Japan.'
    },
    en: {
      ko: '히로시마 원폭은 핵무기의 비극이면서 동시에 조선인 피해자의 존재를 통해 식민지 동원의 문제를 드러낸다.',
      ja: '広島原爆は核兵器の悲劇であると同時に、朝鮮人被害者の存在を通じて植民地動員の問題を示している。'
    }
  }
};

function toggleTranslation(index) {
  const item = sharedNarratives[index];
  if (!item) return;

  item.translationOpen = !item.translationOpen;
  renderSharedList();
}

function buildTranslation(item) {
  const samples = translationSamples[item.eventId];
  if (!samples) return null;

  const src = item.lang;
  const srcKey = (src === 'ko' || src === 'ja' || src === 'en') ? src : 'ko';
  const map = samples[srcKey];
  if (!map) return null;

  const result = {};
  Object.keys(map).forEach(targetLang => {
    result[targetLang] = map[targetLang];
  });
  return result;
}

const emotionLex = {
  negative: {
    ko: ['침략', '치욕', '굴종', '비극', '좌절', '불법', '강제', '왜곡', '차별'],
    ja: ['侵略', '屈辱', '挫折', '不法', '強制', '悲劇', '差別'],
    en: ['invasion', 'humiliation', 'illegal', 'forced', 'tragedy', 'aggression', 'discrimination']
  },
  neutral: {
    ko: ['전쟁', '출병', '진출', '교류', '관계', '제도', '시기', '이주', '원폭'],
    ja: ['戦争', '出兵', '進出', '交流', '関係', '制度', '移住', '原爆'],
    en: ['war', 'campaign', 'exchange', 'relation', 'system', 'period', 'migration', 'atomic']
  },
  positive: {
    ko: ['공동', '평화', '협력', '화해', '대화', '이해', '공존', '상호'],
    ja: ['共同', '平和', '協力', '和解', '対話', '理解'],
    en: ['shared', 'peace', 'cooperation', 'reconciliation', 'dialogue', 'mutual']
  }
};

function analyzeEmotion(text, lang) {
  const counts = { negative: 0, neutral: 0, positive: 0 };
  if (lang === 'unknown') return counts;

  ['negative', 'neutral', 'positive'].forEach(category => {
    const words = emotionLex[category][lang] || [];
    words.forEach(word => {
      let count;
      if (lang === 'en') {
        const re = new RegExp('\\b' + word + '\\b', 'gi');
        count = (text.match(re) || []).length;
      } else {
        count = text.split(word).length - 1;
      }
      counts[category] += count;
    });
  });

  return counts;
}

function runMultilingualAnalysis() {
  const items = sharedNarratives.filter(s => s.eventId === currentEventId);

  if (items.length === 0) {
    return {
      empty: true,
      message: '아직 등록된 공동 표현 제안이 없습니다. "공동 표현 작성" 탭에서 먼저 한·일·영 어떤 언어로든 표현을 등록해 주세요.'
    };
  }

  const byLang = { ko: [], ja: [], en: [], unknown: [] };

  items.forEach(it => {
    const arr = byLang[it.lang] || byLang.unknown;
    arr.push(it);
  });

  const stats = {};

  ['ko', 'ja', 'en'].forEach(lang => {
    const arr = byLang[lang];

    if (arr.length === 0) {
      stats[lang] = null;
      return;
    }

    const avgLen = Math.round(
      arr.reduce((sum, x) => sum + x.text.length, 0) / arr.length
    );

    const emotion = { negative: 0, neutral: 0, positive: 0 };

    arr.forEach(x => {
      const e = analyzeEmotion(x.text, lang);
      emotion.negative += e.negative;
      emotion.neutral += e.neutral;
      emotion.positive += e.positive;
    });

    stats[lang] = { count: arr.length, avgLen, emotion };
  });

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

document.addEventListener('DOMContentLoaded', () => {
  renderEventCards();

  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  document.getElementById('aiAnalyzeBtn')?.addEventListener('click', runAIAnalysis);
  document.getElementById('submitNarrative')?.addEventListener('click', submitSharedNarrative);

  console.log('🎌 Shared Memory Project 로드 완료');
  console.log(`📚 등록된 사건: ${eventsData.length}개`);
});