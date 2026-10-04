// Visual parity: the stage (#stage) of every gear, drawn by the frozen legacy app and by the new build, at
// desktop and phone widths, compared pixel by pixel. Run after `npm run build`:
//   npm run test:visual [-- <gear id> ...] [-- --width 1280] [-- --threshold 0.0005]
// Writes old/new/diff PNGs for every gear that differs to tests/visual/output/ and exits non-zero when any
// differs by more than the threshold (share of differing pixels).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { GearDef } from '../../shared/schema';
import { OUTPUT_DIR, ROOT } from '../../tools/lib/paths';

const require = createRequire(import.meta.url);
const { serve } = require('../legacy/server.cjs') as {
  serve: (root: string) => Promise<{ url: string; close: () => Promise<void> }>;
};
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core') as typeof import('playwright-core');

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args.splice(i, 2)[1]! : fallback;
};
const widths = opt('width', '1280,390').split(',').map(Number);
// 0.05% of the stage: room for text-raster noise (the Hot Rod's 7.5px CHANNEL SELECT label rasterizes a
// hair differently with an identical DOM and layout); anything real is far above it
const threshold = Number(opt('threshold', '0.0005'));
const gear: GearDef[] = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'gear.json'), 'utf8'));
const ids = args.length ? args : gear.filter((d) => !d.chainOnly).map((d) => d.id);
const out = path.join(ROOT, 'tests/visual/output');

async function main() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const legacy = await serve(ROOT),
    built = await serve(path.join(ROOT, 'dist'));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  });
  const failures: string[] = [];
  try {
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const oldPage = await ctx.newPage(),
        newPage = await ctx.newPage();
      for (const id of ids) {
        const shot = async (page: typeof oldPage, url: string, ready: string) => {
          await page.goto(url + '?amp=' + encodeURIComponent(id));
          await page.waitForFunction(ready);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(200);
          return PNG.sync.read(await page.locator('#stage').screenshot({ animations: 'disabled' }));
        };
        await oldPage.evaluate(() => localStorage.clear()).catch(() => {});
        await newPage.evaluate(() => localStorage.clear()).catch(() => {});
        const a = await shot(oldPage, legacy.url + 'legacy/app/', 'window.CF_READY === true');
        const b = await shot(
          newPage,
          built.url,
          "!!document.querySelector('#count') && document.querySelector('#count').textContent !== ''",
        );
        const w = Math.max(a.width, b.width),
          h = Math.max(a.height, b.height);
        const pad = (img: PNG) => {
          const p = new PNG({ width: w, height: h });
          PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0);
          return p;
        };
        const pa = pad(a),
          pb = pad(b),
          diff = new PNG({ width: w, height: h });
        const n = pixelmatch(pa.data, pb.data, diff.data, w, h, { threshold: 0.1 });
        const share = n / (w * h);
        const sizeNote =
          a.width !== b.width || a.height !== b.height ? ` size ${a.width}×${a.height} → ${b.width}×${b.height}` : '';
        if (share > threshold || sizeNote) {
          const base = path.join(out, `${id}@${width}`);
          fs.writeFileSync(base + '-old.png', PNG.sync.write(pa));
          fs.writeFileSync(base + '-new.png', PNG.sync.write(pb));
          fs.writeFileSync(base + '-diff.png', PNG.sync.write(diff));
          failures.push(`${id} @${width}px: ${(share * 100).toFixed(2)}% differs${sizeNote}`);
          console.log('DIFF', failures.at(-1));
        } else console.log('  ok', id, '@' + width);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await legacy.close();
    await built.close();
  }
  console.log(
    failures.length
      ? `\n${failures.length} stage(s) differ (see tests/visual/output/):\n` + failures.join('\n')
      : '\nAll stages match the legacy app.',
  );
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
