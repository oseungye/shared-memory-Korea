/* 브라우저 E2E 테스트용 가짜 Supabase 클라이언트 (실제 DB에 접속하지 않음)
   · e2e 스크립트가 supabase-js 요청을 이 파일로 바꿔 끼웁니다.
   · 데이터는 sessionStorage('__mock_db')에 보관해 새로고침 후에도 유지됩니다. (사이트의 'sm_' 키와 겹치지 않음)
     sessionStorage를 쓸 수 없으면 이 페이지의 메모리에만 보관합니다. */
(function () {
  'use strict';
  const KEY = '__mock_db';
  let memory = null;                      // sessionStorage를 쓸 수 없는 환경(테스트)용
  const empty = () => ({ shared_expressions: [], expression_participants: [], expression_empathy: [], exploration_choices: [], nextId: 100 });
  function load() {
    try { const v = sessionStorage.getItem(KEY); if (v) return JSON.parse(v); } catch (e) { /* 메모리 사용 */ }
    return memory ? JSON.parse(JSON.stringify(memory)) : empty();
  }
  function save(db) {
    memory = JSON.parse(JSON.stringify(db));
    try { sessionStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 메모리에만 */ }
  }
  window.__mockDb = { read: load, failInsert: false, failLoad: false, calls: [] };

  function insert(table, rows) {
    const db = load();
    window.__mockDb.calls.push({ op: 'insert', table, rows });
    let result;
    if (window.__mockDb.noChoiceTable && table === 'exploration_choices') {
      // 객관식 SQL을 아직 실행하지 않은 운영 DB와 같은 응답
      result = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.exploration_choices' in the schema cache" } };
    } else if (window.__mockDb.failInsert && table === 'shared_expressions') {
      result = { data: null, error: { code: 'NETWORK', message: 'Failed to fetch' } };
    } else {
      const saved = rows.map(r => Object.assign({}, r, table === 'shared_expressions'
        ? { id: db.nextId++, created_at: new Date().toISOString() } : {}));
      db[table] = (db[table] || []).concat(saved);
      save(db);
      result = { data: saved.map(r => ({ id: r.id })), error: null };
    }
    const p = Promise.resolve({ data: null, error: result.error });
    p.select = () => Promise.resolve(result);
    return p;
  }

  function select(table) {
    const q = { filters: [] };
    const chain = {
      select() { return chain; },
      eq(col, val) { q.filters.push([col, val]); return chain; },
      order() { return chain; },
      limit() {
        const rows = (load()[table] || []).filter(r => q.filters.every(([c, v]) => r[c] === v)).reverse();
        return Promise.resolve({ data: rows, error: null });
      }
    };
    return chain;
  }

  function rpc(name, args) {
    const db = load();
    window.__mockDb.calls.push({ op: 'rpc', name, args });
    const rows = db.shared_expressions.filter(r => !args || !args.p_event_key || r.event_key === args.p_event_key);
    if (name === 'public_expressions' && window.__mockDb.failLoad) {
      // supabase-config.js의 제한 시간이 지나 요청을 멈춘 경우와 같은 오류
      return Promise.resolve({ data: null, error: { code: '', message: 'TimeoutError: request timeout' } });
    }
    if (name === 'public_expressions') {
      return Promise.resolve({ data: rows.slice().reverse().map(r => Object.assign({ age_group_suppressed: false }, r)), error: null });
    }
    if (name === 'empathy_counts') {
      const counts = {};
      db.expression_empathy.forEach(e => { counts[e.expression_id] = (counts[e.expression_id] || 0) + 1; });
      return Promise.resolve({ data: Object.keys(counts).map(id => ({ expression_id: Number(id), empathy_count: counts[id] })), error: null });
    }
    if (name === 'participation_summary') {
      const keys = new Set(db.expression_participants.map(p => p.participant_key));
      return Promise.resolve({ data: [{ participants: keys.size, completed_participants: keys.size, expressions: db.shared_expressions.length }], error: null });
    }
    if (name === 'choice_counts') {
      if (window.__mockDb.noChoiceTable) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
      const list = (db.exploration_choices || []).filter(c => c.event_key === args.p_event_key);
      const totals = {}, by = {};
      list.forEach(c => { totals[c.question_id] = (totals[c.question_id] || 0) + 1; const k = c.question_id + '|' + c.option_id; by[k] = (by[k] || 0) + 1; });
      // 서버와 같이 질문별 응답이 5건 미만이면 돌려주지 않음
      const data = Object.keys(by).filter(k => totals[k.split('|')[0]] >= 5).map(k => ({ question_id: k.split('|')[0], option_id: k.split('|')[1], n: by[k] }));
      return Promise.resolve({ data, error: null });
    }
    if (name === 'age_group_participants') {
      const by = {};
      rows.forEach(r => { const g = r.age_group || 'unknown'; by[g] = (by[g] || 0) + 1; });
      return Promise.resolve({ data: Object.keys(by).map(g => ({ age_group: g, participants: by[g] < 5 && g !== 'unknown' ? null : by[g] })), error: null });
    }
    return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  }

  window.supabase = {
    createClient() {
      return {
        from(table) {
          return { insert: rows => insert(table, rows), select: () => select(table).select() };
        },
        rpc
      };
    }
  };
})();
