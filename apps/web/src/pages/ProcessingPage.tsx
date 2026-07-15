import { useState } from 'react';

import type { JobSummary } from '@shot-ai/contracts';

import { AppShell } from '../components/AppShell.tsx';
import { ErrorAction } from '../components/ErrorAction.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import { JobTimeline } from '../jobs/JobTimeline.tsx';
import { useJob } from '../jobs/useJob.ts';
import { retryJob, toApiError } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';
import type { PublicApiError } from '../lib/types.ts';

export function ProcessingPage({ jobId }: { jobId: string }) {
  const { job, error, refresh } = useJob(jobId);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<PublicApiError | null>(null);

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryJob(jobId);
      refresh();
    } catch (nextError) {
      setRetryError(toApiError(nextError));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <AppShell active="job">
      <section className="processing-header">
        <span className="eyebrow">LIVE PIPELINE / 真实任务</span>
        <h1>{job?.type === 'template' ? '正在建立动作模板' : '正在比较两段动作'}</h1>
        <p>这里只展示数据库记录的阶段，不估算百分比或剩余时间。</p>
        <div className="job-id-line"><span>JOB</span><code>{jobId}</code></div>
      </section>

      {!job && !error ? <ProcessingSkeleton /> : null}
      {error && !job ? (
        <section className="inline-alert" role="alert">
          <strong>无法读取任务</strong><span>{error.message}</span>
          <button type="button" onClick={refresh}>重新连接</button>
        </section>
      ) : null}
      {job ? (
        <div className="processing-layout" aria-live="polite">
          <section className="timeline-panel">
            <div className="panel-heading processing-panel-heading">
              <div><span className="eyebrow">STAGE LOG</span><h2>处理阶段</h2></div>
              <StatusPill status={job.status} />
            </div>
            <JobTimeline job={job} />
          </section>
          <aside className="job-console">
            <div className="console-scan" aria-hidden="true" />
            <span className="eyebrow">TASK SIGNAL</span>
            <h2>{statusTitle(job)}</h2>
            <p>{statusMessage(job)}</p>
            <dl>
              <div><dt>任务类型</dt><dd>{job.type === 'template' ? '模板解析' : '动作对比'}</dd></div>
              <div><dt>尝试次数</dt><dd>{String(job.attempt).padStart(2, '0')}</dd></div>
              <div><dt>当前阶段</dt><dd>{job.stage ?? '—'}</dd></div>
              <div><dt>最后更新</dt><dd>{formatDate(job.updatedAt)}</dd></div>
            </dl>
            {job.status === 'ready' ? <ReadyAction job={job} /> : null}
          </aside>
          {job.status === 'rejected' && job.error ? (
            <div className="processing-result">
              <ErrorAction error={normalizeJobError(job)} />
              <a className="button button-primary" href={replacementHref(job)}>
                {job.type === 'template' ? '重新上传模板' : '重选模板与视频'}
              </a>
            </div>
          ) : null}
          {job.status === 'failed' && job.error ? (
            <div className="processing-result">
              <ErrorAction error={normalizeJobError(job)} />
              {retryError ? <p className="form-request-error" role="alert">{retryError.message}</p> : null}
              <button className="button button-primary" type="button" onClick={() => void retry()} disabled={retrying}>
                {retrying ? '正在重新排队…' : '从原文件重试'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function ReadyAction({ job }: { job: JobSummary }) {
  const href = job.type === 'template' ? '#/templates' : `#/reports/${job.entityId}`;
  return <a className="button button-primary console-action" href={href}>{job.type === 'template' ? '返回模板页' : '查看动作报告'}</a>;
}

function replacementHref(job: JobSummary) {
  return job.type === 'template' ? '#/templates' : '#/comparisons/new';
}

function normalizeJobError(job: JobSummary): PublicApiError {
  const error = job.error ?? {};
  return {
    code: String(error.code ?? 'UNKNOWN_ERROR'),
    category: error.category === 'rejection' || error.category === 'validation' || error.category === 'system'
      ? error.category
      : job.status === 'rejected' ? 'rejection' : 'system',
    message: String(error.message ?? '处理没有完成'),
    retryable: Boolean(error.retryable),
    ...(isRecord(error.details) ? { details: error.details } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function statusTitle(job: JobSummary) {
  if (job.status === 'queued') return '等待本地处理器';
  if (job.status === 'running') return '分析正在进行';
  if (job.status === 'ready') return job.type === 'template' ? '模板可以使用' : '报告已经生成';
  if (job.status === 'rejected') return '输入未通过门控';
  return '系统处理失败';
}

function statusMessage(job: JobSummary) {
  if (job.status === 'queued') return '任务已经保存，会按本地队列顺序执行。';
  if (job.status === 'running') return '可以离开页面；任务状态保存在本地数据库中。';
  if (job.status === 'ready') return '全部产物已写入并通过契约校验。';
  if (job.status === 'rejected') return '需要按提示更换输入，不能绕过质量检查。';
  return '原始文件仍然保留，可以从失败阶段重新执行。';
}

function ProcessingSkeleton() {
  return <div className="processing-skeleton"><span /><span /><span /><span /></div>;
}
