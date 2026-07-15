import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';

import { ReportWorkspace } from '../src/pages/ReportPage.tsx';
import { eventSampleIndices } from '../src/report/events.ts';
import {
  initialPlaybackState,
  needsVideoCorrection,
  playbackReducer,
} from '../src/report/playback.ts';
import { reportFixture } from './report-fixture.ts';

afterEach(cleanup);

describe('shared report playback', () => {
  test('mode changes preserve both the sample and playing state', () => {
    const initial = playbackReducer(initialPlaybackState(), {
      type: 'seek',
      sampleIndex: 3,
      totalSamples: 6,
    });
    const playing = playbackReducer(initial, { type: 'play', totalSamples: 6 });
    const switched = playbackReducer(playing, { type: 'set_mode', mode: 'motion_channel' });

    expect(switched.sampleIndex).toBe(3);
    expect(switched.progress).toBe(3 / 5);
    expect(switched.playing).toBe(true);
  });

  test('event jumps and renderer switches keep one root sample index', async () => {
    const user = userEvent.setup();
    const report = reportFixture();
    const { container } = render(<ReportWorkspace report={report} />);
    const workspace = container.querySelector('.report-workspace')!;

    await user.click(screen.getByRole('button', { name: /身体最低点/ }));
    expect(workspace).toHaveAttribute('data-sample-index', '1');
    await user.click(screen.getByRole('button', { name: /骨架叠加/ }));
    expect(workspace).toHaveAttribute('data-mode', 'skeleton_overlay');
    expect(workspace).toHaveAttribute('data-sample-index', '1');
    await user.click(screen.getByRole('button', { name: '分离' }));
    expect(workspace).toHaveAttribute('data-sample-index', '1');
  });

  test('low-confidence regions never receive visual highlights in any skeleton mode', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportWorkspace report={reportFixture()} />);
    await user.click(screen.getByRole('button', { name: /骨架叠加/ }));

    expect(container.querySelectorAll('[data-highlighted-region="shooting_arm"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-highlighted-region="guide_arm"]')).toHaveLength(0);
    expect(container.querySelector('[data-region-evidence="guide_arm"]')).toHaveTextContent('当前不可比较');
  });

  test('the fifth event is explicitly a release pose proxy', () => {
    render(<ReportWorkspace report={reportFixture()} />);
    expect(screen.getByRole('button', { name: /释放姿态代理/ })).toBeInTheDocument();
    expect(screen.getByText('非真实离手检测')).toBeInTheDocument();
  });
});

test('event anchors map to the six shared timeline samples', () => {
  expect(eventSampleIndices(reportFixture().comparison)).toEqual({
    prep_start: 0,
    body_lowest: 1,
    lower_body_extension_start: 2,
    shooting_arm_lift: 3,
    release_pose_proxy: 4,
    follow_through_end: 5,
  });
});

test('video correction uses the 40ms synchronization boundary', () => {
  expect(needsVideoCorrection(1, 1.04)).toBe(false);
  expect(needsVideoCorrection(1, 1.041)).toBe(true);
});
