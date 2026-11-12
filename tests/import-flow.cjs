// End-to-end check: real HTML import, practice, bookmarks, mistakes, exam, backup/restore, persistence.
const { chromium, webkit } = require("playwright");
const assert = require("assert");
const path = require("path");
const UP = process.env.QBANK_DIR;
if (!UP) throw new Error("Set QBANK_DIR to the directory containing your own HTML exports.");
const files = (process.env.FILES || "old_corebtr-1.html,image_only_marrow_qb.html").split(",").map(f => path.join(UP, f));
(async () => {
  const engine = process.env.ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto("http://127.0.0.1:8780/");
  const digestCheck = await page.evaluate(async () => {
    const bytes = new Uint8Array(8 * 1024 * 1024);
    const changed = bytes.slice(); changed[4 * 1024 * 1024] = 1;
    return OrbitImporter.fileDigest(new File([bytes], "same.html"))
      !== OrbitImporter.fileDigest(new File([changed], "same.html"));
  });
  assert.ok(digestCheck, "file change detection must cover the whole file, not just its edges");
  await page.getByText("Your library is ready to fill").waitFor();
  await page.getByRole("link", { name: "Import question banks" }).click();
  const t0 = Date.now();
  await page.setInputFiles("#import-files", files);
  await page.waitForFunction(n => document.querySelectorAll(".import-row.done, .import-row.failed").length === n, files.length, { timeout: 30 * 60 * 1000, polling: 1000 });
  const rows = await page.$$eval(".import-row", rs => rs.map(r => r.innerText.replace(/\s+/g, " ")));
  console.log(`import ${((Date.now() - t0) / 1000).toFixed(1)}s`, rows);
  assert.strictEqual(await page.locator(".import-row.failed").count(), 0);
  const summary = await page.evaluate(() => OrbitStore.api("/api/summary"));
  console.log("summary", { total: summary.total, entries: summary.entries, modules: summary.module_count, sources: summary.sources.map(s => [s.name, s.question_count]) });
  if (process.env.SKIP_FLOW) { await browser.close(); return; }

  // Re-import is detected as unchanged.
  await page.setInputFiles("#import-files", files[0]);
  await page.waitForFunction(() => [...document.querySelectorAll(".import-row")].pop()?.innerText.includes("unchanged"), null, { timeout: 60000 });

  // Tutor session: answer wrong on purpose -> mistake; bookmark.
  await page.goto("http://127.0.0.1:8780/#builder");
  await page.locator("#pool-count").filter({ hasText: /\d/ }).waitFor();
  await page.fill("#module-count", "3");
  await page.click("#start-module");
  await page.waitForURL(/#session\//);
  const q = await page.evaluate(async () => { const id = location.hash.split("/")[1]; const s = await OrbitStore.api(`/api/sessions/${id}`); return s; });
  const correct = await page.evaluate(async id => (await OrbitStore.api("/api/sessions/" + id + "/question?index=0")).correct_index, q.id);
  assert.strictEqual(correct, undefined, "answer must be hidden before checking");
  await page.locator('[data-action="option"]').first().click();
  await page.click('[data-action="check-answer"]');
  await page.locator(".explanation-panel").waitFor();
  const wasCorrect = await page.locator(".explanation-panel .badge.green").count();
  await page.click('[data-action="bookmark"]');
  await page.fill("#question-notes", "remember this");
  await page.waitForTimeout(800);
  // Finish
  page.once("dialog", d => d.accept());
  await page.click('.session-controls [data-action="finish"]');
  await page.waitForURL(/#results\//);
  await page.locator(".score-ring").waitFor();
  const after = await page.evaluate(() => OrbitStore.api("/api/summary"));
  assert.strictEqual(after.bookmarks, 1);
  assert.strictEqual(after.attempted, 1);
  assert.strictEqual(after.mistakes, wasCorrect ? 0 : 1);

  // Exam mode with timer, pause/resume.
  await page.goto("http://127.0.0.1:8780/#builder");
  await page.locator("#pool-count").filter({ hasText: /\d/ }).waitFor();
  await page.fill("#module-count", "2"); await page.fill("#module-minutes", "5");
  await page.check('input[name="mode"][value="exam"]');
  await page.click("#start-module");
  await page.waitForURL(/#session\//);
  await page.locator('[data-action="option"]').nth(1).click();
  assert.strictEqual(await page.locator(".explanation-panel").count(), 0, "exam hides explanation");
  await page.click('.session-controls [data-action="pause"]');
  await page.getByText("Take a breath.").waitFor();
  await page.click('.session-controls [data-action="resume"]');
  page.once("dialog", d => d.accept());
  await page.click('.session-controls [data-action="finish"]');
  await page.waitForURL(/#results\//);

  // Bookmarks & mistakes pages + persistence after reload.
  await page.reload();
  await page.goto("http://127.0.0.1:8780/#bookmarks");
  await page.locator(".collection-card").first().waitFor();
  assert.strictEqual(await page.locator(".collection-card").count(), 1);
  const notes = await page.evaluate(async () => { const b = await OrbitStore.api("/api/backup"); return b.question_state.find(s => s.bookmarked).notes; });
  assert.strictEqual(notes, "remember this");

  // Backup -> modify -> restore.
  const backup = await page.evaluate(() => OrbitStore.api("/api/backup"));
  const mismatch = await page.evaluate(async b => {
    try { await OrbitStore.api("/api/restore", { ...b, sources: [] }); }
    catch (error) { return error.message; }
    return "";
  }, backup);
  assert.match(mismatch, /different question-bank files/);
  await page.evaluate(async id => OrbitStore.api(`/api/questions/${id}/state`, { bookmarked: false }), backup.question_state[0].question_id);
  await page.evaluate(b => OrbitStore.api("/api/restore", b), backup);
  assert.strictEqual((await page.evaluate(() => OrbitStore.api("/api/summary"))).bookmarks, 1);

  // Mobile layout smoke.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["dashboard", "library", "builder", "mistakes", "history", "import", "settings"]) {
    await page.goto(`http://127.0.0.1:8780/#${route}`);
    await page.locator(".page-heading").waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${route} overflows by ${overflow}px`);
  }
  await page.goto("http://127.0.0.1:8780/#dashboard");
  await page.locator(".page-heading").waitFor();
  await page.waitForFunction(() => document.querySelector("#sidebar").getBoundingClientRect().right <= 1);
  const mobile = await page.evaluate(() => ({
    width: innerWidth, scrollX,
    sidebar: document.querySelector("#sidebar").getBoundingClientRect().toJSON(),
    shell: document.querySelector(".shell").getBoundingClientRect().toJSON(),
  }));
  assert.ok(mobile.sidebar.right <= 1, `closed mobile sidebar remains visible: ${JSON.stringify(mobile)}`);
  await page.screenshot({ path: "tests/mobile-dashboard.png" });
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.goto("http://127.0.0.1:8780/#import");
  await page.locator(".page-heading").waitFor();
  await page.screenshot({ path: "tests/ipad-import.png" });
  assert.deepStrictEqual(errors, []);
  console.log("ALL FLOW CHECKS PASSED");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
