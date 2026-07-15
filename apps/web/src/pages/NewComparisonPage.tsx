import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { ShootingHand } from '@shot-ai/contracts';

import { AppShell } from '../components/AppShell.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { FilePicker } from '../components/FilePicker.tsx';
import { HandSelector } from '../components/HandSelector.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import {
  createComparison,
  listTemplates,
  MAX_UPLOAD_BYTES,
  toApiError,
} from '../lib/api.ts';
import type { PublicApiError, TemplateDetails } from '../lib/types.ts';

export function NewComparisonPage({ initialTemplateId }: { initialTemplateId?: string }) {
  const [templates, setTemplates] = useState<TemplateDetails[]>([]);
  const [selectedId, setSelectedId] = useState(initialTemplateId ?? '');
  const [hand, setHand] = useState<ShootingHand | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<PublicApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTemplates('ready')
      .then((result) => {
        if (!cancelled) setTemplates(result.filter((template) => template.status === 'ready'));
      })
      .catch((error) => {
        if (!cancelled) setRequestError(toApiError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );
  const handMismatch = Boolean(selected && hand && selected.shootingHand !== hand);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setRequestError(null);
    if (!selected) return setFormError('请选择一个可用模板');
    if (!hand) return setFormError('请选择你的投篮手');
    if (handMismatch) return setFormError('投篮手不一致，请选择同手模板或修改投篮手');
    if (!file) return setFormError('请选择一个本地视频');
    if (file.size > MAX_UPLOAD_BYTES) return setFormError('文件超过 300 MB，请压缩后重试');
    if (!confirmed) return setFormError('请确认视频是正常速度且未变速');

    setSubmitting(true);
    try {
      const result = await createComparison({ file, templateId: selected.id, shootingHand: hand });
      window.location.hash = `#/jobs/${result.jobId}`;
    } catch (error) {
      setRequestError(toApiError(error));
      setSubmitting(false);
    }
  };

  return (
    <AppShell active="comparison">
      <section className="page-heading compact-heading">
        <div>
          <span className="eyebrow">NEW COMPARISON / 单次纵切</span>
          <h1>上传你的投篮</h1>
          <p>一个模板、一个视频、同一投篮手。质量结论由服务端真实分析。</p>
        </div>
      </section>

      <section className="capture-rules" aria-label="拍摄要求">
        {['投篮手侧面', '固定手机', '全身入镜', '一次完整投篮', '正常速度'].map((rule, index) => (
          <span key={rule}><i>{String(index + 1).padStart(2, '0')}</i>{rule}</span>
        ))}
      </section>

      <form className="comparison-form" onSubmit={(event) => void submit(event)} noValidate>
        <section className="form-section">
          <div className="section-number">01</div>
          <div className="section-content">
            <div className="section-heading">
              <div><h2>选择参考模板</h2><p>只列出已经通过动作质量门控的模板。</p></div>
              <span>{templates.length} READY</span>
            </div>
            {loading ? <div className="selection-loading">正在读取可用模板…</div> : null}
            {!loading && templates.length === 0 ? (
              <EmptyState title="没有可用模板">请先在模板页上传并解析一个参考动作。</EmptyState>
            ) : null}
            <div className="template-selector">
              {templates.map((template) => (
                <label key={template.id} className={selectedId === template.id ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name="templateId"
                    value={template.id}
                    checked={selectedId === template.id}
                    onChange={() => setSelectedId(template.id)}
                  />
                  <span className="selector-video">
                    {template.source ? <video src={template.source.videoUrl} muted playsInline preload="metadata" /> : null}
                  </span>
                  <span className="selector-copy">
                    <small>REF · V{template.version.toString().padStart(2, '0')}</small>
                    <strong>{template.name}</strong>
                    <span>{template.shootingHand === 'right' ? '右手投篮' : '左手投篮'}</span>
                  </span>
                  <StatusPill status={template.status} />
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="section-number">02</div>
          <div className="section-content">
            <div className="section-heading">
              <div><h2>上传用户视频</h2><p>浏览器只检查文件和字段，动作质量由分析管线决定。</p></div>
            </div>
            <HandSelector value={hand} onChange={setHand} label="你的投篮手" />
            {handMismatch ? (
              <p className="mismatch-alert" role="alert">
                <strong>投篮手不一致</strong>
                当前模板是{selected?.shootingHand === 'right' ? '右手' : '左手'}，不能镜像后继续。
              </p>
            ) : null}
            <FilePicker file={file} onChange={setFile} />
            <label className="check-row">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span><strong>我确认该视频为正常速度</strong><small>没有加速、慢放或剪辑变速</small></span>
            </label>
          </div>
        </section>

        {formError ? <p className="form-request-error" role="alert">{formError}</p> : null}
        {requestError ? <p className="form-request-error" role="alert">{requestError.message} · {requestError.code}</p> : null}
        <div className="submit-dock">
          <span><b>不会生成虚假报告</b><small>输入不可信时，系统会说明原因并要求重拍。</small></span>
          <button className="button button-primary" type="submit" disabled={submitting || templates.length === 0}>
            {submitting ? '正在上传…' : '开始动作对比'}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
