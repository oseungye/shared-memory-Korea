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
  const AGE_GROUP_IDS = ['10s', '20s', '30s', '40s', '50s', '60plus', 'no_answer'];
  const PRIOR_IDS = ['yes', 'no', 'unsure', 'no_answer'];
  const LOAD_LIMIT = 500;
  const LIMITS = { name: 40, content: 1000, reason: 1000, before: 500 };

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

  function friendlyError(error) {
    if (!error) return '';
    const msg = String(error.message || error);
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
          return { ok: false, error: friendlyError(res.error), raw: res.error };
        }
      }
    } catch (e) {
      return { ok: false, error: friendlyError(e), raw: e };
    }
    return { ok: false, error: '저장하지 못했습니다.' };
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
      priorLearning: PRIOR_IDS.indexOf(item.prior_learning) >= 0 ? item.prior_learning : null,
      viewedCompare: typeof item.viewed_compare === 'boolean' ? item.viewed_compare : null,
      viewedNlp: typeof item.viewed_nlp === 'boolean' ? item.viewed_nlp : null,
      viewedSources: typeof item.viewed_sources === 'boolean' ? item.viewed_sources : null,
      completedFlow: typeof item.completed_flow === 'boolean' ? item.completed_flow : null
    };
  }

  /** 한 사건의 공동 표현(최신순, 최대 LOAD_LIMIT개) → { data, error } */
  async function loadExpressions(eventKey) {
    const c = client();
    if (!c) return { data: [], error: '데이터베이스에 연결할 수 없습니다.' };
    try {
      const res = await c.from(TABLE)
        .select('*')
        .eq('event_key', eventKey)
        .order('created_at', { ascending: false })
        .limit(LOAD_LIMIT);
      if (res.error) return { data: [], error: friendlyError(res.error) };
      return { data: (res.data || []).map(mapRow), error: null, limited: (res.data || []).length >= LOAD_LIMIT };
    } catch (e) {
      return { data: [], error: friendlyError(e) };
    }
  }

  /* ---------- 공감 ---------- */

  function storageGet(key) {
    try { return root.localStorage ? root.localStorage.getItem(key) : null; } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { if (root.localStorage) root.localStorage.setItem(key, value); } catch (e) { /* 저장소 사용 불가: 무시 */ }
  }

  function randomKey(prefix) {
    return root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  const memoryKeys = {};
  /** 브라우저 저장소에 보관하는 무작위 키 (개인정보 아님). 저장소를 쓸 수 없으면 이 페이지에서만 유지합니다. */
  function persistentKey(name, prefix) {
    let key = storageGet(name);
    if (!key) {
      key = memoryKeys[name] || randomKey(prefix);
      memoryKeys[name] = key;
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

  /** 사건별·연령대별 참여자 수 → { available, counts: {ageGroup: n} } */
  async function fetchAgeGroupParticipants(eventKey) {
    const c = client();
    if (!c || typeof c.rpc !== 'function') return { available: false, counts: null };
    try {
      const res = await c.rpc(AGE_RPC, { p_event_key: eventKey });
      if (res.error) return { available: false, counts: null };
      const counts = {};
      (res.data || []).forEach(r => { counts[r.age_group] = Number(r.participants) || 0; });
      return { available: true, counts };
    } catch (e) {
      return { available: false, counts: null };
    }
  }

  root.SharedStore = {
    LIMITS,
    LOAD_LIMIT,
    insertExpression,
    loadExpressions,
    fetchEmpathyCounts,
    addEmpathy,
    fetchParticipationSummary,
    fetchAgeGroupParticipants,
    empathizedSet,
    storageGet,
    storageSet,
    mapRow,
    normalizeLang,
    LANG_CODES,
    isMissingSchemaError
  };
})(typeof self !== 'undefined' ? self : this);
