const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const svg = fs.readFileSync("www/favicon.svg", "utf8");
  const art = (pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${round}" fill="#6554d9"/><g transform="translate(${pad} ${pad}) scale(${(64 - 2 * pad) / 64})"><circle cx="32" cy="32" r="15" fill="none" stroke="#fff" stroke-width="7"/><circle cx="47" cy="18" r="6" fill="#c6ff8e"/></g></svg>`;
  const shots = [["icon-192.png", 192, svg], ["icon-512.png", 512, svg], ["apple-touch-icon.png", 180, art(4, 0)], ["maskable-512.png", 512, art(12, 0)],
    ["android-foreground-432.png", 432, art(18, 0).replace('<rect width="64" height="64" rx="0" fill="#6554d9"/>', "")]];
  for (const [name, size, content] of shots) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${content}`);
    await page.screenshot({ path: `www/icons/${name}`, omitBackground: true });
  }
  await browser.close();
})();
