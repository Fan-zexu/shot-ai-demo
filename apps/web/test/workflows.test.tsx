import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { JobSummary } from '@shot-ai/contracts';

import { NewComparisonPage } from '../src/pages/NewComparisonPage.tsx';
import { ProcessingPage } from '../src/pages/ProcessingPage.tsx';
import { TemplatesPage } from '../src/pages/TemplatesPage.tsx';
import type { TemplateDetails } from '../src/lib/types.ts';

const api = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  createComparison: vi.fn(),
  createTemplate: vi.fn(),
  getJob: vi.fn(),
  retryJob: vi.fn(),
}));

vi.mock('../src/lib/api.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/api.ts')>();
  return {
    ...original,
    listTemplates: api.listTemplates,
    createComparison: api.createComparison,
    createTemplate: api.createTemplate,
    getJob: api.getJob,
    retryJob: api.retryJob,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('template upload', () => {
  test('allows an altered-speed reference without a confirmation checkbox', async () => {
    const user = userEvent.setup();
    api.listTemplates.mockResolvedValue([]);
    api.createTemplate.mockResolvedValue({
      templateId: 'tpl_slow_motion',
      jobId: 'job_slow_motion',
      status: 'queued',
    });
    render(<TemplatesPage />);

    await screen.findByRole('heading', { name: '还没有动作模板' });
    await user.click(screen.getByRole('button', { name: '上传模板' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('允许慢放或剪辑变速')).toBeInTheDocument();

    await user.type(screen.getByLabelText('模板名称'), '慢速右手模板');
    await user.click(screen.getByRole('radio', { name: '右手' }));
    await user.upload(
      screen.getByLabelText('本地视频'),
      new File(['video'], 'slow-shot.mov', { type: 'video/quicktime' }),
    );
    await user.click(screen.getByRole('button', { name: '上传并开始解析' }));

    expect(api.createTemplate).toHaveBeenCalledWith({
      file: expect.any(File),
      name: '慢速右手模板',
      shootingHand: 'right',
    });
  });
});

describe('new comparison', () => {
  test('shows only templates whose persisted status is ready', async () => {
    api.listTemplates.mockResolvedValue([
      templateFixture({ id: 'tpl_ready', name: '可用右手模板', status: 'ready' }),
      templateFixture({ id: 'tpl_running', name: '仍在解析的模板', status: 'running' }),
    ]);

    render(<NewComparisonPage />);

    expect(await screen.findByText('可用右手模板')).toBeInTheDocument();
    expect(screen.queryByText('仍在解析的模板')).not.toBeInTheDocument();
    expect(api.listTemplates).toHaveBeenCalledWith('ready');
  });

  test('blocks task creation when the selected hand differs from the template', async () => {
    const user = userEvent.setup();
    api.listTemplates.mockResolvedValue([
      templateFixture({ id: 'tpl_right', name: '右手侧面参考', status: 'ready' }),
    ]);
    render(<NewComparisonPage initialTemplateId="tpl_right" />);

    await screen.findByText('右手侧面参考');
    await user.click(screen.getByRole('radio', { name: '左手' }));
    await user.upload(
      screen.getByLabelText('本地视频'),
      new File(['video'], 'shot.mp4', { type: 'video/mp4' }),
    );
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '开始动作对比' }));

    expect(screen.getByText('投篮手不一致，请选择同手模板或修改投篮手')).toBeInTheDocument();
    expect(api.createComparison).not.toHaveBeenCalled();
  });
});

describe('processing outcome', () => {
  test('a rejected input leads with retake guidance and never offers retry', async () => {
    api.getJob.mockResolvedValue(rejectedJob());

    render(<ProcessingPage jobId="job_rejected" />);

    expect(
      await screen.findByRole('heading', { name: '固定手机并确保头和脚完整可见后重拍' }),
    ).toBeInTheDocument();
    expect(screen.getByText('人物没有保持全身入镜')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '从原文件重试' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '重选模板与视频' })).toBeInTheDocument();
  });
});

function templateFixture(
  input: Pick<TemplateDetails, 'id' | 'name' | 'status'>,
): TemplateDetails {
  return {
    id: input.id,
    name: input.name,
    status: input.status,
    sourceFileId: `file_${input.id}`,
    currentArtifactId: input.status === 'ready' ? `artifact_${input.id}` : null,
    shootingHand: 'right',
    rejectionCode: null,
    error: null,
    version: 1,
    createdAt: '2026-07-15T10:00:00.000Z',
    updatedAt: '2026-07-15T10:00:00.000Z',
    deletedAt: null,
    source: {
      fileName: 'shot.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1024,
      videoUrl: `/api/v1/files/file_${input.id}/video`,
    },
    quality: null,
    job: null,
  };
}

function rejectedJob(): JobSummary {
  return {
    id: 'job_rejected',
    type: 'comparison',
    entityId: 'cmp_rejected',
    status: 'rejected',
    stage: 'extracting_user_pose',
    completedStages: ['validating_user'],
    attempt: 1,
    error: {
      code: 'USER_BODY_OUT_OF_FRAME',
      category: 'rejection',
      message: 'Input did not pass analysis',
      retryable: false,
      details: { rejectionCodes: ['USER_BODY_OUT_OF_FRAME'] },
    },
    updatedAt: '2026-07-15T10:00:00.000Z',
  };
}
