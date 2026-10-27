/* 브라우저 E2E 테스트용 가짜 Supabase 클라이언트 (실제 DB에 접속하지 않음)
   · e2e 스크립트가 supabase-js 요청을 이 파일로 바꿔 끼웁니다.
   · 데이터는 sessionStorage('__mock_db')에 보관해 새로고침 후에도 유지됩니다. (사이트의 'sm_' 키와 겹치지 않음)
     sessionStorage를 쓸 수 없으면 이 페이지의 메모리에만 보관합니다. */
(function () {
  'use strict';
  const KEY = '__mock_db';
  let memory = null;                      // sessionStorage를 쓸 수 없는 환경(테스트)용
  const empty = () => ({ shared_expressions: [], expression_participants: [], expression_empathy: [], exploration_choices: [], exploration_reflections: [], participation_pings: [], nextId: 100 });
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
    } else if (window.__mockDb.noSubmissionColumn && table === 'exploration_choices' && rows.some(r => 'submission_id' in r)) {
      // 2026-10-save-answers.sql 실행 전 운영 DB와 같은 응답 (새 칸 없음)
      result = { data: null, error: { code: 'PGRST204', message: "Could not find the 'submission_id' column of 'exploration_choices' in the schema cache" } };
    } else if (window.__mockDb.noSubmissionColumn && table === 'exploration_reflections') {
      result = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.exploration_reflections' in the schema cache" } };
    } else if (table === 'participation_pings' && rows.some(r => (db.participation_pings || []).some(g => g.participant_key === r.participant_key && g.event_key === r.event_key))) {
      // 서버의 unique (participant_key, event_key) 와 같은 응답
      result = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' }, status: 409 };
    } else if (window.__mockDb.failInsert && table === 'shared_expressions') {
      result = { data: null, error: { code: 'NETWORK', message: 'Failed to fetch' } };
    } else {
      // 서버처럼 한 번의 INSERT로 들어간 행은 같은 created_at(트랜잭션 시각)을 가집니다.
      const batchAt = new Date().toISOString() + '#' + Math.random().toString(36).slice(2);   // 묶음 구분용
      const saved = rows.map(r => Object.assign({}, r, table === 'shared_expressions'
        ? { id: db.nextId++, created_at: new Date().toISOString() } : table === 'exploration_choices' || table === 'participation_pings' || table === 'exploration_reflections' ? { created_at: batchAt } : {}));
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
      const exprKeys = new Set(db.expression_participants.map(p => p.participant_key));
      // 2026-10-participation-pings.sql: 참여 기록 키 ∪ 공동 표현 키 + 참여 기록 시작 전 객관식 묶음
      const pings = db.participation_pings || [];
      const keys = new Set([...exprKeys, ...pings.map(g => g.participant_key)]);
      const firstPing = pings.length ? pings.map(g => g.created_at).sort()[0] : null;
      const choiceSubmissions = new Set((db.exploration_choices || []).filter(c => !firstPing || c.created_at < firstPing).map(c => c.event_key + '|' + c.created_at)).size;
      return Promise.resolve({ data: [{ participants: keys.size + choiceSubmissions, completed_participants: exprKeys.size, expressions: db.shared_expressions.length }], error: null });
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

  // Edge Function 호출: 실제 supabase-js처럼 fetch를 보냅니다. 테스트 실행기는 외부 요청을 모두 막으므로 기본은 실패(→ 사이트는 폴백),
  // 성공 경로는 테스트가 page.route로 이 주소의 응답을 만들어 확인합니다.
  function invoke(name, opts) {
    window.__mockDb.calls.push({ op: 'invoke', name, body: opts && opts.body });
    return fetch('https://mock.supabase.test/functions/v1/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify((opts && opts.body) || {}), signal: opts && opts.signal
    }).then(async r => r.ok ? { data: await r.json(), error: null } : { data: null, error: { name: 'FunctionsHttpError', status: r.status } })
      .catch(e => ({ data: null, error: e }));
  }

  window.supabase = {
    createClient() {
      return {
        from(table) {
          return { insert: rows => insert(table, rows), select: () => select(table).select() };
        },
        rpc,
        functions: { invoke }
      };
    }
  };
})();
