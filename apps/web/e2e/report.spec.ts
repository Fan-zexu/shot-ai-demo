import { expect, test } from '@playwright/test';

import { openReadyReport } from './fixtures.ts';

test('three report modes preserve the shared sample and playing state', async ({ page }) => {
  await openReadyReport(page);
  const workspace = page.locator('.report-workspace');
  const timeline = page.getByRole('slider', { name: '动作阶段进度' });

  await timeline.fill('3');
  await expect(workspace).toHaveAttribute('data-sample-index', '3');
  await expect(page.getByRole('region', { name: '当前观察重点' })).toContainText('准备 → 最低点');
  await expect(page.getByText(/TEMPLATE F6/)).toBeHidden();
  await page.locator('.technical-evidence > summary').click();
  await expect(page.getByText(/TEMPLATE F6/)).toBeVisible();
  await expect(page.getByText(/USER F9/)).toBeVisible();

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

test('one animation clock drives interpolated playback without rewriting event anchors', async ({ page }) => {
  await openReadyReport(page);
  const workspace = page.locator('.report-workspace');

  await page.getByRole('button', { name: /骨架叠加/ }).click();
  await page.locator('.debug-panel > summary').click();
  const startPosition = Number(await workspace.getAttribute('data-display-position'));
  await page.getByRole('button', { name: '播放动作' }).click();

  await expect(workspace).toHaveAttribute('data-display-source', 'smoothed-interpolated-copy');
  await expect.poll(async () => Number(await workspace.getAttribute('data-display-position'))).toBeGreaterThan(startPosition + 1);
  const fpsValue = page.locator('.debug-playback-diagnostics div').filter({ hasText: '实际渲染 FPS' }).locator('dd');
  await expect.poll(async () => Number(await fpsValue.textContent())).toBeGreaterThan(0);

  await page.getByRole('button', { name: '暂停动作' }).click();
  await page.getByRole('button', { name: /释放姿态代理/ }).click();
  await expect(workspace).toHaveAttribute('data-playing', 'false');
  await expect(workspace).toHaveAttribute('data-display-source', 'raw-analysis-frame');
  await expect(workspace).toHaveAttribute('data-sample-index', '240');
});

test('overlay and channel keep one action-wide fit across the complete timeline', async ({ page }) => {
  await openReadyReport(page);
  await page.getByRole('button', { name: /骨架叠加/ }).click();
  const overlay = page.locator('.skeleton-overlay-renderer svg');
  const scale = await overlay.getAttribute('data-fit-scale');
  const center = await overlay.getAttribute('data-fit-center');

  await page.getByRole('button', { name: /释放姿态代理/ }).click();
  await expect(overlay).toHaveAttribute('data-fit-scale', scale!);
  await expect(overlay).toHaveAttribute('data-fit-center', center!);
  await expect(overlay.locator('.difference-link')).toHaveCount(0);
  expect(await overlay.locator('[data-highlighted-region]').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: /动作通道/ }).click();
  const channel = page.locator('.motion-channel-renderer svg');
  await expect(channel).toHaveAttribute('data-fit-scale', scale!);
  await expect(channel).toHaveAttribute('data-fit-center', center!);
  const points = await channel.locator('circle[data-landmark]').evaluateAll((circles) => circles.map((circle) => ({
    x: Number(circle.getAttribute('cx')),
    y: Number(circle.getAttribute('cy')),
    radius: Number(circle.getAttribute('r')),
  })));
  expect(Math.min(...points.map((point) => point.x - point.radius))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...points.map((point) => point.x + point.radius))).toBeLessThanOrEqual(480);
  expect(Math.min(...points.map((point) => point.y - point.radius))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...points.map((point) => point.y + point.radius))).toBeLessThanOrEqual(400);
});

test('capture incompatibility preserves side-by-side and disables precision-looking modes', async ({ page }) => {
  await openReadyReport(page, {
    level: 'side_by_side_only',
    reasons: ['user_view_mismatch', 'user_body_out_of_frame'],
    modes: { sideBySide: 'enabled', skeletonOverlay: 'disabled', motionChannel: 'disabled' },
  });

  await expect(page.getByText('对比适配度：仅并排可用')).toBeVisible();
  await expect(page.getByRole('button', { name: /并排视频/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /骨架叠加.*已关闭/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /动作通道.*已关闭/ })).toBeDisabled();
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
    page.getByRole('button', { name: '四分之一慢放' }),
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
  await expect(page.getByRole('heading', { name: '播放质量诊断' })).toBeVisible();
  await expect(page.getByText(/重复率来自不可变 DTW 对齐路径/)).toBeVisible();
  await expect(page.locator('.debug-curves article')).toHaveCount(5);
  await expect(page.getByText('全身持续在画面内')).toBeVisible();
  await expect(page.locator('.debug-exports a')).toHaveCount(4);
  await expect(page.locator('.artifact-hashes')).toContainText('bbbbbbbb');
});
