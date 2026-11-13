const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto("http://127.0.0.1:8780/");
    const tests = Array.from({ length: 32 }, (_, i) => ({
      id: i, title: `Original test ${i}`, path: ["Anatomy"],
      questions: ["First", "Second"].map((text, j) => ({
        id: `${i}-${j}`, text: `${text} question ${i}`,
        options: [{ text: "Yes", correct: true }, { text: "No", correct: false }],
      })),
    }));
    await page.evaluate(async tests => {
      await OrbitStore.importFile(new File([`const TESTS_LIST = ${JSON.stringify(tests)};`], "marrow_qb.html"));
    }, tests);
    await page.reload();
    await page.locator("#test-list").waitFor();
    assert.equal(await page.locator('[data-action="open-test"][data-mode="tutor"]').count(), 30);
    assert.equal(await page.locator('[data-action="open-test"][data-mode="exam"]').count(), 30);
    await page.locator('[data-action="tests-page"]').filter({ hasText: "Next" }).click();
    assert.equal(await page.locator('[data-action="open-test"][data-mode="tutor"]').count(), 2);
    await page.fill("#test-search", "Original test 7");
    assert.equal(await page.locator('[data-action="open-test"][data-mode="tutor"]').count(), 1);
    await page.locator('[data-action="open-test"][data-mode="tutor"]').click();
    await page.waitForURL(/#session\//);
    await page.locator(".question-stem").waitFor();
    assert.match(await page.locator(".question-stem").innerText(), /First question 7/);
    const sessionId = page.url().split("/").pop();
    await page.locator('[data-action="question"][data-index="1"]').first().click();
    await page.waitForFunction(() => document.querySelector(".question-stem")?.textContent.includes("Second question 7"));
    assert.match(await page.locator(".question-stem").innerText(), /Second question 7/);
    await page.goto("http://127.0.0.1:8780/#dashboard");
    await page.fill("#test-search", "Original test 7");
    await page.locator('[data-action="open-test"][data-mode="tutor"]').click();
    await page.waitForURL(/#session\//);
    assert.equal(page.url().split("/").pop(), sessionId, "opening again resumes the same attempt");
    await page.locator(".question-stem").waitFor();
    assert.match(await page.locator(".question-stem").innerText(), /Second question 7/);
    await page.goto("http://127.0.0.1:8780/#dashboard");
    await page.fill("#test-search", "Original test 7");
    await page.locator('[data-action="open-test"][data-mode="exam"]').click();
    await page.waitForURL(/#session\//);
    await page.locator(".question-stem").waitFor();
    const examId = page.url().split("/").pop();
    assert.notEqual(examId, sessionId, "each mode maintains a separate session");
    assert.match(await page.locator(".page-heading").innerText(), /Exam mode/);
    await page.locator('[data-action="option"]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-action="option"][data-index="0"]')?.getAttribute("aria-pressed") === "true");
    assert.equal(await page.locator(".explanation-panel").count(), 0, "exam answers stay hidden");
    assert.equal((await page.evaluate(() => OrbitStore.api("/api/summary"))).attempted, 0, "exam answers are not graded until submission");
    await page.goto("http://127.0.0.1:8780/#dashboard");
    await page.fill("#test-search", "Original test 7");
    await page.locator('[data-action="open-test"][data-mode="exam"]').click();
    await page.waitForURL(/#session\//);
    assert.equal(page.url().split("/").pop(), examId, "exam mode resumes its own attempt");
    const exam = await page.evaluate(id => OrbitStore.api(`/api/sessions/${id}`), examId);
    assert.equal(exam.mode, "exam");
    assert.equal(exam.answered, 1);
    await page.evaluate(id => OrbitStore.api(`/api/sessions/${id}/finish`, {}), examId);
    assert.equal((await page.evaluate(() => OrbitStore.api("/api/summary"))).attempted, 1, "submitted exam answer is graded");
    const graded = await page.evaluate(id => OrbitStore.api(`/api/sessions/${id}/question?index=0`), examId);
    assert.equal(graded.revealed, true);
    assert.equal(graded.correct_index, 0);
    await page.goto(`http://127.0.0.1:8780/#session/${sessionId}`);
    await page.locator(".question-stem").waitFor();
    await page.locator('[data-action="option"]').first().click();
    await page.locator('[data-action="check-answer"]').click();
    await page.locator(".explanation-panel").waitFor();
    assert.equal((await page.evaluate(() => OrbitStore.api("/api/summary"))).attempted, 2, "tutor answers are graded immediately");
    await page.evaluate(id => OrbitStore.api(`/api/sessions/${id}/finish`, {}), sessionId);
    await page.goto("http://127.0.0.1:8780/#dashboard");
    await page.fill("#test-search", "Original test 7");
    await page.locator('[data-action="open-test"][data-mode="tutor"]').click();
    await page.waitForURL(/#session\//);
    assert.notEqual(page.url().split("/").pop(), sessionId, "a completed test gets a fresh attempt");
    const fresh = await page.evaluate(() => OrbitStore.api(`/api/sessions/${location.hash.split("/")[1]}`));
    assert.equal(fresh.count, 2);
    assert.deepEqual(fresh.selections, {});
    await page.goto("http://127.0.0.1:8780/#dashboard");
    await page.fill("#test-search", "Original test 7");
    await page.locator('[data-action="open-test"][data-mode="exam"]').click();
    await page.waitForURL(/#session\//);
    assert.notEqual(page.url().split("/").pop(), examId, "completed exam gets a fresh attempt");
    assert.notEqual(page.url().split("/").pop(), fresh.id, "exam does not resume the fresh tutor attempt");
    await page.goto("http://127.0.0.1:8780/#library");
    await page.locator('[data-action="source"]').click();
    await page.waitForURL(/#tests\//);
    await page.locator("#test-list").waitFor();
    assert.notEqual(await page.locator("#test-source").inputValue(), "");
    console.log("Original tests: tutor and exam selection, grading, resume and retry passed");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
