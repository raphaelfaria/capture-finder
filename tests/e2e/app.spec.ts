// End-to-end: the app as a user drives it — no app internals, only the page.
import { expect, test, type Page } from '@playwright/test';

/** Open the app (optionally on a gear) and wait for the results. */
async function open(page: Page, query = '') {
  await page.goto(query);
  await expect(page.locator('#count')).toHaveText(/ for this gear · 2190 total$/);
}
const topCard = (page: Page) => page.locator('#results .mcard').first();

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:'))
      problems.push('external request: ' + r.url());
  });
  (page as Page & { problems: string[] }).problems = problems;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { problems: string[] }).problems).toEqual([]);
});

test('opens on the JP-2C with its captures ranked, and no demo data', async ({ page }) => {
  await open(page);
  await expect(page.locator('#count')).toHaveText('160 for this gear · 2190 total');
  await expect(page.locator('#stage h1')).toHaveText('Mesa/Boogie JP-2C');
  await expect(page).toHaveURL(/\?amp=jp2c$/);
  await expect(page.locator('body')).not.toContainText('DEMO');
});

test('the gear picker browses by category and instrument, and searches', async ({ page }) => {
  await open(page);
  const field = page.locator('#ampq');
  await field.focus();
  await expect(page.locator('#amp-listbox .ampopt.active')).toHaveAttribute('id', 'gear-drill-amps');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#gear-back')).toContainText('Amps');
  await page.keyboard.press('Enter');
  await expect(page.locator('#gear-back')).toContainText('Guitar');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#amp-listbox .ampopt.active')).toHaveAttribute('id', 'gear-drill-guitar');
  await field.fill('marshal 1987');
  await page.keyboard.press('Enter');
  await expect(page.locator('#stage h1')).toHaveText('Marshall JCM800 1987');
  await expect(field).toHaveValue('marshal 1987'); // the search stays in the field
  await expect(page).toHaveURL(/amp=marshall-jcm800-1987/);
});

test('loading a capture scores it 100 and shows where the settings came from', async ({ page }) => {
  await open(page, '?amp=marshall-jcm800-1987');
  await page.locator('#k-volumeI-').press('Home');
  await expect(topCard(page).locator('.mscore')).not.toHaveText(/^100/);
  await page.getByRole('button', { name: 'Load settings from Brit 1987 1', exact: true }).click();
  await expect(topCard(page).locator('h3')).toHaveText('Brit 1987 1');
  await expect(topCard(page).locator('.mscore')).toHaveText(/^100/);
  await expect(page.locator('.loadpill')).toContainText('Loaded from Brit 1987 1');
  await page.locator('#k-bass-').press('ArrowUp');
  await expect(page.locator('.loadpill')).toHaveCount(0);
});

test('the capture search loads a capture of other gear', async ({ page }) => {
  await open(page);
  await page.locator('#capq').fill('brit 1987 3');
  await page.keyboard.press('Enter');
  await expect(page.locator('#stage h1')).toHaveText('Marshall JCM800 1987');
  await expect(page.locator('.loadpill')).toContainText('Brit 1987 3');
});

test('the details drawer traps focus and gives it back', async ({ page }) => {
  await open(page, '?amp=marshall-jcm800-1987');
  const details = topCard(page).getByRole('button', { name: /^Details for / });
  await details.click();
  await expect(page.locator('#drawer-close')).toBeFocused();
  await expect(page.locator('.drawer')).toContainText('Compare with your');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.drawer :focus')).toHaveCount(1); // still inside the drawer
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer')).toHaveCount(0);
  await expect(details).toBeFocused();
});

test('the (i) dialog opens with Close focused and closes with Escape', async ({ page }) => {
  await open(page);
  await page.locator('#info-btn').click();
  await expect(page.locator('#info-close')).toBeFocused();
  await expect(page.locator('#info-pop')).toContainText('Visual reference only');
  await page.keyboard.press('Escape');
  await expect(page.locator('#info-pop')).toHaveCount(0);
  await expect(page.locator('#info-btn')).toBeFocused();
});

test('matching weights can be edited, are remembered, and reset', async ({ page }) => {
  await open(page, '?amp=marshall-jcm800-1987');
  await page.locator('#wt-btn').click();
  await expect(page.locator('#stage .cab')).toHaveClass(/wedit/);
  const editor = page.locator('.wed input').first();
  await editor.fill('0');
  await editor.press('Enter');
  await expect(page.locator('.wed.zero')).toHaveCount(1);
  await page.locator('#wt-done').click();
  await expect(page.locator('#wt-btn')).toHaveClass(/custom/);
  await page.reload();
  await expect(page.locator('#wt-btn')).toHaveClass(/custom/);
  await page.locator('#wt-btn').click();
  await page.locator('#wt-reset').click();
  await expect(page.locator('#wt-reset')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reset')).toBeVisible();
});

test('pedals are drawn in front of the gear and in its effects loop; the chain can be removed', async ({ page }) => {
  await open(page, '?amp=paul-reed-smith-mt15');
  const names = page.locator('#stage .chainitem .chainlink');
  await expect(names).toHaveText(['Xotic Effects BB Preamp ↗', 'BBE Sonic Stomp ↗', 'Boss GE-7']);
  await expect(page.locator('#stage .chainloop .chainitem')).toHaveCount(2);
  await page.locator('#chain-btn').click();
  await page.getByRole('option', { name: /No pedals/ }).click();
  await expect(page.locator('#stage .chainpedal')).toHaveCount(0);
  await expect(page.locator('#chain-btn')).toBeFocused();
});

test('a preamp and its power amp version link to each other; back and forward follow', async ({ page }) => {
  await open(page, '?amp=custom-audio-amplifiers-3-se-preamp');
  await page.locator('#var-btn').click();
  await expect(page).toHaveURL(/amp=custom-audio-amplifiers-3-se-preamp-mesa-boogie-2-90-simulclass/);
  await expect(page.locator('.s9face')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#stage h1')).toHaveText('Custom Audio Amplifiers 3+SE Preamp');
  await page.goForward();
  await expect(page.locator('.s9face')).toBeVisible();
});

test('the workbench survives a reload; an address with a gear wins over it', async ({ page }) => {
  await open(page, '?amp=marshall-jcm800-1987');
  await page.locator('#k-volumeI-').press('Home');
  await page.goto('/');
  await expect(page.locator('#stage h1')).toHaveText('Marshall JCM800 1987');
  await expect(page.locator('#k-volumeI-')).toHaveValue('0');
  await page.goto('?amp=jp2c');
  await expect(page.locator('#stage h1')).toHaveText('Mesa/Boogie JP-2C');
});

for (const id of [
  'custom-audio-amplifiers-3-se-preamp-mesa-boogie-2-90-simulclass',
  'bogner-fish-preamp',
  'fryette-sigx',
  'paul-reed-smith-mt15',
]) {
  test(`no horizontal scrolling on a phone: ${id}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, '?amp=' + id);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
}
