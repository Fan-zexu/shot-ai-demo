import { useCallback, useEffect, useMemo, useState } from 'react';

import type { JobStatus } from '@shot-ai/contracts';

import { AppShell } from '../components/AppShell.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import { listComparisons, toApiError } from '../lib/api.ts';
import { errorCopy } from '../lib/errors.ts';
import { formatDate } from '../lib/format.ts';
import type { ComparisonHistoryItem, PublicApiError } from '../lib/types.ts';

type HistoryFilter = 'all' | 'ready' | 'active' | 'attention';

const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'ready', label: '已完成' },
  { id: 'active', label: '处理中' },
  { id: 'attention', label: '未完成' },
];

export function HistoryPage() {
  const [items, setItems] = useState<ComparisonHistoryItem[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<PublicApiError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listComparisons());
      setLoadError(null);
    } catch (error) {
      setLoadError(toApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilter(item.status, filter)),
    [filter, items],
  );
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const activeCount = items.filter((item) => item.status === 'queued' || item.status === 'running').length;
  const attentionCount = items.length - readyCount - activeCount;

  return (
    <AppShell active="history">
      <section className="page-heading history-heading">
        <div>
          <span className="eyebrow">COMPARISON ARCHIVE / 对比记录</span>
          <h1>历史报告</h1>
          <p>重新打开已经完成的动作报告，或继续查看仍在处理和未完成的任务。</p>
        </div>
        <a className="button button-primary" href="#/comparisons/new">
          <span aria-hidden="true">＋</span> 新建对比
        </a>
      </section>

      <section className="history-summary" aria-label="历史报告统计">
        <div><span>全部记录</span><strong>{items.length}</strong></div>
        <div><span>已完成</span><strong>{readyCount}</strong></div>
        <div><span>处理中</span><strong>{activeCount}</strong></div>
        <div><span>未完成</span><strong>{attentionCount}</strong></div>
      </section>

      <div className="history-filters" role="group" aria-label="筛选历史报告">
        {FILTERS.map((option) => (
          <button
            type="button"
            key={option.id}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? <HistorySkeleton /> : null}
      {loadError ? (
        <section className="inline-alert" role="alert">
          <strong>历史报告加载失败</strong>
          <span>{loadError.message}</span>
          <button type="button" onClick={() => void load()}>重新加载</button>
        </section>
      ) : null}

      {!loading && !loadError && items.length === 0 ? (
        <EmptyState title="还没有对比记录">
          完成第一次动作对比后，成功报告和未完成任务都会保留在这里。
        </EmptyState>
      ) : null}

      {!loading && !loadError && items.length > 0 && visibleItems.length === 0 ? (
        <EmptyState title="当前筛选没有记录">
          切换其他状态，或者新建一次动作对比。
        </EmptyState>
      ) : null}

      {visibleItems.length > 0 ? (
        <section className="history-list" aria-label="历史报告列表">
          {visibleItems.map((item) => <HistoryCard key={item.id} item={item} />)}
        </section>
      ) : null}
    </AppShell>
  );
}

function HistoryCard({ item }: { item: ComparisonHistoryItem }) {
  const rawError = item.error ?? item.job?.error ?? null;
  const copy = rawError
    ? errorCopy({
        code: String(rawError.code ?? item.rejectionCode ?? 'UNKNOWN_ERROR'),
        message: String(rawError.message ?? '处理没有完成'),
      })
    : null;
  const destination = historyDestination(item);
  return (
    <article className={`history-card history-${item.status}`}>
      <header>
        <div>
          <small>REPORT · {item.id.slice(-8).toUpperCase()}</small>
          <h2>{item.userFileName}</h2>
        </div>
        <StatusPill status={item.status} />
      </header>
      <dl>
        <div><dt>参考模板</dt><dd>{item.template.name}</dd></div>
        <div><dt>投篮手</dt><dd>{item.shootingHand === 'right' ? '右手' : '左手'}</dd></div>
        <div><dt>创建时间</dt><dd>{formatDate(item.createdAt)}</dd></div>
        <div><dt>最近更新</dt><dd>{formatDate(item.updatedAt)}</dd></div>
      </dl>
      {copy ? (
        <div className="card-message">
          <strong>{copy.title}</strong>
          <span>{copy.action}</span>
        </div>
      ) : null}
      <footer>
        <span>{historyStatusCopy(item.status)}</span>
        {destination ? (
          <a className={`button ${item.status === 'ready' ? 'button-secondary' : 'button-ghost'}`} href={destination.href}>
            {destination.label}
          </a>
        ) : null}
      </footer>
    </article>
  );
}

function historyDestination(item: ComparisonHistoryItem) {
  if (item.status === 'ready') {
    return { href: `#/reports/${encodeURIComponent(item.id)}`, label: '查看报告' };
  }
  if (!item.job) return null;
  return {
    href: `#/jobs/${encodeURIComponent(item.job.id)}`,
    label: item.status === 'queued' || item.status === 'running' ? '查看处理进度' : '查看任务详情',
  };
}

function historyStatusCopy(status: JobStatus) {
  if (status === 'ready') return '报告已保存，可随时重新打开';
  if (status === 'queued' || status === 'running') return '任务仍在处理，进入详情查看阶段';
  if (status === 'rejected') return '输入未形成报告，保留拒绝原因';
  return '系统处理未完成，保留错误与重试入口';
}

function matchesFilter(status: JobStatus, filter: HistoryFilter) {
  if (filter === 'all') return true;
  if (filter === 'ready') return status === 'ready';
  if (filter === 'active') return status === 'queued' || status === 'running';
  return status === 'rejected' || status === 'failed';
}

function HistorySkeleton() {
  return (
    <section className="history-list" aria-label="正在加载历史报告">
      {[0, 1, 2].map((index) => <div className="history-skeleton" key={index} />)}
    </section>
  );
}
