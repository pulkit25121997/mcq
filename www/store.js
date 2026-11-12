"use strict";
// Orbit's on-device engine: the desktop server's API semantics, backed by IndexedDB.
// Full questions stay in IndexedDB; a compact index and progress are kept in memory for fast filtering.

const OrbitStore = (() => {
  const DB_NAME = "orbit-qbank", DB_VERSION = 1;
  const KEYS = { meta: "key", sources: "id", modules: "id", questions: "id", qindex: "id", state: "question_id", sessions: "id", attempts: ["session_id", "question_id"] };
  class UserError extends Error {}
  const now = () => Date.now() / 1000;
  const req = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const done = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error?.name === "QuotaExceededError"
      ? new UserError("This device is out of browser storage. Free some space, then import again.")
      : tx.error || new Error("Saving to device storage failed."));
  });
  let dbPromise;
  function db() {
    dbPromise ||= new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new UserError("This browser does not support on-device storage (IndexedDB). Use Safari, Chrome or the Android app; private browsing may block storage.")); return; }
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => { for (const [name, keyPath] of Object.entries(KEYS)) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath }); };
      open.onsuccess = () => { open.result.onversionchange = () => open.result.close(); resolve(open.result); };
      open.onerror = () => reject(open.error || new UserError("Could not open on-device storage. Private browsing may block it."));
      open.onblocked = () => reject(new UserError("Close other Orbit tabs, then reload this page."));
    });
    return dbPromise;
  }
  async function write(names, fn) {
    const tx = (await db()).transaction(names, "readwrite");
    const stores = Object.fromEntries(names.map(n => [n, tx.objectStore(n)]));
    fn(stores);
    await done(tx);
  }

  const M = { loaded: null, sources: new Map(), modules: new Map(), qidx: new Map(), qmods: new Map(), state: new Map(), sessions: new Map(), attempts: new Map() };
  function indexModule(module) {
    module.low = `${module.title}\n${module.topic}`.toLowerCase();
    for (const qid of module.qids) { const list = M.qmods.get(qid); if (list) list.push(module.id); else M.qmods.set(qid, [module.id]); }
  }
  function rebuildMemberships() { M.qmods.clear(); for (const m of M.modules.values()) indexModule(m); }
  function addAttempt(a) { let map = M.attempts.get(a.session_id); if (!map) M.attempts.set(a.session_id, map = new Map()); map.set(a.question_id, a); }
  function load() {
    M.loaded ||= (async () => {
      const tx = (await db()).transaction(Object.keys(KEYS), "readonly");
      const all = name => req(tx.objectStore(name).getAll());
      const [sources, modules, qindex, state, sessions, attempts] = await Promise.all(["sources", "modules", "qindex", "state", "sessions", "attempts"].map(all));
      sources.forEach(s => M.sources.set(s.id, s));
      modules.forEach(m => M.modules.set(m.id, m));
      qindex.forEach(q => M.qidx.set(q.id, q));
      state.forEach(s => M.state.set(s.question_id, s));
      sessions.forEach(s => M.sessions.set(s.id, s));
      attempts.forEach(addAttempt);
      rebuildMemberships();
      await cleanupOrphans();
    })().catch(error => { M.loaded = null; throw error; });
    return M.loaded;
  }
  function reload() {
    for (const key of ["sources", "modules", "qidx", "qmods", "state", "sessions", "attempts"]) M[key] = new Map();
    M.loaded = null;
    return load();
  }

  const int = (value, name, low = 0, high = Infinity) => {
    if (!Number.isInteger(value) || value < low || value > high) throw new UserError(`${name} is outside the allowed range.`);
    return value;
  };
  const strings = (value, name) => {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 100000 || value.some(v => typeof v !== "string")) throw new UserError(`${name} must be a list of strings.`);
    return value;
  };
  function pool(filters) {
    if (!filters || typeof filters !== "object" || Array.isArray(filters)) throw new UserError("Filters must be an object.");
    const sources = new Set(strings(filters.sources, "sources")), subjects = new Set(strings(filters.subjects, "subjects")), topics = new Set(strings(filters.topics, "topics"));
    const year = filters.year || "";
    if (typeof year !== "string") throw new UserError("Year must be text.");
    let ids;
    if (sources.size || subjects.size || topics.size || year || filters.pyq_only) {
      ids = new Set();
      for (const m of M.modules.values()) {
        if ((sources.size && !sources.has(m.source_id)) || (subjects.size && !subjects.has(m.subject)) || (topics.size && !topics.has(m.id))
          || (year && m.year !== year) || (filters.pyq_only && M.sources.get(m.source_id)?.kind !== "pyq")) continue;
        for (const qid of m.qids) ids.add(qid);
      }
      ids = [...ids];
    } else ids = [...M.qmods.keys()];
    const status = filters.status || "all";
    const tests = {
      all: () => true, unattempted: st => !st?.attempts, incorrect: st => st?.last_correct === 0,
      correct: st => st?.last_correct === 1, bookmarked: st => st?.bookmarked === 1,
    };
    if (!tests[status]) throw new UserError("Unknown question status.");
    const wanted = strings(filters.question_ids, "question_ids");
    const only = wanted.length ? new Set(wanted) : null;
    const search = filters.search || "";
    if (typeof search !== "string" || search.length > 500) throw new UserError("Search must be text of up to 500 characters.");
    const term = search.trim().toLowerCase();
    return ids.filter(qid => {
      if (only && !only.has(qid)) return false;
      if (!tests[status](M.state.get(qid))) return false;
      const q = M.qidx.get(qid);
      if (!q) return false;
      if (filters.image_only && !q.img) return false;
      if (term) {
        q.low ??= q.stem.toLowerCase();
        if (!q.low.includes(term) && !(M.qmods.get(qid) || []).some(mid => M.modules.get(mid)?.low.includes(term))) return false;
      }
      return true;
    }).sort();
  }

  function sessionView(s) {
    const view = { ...s, count: s.question_ids.length, answered: Object.keys(s.selections).length };
    if (s.status === "completed" || s.mode === "tutor") {
      const results = {};
      for (const [qid, a] of M.attempts.get(s.id) || []) results[qid] = !!a.correct;
      const correct = Object.values(results).filter(Boolean).length, answered = Object.keys(results).length;
      Object.assign(view, { correct, incorrect: answered - correct, skipped: view.count - answered, score: 4 * correct - (answered - correct), maximum: 4 * view.count, results });
    }
    return view;
  }
  function summary() {
    const counts = { total: 0, attempted: 0, correct: 0, mistakes: 0, bookmarks: 0 };
    for (const qid of M.qmods.keys()) {
      const st = M.state.get(qid);
      counts.total++;
      if (st?.attempts) counts.attempted++;
      if (st?.last_correct === 1) counts.correct++;
      if (st?.last_correct === 0) counts.mistakes++;
      if (st?.bookmarked === 1) counts.bookmarks++;
    }
    const perSource = new Map(), perSubject = new Map();
    for (const m of M.modules.values()) {
      if (!perSource.has(m.source_id)) perSource.set(m.source_id, new Set());
      if (!perSubject.has(m.subject)) perSubject.set(m.subject, new Set());
      for (const qid of m.qids) { perSource.get(m.source_id).add(qid); perSubject.get(m.subject).add(qid); }
    }
    const sources = [...M.sources.values()].map(s => ({ ...s, question_count: perSource.get(s.id)?.size || 0 }))
      .sort((a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name));
    const subjects = [...perSubject].map(([subject, ids]) => {
      const row = { subject, total: ids.size, attempted: 0, correct: 0, mistakes: 0 };
      for (const qid of ids) { const st = M.state.get(qid); if (st?.attempts) row.attempted++; if (st?.last_correct === 1) row.correct++; if (st?.last_correct === 0) row.mistakes++; }
      return row;
    }).sort((a, b) => a.subject.localeCompare(b.subject));
    const day = t => new Date(t * 1000).toISOString().slice(0, 10);
    const days = new Set(), activity = new Map(), since = now() - 13 * 86400;
    for (const map of M.attempts.values()) for (const a of map.values()) {
      days.add(day(a.created_at));
      if (a.created_at >= since) { const d = activity.get(day(a.created_at)) || { day: day(a.created_at), answers: 0, correct: 0 }; d.answers++; d.correct += a.correct; activity.set(d.day, d); }
    }
    const cursor = new Date(); cursor.setUTCHours(12, 0, 0, 0);
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let streak = 0;
    while (days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
    const recent = [...M.sessions.values()].sort((a, b) => b.started_at - a.started_at).slice(0, 8).map(sessionView);
    return { ...counts, sources, subjects, streak, entries: sources.reduce((n, s) => n + s.entries, 0), module_count: sources.reduce((n, s) => n + s.tests, 0),
      activity: [...activity.values()].sort((a, b) => a.day.localeCompare(b.day)), recent_sessions: recent };
  }

  function getSession(id) {
    const s = M.sessions.get(id);
    if (!s) throw new UserError("Session not found. It may have been removed by a progress restore.");
    return s;
  }
  function stage(s, qid, selected, time, out) {
    const attempts = M.attempts.get(s.id);
    if (attempts?.has(qid)) return;
    const correct = selected === M.qidx.get(qid).c ? 1 : 0;
    const a = { session_id: s.id, question_id: qid, selected, correct, created_at: time };
    addAttempt(a); out.attempts.push(a);
    const st = M.state.get(qid) || { question_id: qid, bookmarked: 0, notes: "", attempts: 0, wrong_attempts: 0, last_correct: null, last_selected: null, last_attempt: null };
    Object.assign(st, { attempts: st.attempts + 1, wrong_attempts: st.wrong_attempts + 1 - correct, last_correct: correct, last_selected: selected, last_attempt: time });
    M.state.set(qid, st); out.state.push(st);
  }
  function persist(out) {
    return write(["sessions", "attempts", "state"], st => {
      out.sessions.forEach(s => st.sessions.put(s)); out.attempts.forEach(a => st.attempts.put(a)); out.state.forEach(s => st.state.put(s));
    });
  }
  const changes = () => ({ sessions: [], attempts: [], state: [] });
  function finish(s, out) {
    if (s.status === "completed") return;
    const time = now();
    for (const [qid, selected] of Object.entries(s.selections)) stage(s, qid, selected, time, out);
    Object.assign(s, { status: "completed", ended_at: time, deadline: null });
    out.sessions.push(s);
  }
  async function expire(s) {
    if (s.status === "active" && s.deadline != null && now() >= s.deadline) {
      const out = changes(); finish(s, out);
      try { await persist(out); } catch (error) { await reload(); throw error; }
    }
    return s;
  }
  async function question(s, index) {
    int(index, "Question index", 0, s.question_ids.length - 1);
    const qid = s.question_ids[index];
    const tx = (await db()).transaction("questions", "readonly");
    const record = await req(tx.objectStore("questions").get(qid));
    if (!record) throw new UserError("This question is no longer stored on this device. Re-import its bank.");
    const st = M.state.get(qid) || {};
    const q = { ...record, bookmarked: st.bookmarked || 0, notes: st.notes || "", attempts: st.attempts || 0, wrong_attempts: st.wrong_attempts || 0 };
    q.selected = Object.hasOwn(s.selections, qid) ? s.selections[qid] : null;
    q.index = index;
    q.sources = (M.qmods.get(qid) || []).map(mid => M.modules.get(mid)).map(m => ({ name: M.sources.get(m.source_id)?.name || "", subject: m.subject, title: m.title, topic: m.topic, year: m.year }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.title.localeCompare(b.title));
    q.revealed = s.status === "completed" || (s.mode === "tutor" && Object.hasOwn(s.selections, qid));
    if (!q.revealed) for (const field of ["correct_index", "explanation", "explanation_images", "video"]) delete q[field];
    return q;
  }
  const randomId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, "0")).join("");
  async function createSession(data) {
    const filters = data.filters || {};
    const ids = pool(filters);
    if (!ids.length) throw new UserError("No questions match these filters. Change your selections.");
    const count = int(data.count ?? 40, "Question count", 1, ids.length);
    const mode = data.mode || "tutor";
    if (!["tutor", "exam"].includes(mode)) throw new UserError("Choose tutor or exam mode.");
    const minutes = int(data.minutes ?? 0, "Time limit", 0, 1440);
    const title = data.title ?? "Custom module";
    if (typeof title !== "string" || !title.trim() || title.length > 140) throw new UserError("Give your module a name of 1–140 characters.");
    if (data.shuffle ?? true) for (let i = ids.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const duration = minutes ? minutes * 60 : null, start = now();
    const s = { id: randomId(), title: title.trim(), mode, status: "active", filters, question_ids: ids.slice(0, count), selections: {}, review_flags: [],
      current_index: 0, duration_seconds: duration, remaining_seconds: duration, deadline: duration ? start + duration : null, started_at: start, ended_at: null };
    await write(["sessions"], st => st.sessions.put(s));
    M.sessions.set(s.id, s);
    return sessionView(s);
  }
  async function saveState(qid, data) {
    if (!M.qidx.has(qid)) throw new UserError("Question not found.");
    const st = { ...(M.state.get(qid) || { question_id: qid, bookmarked: 0, notes: "", attempts: 0, wrong_attempts: 0, last_correct: null, last_selected: null, last_attempt: null }) };
    if ("bookmarked" in data) { if (typeof data.bookmarked !== "boolean") throw new UserError("Bookmark must be true or false."); st.bookmarked = data.bookmarked ? 1 : 0; }
    if ("notes" in data) { if (typeof data.notes !== "string" || data.notes.length > 20000) throw new UserError("Notes must be text of up to 20,000 characters."); st.notes = data.notes; }
    await write(["state"], s => s.state.put(st));
    M.state.set(qid, st);
    return { saved: true };
  }
  async function sessionAction(s, action, data) {
    await expire(s);
    const out = changes(), next = structuredClone(s);
    const ids = s.question_ids;
    if (action === "finish") finish(next, out);
    else if (action === "navigate") next.current_index = int(data.index, "Question index", 0, ids.length - 1);
    else if (action === "answer") {
      if (s.status !== "active") throw new UserError("This session is not running. Resume it or review its results.");
      const qid = data.question_id;
      if (!ids.includes(qid)) throw new UserError("This question is not in this session.");
      const selected = int(data.selected, "Option", 0, M.qidx.get(qid).n - 1);
      if (s.mode === "tutor" && Object.hasOwn(s.selections, qid)) throw new UserError("This answer is already checked. Start a new session to retry it.");
      next.selections[qid] = selected;
      if (s.mode === "tutor") stage(next, qid, selected, now(), out);
    } else if (action === "flag") {
      if (s.status === "completed") throw new UserError("A completed session is read-only.");
      if (!ids.includes(data.question_id)) throw new UserError("This question is not in this session.");
      const flags = new Set(s.review_flags);
      flags.has(data.question_id) ? flags.delete(data.question_id) : flags.add(data.question_id);
      next.review_flags = [...flags].sort();
    } else if (action === "pause") {
      if (s.status !== "active") throw new UserError("Only a running session can be paused.");
      Object.assign(next, { status: "paused", remaining_seconds: s.deadline ? Math.max(0, s.deadline - now()) : null, deadline: null });
    } else if (action === "resume") {
      if (s.status !== "paused") throw new UserError("Only a paused session can be resumed.");
      Object.assign(next, { status: "active", deadline: s.remaining_seconds != null ? now() + s.remaining_seconds : null });
    }
    if (!out.sessions.includes(next)) out.sessions.push(next);
    try { await persist(out); }
    catch (error) { await reload(); throw error; }
    M.sessions.set(s.id, next);
    return sessionView(next);
  }

  function collection(kind, offset, search) {
    if (!["bookmarked", "incorrect"].includes(kind)) throw new UserError("Unknown collection.");
    const ids = pool({ status: kind, search });
    ids.sort((a, b) => (M.state.get(b)?.last_attempt ?? -1) - (M.state.get(a)?.last_attempt ?? -1) || (a < b ? -1 : 1));
    return { total: ids.length, offset, items: ids.slice(offset, offset + 30).map(id => {
      const q = M.qidx.get(id), st = M.state.get(id);
      return { id, platform: q.platform, stem: q.stem, bookmarked: st.bookmarked, attempts: st.attempts, wrong_attempts: st.wrong_attempts, last_correct: st.last_correct };
    }) };
  }
  function review(s, kind, offset) {
    if (s.status !== "completed") throw new UserError("Finish this session before reviewing its results.");
    if (!["all", "incorrect", "correct", "skipped"].includes(kind)) throw new UserError("Unknown review filter.");
    const results = M.attempts.get(s.id) || new Map();
    const chosen = s.question_ids.map((qid, index) => [index, qid]).filter(([, qid]) => {
      const r = results.get(qid);
      return kind === "all" || (kind === "incorrect" && r?.correct === 0) || (kind === "correct" && r?.correct === 1) || (kind === "skipped" && !r);
    });
    return { total: chosen.length, offset, items: chosen.slice(offset, offset + 30).map(([index, qid]) => {
      const r = results.get(qid);
      return { id: qid, index, stem: M.qidx.get(qid)?.stem || "", platform: M.qidx.get(qid)?.platform || "", correct: r ? !!r.correct : null };
    }) };
  }

  function backup() {
    return { format: "orbit-web-progress", version: 1, exported_at: now(), sources: [...M.sources.values()].map(s => ({ id: s.id, name: s.name, digest: s.digest })),
      question_state: [...M.state.values()], sessions: [...M.sessions.values()], attempts: [...M.attempts.values()].flatMap(m => [...m.values()]) };
  }
  async function restore(data) {
    if (data?.format !== "orbit-web-progress" || data.version !== 1) throw new UserError("This is not an Orbit web/Android progress backup.");
    const actualSources = [...M.sources.values()].map(s => `${s.id}:${s.digest}`).sort();
    const backupSources = Array.isArray(data.sources) ? data.sources.map(s => `${s?.id}:${s?.digest}`).sort() : [];
    if (actualSources.length !== backupSources.length || actualSources.some((source, i) => source !== backupSources[i]))
      throw new UserError("This backup was made with different question-bank files. Import the same banks first.");
    for (const table of ["question_state", "sessions", "attempts"]) if (!Array.isArray(data[table]) || data[table].some(r => !r || typeof r !== "object")) throw new UserError(`Backup ${table} is invalid.`);
    const known = qid => typeof qid === "string" && M.qidx.has(qid);
    const missing = () => new UserError("This backup refers to questions not on this device. Import the same HTML banks first, then restore.");
    const state = data.question_state.map(r => {
      if (!known(r.question_id)) throw missing();
      if (typeof r.notes !== "string" || r.notes.length > 20000) throw new UserError("Backup contains invalid notes.");
      int(r.bookmarked, "Bookmark", 0, 1); int(r.attempts, "Attempts", 0); int(r.wrong_attempts, "Wrong attempts", 0, r.attempts);
      if (![0, 1, null].includes(r.last_correct)) throw new UserError("Backup contains an invalid result.");
      if (r.last_selected != null) int(r.last_selected, "Selected answer", 0, M.qidx.get(r.question_id).n - 1);
      if (r.last_attempt != null && (!Number.isFinite(r.last_attempt) || r.last_attempt < 0 || r.last_attempt > 1e12))
        throw new UserError("Backup contains an invalid timestamp.");
      return { question_id: r.question_id, bookmarked: r.bookmarked, notes: r.notes, attempts: r.attempts, wrong_attempts: r.wrong_attempts, last_correct: r.last_correct, last_selected: r.last_selected ?? null, last_attempt: r.last_attempt ?? null };
    });
    const time = Number(data.exported_at) || now();
    const seenSessions = new Set();
    const timestamp = (value, name) => {
      if (value != null && (!Number.isFinite(value) || value < 0 || value > 1e12)) throw new UserError(`Backup contains an invalid ${name}.`);
    };
    const sessions = data.sessions.map(r => {
      if (!["active", "paused", "completed"].includes(r.status) || !["tutor", "exam"].includes(r.mode)
          || typeof r.id !== "string" || !r.id || seenSessions.has(r.id)) throw new UserError("Backup contains an invalid session.");
      seenSessions.add(r.id);
      if (!Array.isArray(r.question_ids) || !r.question_ids.length || new Set(r.question_ids).size !== r.question_ids.length
          || !r.question_ids.every(known)) throw missing();
      if (typeof r.title !== "string" || !r.title.trim() || r.title.length > 140) throw new UserError("Backup contains an invalid module title.");
      if (!r.selections || typeof r.selections !== "object" || Array.isArray(r.selections) || !Array.isArray(r.review_flags)
          || r.review_flags.some(qid => !r.question_ids.includes(qid))) throw new UserError("Backup session answers are invalid.");
      for (const [qid, sel] of Object.entries(r.selections)) { if (!r.question_ids.includes(qid)) throw new UserError("Backup answer is outside its session."); int(sel, "Answer", 0, M.qidx.get(qid).n - 1); }
      if (r.duration_seconds != null) int(r.duration_seconds, "Duration", 1, 86400);
      for (const field of ["remaining_seconds", "deadline", "started_at", "ended_at"]) timestamp(r[field], "timestamp");
      const s = { id: r.id, title: r.title, mode: r.mode, status: r.status, filters: r.filters || {}, question_ids: r.question_ids, selections: r.selections,
        review_flags: r.review_flags, current_index: int(r.current_index, "Question index", 0, r.question_ids.length - 1),
        duration_seconds: r.duration_seconds ?? null, remaining_seconds: r.remaining_seconds ?? null, deadline: r.deadline ?? null, started_at: Number(r.started_at) || time, ended_at: r.ended_at ?? null };
      if (s.status === "active") Object.assign(s, { status: "paused", remaining_seconds: s.deadline != null ? Math.max(0, s.deadline - time) : null, deadline: null });
      return s;
    });
    const sessionsById = new Map(sessions.map(s => [s.id, s]));
    const seenAttempts = new Set();
    const attempts = data.attempts.map(a => {
      const session = sessionsById.get(a.session_id);
      const key = `${a.session_id}:${a.question_id}`;
      if (!session || !session.question_ids.includes(a.question_id) || !known(a.question_id) || seenAttempts.has(key))
        throw new UserError("Backup contains an invalid attempt.");
      seenAttempts.add(key);
      int(a.selected, "Selected answer", 0, M.qidx.get(a.question_id).n - 1); int(a.correct, "Correct result", 0, 1);
      timestamp(a.created_at, "timestamp");
      return { session_id: a.session_id, question_id: a.question_id, selected: a.selected, correct: a.correct, created_at: Number(a.created_at) || time };
    });
    await write(["state", "sessions", "attempts"], st => {
      st.state.clear(); st.sessions.clear(); st.attempts.clear();
      state.forEach(r => st.state.put(r)); sessions.forEach(r => st.sessions.put(r)); attempts.forEach(r => st.attempts.put(r));
    });
    M.state = new Map(state.map(r => [r.question_id, r])); M.sessions = new Map(sessions.map(s => [s.id, s])); M.attempts = new Map(); attempts.forEach(addAttempt);
    return { restored: true };
  }

  async function cleanupOrphans() {
    const keep = new Set(M.qmods.keys());
    for (const s of M.sessions.values()) s.question_ids.forEach(q => keep.add(q));
    const orphans = [...M.qidx.keys()].filter(q => !keep.has(q));
    for (let i = 0; i < orphans.length; i += 2000) {
      const batch = orphans.slice(i, i + 2000);
      await write(["questions", "qindex", "state"], st => batch.forEach(q => {
        st.questions.delete(q); st.qindex.delete(q); st.state.delete(q);
      }));
      batch.forEach(q => { M.qidx.delete(q); M.state.delete(q); });
    }
  }
  async function replaceSource(sourceId, source, modules) {
    const old = [...M.modules.values()].filter(m => m.source_id === sourceId);
    await write(["sources", "modules"], st => {
      old.forEach(m => st.modules.delete(m.id));
      if (source) { st.sources.put(source); modules.forEach(m => st.modules.put(m)); } else st.sources.delete(sourceId);
    });
    old.forEach(m => M.modules.delete(m.id));
    if (source) { M.sources.set(sourceId, source); modules.forEach(m => M.modules.set(m.id, m)); } else M.sources.delete(sourceId);
    rebuildMemberships();
  }

  async function importFile(file, progress = () => {}) {
    const I = window.OrbitImporter;
    const info = I.describeFile(file.name);
    const sourceId = I.hash128(`source:${info.key}`).slice(0, 16);
    progress({ phase: "checking", bytes: 0 });
    const digest = await I.fileDigest(file);
    const existing = M.sources.get(sourceId);
    if (existing?.digest === digest) return { file: file.name, name: existing.name, entries: existing.entries, tests: existing.tests, unchanged: true };
    const modules = [], pending = new Map();
    let entries = 0, index = 0, saved = 0;
    const flush = async () => {
      const batch = [...pending.values()]; pending.clear();
      if (!batch.length) return;
      await write(["questions", "qindex"], st => {
        for (const q of batch) {
          const known = M.qidx.get(q.id);
          const entry = { id: q.id, platform: q.platform, stem: q.stem, img: q.image_based, c: q.correct_index, n: q.options.length, el: q.explanation.length, hv: q.video ? 1 : 0 };
          if (!known) { st.questions.put(q); st.qindex.put(entry); continue; }
          if (q.explanation.length <= known.el && (known.hv || !q.video)) continue;
          st.questions.get(q.id).onsuccess = event => {
            const old = event.target.result;
            const merged = old ? { ...old } : q;
            if (old && q.explanation.length > known.el) { merged.explanation = q.explanation; merged.explanation_images = q.explanation_images; }
            if (old && !old.video && q.video) merged.video = q.video;
            st.questions.put(merged);
            st.qindex.put({ ...entry, el: merged.explanation.length, hv: merged.video ? 1 : 0 });
          };
        }
      });
      for (const q of batch) {
        const known = M.qidx.get(q.id);
        M.qidx.set(q.id, { id: q.id, platform: q.platform, stem: q.stem, img: q.image_based, c: q.correct_index, n: q.options.length,
          el: Math.max(q.explanation.length, known?.el || 0), hv: q.video || known?.hv ? 1 : 0 });
      }
      saved += batch.length;
    };
    try {
      for await (const test of I.streamTests(file, bytes => progress({ phase: "reading", bytes: Math.min(file.size, bytes * 1.0), questions: entries }))) {
        if (!test || typeof test !== "object" || !Array.isArray(test.questions)) throw new Error(`Module ${index + 1} has no question list.`);
        const path = Array.isArray(test.path) ? test.path : [];
        const title = I.clean(test.title) || `Module ${index + 1}`;
        const qids = new Set();
        for (const raw of test.questions) {
          const q = I.normalizeQuestion(raw, info.platform);
          const prior = pending.get(q.id);
          if (!prior || q.explanation.length > prior.explanation.length) pending.set(q.id, prior && !q.video ? { ...q, video: prior.video } : q);
          qids.add(q.id); entries++;
        }
        modules.push({ id: I.hash128(`${sourceId}:${index}:${test.id}`).slice(0, 24), source_id: sourceId, title,
          subject: I.subjectName(path[0] || ""), topic: path.slice(1).map(p => I.clean(p).replace(/_/g, " ")).join(" / ") || title,
          year: title.match(/\b(?:19|20)\d{2}\b/)?.[0] || "", qids: [...qids] });
        index++;
        if (pending.size >= 600) await flush();
      }
      await flush();
      if (!modules.length) throw new Error("This file contains no modules.");
      progress({ phase: "saving", questions: entries });
      const source = { id: sourceId, name: info.name, platform: info.platform, filename: file.name, kind: info.kind, entries, tests: modules.length, digest, imported_at: now() };
      await replaceSource(sourceId, source, modules);
      return { file: file.name, name: info.name, entries, tests: modules.length, unique: new Set(modules.flatMap(m => m.qids)).size, unchanged: false };
    } finally {
      await cleanupOrphans();
      navigator.storage?.persist?.().catch(() => {});
    }
  }
  async function removeSource(id) {
    if (!M.sources.has(id)) throw new UserError("This bank is not imported.");
    await replaceSource(id, null, []);
    await cleanupOrphans();
    return { removed: true };
  }
  async function eraseAll() {
    (await db()).close(); dbPromise = null; M.loaded = null;
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = resolve; r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new UserError("Close other Orbit tabs, then try erasing your data again."));
    });
    for (const key of ["sources", "modules", "qidx", "qmods", "state", "sessions", "attempts"]) M[key] = new Map();
  }
  async function storageInfo() {
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    const persisted = await navigator.storage?.persisted?.().catch(() => null);
    return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted };
  }

  let chain = Promise.resolve();
  const serial = fn => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };

  async function handle(path, data) {
    await load();
    const url = new URL(path, "https://orbit.local");
    const p = url.pathname, query = name => url.searchParams.get(name);
    const offset = () => int(Number(query("offset") || 0), "Offset", 0);
    if (data === undefined) {
      if (p === "/api/summary") return summary();
      if (p === "/api/topics") {
        const filters = JSON.parse(query("filters") || "{}");
        const sources = new Set(strings(filters.sources, "sources")), subjects = new Set(strings(filters.subjects, "subjects"));
        const all = [...M.modules.values()];
        return { topics: all.filter(m => (!sources.size || sources.has(m.source_id)) && (!subjects.size || subjects.has(m.subject)))
          .map(({ id, title, subject, topic, source_id }) => ({ id, title, subject, topic, source_id }))
          .sort((a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title)),
          years: [...new Set(all.map(m => m.year).filter(Boolean))].sort().reverse() };
      }
      if (p === "/api/collection") return collection(query("kind") || "bookmarked", offset(), query("search") || "");
      if (p === "/api/history") return { sessions: [...M.sessions.values()].sort((a, b) => b.started_at - a.started_at).map(sessionView) };
      if (p === "/api/backup") return backup();
      if (p === "/api/storage") return storageInfo();
      const match = p.match(/^\/api\/sessions\/([a-f0-9]+)(\/question|\/review)?$/);
      if (match) {
        const s = await expire(getSession(match[1]));
        if (match[2] === "/question") return question(M.sessions.get(s.id), Number(query("index") ?? s.current_index));
        if (match[2] === "/review") return review(s, query("kind") || "all", offset());
        return sessionView(s);
      }
    } else {
      if (!data || typeof data !== "object") throw new UserError("Request body must be an object.");
      if (p === "/api/pool") return { count: pool(data.filters || {}).length };
      if (p === "/api/sessions") return createSession(data);
      if (p === "/api/restore") return restore(data);
      let match = p.match(/^\/api\/questions\/([a-f0-9]+)\/state$/);
      if (match) return saveState(match[1], data);
      match = p.match(/^\/api\/sources\/([a-f0-9]+)\/delete$/);
      if (match) return removeSource(match[1]);
      match = p.match(/^\/api\/sessions\/([a-f0-9]+)\/(answer|navigate|flag|pause|resume|finish)$/);
      if (match) return sessionAction(getSession(match[1]), match[2], data);
    }
    throw new UserError("Unknown action.");
  }

  return {
    api: (path, data) => serial(() => handle(path, data === undefined ? undefined : structuredClone(data))),
    importFile: (file, progress) => serial(async () => { await load(); return importFile(file, progress); }),
    eraseAll: () => serial(eraseAll),
    load,
  };
})();
