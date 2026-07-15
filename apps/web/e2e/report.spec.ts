import { expect, test } from '@playwright/test';

import { openReadyReport } from './fixtures.ts';

test('three report modes preserve the shared sample and playing state', async ({ page }) => {
  await openReadyReport(page);
  const workspace = page.locator('.report-workspace');
  const timeline = page.getByRole('slider', { name: '动作阶段进度' });

  await timeline.fill('3');
  await expect(workspace).toHaveAttribute('data-sample-index', '3');
  await expect(page.getByText('TEMPLATE F6')).toBeVisible();
  await expect(page.getByText('USER F9')).toBeVisible();

  await page.getByRole('button', { name: '播放动作' }).click();
  await page.getByRole('button', { name: /骨架叠加/ }).click();
  await expect(workspace).toHaveAttribute('data-mode', 'skeleton_overlay');
  await expect(workspace).toHaveAttribute('data-playing', 'true');

  await page.getByRole('button', { name: '暂停动作' }).click();
  await timeline.fill('3');
  await page.getByRole('button', { name: /动作通道/ }).click();
  await expect(workspace).toHaveAttribute('data-mode', 'motion_channel');
  await expect(workspace).toHaveAttribute('data-sample-index', '3');
  await expect(workspace).toHaveAttribute('data-playing', 'false');
});

test('320px report keeps two video columns and 44px touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openReadyReport(page);

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

  const panes = page.locator('.video-pane');
  const templateBox = await panes.nth(0).boundingBox();
  const userBox = await panes.nth(1).boundingBox();
  expect(templateBox).not.toBeNull();
  expect(userBox).not.toBeNull();
  expect(Math.abs(templateBox!.y - userBox!.y)).toBeLessThan(2);
  expect(userBox!.x).toBeGreaterThan(templateBox!.x);

  for (const control of [
    page.getByRole('button', { name: /并排视频/ }),
    page.getByRole('button', { name: '播放动作' }),
    page.getByRole('slider', { name: '动作阶段进度' }),
    page.getByRole('button', { name: /准备开始/ }),
    page.getByRole('button', { name: '0.25×' }),
  ]) {
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await expect(page.locator('.debug-panel')).toHaveCSS('display', 'none');
});

test('desktop debug evidence exposes confidence, provenance, and exports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openReadyReport(page);
  await page.locator('.debug-panel > summary').click();

  const eventRow = page.locator('.debug-panel table tbody tr').filter({ hasText: '准备开始' }).first();
  await expect(eventRow).toContainText('94%');
  await expect(eventRow).toContainText('92%');
  await expect(page.getByRole('heading', { name: '当前关键点置信度' })).toBeVisible();
  await expect(page.locator('.debug-curves article')).toHaveCount(5);
  await expect(page.getByText('全身持续在画面内')).toBeVisible();
  await expect(page.locator('.debug-exports a')).toHaveCount(4);
  await expect(page.locator('.artifact-hashes')).toContainText('bbbbbbbb');
});
