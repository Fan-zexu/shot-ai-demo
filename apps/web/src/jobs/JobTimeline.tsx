import type { JobSummary } from '@shot-ai/contracts';

import { COMPARISON_STAGES, TEMPLATE_STAGES } from './stages.ts';

export function JobTimeline({ job }: { job: JobSummary }) {
  const stages = job.type === 'template' ? TEMPLATE_STAGES : COMPARISON_STAGES;
  const completed = new Set(job.completedStages);

  return (
    <ol className="job-timeline" aria-label="真实处理阶段">
      {stages.map((stage, index) => {
        const isUpload = stage.id === 'upload_received';
        const isReady = stage.id === 'ready';
        const isComplete =
          isUpload ||
          completed.has(stage.id) ||
          (isReady && job.status === 'ready');
        const isActive =
          job.stage === stage.id ||
          (isReady && job.status === 'ready') ||
          (isUpload && job.status === 'queued');
        return (
          <li
            key={stage.id}
            className={isActive ? 'is-active' : isComplete ? 'is-complete' : ''}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="stage-index" aria-hidden="true">
              {isComplete && !isActive ? '✓' : String(index + 1).padStart(2, '0')}
            </span>
            <span>
              <strong>{stage.label}</strong>
              <small>{stage.detail}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
