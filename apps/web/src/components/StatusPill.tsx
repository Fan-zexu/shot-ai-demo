import type { JobStatus } from '@shot-ai/contracts';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: '等待处理',
  running: '分析中',
  ready: '可使用',
  rejected: '需更换输入',
  failed: '系统失败',
};

export function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`status-pill status-${status}`}>{STATUS_LABEL[status]}</span>;
}
