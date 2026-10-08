/* ============================================================
   Shared Memory Project — concept-lexicon.js
   다국어 개념 사전 (사람이 작성·검토하는 데이터)
   ============================================================
   · 같은 뜻을 가진 한국어·중국어·일본어·영어 표현을 하나의 "개념"으로 묶습니다.
     예) 침략 · 침공 · 侵略 · 入侵 · invasion → concept "invasion"
     forms의 언어 순서는 ko → zh → ja → en 입니다.
   · 쓰임새
       1) 공동 표현 분석: 표현이 달라도 같은 개념을 쓰면 가깝게 계산 (언어 간 비교 포함)
       2) 서술 강조점 비교: 국가별 서술이 어떤 개념을 얼마나 언급하는지
       3) 표현 프레이밍 분석: 갈등·책임 / 사실·기술 / 화해·협력 프레임
       4) 공동 표현 작성 가이드의 후보 개념
   · 이 사전은 기계학습 모델이 아니라 사람이 만든 목록입니다.
     목록에 없는 동의어는 인식하지 못하며, 문맥(부정문 등)은 고려하지 않습니다.

   표기 규칙 (forms)
     · 한국어·중국어·일본어: 부분 문자열로 찾습니다. (예: '침략' → '침략적', '침략으로'도 일치)
     · 중국어(zh): 현대 표준 중국어 간체를 기본으로, 역사·동아시아 맥락에서 실제로 쓰이는 번체를 함께 적습니다.
             확신할 수 있는 핵심 역사 표현만 보수적으로 넣었습니다. 중국어와 일본어는 한자 표기가 같은 경우가
             많으며(侵略·和解 등), 같은 개념에 묶여 있으므로 어느 쪽으로 일치해도 같은 개념으로 셉니다.
             '在日'은 중국어 '在日本(일본에서)'과 겹치므로 '在日朝鮮'처럼 재일 맥락이 분명한 표현만 씁니다.
             단, 差別(중국어: 차이)·独自(중국어: 혼자)처럼 같은 한자가 언어마다 뜻이 다른 경우는 구분하지 못합니다.
     · 영어: 단어 시작 기준 접두어로 찾습니다. (예: 'invad' → invade, invaded, invading)
             단, 4글자 이하 표현은 온전한 단어(+s/es/ed/ing)로만 찾습니다. (예: 'war' ≠ 'warm')
     · 앞에 '='를 붙이면 공백·문장부호로 구분된 온전한 어절과만 일치합니다. (예: '=명')
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SharedMemoryConcepts = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 표현 프레임 — 역사적 가치판단이 아니라 어휘가 어떤 결의 언어인지 나타내는 보조 분류 */
  const FRAMES = [
    { id: 'conflict', label: '갈등·책임 프레임', short: '갈등·책임', desc: '침략·강제·차별·책임·피해처럼 갈등과 책임을 드러내는 어휘' },
    { id: 'fact', label: '사실·기술 프레임', short: '사실·기술', desc: '전쟁·제도·이동·관계·시기처럼 사건의 과정과 구조를 기술하는 어휘' },
    { id: 'cooperation', label: '화해·협력 프레임', short: '화해·협력', desc: '공동·평화·협력·대화·공존·상호 이해처럼 관계 회복을 지향하는 어휘' }
  ];

  const CONCEPTS = [
    {
      id: 'invasion', label: '침략', frame: 'conflict',
      forms: {
        ko: ['침략', '침공', '침입', '왜란'],
        zh: ['侵略', '入侵', '侵犯', '侵占', '侵佔', '倭乱', '倭亂'],
        ja: ['侵略', '侵攻', '侵入'],
        en: ['invasion', 'invad', 'aggression', 'aggressor']
      }
    },
    {
      id: 'dispatch', label: '출병·진출', frame: 'fact',
      forms: {
        ko: ['출병', '진출', '파병', '원정', '정복'],
        zh: ['出兵', '派兵', '远征', '遠征', '征服', '进军', '進軍'],
        ja: ['出兵', '進出', '派兵', '遠征', '征服'],
        en: ['expedition', 'dispatch', 'deploy', 'conquest', 'conquer']
      }
    },
    {
      id: 'war', label: '전쟁', frame: 'fact',
      forms: {
        ko: ['전쟁', '전란', '전투', '해전', '전쟁터'],
        zh: ['战争', '戰爭', '战役', '戰役', '战乱', '戰亂', '战斗', '戰鬥', '海战', '海戰'],
        ja: ['戦争', '戦役', '戦い', '戦乱', '合戦'],
        en: ['war', 'battle', 'warfare']
      }
    },
    {
      id: 'international', label: '국제·동아시아', frame: 'fact',
      forms: {
        ko: ['국제', '동아시아', '동북아', '삼국', '세 나라', '세 국가', '여러 나라', '여러 국가', '한중일', '한·중·일', '조선·명·일본'],
        zh: ['国际', '國際', '东亚', '東亞', '东北亚', '東北亞', '中日韩', '中日韓', '中韩日', '三国'],
        ja: ['国際', '東アジア', '東北アジア', '三国', '日中韓', '日韓中', '韓日中'],
        en: ['international', 'east asia', 'northeast asia', 'three countries', 'three nations', 'regional']
      }
    },
    {
      id: 'resistance', label: '저항·항쟁', frame: 'conflict',
      forms: {
        ko: ['저항', '항쟁', '항전', '의병', '격퇴', '독립운동'],
        zh: ['抵抗', '反抗', '抗争', '抗爭', '抗战', '抗戰', '抗日', '义兵', '義兵', '击退', '擊退'],
        ja: ['抵抗', '義兵', '抗戦', '撃退'],
        en: ['resist', 'uprising', 'righteous army', 'repel']
      }
    },
    {
      id: 'aid', label: '구원·지원', frame: 'fact',
      forms: {
        ko: ['구원', '원군', '원병', '지원', '원조', '도움', '도와', '연합군'],
        zh: ['援军', '援軍', '救援', '支援', '援助', '援朝', '联军', '聯軍'],
        ja: ['援軍', '救援', '支援', '援助', '連合軍'],
        en: ['relief', 'reinforcement', 'aid', 'assist', 'allied', 'alliance']
      }
    },
    {
      id: 'damage', label: '피해·희생', frame: 'conflict',
      forms: {
        ko: ['피해', '희생', '황폐', '참상', '고통', '상처', '사상자', '비극', '참혹'],
        zh: ['受害', '损害', '損害', '牺牲', '犧牲', '惨案', '慘案', '悲剧', '悲劇', '苦难', '苦難', '伤亡', '傷亡'],
        ja: ['被害', '犠牲', '惨禍', '悲劇', '苦しみ', '惨状', '被爆'],
        en: ['damage', 'suffer', 'victim', 'casualt', 'tragedy', 'tragic', 'devastat']
      }
    },
    {
      id: 'civilians', label: '민간·백성', frame: 'fact',
      forms: {
        ko: ['민간', '백성', '민중', '주민', '시민', '사람들'],
        zh: ['平民', '百姓', '民众', '民眾', '居民', '市民', '民间', '民間'],
        ja: ['民間', '民衆', '住民', '市民', '人々'],
        en: ['civilian', 'people', 'resident', 'citizen', 'ordinary']
      }
    },
    {
      id: 'responsibility', label: '책임', frame: 'conflict',
      forms: {
        ko: ['책임', '반성', '사죄', '가해', '청산'],
        zh: ['责任', '責任', '反省', '道歉', '谢罪', '謝罪', '加害'],
        ja: ['責任', '反省', '謝罪', '加害'],
        en: ['responsib', 'accountab', 'apolog', 'perpetrat']
      }
    },
    {
      id: 'coercion', label: '강제·동원', frame: 'conflict',
      forms: {
        ko: ['강제', '동원', '징용', '강압'],
        zh: ['强制', '強制', '强征', '強徵', '动员', '動員', '征用', '徵用', '强迫', '強迫'],
        ja: ['強制', '動員', '徴用'],
        en: ['forced', 'coerc', 'mobiliz', 'conscript']
      }
    },
    {
      id: 'discrimination', label: '차별', frame: 'conflict',
      forms: {
        ko: ['차별', '배제', '혐오', '편견'],
        zh: ['歧视', '歧視', '排斥', '偏见', '偏見'],
        ja: ['差別', '排除', '偏見'],
        en: ['discriminat', 'exclusion', 'prejudice']
      }
    },
    {
      id: 'colonial', label: '식민지·제국주의', frame: 'conflict',
      forms: {
        ko: ['식민', '제국주의', '병합', '강점', '군국주의', '일제'],
        zh: ['殖民', '帝国主义', '帝國主義', '吞并', '吞併', '军国主义', '軍國主義', '占领', '佔領'],
        ja: ['植民', '帝国主義', '併合', '軍国主義'],
        en: ['coloni', 'imperialis', 'annex', 'militaris']
      }
    },
    {
      id: 'humiliation', label: '좌절·치욕', frame: 'conflict',
      forms: {
        ko: ['치욕', '좌절', '굴욕', '굴종', '상실', '수탈'],
        zh: ['屈辱', '耻辱', '恥辱', '挫折', '掠夺', '掠奪', '国耻', '國恥'],
        ja: ['屈辱', '挫折', '屈従', '喪失', '収奪'],
        en: ['humiliat', 'frustrat', 'exploit']
      }
    },
    {
      id: 'culture', label: '문화·기술', frame: 'fact',
      forms: {
        ko: ['문화', '도자기', '인쇄', '한자', '불교', '유교', '기술', '학문', '문물'],
        zh: ['文化', '陶瓷', '瓷器', '印刷', '汉字', '漢字', '佛教', '儒教', '儒家', '技术', '技術', '学问', '學問'],
        ja: ['文化', '陶磁', '印刷', '漢字', '仏教', '儒教', '技術', '学問'],
        en: ['cultur', 'ceramic', 'pottery', 'printing', 'buddhis', 'confucian', 'technolog', 'learning']
      }
    },
    {
      id: 'exchange', label: '교류·전파', frame: 'fact',
      forms: {
        ko: ['교류', '전파', '전수', '수용', '변용', '전래', '주고받'],
        zh: ['交流', '传播', '傳播', '传入', '傳入'],
        ja: ['交流', '伝来', '伝播', '受容', '変容', '伝え'],
        en: ['exchang', 'transmi', 'spread', 'adopt', 'adapt']
      }
    },
    {
      id: 'order', label: '질서·제도·외교', frame: 'fact',
      forms: {
        ko: ['질서', '제도', '체제', '조공', '책봉', '외교', '사대'],
        zh: ['秩序', '制度', '体制', '體制', '朝贡', '朝貢', '册封', '冊封', '外交', '宗藩'],
        ja: ['秩序', '制度', '体制', '朝貢', '冊封', '外交'],
        en: ['world order', 'regional order', 'tribut', 'diplomac', 'investiture']
      }
    },
    {
      id: 'autonomy', label: '자주·독자성', frame: 'fact',
      forms: {
        ko: ['자주', '독자', '주체', '자강', '독립'],
        zh: ['自主', '独立', '獨立', '自强', '自強'],
        ja: ['自主', '独自', '主体', '自強', '独立'],
        en: ['autonom', 'independen', 'sovereign', 'self-strengthen']
      }
    },
    {
      id: 'modernization', label: '근대화·개혁', frame: 'fact',
      forms: {
        ko: ['근대', '개혁', '유신', '산업화', '개화', '개항'],
        zh: ['近代', '现代化', '現代化', '改革', '维新', '維新', '洋务', '洋務', '变法', '變法', '工业化', '工業化'],
        ja: ['近代', '改革', '維新', '産業化', '開化', '開港'],
        en: ['modern', 'reform', 'restoration', 'industrializ']
      }
    },
    {
      id: 'development', label: '성공·발전', frame: 'fact',
      forms: {
        ko: ['성공', '발전', '부국강병', '번영', '열강'],
        zh: ['成功', '发展', '發展', '富国强兵', '富國強兵', '繁荣', '繁榮', '列强', '列強'],
        ja: ['成功', '発展', '富国強兵', '繁栄', '列強'],
        en: ['success', 'develop', 'prosper', 'great power']
      }
    },
    {
      id: 'migration', label: '이주·정착', frame: 'fact',
      forms: {
        ko: ['이주', '거주', '정착', '후손', '재일', '국적', '영주'],
        zh: ['移民', '移居', '定居', '后裔', '後裔', '子孙', '子孫', '在日朝鲜', '在日朝鮮', '在日韩国', '在日韓國', '国籍', '國籍'],
        ja: ['移住', '居住', '定住', '子孫', '在日朝鮮', '在日韓国', '在日コリアン', '在日外国', '国籍', '永住'],
        en: ['migra', 'settle', 'descendant', 'nationality', 'zainichi']
      }
    },
    {
      id: 'identity', label: '정체성·권리', frame: 'fact',
      forms: {
        ko: ['정체성', '권리', '인권', '지위'],
        zh: ['认同', '認同', '权利', '權利', '人权', '人權', '地位'],
        ja: ['アイデンティティ', '権利', '人権', '地位'],
        en: ['identity', 'rights', 'status']
      }
    },
    {
      id: 'nuclear', label: '원폭·핵무기', frame: 'fact',
      forms: {
        ko: ['원폭', '원자폭탄', '핵무기', '피폭', '방사능'],
        zh: ['原子弹', '原子彈', '原爆', '核武器', '核爆', '辐射', '輻射'],
        ja: ['原爆', '原子爆弾', '核兵器', '放射能'],
        en: ['atomic', 'nuclear', 'a-bomb', 'hibakusha', 'radiation']
      }
    },
    {
      id: 'peace', label: '평화·공존', frame: 'cooperation',
      forms: {
        ko: ['평화', '공존', '화해', '반전', '비핵'],
        zh: ['和平', '共存', '和解', '反战', '反戰'],
        ja: ['平和', '共存', '和解', '反戦'],
        en: ['peace', 'coexist', 'reconcil', 'anti-war']
      }
    },
    {
      id: 'dialogue', label: '대화·상호 이해', frame: 'cooperation',
      forms: {
        ko: ['대화', '상호', '서로 이해', '이해하', '소통', '존중', '공감'],
        zh: ['对话', '對話', '相互', '互相', '理解', '尊重', '共鸣', '共鳴', '沟通', '溝通'],
        ja: ['対話', '相互', '理解', '尊重', '共感'],
        en: ['dialogue', 'mutual', 'understanding', 'respect', 'empath']
      }
    },
    {
      id: 'shared', label: '공동·함께', frame: 'cooperation',
      forms: {
        ko: ['공동', '함께', '공유', '공통', '연대', '협력'],
        zh: ['共同', '共享', '共有', '团结', '團結', '合作', '携手', '攜手', '一起'],
        ja: ['共同', '共有', '共通', '連帯', '協力', '共に', '一緒'],
        en: ['shared', 'common', 'together', 'solidarity', 'cooperat', 'joint']
      }
    },
    {
      id: 'memory', label: '기억·추모', frame: 'cooperation',
      forms: {
        ko: ['기억', '추모', '기록', '교훈', '미래'],
        zh: ['记忆', '記憶', '纪念', '紀念', '悼念', '追悼', '记录', '記錄', '教训', '教訓', '未来'],
        ja: ['記憶', '追悼', '記録', '教訓', '未来'],
        en: ['memor', 'remember', 'commemorat', 'lesson', 'future']
      }
    }
  ];

  return { FRAMES, CONCEPTS };
});
