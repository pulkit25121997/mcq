"use strict";

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  library: '<path d="M4 5h5v15H4zM10 5h5v15h-5zM16 5l4-1 3 15-4 1z"/>',
  sliders: '<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<path d="m9 3-1 3-3 1-2 4 2 3v3l4 3 3-1 3 1 4-3v-3l2-3-2-4-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  moon: '<path d="M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M5 21V4m0 0c4-3 9 3 14 0v9c-5 3-10-3-14 0"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  flame: '<path d="M12 2c1 6 7 7 7 13a7 7 0 1 1-14 0c0-3 2-6 4-8-1 4 0 5 1 5 3-1 3-6 2-10z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = value => Number(value || 0).toLocaleString();
const percent = (a, b) => b ? Math.round(a / b * 100) : 0;
const date = value => new Date(value * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const main = document.querySelector("#main");
const S = {
  summary: null, route: "", session: null, question: null, draft: null, builderPreset: null,
  pool: 0, topics: [], builderSeq: 0, routeSeq: 0, collectionOffset: 0, collectionSearch: "",
  reviewKind: "all", reviewOffset: 0, navStart: 0, busy: false, noteTimer: null, toastTimer: null,
};

async function api(path, data) {
  try { return await OrbitStore.api(path, data); }
  catch (error) {
    console.error(error);
    if (error?.name === "QuotaExceededError") throw new Error("This device is out of browser storage. Free some space and try again.");
    throw new Error(error?.message || "Saving on this device failed. Reload the app and try again.");
  }
}

function toast(message, error = false) {
  const element = document.querySelector("#toast");
  clearTimeout(S.toastTimer);
  element.textContent = message;
  element.className = `visible${error ? " error" : ""}`;
  S.toastTimer = setTimeout(() => { element.className = ""; }, error ? 8500 : 3500);
}

function button(text, action, extra = "", style = "", ico = "") {
  return `<button class="button ${style}" data-action="${action}" ${extra}>${ico ? icon(ico) : ""}${esc(text)}</button>`;
}
function heading(title, description, actions = "", eyebrow = "") {
  return `<div class="page-heading"><div>${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ""}<h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}
function empty(title, text, ico = "library", action = '<a class="button primary" href="#builder">Create a module</a>') {
  return `<div class="empty">${icon(ico)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
function platformClass(platform) {
  return platform === "Cerebellum" ? "cerebellum" : platform === "Core BTR" ? "core" : "";
}
function stat(label, value, foot, ico, color = "") {
  return `<div class="stat-card"><div class="stat-top"><span>${esc(label)}</span><span class="stat-icon ${color}">${icon(ico)}</span></div><div class="stat-value">${esc(value)}</div><div class="stat-foot">${esc(foot)}</div></div>`;
}
function sessionRows(sessions) {
  if (!sessions.length) return empty("A fresh start", "Your practice sessions will appear here. Build your first custom module.", "play");
  return sessions.map(s => `<div class="session-row"><div><h3>${esc(s.title)}</h3><p>${date(s.started_at)} &middot; ${s.mode === "tutor" ? "Tutor" : "Exam"} &middot; ${s.answered}/${s.count} answered</p></div><div class="badge-row"><span class="badge ${s.status === "completed" ? "green" : "brand"}">${s.status === "completed" ? `${s.correct}/${s.count} correct` : esc(s.status)}</span><a class="button small" href="#${s.status === "completed" ? "results" : "session"}/${s.id}">${s.status === "completed" ? "Review" : "Resume"} ${icon("arrow")}</a></div></div>`).join("");
}
async function refreshSummary() {
  S.summary = await api("/api/summary");
  document.querySelector("#bookmark-count").textContent = fmt(S.summary.bookmarks);
  document.querySelector("#mistake-count").textContent = fmt(S.summary.mistakes);
}
function sourceRows() {
  return S.summary.sources.map(s => `<div class="source-row"><span class="platform-icon ${platformClass(s.platform)}">${esc(s.platform[0])}</span><div class="source-info"><div class="source-name">${esc(s.name)}</div><div class="source-detail">${fmt(s.tests)} original modules &middot; ${fmt(s.entries)} source entries</div></div><span class="source-count">${fmt(s.question_count)} <small class="muted">MCQs</small></span>${button("Browse tests", "source", `data-id="${s.id}"`, "small", "arrow")}</div>`).join("");
}

async function dashboard() {
  const d = S.summary;
  const activity = new Map(d.activity.map(day => [day.day, day.answers]));
  const maxActivity = Math.max(1, ...d.activity.map(day => day.answers));
  const bars = Array.from({ length: 7 }, (_, index) => {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - 6 + index);
    const count = activity.get(now.toISOString().slice(0, 10)) || 0;
    const height = count ? Math.max(8, Math.round(count / maxActivity * 52)) : 3;
    return `<div class="activity-col" title="${now.toISOString().slice(0, 10)}: ${count} answers"><span class="activity-bar"><svg viewBox="0 0 20 52" aria-hidden="true"><rect x="0" y="${52 - height}" width="20" height="${height}" fill="currentColor" rx="3"/></svg></span><small>${now.toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })}</small></div>`;
  }).join("");
  main.innerHTML = heading("Make every question count.", "One focused workspace. All your question banks. A little better, every day.",
    `<a class="button primary" href="#tests">${icon("library")} Browse tests</a>`, "YOUR STUDY SPACE")
    + `<div class="stats-grid">${stat("Questions in your library", fmt(d.total), `${fmt(d.sources.length)} banks · ${fmt(d.module_count)} modules`, "library")}
      ${stat("Questions attempted", fmt(d.attempted), `${percent(d.attempted, d.total)}% of your library explored`, "check", "green")}
      ${stat("Latest-answer accuracy", d.attempted ? `${percent(d.correct, d.attempted)}%` : "--", d.attempted ? `${fmt(d.correct)} currently correct` : "Your first answer starts the story", "target", "amber")}
      ${stat("Mistakes to revisit", fmt(d.mistakes), "A correct retry clears a mistake", "refresh", "red")}</div>
      <div class="dashboard-layout"><div>
        <section class="panel" id="dashboard-tests"></section>
        <section class="panel"><div class="panel-heading"><div><h2>Your question banks</h2><p class="section-caption">Different platforms. One familiar practice experience.</p></div><a href="#library">Browse library ${icon("arrow")}</a></div>${sourceRows()}</section>
        <section class="panel"><div class="panel-heading"><h2>Pick up where you left off</h2><a href="#history">All sessions ${icon("arrow")}</a></div>${sessionRows(d.recent_sessions.slice(0, 4))}</section>
      </div><aside class="dashboard-aside">
        <section class="panel"><div class="streak"><span class="streak-icon">${icon("flame")}</span><div><strong>${d.streak} day${d.streak === 1 ? "" : "s"}</strong><p class="subtext">practice streak · UTC</p></div></div><div class="activity">${bars}</div><p class="section-caption">Every checked answer is a step forward.</p></section>
        <section class="panel"><h2>Your revision corner</h2><p class="section-caption">Turn a second look into a stronger memory.</p><a class="revision-tile" href="#bookmarks"><div class="tile-top">${icon("bookmark")} Saved for later</div><strong>${fmt(d.bookmarks)}</strong><p>Revisit your bookmarked questions ${icon("arrow")}</p></a><a class="revision-tile" href="#mistakes"><div class="tile-top">${icon("refresh")} Learn from mistakes</div><strong>${fmt(d.mistakes)}</strong><p>Retry questions last answered incorrectly ${icon("arrow")}</p></a></section>
        <section class="panel"><h3>A little progress, daily.</h3><p class="section-caption">Library completion</p><progress value="${d.attempted}" max="${d.total || 1}" aria-label="Library completion"></progress><div class="progress-label"><span>${fmt(d.attempted)} attempted</span><strong>${percent(d.attempted, d.total)}%</strong></div><p class="section-caption">Matching questions within the same platform share progress, even across banks.</p></section>
      </aside></div>`;
  await testBrowser(document.querySelector("#dashboard-tests"));
}

async function testBrowser(container, source = "") {
  const sequence = S.routeSeq;
  const { topics } = await api("/api/topics");
  if (sequence !== S.routeSeq || !container?.isConnected) return;
  container.innerHTML = `<h2>Browse original tests</h2><p class="section-caption">Choose tutor mode to check answers as you go, or exam mode to review them after submission. Questions stay in their original order; unfinished tests resume in the selected mode.</p>
    <div class="form-grid"><div class="field"><label for="test-source">Question bank</label><select id="test-source"><option value="">All banks</option>${S.summary.sources.map(s => `<option value="${s.id}" ${source === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
    <div class="field"><label for="test-subject">Subject</label><select id="test-subject"><option value="">All subjects</option>${S.summary.subjects.map(s => `<option>${esc(s.subject)}</option>`).join("")}</select></div></div>
    <div class="field"><label for="test-search">Find a test or topic</label><input id="test-search" type="search" placeholder="Search original test names..."></div><div id="test-list" aria-live="polite"></div>`;
  let offset = 0;
  function render() {
    const bank = container.querySelector("#test-source").value;
    const subject = container.querySelector("#test-subject").value;
    const term = container.querySelector("#test-search").value.trim().toLowerCase();
    const chosen = topics.filter(t => (!bank || t.source_id === bank) && (!subject || t.subject === subject)
      && (!term || `${t.title} ${t.topic}`.toLowerCase().includes(term)));
    const list = container.querySelector("#test-list");
    list.innerHTML = `<p class="section-caption">${fmt(chosen.length)} tests</p>` + chosen.slice(offset, offset + 30).map(t => {
      const bankName = S.summary.sources.find(s => s.id === t.source_id)?.name || "";
      return `<article class="session-row"><div><h3>${esc(t.title)}</h3><p>${esc(bankName)} &middot; ${esc(t.subject)} &middot; ${fmt(t.count)} questions</p><p>${fmt(t.attempted)} previously attempted</p></div><div class="badge-row">${button("Tutor mode", "open-test", `data-id="${t.id}" data-mode="tutor" ${t.count ? "" : "disabled"} aria-label="Tutor mode: ${esc(t.title)}"`, "small", "play")}${button("Exam mode", "open-test", `data-id="${t.id}" data-mode="exam" ${t.count ? "" : "disabled"} aria-label="Exam mode: ${esc(t.title)}"`, "small", "play")}</div></article>`;
    }).join("") + (chosen.length ? pagination({ total: chosen.length, offset }, "tests-page") : '<p class="notice">No tests match. Try another bank, subject or search.</p>');
  }
  container.addEventListener("input", event => {
    if (event.target.matches("#test-source, #test-subject, #test-search")) { offset = 0; render(); }
  });
  container.addEventListener("click", event => {
    const target = event.target.closest('[data-action="tests-page"]');
    if (!target || target.disabled) return;
    event.stopPropagation(); offset = Number(target.dataset.offset); render();
  });
  render();
}

function library() {
  const d = S.summary;
  main.innerHTML = heading("Your entire library, together.", "Browse by source or jump into a subject. Original modules and attribution are preserved.")
    + `<section class="panel"><div class="panel-heading"><h2>All ${d.sources.length} imported banks</h2><span class="badge brand">${fmt(d.total)} unique platform questions</span></div>${sourceRows()}<div class="notice">${fmt(d.entries)} source entries become ${fmt(d.total)} questions after same-platform deduplication. Different platforms remain separate; answer or image differences remain distinct.</div></section>
    <div class="section-heading"><h2>Explore by subject</h2><span class="muted subtext">${d.subjects.length} subject groups</span></div><div class="subject-grid">${d.subjects.map(s => `<a href="#builder" class="subject-card" data-action="subject" data-subject="${esc(s.subject)}"><span class="subject-icon">${esc(s.subject.slice(0, 2).toUpperCase())}</span><h3>${esc(s.subject)}</h3><p>${fmt(s.total)} questions across your banks</p><progress value="${s.attempted}" max="${s.total}" aria-label="${esc(s.subject)} completion"></progress><div class="progress-label"><span>${fmt(s.attempted)} attempted</span><span>${s.attempted ? `${percent(s.correct, s.attempted)}% accuracy` : "Not started"}</span></div></a>`).join("")}</div>`;
}

function collectFilters() {
  const f = document.querySelector("#builder-form");
  return {
    sources: [...f.querySelectorAll('input[name="source"]:checked')].map(e => e.value),
    subjects: [...f.elements.subjects.selectedOptions].map(e => e.value),
    topics: [...f.elements.topics.selectedOptions].map(e => e.value),
    status: f.elements.status.value, search: f.elements.search.value.trim(),
    image_only: f.elements.image_only.checked, pyq_only: f.elements.pyq_only.checked,
    year: f.elements.year.value,
  };
}
function builder(preset = {}) {
  const d = S.summary;
  main.innerHTML = heading("Build your next breakthrough.", "Choose what matters. Mix your banks. Make this session yours.", "", "CUSTOM MODULE")
    + `<form id="builder-form"><div class="builder-layout"><div class="panel">
      <section class="form-section"><h2>01 &nbsp; Choose your question banks</h2><p>Leave all unchecked to include every platform.</p><div class="source-options">${d.sources.map(s => `<label class="check-card"><input type="checkbox" name="source" value="${s.id}" ${(preset.sources || []).includes(s.id) ? "checked" : ""}><span>${esc(s.name)}</span><small>${fmt(s.question_count)}</small></label>`).join("")}</div></section>
      <section class="form-section"><h2>02 &nbsp; Find your focus</h2><p>Select one or more subjects and original topic modules. Empty selections mean all.</p>
        <div class="field"><label for="subjects">Subjects</label><select id="subjects" name="subjects" multiple size="5" aria-describedby="multi-hint">${d.subjects.map(s => `<option ${(preset.subjects || []).includes(s.subject) ? "selected" : ""}>${esc(s.subject)}</option>`).join("")}</select><span class="field-hint" id="multi-hint">Use Ctrl / Cmd or Shift on desktop to select multiple. Ctrl / Cmd-click to deselect.</span></div>
        <div class="field"><label for="topic-search">Find an original module</label><input id="topic-search" type="search" placeholder="Search module or topic names..."></div>
        <div class="field"><label for="topics">Topics / original modules <span class="muted" id="topic-count"></span></label><select id="topics" name="topics" multiple size="6"></select><span class="field-hint">Filtered by the selected banks and subjects.</span></div>
        <div class="field"><label for="question-search">Question or topic search</label><input id="question-search" type="search" name="search" placeholder="e.g. brachial plexus, renal, AIIMS" value="${esc(preset.search || "")}"></div>
      </section>
      <section class="form-section"><h2>03 &nbsp; Refine your revision</h2><p>Question status is based on your most recent checked answer.</p><div class="form-grid">
        <div class="field"><label for="question-status">Question status</label><select id="question-status" name="status">${[["all", "All questions"], ["unattempted", "Not attempted yet"], ["incorrect", "Incorrect / mistake notebook"], ["bookmarked", "Bookmarked"], ["correct", "Previously correct"]].map(([value, name]) => `<option value="${value}" ${preset.status === value ? "selected" : ""}>${name}</option>`).join("")}</select></div>
        <div class="field"><label for="question-year">Year in original module title</label><select id="question-year" name="year"><option value="">All years</option></select></div>
      </div><div class="check-row"><label class="check-inline"><input type="checkbox" name="image_only" ${preset.image_only ? "checked" : ""}>Image-based only</label><label class="check-inline"><input type="checkbox" name="pyq_only" ${preset.pyq_only ? "checked" : ""}>Previous-year bank only</label></div><p class="field-hint">Difficulty and clinical/high-yield tags are not included in these exports, so the app does not invent them. System-wise BTR modules are grouped as Integrated systems; mixed tests remain Mixed subjects.</p></section>
      <section class="form-section"><h2>04 &nbsp; Set your session</h2><p>Tutor mode teaches as you go. Exam mode keeps answers hidden until you finish.</p>
        <div class="field"><label for="module-title">Module name</label><input id="module-title" type="text" name="title" maxlength="140" required value="${esc(preset.title || (preset.status === "incorrect" ? "Mistake revision" : preset.status === "bookmarked" ? "Bookmark revision" : "My custom module"))}"></div>
        <div class="mode-options"><label class="mode-card"><input type="radio" name="mode" value="tutor" checked><span><strong>Tutor mode</strong><small>Check each answer and learn from its explanation.</small></span></label><label class="mode-card"><input type="radio" name="mode" value="exam"><span><strong>Exam mode</strong><small>Save or change answers. Review after submitting.</small></span></label></div>
        <div class="form-grid"><div class="field"><label for="module-count">Number of questions</label><input id="module-count" name="count" type="number" min="1" value="${preset.count || 40}" required></div><div class="field"><label for="module-minutes">Time limit in minutes</label><input id="module-minutes" name="minutes" type="number" min="0" max="1440" value="0" required><span class="field-hint">0 = untimed. You can pause and resume.</span></div></div>
        <label class="check-inline"><input type="checkbox" name="shuffle" checked>Shuffle question order</label>
      </section></div><aside class="builder-summary"><div class="panel"><span class="badge brand">YOUR PRACTICE POOL</span><div class="pool-count" id="pool-count">...</div><p class="subtext">matching unique questions</p><div class="notice">Combine banks without repeating identical questions from the same platform.</div><div class="summary-line"><span>Scoring</span><strong>+4 correct / -1 incorrect</strong></div><div class="summary-line"><span>Skipped</span><strong>0 marks</strong></div><div class="summary-line"><span>Progress</span><strong>Saved automatically</strong></div><p class="notice error" id="builder-error" hidden></p><button class="button primary full" type="submit" id="start-module">${icon("play")} Start practice</button><p class="section-caption">All filters are combined. No matching questions? Broaden a selection.</p></div></aside></div></form>`;
  const form = document.querySelector("#builder-form");
  form.addEventListener("change", async event => {
    if (event.target.name === "source" || event.target.name === "subjects") await updateTopics();
    await updatePool();
  });
  let searchTimer;
  form.elements.search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => safe(updatePool), 250); });
  document.querySelector("#topic-search").addEventListener("input", renderTopics);
  form.addEventListener("submit", event => { event.preventDefault(); safe(startModule); });
  safe(async () => { await updateTopics(preset.topics || []); await updatePool(true); });
}
function renderTopics() {
  const select = document.querySelector("#topics");
  if (!select) return;
  const selected = new Set([...select.selectedOptions].map(e => e.value));
  const search = document.querySelector("#topic-search").value.toLowerCase();
  const topics = S.topics.filter(t => selected.has(t.id) || `${t.subject} ${t.title} ${t.topic}`.toLowerCase().includes(search));
  select.innerHTML = topics.map(t => `<option value="${t.id}" ${selected.has(t.id) ? "selected" : ""}>${esc(t.subject)} / ${esc(t.title)}${S.summary.sources.find(s => s.id === t.source_id) ? ` [${esc(S.summary.sources.find(s => s.id === t.source_id).name)}]` : ""}</option>`).join("");
  document.querySelector("#topic-count").textContent = `(${fmt(topics.length)} shown)`;
}
async function updateTopics(selected = []) {
  const sequence = ++S.builderSeq;
  const filters = collectFilters();
  const result = await api(`/api/topics?filters=${encodeURIComponent(JSON.stringify(filters))}`);
  if (sequence !== S.builderSeq || !document.querySelector("#builder-form")) return;
  S.topics = result.topics;
  renderTopics();
  for (const option of document.querySelector("#topics").options) option.selected = selected.includes(option.value);
  const year = document.querySelector("#question-year");
  const previous = year.value;
  year.innerHTML = '<option value="">All years</option>' + result.years.map(y => `<option ${y === previous ? "selected" : ""}>${esc(y)}</option>`).join("");
}
let poolSeq = 0;
async function updatePool(initial = false) {
  const sequence = ++poolSeq;
  if (!document.querySelector("#builder-form")) return;
  const filters = collectFilters();
  const { count } = await api("/api/pool", { filters });
  if (sequence !== poolSeq || !document.querySelector("#builder-form")) return;
  S.pool = count;
  document.querySelector("#pool-count").textContent = fmt(count);
  const number = document.querySelector("#module-count");
  number.max = count || 1;
  if (initial || Number(number.value) > count) number.value = Math.max(1, Math.min(Number(number.value), count));
  document.querySelector("#start-module").disabled = count === 0;
  document.querySelector("#builder-error").hidden = true;
}
async function startModule() {
  const form = document.querySelector("#builder-form");
  const start = document.querySelector("#start-module");
  start.disabled = true;
  try {
    const session = await api("/api/sessions", {
      filters: collectFilters(), title: form.elements.title.value, count: Number(form.elements.count.value),
      minutes: Number(form.elements.minutes.value), mode: form.elements.mode.value, shuffle: form.elements.shuffle.checked,
    });
    location.hash = `session/${session.id}`;
  } catch (error) {
    const element = document.querySelector("#builder-error");
    element.textContent = error.message; element.hidden = false; start.disabled = false;
  }
}
function openBuilder(preset) {
  S.builderPreset = preset;
  if (location.hash === "#builder") safe(route);
  else location.hash = "builder";
}

async function collection(kind) {
  const isBookmark = kind === "bookmarked";
  main.innerHTML = heading(isBookmark ? "Worth another look." : "Your mistakes are your next wins.",
    isBookmark ? "Your saved questions, ready whenever you are." : "Questions last answered incorrectly. A correct retry removes them from this notebook.",
    button("Build revision module", "revision", `data-kind="${kind}"`, "primary", "sliders"))
    + `<div class="search-toolbar"><input type="search" id="collection-search" aria-label="Search saved questions" placeholder="Search questions or topics..." value="${esc(S.collectionSearch)}"><span id="collection-count" class="subtext"></span></div><div id="collection-list"></div>`;
  let timer;
  document.querySelector("#collection-search").addEventListener("input", event => {
    S.collectionSearch = event.target.value; S.collectionOffset = 0;
    clearTimeout(timer); timer = setTimeout(() => safe(() => loadCollection(kind)), 200);
  });
  await loadCollection(kind);
}
let collectionSeq = 0;
async function loadCollection(kind) {
  const sequence = ++collectionSeq;
  const result = await api(`/api/collection?kind=${kind}&offset=${S.collectionOffset}&search=${encodeURIComponent(S.collectionSearch)}`);
  if (sequence !== collectionSeq || !document.querySelector("#collection-list")) return;
  document.querySelector("#collection-count").textContent = `${fmt(result.total)} questions`;
  document.querySelector("#collection-list").innerHTML = result.items.length
    ? result.items.map(q => `<article class="collection-card"><div class="collection-body"><div class="badge-row"><span class="badge brand">${esc(q.platform)}</span><span class="badge">${q.attempts} attempt${q.attempts === 1 ? "" : "s"}</span>${q.last_correct === 0 ? '<span class="badge red">Last answer incorrect</span>' : ""}</div><h3>${esc(q.stem.slice(0, 650) || "Image-based question")}${q.stem.length > 650 ? "..." : ""}</h3></div><div class="collection-actions">${button("Practice", "single", `data-id="${q.id}"`, "small", "play")}${button(q.bookmarked ? "Unbookmark" : "Bookmark", "collection-bookmark", `data-id="${q.id}" data-value="${q.bookmarked ? "false" : "true"}" data-kind="${kind}"`, "small", "bookmark")}</div></article>`).join("") + pagination(result, "collection-page", `data-kind="${kind}"`)
    : empty(kind === "bookmarked" ? "Nothing bookmarked yet" : "A clean mistake notebook", kind === "bookmarked" ? "Tap the bookmark icon on any practice question to save it here." : "Incorrect checked answers appear here. Keep practicing, then come back for a focused retry.", kind === "bookmarked" ? "bookmark" : "check");
}
function pagination(result, action, extra = "") {
  if (result.total <= 30) return "";
  return `<div class="pagination">${button("Previous", action, `${extra} data-offset="${Math.max(0, result.offset - 30)}" ${result.offset === 0 ? "disabled" : ""}`, "small")}<span>${result.offset + 1}-${Math.min(result.offset + 30, result.total)} of ${fmt(result.total)}</span>${button("Next", action, `${extra} data-offset="${result.offset + 30}" ${result.offset + 30 >= result.total ? "disabled" : ""}`, "small")}</div>`;
}

function images(urls) {
  return urls?.length ? `<div class="question-images">${urls.map((url, i) => `<div class="image-wrap"><img src="${esc(url)}" alt="Question illustration ${i + 1}" loading="lazy" referrerpolicy="no-referrer" data-zoom="true"></div>`).join("")}</div>` : "";
}
function navigator(session) {
  const start = Math.floor(session.current_index / 50) * 50;
  S.navStart = start;
  return `<div class="navigator-heading"><span>Question navigator</span><span class="subtext">${session.answered}/${session.count}</span></div>
    <div class="navigator-grid">${session.question_ids.slice(start, start + 50).map((qid, i) => {
      const index = start + i;
      const answered = Object.hasOwn(session.selections, qid);
      const outcome = session.results?.[qid];
      return `<button class="nav-question ${outcome === true ? "correct" : outcome === false ? "incorrect" : answered ? "answered" : ""} ${session.current_index === index ? "current" : ""} ${session.review_flags.includes(qid) ? "flagged" : ""}" data-action="question" data-index="${index}" aria-label="Question ${index + 1}${answered ? ", answered" : ", unanswered"}${session.review_flags.includes(qid) ? ", flagged" : ""}" ${session.current_index === index ? 'aria-current="step"' : ""}>${index + 1}</button>`;
    }).join("")}</div>${session.count > 50 ? `<div class="navigator-pages">${button("<", "question", `data-index="${Math.max(0, start - 50)}" ${start === 0 ? "disabled" : ""}`, "small")}<span>${start + 1}-${Math.min(start + 50, session.count)}</span>${button(">", "question", `data-index="${start + 50}" ${start + 50 >= session.count ? "disabled" : ""}`, "small")}</div>` : ""}
    <div class="nav-legend"><span><i></i>Answered</span><span><i class="flag"></i>Flagged</span><span><i class="blank"></i>Unanswered</span></div>`;
}
async function loadSession(id) {
  await saveNotes();
  const sequence = S.routeSeq;
  const session = await api(`/api/sessions/${id}`);
  const question = await api(`/api/sessions/${id}/question?index=${session.current_index}`);
  if (sequence !== S.routeSeq) return;
  S.session = session; S.question = question; S.draft = question.selected;
  renderPractice();
}
function renderPractice() {
  const s = S.session, q = S.question;
  const completed = s.status === "completed";
  const paused = s.status === "paused";
  const locked = completed || paused || (s.mode === "tutor" && q.revealed);
  const selected = S.draft;
  const flagged = s.review_flags.includes(q.id);
  main.innerHTML = heading(s.title, `${s.mode === "tutor" ? "Tutor" : "Exam"} mode · ${fmt(s.count)} questions · ${completed ? "Completed session review" : "Progress is saved on this device"}`,
    completed ? `<a href="#results/${s.id}" class="button">Session results ${icon("arrow")}</a>` : button("Back to overview", "leave-session"), "PRACTICE")
    + `<div class="practice-layout"><div>
      ${paused ? `<section class="panel paused-panel">${icon("pause")}<h2>Take a breath.</h2><p>Your session is paused. Your answers and remaining time are saved.</p>${button("Resume session", "resume", "", "primary", "play")}</section>` : `
      <section class="panel question-panel"><div class="question-top"><span class="question-label">QUESTION ${q.index + 1} OF ${fmt(s.count)}</span><div class="question-tools"><button class="icon-button ${q.bookmarked ? "selected" : ""}" data-action="bookmark" aria-label="${q.bookmarked ? "Remove bookmark" : "Bookmark question"}" aria-pressed="${!!q.bookmarked}">${icon("bookmark")}</button>${!completed ? `<button class="icon-button ${flagged ? "selected" : ""}" data-action="flag" aria-label="${flagged ? "Remove review flag" : "Flag for review"}" aria-pressed="${flagged}">${icon("flag")}</button>` : ""}</div></div>
      <div class="badge-row"><span class="badge brand">${esc(q.platform)}</span><span class="badge">${esc(q.sources[0]?.subject || "Mixed subjects")}</span>${q.image_based ? '<span class="badge">Image-based</span>' : ""}${q.attempts ? `<span class="badge">${q.attempts} checked attempt${q.attempts === 1 ? "" : "s"}</span>` : ""}</div>
      <div class="question-stem">${q.stem_html}</div>${images(q.images)}
      <div class="option-list" role="group" aria-label="Answer options">${q.options.map((o, i) => `<button class="option ${selected === i ? "selected" : ""} ${q.revealed && i === q.correct_index ? "correct" : q.revealed && selected === i ? "incorrect" : ""}" data-action="option" data-index="${i}" aria-pressed="${selected === i}" ${locked ? "disabled" : ""}><span class="option-label">${String.fromCharCode(65 + i)}</span><span class="option-html">${o.html}</span>${q.revealed && i === q.correct_index ? '<span class="option-outcome">Correct answer</span>' : ""}</button>`).join("")}</div>
      ${s.mode === "exam" && !completed ? '<p class="notice">Answers are saved when selected. Correct answers and explanations stay hidden until you finish.</p>' : ""}
      <div class="question-footer">${button("Previous", "question", `data-index="${q.index - 1}" ${q.index === 0 ? "disabled" : ""}`)}<div>
      ${s.mode === "tutor" && !q.revealed ? button("Check answer", "check-answer", selected == null ? "disabled" : "", "primary", "check") : ""}
      ${q.index + 1 < s.count ? button("Next question", "question", `data-index="${q.index + 1}"`, q.revealed || s.mode === "exam" ? "primary" : "", "arrow") : !completed ? button("Finish session", "finish", "", q.revealed || s.mode === "exam" ? "primary" : "") : ""}
      </div></div><p class="keyboard-hint"><kbd>1</kbd>-<kbd>${q.options.length}</kbd> choose &nbsp; <kbd>Enter</kbd> check / next &nbsp; <kbd>B</kbd> bookmark &nbsp; <kbd>F</kbd> flag &nbsp; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> navigate</p></section>
      ${q.revealed ? `<section class="panel explanation-panel"><div class="feedback-heading">${q.selected == null ? '<span class="badge amber">Skipped</span>' : q.selected === q.correct_index ? '<span class="badge green">Correct · +4</span>' : '<span class="badge red">Incorrect · -1</span>'}<strong>Answer & explanation</strong></div><div class="rich-content">${q.explanation || "<p>No explanation was included in this source.</p>"}</div>${images(q.explanation_images)}${q.video ? `<details><summary>Original video resource</summary><p class="section-caption">Requires internet and may need original-platform access. Stream compatibility depends on your browser.</p><video controls preload="none" class="full"><source src="${esc(q.video)}"></video><a href="${esc(q.video)}" target="_blank" rel="noopener noreferrer">Open original video link</a></details>` : ""}</section>` : ""}
      <section class="panel question-meta"><details><summary>Question sources & original modules</summary>${q.sources.map(source => `<div class="source-chip"><strong>${esc(source.name)}</strong><br>${esc(source.subject)} / ${esc(source.title)}${source.topic !== source.title ? `<br>${esc(source.topic)}` : ""}</div>`).join("")}<p class="subtext">Original question ID: ${esc(q.original_id)}</p></details></section>`}
    </div><aside class="practice-sidebar"><div>
      <section class="panel"><div class="subtext">${s.duration_seconds ? "TIME REMAINING" : "SESSION"}</div><div class="timer" id="session-timer">${s.duration_seconds ? "--:--" : "Untimed"}</div><progress value="${s.answered}" max="${s.count}" aria-label="Session completion"></progress><div class="progress-label"><span>${s.answered} answered</span><span>${percent(s.answered, s.count)}%</span></div></section>
      <section class="panel">${navigator(s)}<div class="session-controls">${!completed ? button(paused ? "Resume" : "Pause session", paused ? "resume" : "pause", "", "full", paused ? "play" : "pause") + button("Finish & review", "finish", "", "full") : `<a class="button full soft" href="#results/${s.id}">View results</a>`}</div></section>
    </div><section class="panel"><h3>My notes</h3><p class="section-caption">Personal notes follow this question across sessions.</p><label for="question-notes" class="sr-only">Notes for this question</label><textarea class="notes-area" id="question-notes" rows="6" maxlength="20000" placeholder="A clue, a concept, a reminder...">${esc(q.notes)}</textarea><span class="subtext" id="note-status">Saved locally</span></section></aside></div>`;
  document.querySelector("#question-notes").addEventListener("input", () => {
    clearTimeout(S.noteTimer);
    document.querySelector("#note-status").textContent = "Saving...";
    S.noteTimer = setTimeout(() => safe(saveNotes), 500);
  });
  updateTimer();
}
async function saveNotes() {
  clearTimeout(S.noteTimer);
  const textarea = document.querySelector("#question-notes");
  if (!textarea || !S.question || textarea.value === S.question.notes) return;
  const q = S.question, value = textarea.value;
  await api(`/api/questions/${q.id}/state`, { notes: value });
  q.notes = value;
  if (S.question === q && document.querySelector("#note-status")) document.querySelector("#note-status").textContent = "Saved locally";
}
async function navigateQuestion(index) {
  await saveNotes();
  const s = S.session;
  if (!s || index < 0 || index >= s.count) return;
  S.session = await api(`/api/sessions/${s.id}/navigate`, { index });
  S.question = await api(`/api/sessions/${s.id}/question?index=${index}`);
  S.draft = S.question.selected;
  renderPractice();
  document.querySelector(".question-label")?.scrollIntoView({ block: "nearest", behavior: "auto" });
}
let expiring = false;
function updateTimer() {
  const element = document.querySelector("#session-timer");
  const s = S.session;
  if (!element || !s || !s.duration_seconds) return;
  if (s.status === "completed") { element.textContent = "Finished"; return; }
  const seconds = Math.max(0, Math.ceil(s.status === "paused" ? s.remaining_seconds : (s.deadline - Date.now() / 1000)));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), sec = seconds % 60;
  element.textContent = `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}${s.status === "paused" ? " · paused" : ""}`;
  element.classList.toggle("low", seconds < 60 && s.status === "active");
  if (seconds === 0 && s.status === "active" && !expiring) {
    expiring = true;
    safe(async () => {
      try { await saveNotes(); await api(`/api/sessions/${s.id}/finish`, {}); toast("Time is up. Your saved answers have been submitted."); location.hash = `results/${s.id}`; }
      finally { expiring = false; }
    });
  }
}
setInterval(updateTimer, 1000);

async function results(id) {
  const sequence = S.routeSeq;
  const session = await api(`/api/sessions/${id}`);
  if (sequence !== S.routeSeq) return;
  if (session.status !== "completed") { location.hash = `session/${id}`; return; }
  S.session = session;
  const s = session, accuracy = percent(s.correct, s.answered);
  main.innerHTML = heading("Every session is a step forward.", s.title, button("Create another module", "new-module", "", "primary", "plus"), "SESSION RESULTS")
    + `<div class="result-banner"><div class="score-ring"><strong>${accuracy}%</strong><span>answer accuracy</span></div><div><h2>${s.answered ? accuracy >= 80 ? "Strong work. Keep building." : "Now you know what to revisit." : "A starting point, not a setback."}</h2><p>${s.mode === "tutor" ? "Tutor" : "Exam"} mode &middot; ${date(s.started_at)} &middot; ${s.count} questions</p><div class="badge-row"><span class="badge brand">${s.score} / ${s.maximum} marks</span><span class="badge">+4 correct / -1 incorrect / 0 skipped</span></div></div></div>
    <div class="stats-grid">${stat("Correct", fmt(s.correct), "Concepts getting stronger", "check", "green")}${stat("Incorrect", fmt(s.incorrect), "Your next revision focus", "refresh", "red")}${stat("Skipped", fmt(s.skipped), "Worth coming back to", "clock", "amber")}${stat("Answered", `${s.answered}/${s.count}`, `${percent(s.answered, s.count)}% completion`, "target")}</div>
    <section class="panel"><div class="panel-heading"><h2>Review your questions</h2>${button("Retry this session", "retry", "", "small", "refresh")}</div><div class="result-filters">${[["all", "All"], ["incorrect", "Incorrect"], ["correct", "Correct"], ["skipped", "Skipped"]].map(([kind, text]) => button(text, "review-filter", `data-kind="${kind}"`, S.reviewKind === kind ? "small soft" : "small")).join("")}</div><div id="review-list"></div></section>`;
  await loadReview(id);
}
async function loadReview(id) {
  const result = await api(`/api/sessions/${id}/review?kind=${S.reviewKind}&offset=${S.reviewOffset}`);
  if (!document.querySelector("#review-list") || S.session?.id !== id || S.route !== "results") return;
  document.querySelector("#review-list").innerHTML = result.items.length
    ? result.items.map(q => `<div class="result-row"><span class="result-number">${q.index + 1}.</span><p>${esc(q.stem.slice(0, 200) || "Image-based question")}${q.stem.length > 200 ? "..." : ""}</p><span class="badge ${q.correct === true ? "green" : q.correct === false ? "red" : "amber"}">${q.correct === true ? "Correct" : q.correct === false ? "Incorrect" : "Skipped"}</span>${button("Review", "review-question", `data-index="${q.index}"`, "small", "arrow")}</div>`).join("") + pagination(result, "review-page")
    : empty("Nothing in this group", "Choose another filter to review the rest of your session.", "check", "");
}
async function history() {
  const sequence = S.routeSeq;
  const { sessions } = await api("/api/history");
  if (sequence !== S.routeSeq) return;
  main.innerHTML = heading("Your practice, over time.", "Resume a saved module or review a completed one. Every session has its own answers and review flags.")
    + `<section class="panel">${sessionRows(sessions)}</section>`;
}
function settings() {
  main.innerHTML = heading("Your data. Your space.", "A local, single-user study app. No account, trackers, or cloud question-bank uploads.")
    + `<div class="settings-grid"><section class="panel"><h2>Keep your progress safe</h2><p>Bookmarks, notes, checked answers and sessions are stored privately on this device, inside this app's browser storage. Clearing website data, uninstalling the app or using private browsing removes them.</p><p>Export a progress backup regularly and before changing devices. Restore replaces current progress and needs the same banks imported first. Running sessions restore paused.</p><div class="backup-actions">${button("Export progress", "backup", "", "primary", "download")}${button("Restore progress", "restore", "", "", "upload")}<input type="file" id="restore-file" accept=".json,application/json" hidden></div></section>
    <section class="panel"><h2>How revision works</h2><ul><li>Bookmarks are manual and stay saved until you remove them.</li><li>Mistakes contain questions whose latest checked answer was incorrect. A correct retry clears the mistake, not its history.</li><li>Tutor answers are graded when checked. Exam answers are graded only when submitted or time expires.</li><li>Skipped questions never count as incorrect.</li><li>Same-platform duplicates share progress. Cross-platform questions and answer/image variants stay separate.</li><li>Scores use +4 / -1 / 0. Accuracy uses answered questions only.</li></ul></section>
    <section class="panel"><h2>Images & offline use</h2><p>Question text, options, explanations and progress work offline once imported. Many original illustrations and videos are remote URLs and require internet or original-platform access.</p><p>Broken images are clearly marked; the app does not substitute invented illustrations. Protected or unavailable streams cannot be unlocked here.</p><p>Nothing is uploaded: the app has no server, account or cross-device sync. Use progress backups to move between devices.</p></section>
    <section class="panel"><h2>Feature references & source limits</h2><p>The module workflow draws on Marrow's publicly described subject, tag and revision filters, plus Reflex's public descriptions of tagged PYQs, custom tests, bookmarks, notes and analysis. This is an independent interface, not a clone.</p><p><a href="https://www.marrow.com/" target="_blank" rel="noopener noreferrer">Marrow feature overview</a> &middot; <a href="https://www.marrow.com/how-to-use-qbank-document" target="_blank" rel="noopener noreferrer">Marrow Qbank guide</a> &middot; <a href="https://reflexprep.com/faq" target="_blank" rel="noopener noreferrer">Reflex FAQ</a></p><p>No difficulty ratings or clinical/high-yield tags were present in your exports. Years are parsed only from module titles, not assumed. No ranks or clinical correctness claims are generated.</p><p>Use only material you are entitled to study. Original platform ownership and access restrictions remain unchanged. Do not publish or redistribute the imported question banks.</p></section></div>`;
  document.querySelector("#restore-file").addEventListener("change", event => safe(async () => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm("Replace all current progress with this backup? Export your current progress first if you need to keep it.")) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw new Error("This file is not valid JSON."); }
    await api("/api/restore", data); await refreshSummary(); toast("Progress restored. Running sessions are paused.");
  }));
}

const bytes = n => n == null ? "unknown" : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(0, Math.round(n / 1e6))} MB`;
let importing = false;
async function importPage() {
  const sequence = S.routeSeq;
  const storage = await api("/api/storage");
  if (sequence !== S.routeSeq) return;
  const d = S.summary;
  main.innerHTML = heading("Bring your banks in.", "Choose one or more HTML question-bank files. They are read and stored only on this device. Nothing is uploaded.", "", "IMPORT")
    + `<div class="settings-grid"><section class="panel"><h2>Import HTML question banks</h2><p>Supported: exports that contain an embedded <code>TESTS_LIST</code> array, including Marrow, Core BTR and Cerebellum banks. On iPad or iPhone, tap the button and choose files from Files, iCloud Drive or Downloads.</p>
      <label class="button primary file-button ${importing ? "disabled" : ""}">${icon("upload")} Choose HTML files<input type="file" id="import-files" multiple accept=".html,.htm,text/html" ${importing ? "disabled" : ""}></label>
      <p class="field-hint">Large banks (90 MB) can take a few minutes. Keep this screen open until every file shows a result. Re-importing an updated file replaces that bank and keeps your progress on matching questions.</p><div id="import-log" aria-live="polite"></div></section>
    <section class="panel"><h2>Imported banks</h2>${d.sources.length ? d.sources.map(s => `<div class="source-row"><span class="platform-icon ${platformClass(s.platform)}">${esc(s.platform[0])}</span><div class="source-info"><div class="source-name">${esc(s.name)}</div><div class="source-detail">${esc(s.filename)} &middot; ${fmt(s.question_count)} MCQs &middot; ${fmt(s.tests)} modules</div></div>${button("Remove", "remove-source", `data-id="${s.id}" data-name="${esc(s.name)}"`, "small")}</div>`).join("") : '<p class="subtext">No banks imported yet.</p>'}
      <p class="section-caption">${fmt(d.total)} unique questions in your library.</p></section>
    <section class="panel"><h2>Device storage</h2><p>Used by Orbit: <strong>${bytes(storage.usage)}</strong>${storage.quota ? ` of about ${bytes(storage.quota)} available to this app` : ""}.</p><p>${storage.persisted ? "Storage is marked persistent, so the browser will not clear it automatically." : "Tip: on iPad/iPhone, add Orbit to your Home Screen (Share → Add to Home Screen) so storage is kept, and export progress backups regularly."}</p></section>
    <section class="panel"><h2>Start over</h2><p>Erase every imported bank, bookmark, note and session from this device. Export a progress backup first if you want to keep it.</p>${button("Erase all data on this device", "erase-all", "", "danger")}</section></div>`;
  document.querySelector("#import-files").addEventListener("change", event => safe(() => importFiles([...event.target.files])));
}
async function importFiles(files) {
  if (!files.length || importing) return;
  importing = true;
  const log = document.querySelector("#import-log"), input = document.querySelector("#import-files");
  if (input) { input.disabled = true; input.closest("label").classList.add("disabled"); }
  let lock = null;
  try { lock = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
  const rows = files.map(file => {
    const row = document.createElement("div");
    row.className = "import-row";
    row.innerHTML = `<div class="import-name"><strong></strong><span class="subtext">Waiting...</span></div><progress max="100" value="0"></progress>`;
    row.querySelector("strong").textContent = file.name;
    log?.append(row);
    return row;
  });
  let ok = 0;
  try {
    for (const [i, file] of files.entries()) {
      const row = rows[i], status = row.querySelector(".subtext"), bar = row.querySelector("progress");
      if (!/\.html?$/i.test(file.name)) { status.textContent = "Skipped: choose .html files."; row.classList.add("failed"); continue; }
      try {
        const result = await OrbitStore.importFile(file, p => {
          if (p.phase === "reading") { bar.value = Math.min(99, Math.round(p.bytes / Math.max(1, file.size) * 100)); status.textContent = `Reading · ${fmt(p.questions)} questions`; }
          else if (p.phase === "saving") { bar.value = 99; status.textContent = "Saving..."; }
          else status.textContent = "Checking...";
        });
        bar.value = 100; ok++;
        row.classList.add("done");
        status.textContent = result.unchanged ? `${result.name}: already imported, unchanged.` : `${result.name}: ${fmt(result.entries)} entries · ${fmt(result.unique)} unique MCQs · ${fmt(result.tests)} modules`;
      } catch (error) {
        console.error(error);
        row.classList.add("failed");
        status.textContent = `Not imported: ${error.message || error}`;
      }
    }
  } finally {
    importing = false;
    lock?.release?.().catch(() => {});
    await refreshSummary();
  }
  toast(ok ? `${ok} of ${files.length} file${files.length === 1 ? "" : "s"} imported. Your library is ready.` : "No files were imported.", !ok);
  if (S.route === "import") {
    const logged = document.querySelector("#import-log")?.innerHTML;
    await importPage();
    if (logged && document.querySelector("#import-log")) document.querySelector("#import-log").innerHTML = logged;
  }
}
async function saveBackup(data) {
  const name = `orbit-progress-${new Date().toISOString().slice(0, 10)}.json`, text = JSON.stringify(data);
  const blob = new Blob([text], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  if (window.Capacitor?.isNativePlatform?.() || /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Orbit progress backup" }); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
window.addEventListener("beforeunload", event => { if (importing) { event.preventDefault(); event.returnValue = ""; } });

async function safe(action) {
  try { await action(); }
  catch (error) { console.error(error); toast(error.message || "Something went wrong. Reload the app and try again.", true); }
}
async function route() {
  await saveNotes();
  const sequence = ++S.routeSeq;
  const [page = "dashboard", id] = (location.hash.slice(1) || "dashboard").split("/");
  S.route = page;
  if (page !== "session" && page !== "results") { S.session = null; S.question = null; }
  document.querySelector("#sidebar").classList.remove("open");
  document.querySelectorAll("[data-nav]").forEach(e => e.classList.toggle("active", e.dataset.nav === page || (e.dataset.nav === "history" && ["session", "results"].includes(page))));
  const names = { dashboard: "Overview", library: "Question library", tests: "Original tests", builder: "Custom modules", bookmarks: "Bookmarks", mistakes: "Mistake notebook", history: "Session history", session: "Practice", results: "Session results", settings: "Data & settings", import: "Import banks" };
  document.querySelector("#breadcrumb").textContent = `Workspace / ${names[page] || "Overview"}`;
  main.innerHTML = '<div class="loading"><span class="spinner"></span>Loading your workspace...</div>';
  await refreshSummary();
  if (sequence !== S.routeSeq) return;
  if (!S.summary.total && !["settings", "import"].includes(page)) {
    main.innerHTML = empty("Your library is ready to fill", "Import your HTML question-bank files from Files, Downloads or iCloud Drive. They are processed and stored only on this device.", "upload", '<a class="button primary" href="#import">Import question banks</a>');
    return;
  }
  if (page === "dashboard") await dashboard();
  else if (page === "tests") {
    main.innerHTML = heading("Your original tests.", "Browse a bank, choose a subject and open a test. No custom module setup needed.") + '<section class="panel" id="original-tests"></section>';
    await testBrowser(document.querySelector("#original-tests"), id || "");
  }
  else if (page === "library") library();
  else if (page === "builder") { const preset = S.builderPreset || {}; S.builderPreset = null; builder(preset); }
  else if (page === "bookmarks" || page === "mistakes") { S.collectionOffset = 0; S.collectionSearch = ""; await collection(page === "bookmarks" ? "bookmarked" : "incorrect"); }
  else if (page === "history") await history();
  else if (page === "session" && id) await loadSession(id);
  else if (page === "results" && id) { S.reviewKind = "all"; S.reviewOffset = 0; await results(id); }
  else if (page === "settings") settings();
  else if (page === "import") await importPage();
  else { location.hash = "dashboard"; return; }
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

document.addEventListener("click", event => {
  const image = event.target.closest("img");
  if (image && image.id !== "zoom-image" && main.contains(image)) {
    document.querySelector("#zoom-image").src = image.src;
    document.querySelector("#image-dialog").showModal(); return;
  }
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  event.preventDefault();
  const action = target.dataset.action;
  if (action === "menu") { document.querySelector("#sidebar").classList.toggle("open"); return; }
  if (action === "theme") {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("orbit-theme", dark ? "dark" : "light"); return;
  }
  if (action === "close-image") { document.querySelector("#image-dialog").close(); return; }
  if (S.busy) return;
  S.busy = true;
  const controlStates = [...main.querySelectorAll("button[data-action]")].map(element => [element, element.disabled]);
  controlStates.forEach(([element]) => { element.disabled = true; });
  safe(async () => {
    try {
      if (action === "retry-load") await route();
      else if (action === "source") location.hash = `tests/${target.dataset.id}`;
      else if (action === "open-test") {
        const session = await api(`/api/modules/${target.dataset.id}/start`, { mode: target.dataset.mode });
        location.hash = `${session.status === "completed" ? "results" : "session"}/${session.id}`;
      }
      else if (action === "subject") openBuilder({ subjects: [target.dataset.subject] });
      else if (action === "new-module") openBuilder({});
      else if (action === "revision") openBuilder({ status: target.dataset.kind });
      else if (action === "single") {
        const session = await api("/api/sessions", { title: "Focused revision", count: 1, filters: { question_ids: [target.dataset.id] } });
        location.hash = `session/${session.id}`;
      } else if (action === "collection-page") {
        S.collectionOffset = Number(target.dataset.offset); await loadCollection(target.dataset.kind);
      } else if (action === "collection-bookmark") {
        await api(`/api/questions/${target.dataset.id}/state`, { bookmarked: target.dataset.value === "true" });
        await refreshSummary(); await loadCollection(target.dataset.kind);
      } else if (action === "backup") {
        await saveBackup(await api("/api/backup")); toast("Progress backup ready.");
      } else if (action === "restore") document.querySelector("#restore-file").click();
      else if (action === "remove-source") {
        if (!confirm(`Remove ${target.dataset.name} from this device? Progress on questions that only exist in this bank is kept with your sessions but they leave the library.`)) return;
        await api(`/api/sources/${target.dataset.id}/delete`, {}); toast("Bank removed."); await route();
      } else if (action === "erase-all") {
        if (!confirm("Erase all imported banks and all progress on this device? This cannot be undone.")) return;
        await OrbitStore.eraseAll(); toast("All Orbit data on this device was erased."); location.hash = "import"; await route();
      }
      else if (action === "leave-session") { await saveNotes(); location.hash = "dashboard"; }
      else if (action === "question") await navigateQuestion(Number(target.dataset.index));
      else if (action === "review-question") {
        await api(`/api/sessions/${S.session.id}/navigate`, { index: Number(target.dataset.index) });
        location.hash = `session/${S.session.id}`;
      } else if (action === "review-filter") {
        S.reviewKind = target.dataset.kind; S.reviewOffset = 0; await results(S.session.id);
      } else if (action === "review-page") {
        S.reviewOffset = Number(target.dataset.offset); await loadReview(S.session.id);
      } else if (action === "retry") {
        const s = S.session;
        const retry = await api("/api/sessions", { title: `Retry: ${s.title}`.slice(0, 140), count: s.count, mode: s.mode, filters: { question_ids: s.question_ids } });
        location.hash = `session/${retry.id}`;
      } else if (action === "option") {
        const selected = Number(target.dataset.index);
        await saveNotes();
        S.draft = selected;
        if (S.session.mode === "exam") {
          S.session = await api(`/api/sessions/${S.session.id}/answer`, { question_id: S.question.id, selected });
          S.question.selected = selected;
        }
        renderPractice();
      } else if (action === "check-answer") {
        if (S.draft == null) return;
        await saveNotes();
        S.session = await api(`/api/sessions/${S.session.id}/answer`, { question_id: S.question.id, selected: S.draft });
        S.question = await api(`/api/sessions/${S.session.id}/question?index=${S.question.index}`);
        await refreshSummary(); renderPractice();
      } else if (action === "bookmark") {
        const bookmarked = !S.question.bookmarked;
        await api(`/api/questions/${S.question.id}/state`, { bookmarked });
        S.question.bookmarked = bookmarked;
        target.classList.toggle("selected", bookmarked); target.setAttribute("aria-pressed", String(bookmarked));
        target.setAttribute("aria-label", bookmarked ? "Remove bookmark" : "Bookmark question");
        toast(bookmarked ? "Saved to bookmarks." : "Bookmark removed."); await refreshSummary();
      } else if (action === "flag") {
        await saveNotes(); S.session = await api(`/api/sessions/${S.session.id}/flag`, { question_id: S.question.id }); renderPractice();
      } else if (action === "pause" || action === "resume") {
        await saveNotes(); S.session = await api(`/api/sessions/${S.session.id}/${action}`, {}); renderPractice();
      } else if (action === "finish") {
        const s = S.session;
        if (!confirm(`Finish this session? ${s.count - s.answered} unanswered question(s) will be marked skipped. ${s.mode === "exam" ? "Your saved exam answers will now be graded." : ""}`)) return;
        await saveNotes(); await api(`/api/sessions/${s.id}/finish`, {}); location.hash = `results/${s.id}`;
      }
    } finally {
      S.busy = false;
      controlStates.forEach(([element, disabled]) => { if (element.isConnected) element.disabled = disabled; });
    }
  });
});
document.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input,textarea,select") || document.querySelector("dialog[open]")) return;
  if (S.route !== "session" || !S.session || S.session.status === "paused") return;
  let target;
  const key = event.key.toLowerCase();
  if (/^[1-9]$/.test(key)) target = document.querySelector(`[data-action="option"][data-index="${Number(key) - 1}"]`);
  else if (key === "b") target = document.querySelector('[data-action="bookmark"]');
  else if (key === "f") target = document.querySelector('[data-action="flag"]');
  else if (key === "arrowright") target = document.querySelector(`[data-action="question"][data-index="${S.question.index + 1}"]`);
  else if (key === "arrowleft") target = document.querySelector(`[data-action="question"][data-index="${S.question.index - 1}"]`);
  else if (key === "enter" && event.target === document.body) target = document.querySelector('[data-action="check-answer"]') || document.querySelector(`[data-action="question"][data-index="${S.question.index + 1}"]`);
  if (target && !target.disabled) { event.preventDefault(); target.click(); }
});
document.addEventListener("error", event => {
  const target = event.target;
  if (target.tagName === "IMG" && main.contains(target)) {
    const warning = document.createElement("span");
    warning.className = "image-error";
    warning.textContent = "This original image could not load. Check internet access or original-platform availability.";
    target.replaceWith(warning);
  }
  if (target.tagName === "VIDEO" || target.tagName === "SOURCE") {
    const video = target.closest("video");
    if (video && !video.nextElementSibling?.classList.contains("image-error")) {
      const warning = document.createElement("span"); warning.className = "image-error";
      warning.textContent = "This stream could not play. Try the original video link; access may be restricted.";
      video.after(warning);
    }
  }
}, true);
document.querySelectorAll("[data-icon]").forEach(e => { e.innerHTML = icon(e.dataset.icon); });
document.documentElement.dataset.theme = localStorage.getItem("orbit-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
function routeSafely() {
  safe(async () => {
    try { await route(); }
    catch (error) {
      main.innerHTML = empty("Couldn't open this page", error.message, "refresh", button("Try again", "retry-load", "", "primary"));
      throw error;
    }
  });
}
window.addEventListener("hashchange", routeSafely);
routeSafely();
