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
   * 공동 표현을 저장합니다.
   * 확장 컬럼이 없는 DB라면 기존 컬럼만으로 다시 저장합니다. → { ok, legacy, error }
   */
  async function insertExpression(row) {
    const c = client();
    if (!c) return { ok: false, error: '데이터베이스에 연결할 수 없습니다. (Supabase 라이브러리를 불러오지 못했습니다)' };

    const base = {
      event_key: row.eventKey,
      author_name: String(row.author || '').slice(0, LIMITS.name),
      country_code: row.lang || 'unknown',
      content: String(row.content || '').slice(0, LIMITS.content),
      reason: String(row.reason || '').slice(0, LIMITS.reason)
    };
    const extended = Object.assign({}, base, {
      expression_style: row.style || null,
      selected_concepts: (row.selectedConcepts || []).slice(0, 20),
      reason_tags: (row.reasonTags || []).slice(0, 10),
      before_content: row.before ? String(row.before).slice(0, LIMITS.before) : null
    });

    try {
      const res = await c.from(TABLE).insert([extended]);
      if (!res.error) return { ok: true, legacy: false };
      if (!isMissingSchemaError(res.error)) return { ok: false, error: friendlyError(res.error), raw: res.error };

      const legacy = await c.from(TABLE).insert([base]);
      if (legacy.error) return { ok: false, error: friendlyError(legacy.error), raw: legacy.error };
      return { ok: true, legacy: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e), raw: e };
    }
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
      lang: item.country_code || 'unknown',
      createdAt: item.created_at || null,
      style: typeof item.expression_style === 'string' ? item.expression_style : null,
      selectedConcepts: asArray(item.selected_concepts),
      reasonTags: asArray(item.reason_tags),
      before: typeof item.before_content === 'string' ? item.before_content : ''
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

  let memoryVoterKey = null;
  /** 이 브라우저를 구분하는 무작위 키 (개인정보 아님). 같은 제안에 두 번 공감하는 것을 막는 데 씁니다. */
  function voterKey() {
    let key = storageGet('sm_voter_key');
    if (!key) {
      key = memoryVoterKey || (root.crypto && root.crypto.randomUUID
        ? root.crypto.randomUUID()
        : 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12));
      memoryVoterKey = key;
      storageSet('sm_voter_key', key);
    }
    return key;
  }

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

  root.SharedStore = {
    LIMITS,
    LOAD_LIMIT,
    insertExpression,
    loadExpressions,
    fetchEmpathyCounts,
    addEmpathy,
    empathizedSet,
    storageGet,
    storageSet,
    mapRow,
    isMissingSchemaError
  };
})(typeof self !== 'undefined' ? self : this);
