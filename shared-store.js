/* ============================================================
   Shared Memory Project — shared-store.js
   Supabase 읽기·쓰기 (공동 표현 / 공감)
   ============================================================
   · supabase-config.js가 만든 공개 클라이언트(db)만 사용합니다. 비밀 키는 쓰지 않습니다.
   · 확장 컬럼(expression_style 등)이나 공감 테이블이 아직 없어도 기존 기능이 그대로 동작하도록
     "없으면 기존 방식으로 저장" 하는 하위 호환 처리를 합니다. (README의 SQL 참고)
   ============================================================ */

(function (root) {
  'use strict';

  const TABLE = 'shared_expressions';
  const EMPATHY_TABLE = 'expression_empathy';
  const EMPATHY_RPC = 'empathy_counts';
  const PARTICIPANT_TABLE = 'expression_participants';
  const SUMMARY_RPC = 'participation_summary';
  const AGE_RPC = 'age_group_participants';
  const LIST_RPC = 'public_expressions';
  const CHOICE_TABLE = 'exploration_choices';   // 기본 체험 객관식 응답 (공동 표현과 별도 테이블)
  const CHOICE_RPC = 'choice_counts';
  const CHOICE_ID_RE = /^[a-z0-9_]{1,40}$/;
  // 공개 조회 컬럼 (age_group 제외). 2단계 SQL 이후에는 테이블에서 age_group 을 직접 읽을 수 없습니다.
  const PUBLIC_COLUMNS = 'id,event_key,author_name,country_code,content,reason,created_at,expression_style,' +
    'selected_concepts,reason_tags,before_content,prior_learning,viewed_compare,viewed_nlp,viewed_sources,completed_flow';
  const AGE_GROUP_IDS = ['10s', '20s', '30s', '40s', '50s', '60plus', 'no_answer'];
  const PRIOR_IDS = ['yes', 'no', 'unsure', 'no_answer'];
  const LOAD_LIMIT = 500;
  const LIMITS = { name: 40, content: 1000, reason: 1000, before: 500 };

  /* ---------- 공개 게시물 관리 (DB를 바꾸지 않는 최소 방침, README 참고) ----------
     · HIDDEN_EXPRESSION_IDS: 부적절하다고 판단한 제안의 id를 적으면 목록·지도·아카이브 어디에도 표시하지 않습니다.
       DB의 행은 그대로 두며, 영구 삭제는 운영자 승인 후 Supabase 대시보드에서 합니다.
     · ARCHIVE_SINCE: Shared Archive에는 공개 등록에 별도 동의를 받기 시작한 배포(2026-10-16) 이후의 제안만 모읍니다.
       그 전 시범 운영 제안은 아카이브에 넣지 않습니다. */
  const HIDDEN_EXPRESSION_IDS = [
    11, 14   // 2026-10-08 시범 운영: 빈칸 검사 도입 전 문장 틀 밑줄(_, ____)이 남은 제안 (운영 책임자 확인 2026-10-22, DB 행 유지)
  ];
  const ARCHIVE_SINCE = '2026-10-16T13:00:00Z';

  function isHidden(id) {
    return HIDDEN_EXPRESSION_IDS.some(h => String(h) === String(id));
  }

  /** Shared Archive에 보여 줄 수 있는 제안인가 (동의 분리 이후 등록 · 숨김 아님) */
  function isArchivable(item) {
    if (!item || isHidden(item.id)) return false;
    const t = Date.parse(item.createdAt || '');
    return !isNaN(t) && t >= Date.parse(ARCHIVE_SINCE);
  }

  function client() {
    try {
      // supabase-config.js의 최상위 const db (전역 스코프)
      return typeof db !== 'undefined' && db ? db : null;   // eslint-disable-line no-undef
    } catch (e) {
      return null;
    }
  }

  function isMissingSchemaError(error) {
    if (!error) return false;
    const msg = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '');
    return error.code === 'PGRST204' || error.code === 'PGRST202' || error.code === 'PGRST205' ||
      error.code === '42703' || error.code === '42P01' || error.code === '42883' ||
      /column .* (does not exist|not find)|could not find the .* (column|function|table)|schema cache/i.test(msg);
  }

  /** supabase-config.js의 제한 시간 초과(TimeoutError) 또는 중단된 요청 */
  function isTimeoutError(error) {
    if (!error) return false;
    const msg = String(error.name || '') + ' ' + String(error.message || error);
    return /timeout|timed out|abort/i.test(msg);
  }

  function friendlyError(error) {
    if (!error) return '';
    const msg = String(error.message || error);
    if (isTimeoutError(error)) return '서버 응답이 늦어 요청을 멈췄습니다. 잠시 후 다시 시도해 주세요.';
    // 서버 등록 빈도 제한 (supabase/2026-10-server-moderation.sql 의 sm_insert_guard)
    if (/sm_duplicate/.test(msg)) return '같은 제안이 방금 등록되었습니다. 아래 목록에서 확인해 주세요.';
    if (/sm_rate_limited/.test(msg)) return '지금 등록이 몰려 잠시 멈췄습니다. 1분쯤 뒤에 다시 등록해 주세요.';
    if (/fetch|network|failed to fetch|load failed/i.test(msg)) return '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
    if (/row-level security|permission|not allowed|violates/i.test(msg)) return '저장 권한이 없거나 입력값이 허용 범위를 벗어났습니다.';
    return msg;
  }

  /* ---------- 공동 표현 ---------- */

  /**
   * 작성 언어 코드. shared_expressions.country_code 컬럼은 이름과 달리 '국가'가 아니라
   * '작성 언어'를 저장합니다(기존 데이터 호환을 위해 컬럼 이름은 바꾸지 않습니다).
   * 지원 언어 외의 값(기존 'unknown', 기본값 'ETC', 빈 값)은 모두 'unknown'으로 다룹니다.
   */
  const LANG_CODES = ['ko', 'zh', 'ja', 'en'];
  function normalizeLang(code) {
    const c = typeof code === 'string' ? code.trim().toLowerCase() : '';
    return LANG_CODES.indexOf(c) >= 0 ? c : 'unknown';
  }

  /**
   * 공동 표현을 저장합니다.
   * DB에 아직 없는 컬럼이 있으면 한 단계씩 줄여서 다시 저장합니다.
   *   ① 참여자 통계 컬럼 포함 → ② 작성 가이드 확장 컬럼까지 → ③ 기존 기본 컬럼만
   * 저장에 성공하면 비공개 테이블에 익명 참여자 키를 연결합니다(실패해도 제안 저장은 유지).
   * → { ok, legacy, level, error }
   */
  async function insertExpression(row) {
    const c = client();
    if (!c) return { ok: false, error: '데이터베이스에 연결할 수 없습니다. (Supabase 라이브러리를 불러오지 못했습니다)' };

    const base = {
      event_key: row.eventKey,
      author_name: String(row.author || '익명').slice(0, LIMITS.name),
      country_code: normalizeLang(row.lang),
      content: String(row.content || '').slice(0, LIMITS.content),
      reason: String(row.reason || '').slice(0, LIMITS.reason)
    };
    const extended = Object.assign({}, base, {
      expression_style: row.style || null,
      selected_concepts: (row.selectedConcepts || []).slice(0, 20),
      reason_tags: (row.reasonTags || []).slice(0, 10),
      before_content: row.before ? String(row.before).slice(0, LIMITS.before) : null
    });
    const m = row.milestones || {};
    const demographic = Object.assign({}, extended, {
      age_group: AGE_GROUP_IDS.indexOf(row.ageGroup) >= 0 ? row.ageGroup : null,
      prior_learning: PRIOR_IDS.indexOf(row.priorLearning) >= 0 ? row.priorLearning : null,
      viewed_compare: !!m.viewedCompare,
      viewed_nlp: !!m.viewedNlp,
      viewed_sources: !!m.viewedSources,
      completed_flow: !!m.completedFlow
    });

    const attempts = [demographic, extended, base];
    try {
      for (let level = 0; level < attempts.length; level++) {
        const res = await c.from(TABLE).insert([attempts[level]]).select('id');
        if (!res.error) {
          const id = res.data && res.data[0] ? res.data[0].id : null;
          if (level === 0 && id != null) await linkParticipant(c, id);
          return { ok: true, legacy: level > 0, level, id };
        }
        if (!isMissingSchemaError(res.error) || level === attempts.length - 1) {
          return { ok: false, error: insertError(res.error), raw: res.error };
        }
      }
    } catch (e) {
      return { ok: false, error: insertError(e), raw: e };
    }
    return { ok: false, error: '저장하지 못했습니다.' };
  }

  /** 등록 실패 안내. 시간 초과는 서버에 이미 저장됐을 수 있으므로 다시 등록하기 전에 목록을 확인하게 합니다. */
  function insertError(error) {
    if (isTimeoutError(error)) {
      return '서버 응답이 늦어 등록 여부를 확인하지 못했습니다. 잠시 후 아래 목록에 내 문장이 없으면 다시 등록해 주세요.';
    }
    return friendlyError(error);
  }

  /** 제안 id ↔ 익명 참여자 키 연결 (비공개 테이블, 조회 불가). 실패는 무시합니다. */
  async function linkParticipant(c, expressionId) {
    try {
      await c.from(PARTICIPANT_TABLE).insert([{ expression_id: expressionId, participant_key: participantKey() }]);
    } catch (e) { /* 참여자 수 집계에서만 빠집니다 */ }
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.filter(v => typeof v === 'string');
    return [];
  }

  /** DB 행 → 화면에서 쓰는 형태 (확장 컬럼이 없으면 빈 값) */
  function mapRow(item) {
    return {
      id: item.id,
      user: item.author_name || '익명',
      text: item.content || '',
      reason: item.reason || '',
      eventId: item.event_key,
      lang: normalizeLang(item.country_code),
      createdAt: item.created_at || null,
      style: typeof item.expression_style === 'string' ? item.expression_style : null,
      selectedConcepts: asArray(item.selected_concepts),
      reasonTags: asArray(item.reason_tags),
      before: typeof item.before_content === 'string' ? item.before_content : '',
      // 참여자 통계 (기존 행에는 없음 → null)
      ageGroup: AGE_GROUP_IDS.indexOf(item.age_group) >= 0 ? item.age_group : null,
      // 서버가 소표본(5명 미만) 보호를 위해 연령대를 가린 행
      ageSuppressed: item.age_group_suppressed === true,
      priorLearning: PRIOR_IDS.indexOf(item.prior_learning) >= 0 ? item.prior_learning : null,
      viewedCompare: typeof item.viewed_compare === 'boolean' ? item.viewed_compare : null,
      viewedNlp: typeof item.viewed_nlp === 'boolean' ? item.viewed_nlp : null,
      viewedSources: typeof item.viewed_sources === 'boolean' ? item.viewed_sources : null,
      completedFlow: typeof item.completed_flow === 'boolean' ? item.completed_flow : null
    };
  }

  /**
   * 한 사건의 공동 표현(최신순, 최대 LOAD_LIMIT개) → { data, error, source }
   * ① public_expressions() RPC — 5명 미만 연령대의 age_group 을 서버에서 가린 결과 (기본)
   * ② RPC 가 아직 없으면 테이블에서 공개 컬럼만 조회 (age_group 없음)
   * ③ 그래도 안 되면(확장 컬럼이 없는 예전 DB) 기존 방식 select('*')
   */
  async function loadExpressions(eventKey) {
    const c = client();
    if (!c) return { data: [], error: '데이터베이스에 연결할 수 없습니다.' };
    const done = (rows, source) => ({
      data: (rows || []).map(mapRow).filter(r => !isHidden(r.id)), error: null, source,
      limited: (rows || []).length >= LOAD_LIMIT
    });
    try {
      if (typeof c.rpc === 'function') {
        const r = await c.rpc(LIST_RPC, { p_event_key: eventKey, p_limit: LOAD_LIMIT });
        if (!r.error && Array.isArray(r.data)) return done(r.data, 'rpc');
        // 시간 초과면 테이블로 다시 묻지 않습니다(기다리는 시간이 두 배가 되므로).
        if (isTimeoutError(r.error)) return { data: [], error: friendlyError(r.error) };
      }
      const table = cols => c.from(TABLE).select(cols)
        .eq('event_key', eventKey)
        .order('created_at', { ascending: false })
        .limit(LOAD_LIMIT);
      let res = await table(PUBLIC_COLUMNS);
      if (res.error && isMissingSchemaError(res.error)) res = await table('*');
      if (res.error) return { data: [], error: friendlyError(res.error) };
      return done(res.data, 'table');
    } catch (e) {
      return { data: [], error: friendlyError(e) };
    }
  }

  /* ---------- 공감 ---------- */

  /* ---------- 브라우저 저장소 (참여자별 임시 상태) ----------
     · Shared Memory가 쓰는 키는 모두 STORAGE_PREFIX('sm_')로 시작합니다.
       (GitHub Pages는 같은 계정의 다른 사이트와 저장소를 공유하므로, 초기화는 이 접두어 키만 지웁니다)
     · localStorage를 쓸 수 없으면(사생활 보호 모드·차단 등) 이 페이지가 열려 있는 동안만 메모리에 보관합니다. */

  const STORAGE_PREFIX = 'sm_';
  const memoryStore = {};

  function localStore() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  function storageGet(key) {
    let value = null;
    try { const ls = localStore(); value = ls ? ls.getItem(key) : null; } catch (e) { value = null; }
    if (value != null) return value;
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }
  function storageSet(key, value) {
    const str = String(value);
    try {
      const ls = localStore();
      if (!ls) throw new Error('no localStorage');
      ls.setItem(key, str);
      delete memoryStore[key];
    } catch (e) {
      memoryStore[key] = str;     // 저장소 사용 불가: 이 페이지에서만 유지
    }
  }
  function storageRemove(key) {
    delete memoryStore[key];
    try { const ls = localStore(); if (ls) ls.removeItem(key); } catch (e) { /* 무시 */ }
  }

  /** 이 기기(브라우저)에 남아 있는 Shared Memory 참여자 상태 키 목록 */
  function participantStorageKeys() {
    const keys = Object.keys(memoryStore).filter(k => k.indexOf(STORAGE_PREFIX) === 0);
    try {
      const ls = localStore();
      if (ls) {
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k && k.indexOf(STORAGE_PREFIX) === 0 && keys.indexOf(k) < 0) keys.push(k);
        }
      }
    } catch (e) { /* 저장소 사용 불가: 메모리 키만 */ }
    return keys;
  }

  function hasParticipantState() {
    return participantStorageKeys().length > 0;
  }

  /**
   * 새 참여자로 시작: 이 기기에 남은 이전 참여자의 상태(연령대·탐구 전 문장·학습 경험·진행 기록·
   * 참여자 키·공감 키·공감 기록)를 지웁니다. 'sm_' 키만 지우며, 다른 사이트의 저장소와
   * 데이터베이스에 이미 등록된 제안은 건드리지 않습니다. → { removed }
   */
  function resetParticipant() {
    const keys = participantStorageKeys();
    keys.forEach(storageRemove);
    return { removed: keys.length };
  }

  function randomKey(prefix) {
    return root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  /** 브라우저 저장소에 보관하는 무작위 키 (개인정보 아님). 저장소를 쓸 수 없으면 이 페이지에서만 유지합니다. */
  function persistentKey(name, prefix) {
    let key = storageGet(name);
    if (!key) {
      key = randomKey(prefix);
      storageSet(name, key);
    }
    return key;
  }

  /** 같은 제안에 두 번 공감하는 것을 막는 키 */
  function voterKey() { return persistentKey('sm_voter_key', 'v'); }

  /** 참여자 수 중복 집계를 막는 키 (공감 키와 별개, 공개 조회되지 않는 테이블에만 저장) */
  function participantKey() { return persistentKey('sm_participant_key', 'p'); }

  function empathizedSet() {
    try { return new Set(JSON.parse(storageGet('sm_empathized') || '[]').map(String)); } catch (e) { return new Set(); }
  }
  function rememberEmpathy(id) {
    const set = empathizedSet();
    set.add(String(id));
    storageSet('sm_empathized', JSON.stringify([...set].slice(-500)));
  }

  /** 사건별 공감 수 → { available, counts: {id: n} } (공감 기능 SQL을 실행하기 전이면 available=false) */
  async function fetchEmpathyCounts(eventKey) {
    const c = client();
    if (!c || typeof c.rpc !== 'function') return { available: false, counts: {} };
    try {
      const res = await c.rpc(EMPATHY_RPC, { p_event_key: eventKey });
      if (res.error) return { available: false, counts: {}, error: res.error };
      const counts = {};
      (res.data || []).forEach(r => { counts[String(r.expression_id)] = Number(r.empathy_count) || 0; });
      return { available: true, counts };
    } catch (e) {
      return { available: false, counts: {} };
    }
  }

  /** 공감 추가 → { ok, duplicate, unavailable, error } */
  async function addEmpathy(expressionId) {
    const c = client();
    if (!c) return { ok: false, error: '데이터베이스에 연결할 수 없습니다.' };
    if (empathizedSet().has(String(expressionId))) return { ok: false, duplicate: true };
    try {
      const res = await c.from(EMPATHY_TABLE).insert([{ expression_id: expressionId, voter_key: voterKey() }]);
      if (!res.error) { rememberEmpathy(expressionId); return { ok: true }; }
      if (res.error.code === '23505') { rememberEmpathy(expressionId); return { ok: false, duplicate: true }; }
      if (isMissingSchemaError(res.error)) return { ok: false, unavailable: true };
      return { ok: false, error: friendlyError(res.error) };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* ---------- 기본 체험 객관식 응답 (동의한 경우에만 · 공동 표현과 별도) ---------- */

  /**
   * 객관식 응답을 저장합니다. 사건·질문·선택지 id만 보내고, 닉네임·문장·참여자 키는 보내지 않습니다.
   * 테이블이 아직 없으면(SQL 실행 전) unavailable=true로 돌려주고, 화면은 그대로 진행합니다.
   * @param {Array<{event_key, question_id, option_id}>} rows
   * @returns {{ok, unavailable?, error?, count?}}
   */
  async function insertChoices(rows) {
    const c = client();
    if (!c) return { ok: false, unavailable: true };
    const clean = (Array.isArray(rows) ? rows : [])
      .filter(r => r && typeof r.event_key === 'string' && CHOICE_ID_RE.test(r.question_id) && CHOICE_ID_RE.test(r.option_id))
      .map(r => ({ event_key: r.event_key, question_id: r.question_id, option_id: r.option_id }))
      .slice(0, 10);
    if (!clean.length) return { ok: true, count: 0 };
    try {
      const res = await c.from(CHOICE_TABLE).insert(clean);
      if (!res.error) return { ok: true, count: clean.length };
      if (isMissingSchemaError(res.error)) return { ok: false, unavailable: true };
      return { ok: false, error: friendlyError(res.error) };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  /** 사건별 객관식 집계 → { available, rows: [{question_id, option_id, n}] } (작은 표본은 서버가 숨김) */
  async function fetchChoiceCounts(eventKey) {
    const c = client();
    if (!c || typeof c.rpc !== 'function') return { available: false, rows: [] };
    try {
      const res = await c.rpc(CHOICE_RPC, { p_event_key: eventKey });
      if (res.error) return { available: false, rows: [] };
      return { available: true, rows: Array.isArray(res.data) ? res.data : [] };
    } catch (e) {
      return { available: false, rows: [] };
    }
  }

  /* ---------- 참여 현황 집계 (RPC만 사용, 원본 키는 받지 않음) ---------- */

  /** 전체 참여자 수 → { available, participants, completedParticipants, expressions } */
  async function fetchParticipationSummary() {
    const c = client();
    if (!c || typeof c.rpc !== 'function') return { available: false };
    try {
      const res = await c.rpc(SUMMARY_RPC);
      if (res.error) return { available: false, error: res.error };
      const r = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!r) return { available: false };
      return {
        available: true,
        participants: Number(r.participants) || 0,
        completedParticipants: Number(r.completed_participants) || 0,
        expressions: Number(r.expressions) || 0
      };
    } catch (e) {
      return { available: false };
    }
  }

  /**
   * 사건별·연령대별 참여자 수 → { available, counts: {ageGroup: n}, suppressed: [ageGroup] }
   * 서버는 5명 미만인 연령대의 수를 null 로 돌려줍니다(소표본 보호). 이 경우 0으로 두고 suppressed 에 기록해
   * 화면에서는 "5명 미만"으로만 표시합니다.
   */
  async function fetchAgeGroupParticipants(eventKey) {
    const c = client();
    if (!c || typeof c.rpc !== 'function') return { available: false, counts: null };
    try {
      const res = await c.rpc(AGE_RPC, { p_event_key: eventKey });
      if (res.error) return { available: false, counts: null };
      const counts = {};
      const suppressed = [];
      (res.data || []).forEach(r => {
        if (r.participants == null) suppressed.push(r.age_group);
        counts[r.age_group] = Number(r.participants) || 0;
      });
      return { available: true, counts, suppressed };
    } catch (e) {
      return { available: false, counts: null };
    }
  }

  root.SharedStore = {
    LIMITS,
    LOAD_LIMIT,
    PUBLIC_COLUMNS,
    HIDDEN_EXPRESSION_IDS,
    ARCHIVE_SINCE,
    isHidden,
    isArchivable,
    insertExpression,
    loadExpressions,
    fetchEmpathyCounts,
    addEmpathy,
    fetchParticipationSummary,
    fetchAgeGroupParticipants,
    insertChoices,
    fetchChoiceCounts,
    empathizedSet,
    storageGet,
    storageSet,
    storageRemove,
    STORAGE_PREFIX,
    participantStorageKeys,
    hasParticipantState,
    resetParticipant,
    participantKey,
    voterKey,
    mapRow,
    normalizeLang,
    LANG_CODES,
    isMissingSchemaError
  };
})(typeof self !== 'undefined' ? self : this);
