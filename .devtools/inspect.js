// dumps bounding-box size/min/max/animations/bones for a list of GLB files
// by actually loading them through Three.js's GLTFLoader in real headless
// Chrome - so composing kit pieces uses measured dimensions instead of
// guessed ones.
// Usage: node inspect.js file1.glb,file2.glb,... [base-path]
const { chromium } = require('playwright-core');

async function main() {
  const files = process.argv[2] || '';
  const base = process.argv[3] || '/assets/kenney/castle-kit/';
  const url = `http://127.0.0.1:8099/.devtools/inspect.html?files=${encodeURIComponent(files)}&base=${encodeURIComponent(base)}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  let result = null;
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.startsWith('INSPECT_RESULT:')) result = JSON.parse(t.slice('INSPECT_RESULT:'.length));
    else console.error('[console]', t);
  });
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));
  page.on('requestfailed', (req) => console.error('[requestfailed]', req.url(), req.failure()?.errorText));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('document.title === "DONE"', { timeout: 25000 });
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
