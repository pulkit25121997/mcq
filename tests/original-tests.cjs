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
    assert.equal(await page.locator('[data-action="open-test"]').count(), 30);
    await page.locator('[data-action="tests-page"]').filter({ hasText: "Next" }).click();
    assert.equal(await page.locator('[data-action="open-test"]').count(), 2);
    await page.fill("#test-search", "Original test 7");
    assert.equal(await page.locator('[data-action="open-test"]').count(), 1);
    await page.locator('[data-action="open-test"]').click();
    await page.waitForURL(/#session\//);
    await page.locator(".question-stem").waitFor();
    assert.match(await page.locator(".question-stem").innerText(), /First question 7/);
    const sessionId = page.url().split("/").pop();
    await page.locator('[data-action="question"][data-index="1"]').first().click();
    await page.waitForFunction(() => document.querySelector(".question-stem")?.textContent.includes("Second question 7"));
    assert.match(await page.locator(".question-stem").innerText(), /Second question 7/);
    await page.goto("http://127.0.0.1:8780/#dashboard");
    await page.fill("#test-search", "Original test 7");
    await page.locator('[data-action="open-test"]').click();
    await page.waitForURL(/#session\//);
    assert.equal(page.url().split("/").pop(), sessionId, "opening again resumes the same attempt");
    await page.locator(".question-stem").waitFor();
    assert.match(await page.locator(".question-stem").innerText(), /Second question 7/);
    await page.evaluate(id => OrbitStore.api(`/api/sessions/${id}/finish`, {}), sessionId);
    await page.goto("http://127.0.0.1:8780/#dashboard");
    await page.fill("#test-search", "Original test 7");
    await page.locator('[data-action="open-test"]').click();
    await page.waitForURL(/#session\//);
    assert.notEqual(page.url().split("/").pop(), sessionId, "a completed test gets a fresh attempt");
    const fresh = await page.evaluate(() => OrbitStore.api(`/api/sessions/${location.hash.split("/")[1]}`));
    assert.equal(fresh.count, 2);
    assert.deepEqual(fresh.selections, {});
    await page.goto("http://127.0.0.1:8780/#library");
    await page.locator('[data-action="source"]').click();
    await page.waitForURL(/#tests\//);
    await page.locator("#test-list").waitFor();
    assert.notEqual(await page.locator("#test-source").inputValue(), "");
    console.log("Original test browsing, pagination, order, resume and retry passed");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
