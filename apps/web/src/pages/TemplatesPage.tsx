import { type FormEvent, useCallback, useEffect, useState } from 'react';

import type { ShootingHand } from '@shot-ai/contracts';

import { AppShell } from '../components/AppShell.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { FilePicker } from '../components/FilePicker.tsx';
import { HandSelector } from '../components/HandSelector.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  MAX_UPLOAD_BYTES,
  toApiError,
} from '../lib/api.ts';
import { errorCopy } from '../lib/errors.ts';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatFps,
} from '../lib/format.ts';
import type { PublicApiError, TemplateDetails } from '../lib/types.ts';

interface FormErrors {
  name?: string;
  file?: string;
  hand?: string;
  confirmation?: string;
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<PublicApiError | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setTemplates(await listTemplates());
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

  return (
    <AppShell active="templates">
      <section className="page-heading">
        <div>
          <span className="eyebrow">REFERENCE SET / 参考动作</span>
          <h1>模板工作台</h1>
          <p>通过真实质量门控的动作，才会进入对比候选。</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => setShowForm(true)}>
          <span aria-hidden="true">＋</span> 上传模板
        </button>
      </section>

      <section className="lab-strip" aria-label="模板流程">
        <span>本地视频</span><i />
        <span>动作解析</span><i />
        <span>质量门控</span><i />
        <strong>可用模板</strong>
      </section>

      {showForm ? (
        <TemplateUploadPanel
          onClose={() => setShowForm(false)}
          onCreated={(jobId) => {
            window.location.hash = `#/jobs/${jobId}`;
          }}
        />
      ) : null}

      {loading ? <TemplateSkeleton /> : null}
      {loadError ? (
        <section className="inline-alert" role="alert">
          <strong>模板列表加载失败</strong>
          <span>{loadError.message}</span>
          <button type="button" onClick={() => void load()}>重新加载</button>
        </section>
      ) : null}

      {!loading && !loadError && templates.length === 0 ? (
        <EmptyState title="还没有动作模板">
          上传一段正常速度、完整侧面的投篮视频，系统会先验证它是否适合作为参考。
        </EmptyState>
      ) : null}

      {templates.length > 0 ? (
        <section className="template-grid" aria-label="模板列表">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onDelete={async () => {
                if (!window.confirm(`删除模板“${template.name}”？`)) return;
                await deleteTemplate(template.id);
                await load();
              }}
            />
          ))}
        </section>
      ) : null}
    </AppShell>
  );
}

function TemplateUploadPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (jobId: string) => void;
}) {
  const [name, setName] = useState('');
  const [hand, setHand] = useState<ShootingHand | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [requestError, setRequestError] = useState<PublicApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = '请输入模板名称';
    if (!hand) nextErrors.hand = '请选择投篮手';
    if (!file) nextErrors.file = '请选择一个本地视频';
    else if (file.size > MAX_UPLOAD_BYTES) nextErrors.file = '文件超过 300 MB，请压缩后重试';
    if (!confirmed) nextErrors.confirmation = '请确认视频是正常速度且未变速';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !file || !hand) return;

    setSubmitting(true);
    setRequestError(null);
    try {
      const result = await createTemplate({ file, name: name.trim(), shootingHand: hand });
      onCreated(result.jobId);
    } catch (error) {
      setRequestError(toApiError(error));
      setSubmitting(false);
    }
  };

  return (
    <section className="upload-panel" aria-labelledby="template-upload-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">NEW REFERENCE</span>
          <h2 id="template-upload-title">创建参考模板</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭上传表单">×</button>
      </div>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="field">
          <label htmlFor="template-name">模板名称</label>
          <input
            id="template-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：右手侧面参考 01"
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name ? <p className="field-error" role="alert">{errors.name}</p> : null}
        </div>
        <HandSelector value={hand} onChange={setHand} />
        {errors.hand ? <p className="field-error" role="alert">{errors.hand}</p> : null}
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <label className={`check-row ${errors.confirmation ? 'has-error' : ''}`}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            <strong>我确认该视频为正常速度</strong>
            <small>没有加速、慢放或剪辑变速</small>
          </span>
        </label>
        {errors.confirmation ? <p className="field-error" role="alert">{errors.confirmation}</p> : null}
        {requestError ? (
          <p className="form-request-error" role="alert">{requestError.message} · {requestError.code}</p>
        ) : null}
        <div className="form-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>取消</button>
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? '正在上传…' : '上传并开始解析'}
          </button>
        </div>
      </form>
    </section>
  );
}

function TemplateCard({ template, onDelete }: { template: TemplateDetails; onDelete: () => Promise<void> }) {
  const durationMs = qualityMetric(template, 'VIDEO_DURATION');
  const fps = qualityMetric(template, 'VIDEO_FRAME_RATE');
  const cardError = template.error
    ? {
        code: String(template.error.code ?? template.rejectionCode ?? 'UNKNOWN_ERROR'),
        message: String(template.error.message ?? '处理没有完成'),
      }
    : null;
  const copy = errorCopy(cardError);
  return (
    <article className={`template-card template-${template.status}`}>
      <div className="template-preview">
        {template.source ? (
          <video
            src={template.source.videoUrl}
            muted
            playsInline
            preload="metadata"
            aria-label={`${template.name} 原始视频预览`}
          />
        ) : <span>NO PREVIEW</span>}
        <StatusPill status={template.status} />
        <span className="hand-stamp">{template.shootingHand === 'right' ? 'R / 右手' : 'L / 左手'}</span>
      </div>
      <div className="template-body">
        <div className="template-title-row">
          <div>
            <small>REF · V{template.version.toString().padStart(2, '0')}</small>
            <h2>{template.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => void onDelete()} aria-label={`删除 ${template.name}`}>×</button>
        </div>
        <dl className="metric-row">
          <div><dt>时长</dt><dd>{formatDuration(typeof durationMs === 'number' ? durationMs / 1000 : undefined)}</dd></div>
          <div><dt>帧率</dt><dd>{formatFps(typeof fps === 'number' ? fps : undefined)}</dd></div>
          <div><dt>文件</dt><dd>{template.source ? formatBytes(template.source.sizeBytes) : '—'}</dd></div>
          <div><dt>创建</dt><dd>{formatDate(template.createdAt)}</dd></div>
        </dl>
        {copy ? (
          <div className="card-message">
            <strong>{copy.title}</strong>
            <span>{copy.action}</span>
          </div>
        ) : null}
        <div className="card-actions">
          {template.status === 'ready' ? (
            <a className="button button-secondary" href={`#/comparisons/new?template=${template.id}`}>用它开始对比</a>
          ) : template.job ? (
            <a className="button button-ghost" href={`#/jobs/${template.job.id}`}>查看处理详情</a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function qualityMetric(template: TemplateDetails, code: string) {
  return template.quality?.checks.find((check) => check.code === code)?.measuredValue;
}

function TemplateSkeleton() {
  return (
    <section className="template-grid" aria-label="正在加载模板">
      {[0, 1].map((index) => <div className="template-skeleton" key={index} />)}
    </section>
  );
}
