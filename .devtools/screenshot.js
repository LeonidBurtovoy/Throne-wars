// Local-only visual QA: boots a local match in real headless Chrome (via
// playwright-core, driving the already-installed system Chrome so no
// separate browser download is needed) and saves a screenshot of the 3D
// scene. Not part of the deployed game - lives in the gitignored
// .devtools/ folder purely so Claude can actually see the WebGL output
// instead of reasoning about it blind.
//
// Usage: node screenshot.js [outfile] [--wait=ms] [--faction=stark|targaryen] [--map=map1..4]

const { chromium } = require('playwright-core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const outfile = args.find((a) => !a.startsWith('--')) || 'shot.png';
  const waitMs = Number((args.find((a) => a.startsWith('--wait=')) || '--wait=3000').split('=')[1]);
  const faction = (args.find((a) => a.startsWith('--faction=')) || '--faction=stark').split('=')[1];
  const map = (args.find((a) => a.startsWith('--map=')) || '--map=map1').split('=')[1];
  const url = process.env.GAME_URL || 'http://127.0.0.1:8099/index.html';

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(url, { waitUntil: 'load' });
  await page.click(`#faction-select [data-faction="${faction}"]`);
  await page.click(`#map-select [data-map="${map}"]`);
  await page.click('#opponents-select [data-opponents="1"]');
  await page.click('#start-btn');
  await page.waitForTimeout(waitMs);

  const clipArg = args.find((a) => a.startsWith('--clip='));
  const shotOpts = { path: path.resolve(outfile) };
  if (clipArg) {
    const [x, y, width, height] = clipArg.split('=')[1].split(',').map(Number);
    shotOpts.clip = { x, y, width, height };
  }
  const outPath = shotOpts.path;
  await page.screenshot(shotOpts);
  await browser.close();

  console.log('SCREENSHOT_SAVED:', outPath);
  if (logs.length) console.log('---page console/errors---\n' + logs.join('\n'));
}

main().catch((err) => { console.error('SCRIPT_FAILED:', err); process.exit(1); });
