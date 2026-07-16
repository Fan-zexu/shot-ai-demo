import { useEffect, useState } from 'react';

import type { BodyRegion, ReportBundle, ReportFrame, TimelineSample } from '@shot-ai/contracts';

import { apiUrl, getDebugSummary, toApiError } from '../lib/api.ts';
import type { DebugSummary, PublicApiError } from '../lib/types.ts';
import { eventSampleIndices, REPORT_EVENTS } from './events.ts';
import type { PlaybackDiagnostics } from './motion-presentation.ts';
import { REGION_LABELS, REGION_ORDER } from './regions.ts';

export function DebugPanel({
  report,
  frame,
  sample,
  diagnostics,
  renderFps,
  presentationActive,
  showAllLandmarks,
  onShowAllLandmarksChange,
}: {
  report: ReportBundle;
  frame: ReportFrame;
  sample: TimelineSample;
  diagnostics: PlaybackDiagnostics;
  renderFps: number;
  presentationActive: boolean;
  showAllLandmarks: boolean;
  onShowAllLandmarksChange: (show: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<DebugSummary | null>(null);
  const [error, setError] = useState<PublicApiError | null>(null);

  useEffect(() => {
    if (!open || summary || error) return;
    getDebugSummary(report.comparison.comparisonId)
      .then(setSummary)
      .catch((nextError) => setError(toApiError(nextError)));
  }, [error, open, report.comparison.comparisonId, summary]);

  const eventSamples = eventSampleIndices(report.comparison);
  return (
    <details className="debug-panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span><b>DESKTOP DEBUG</b>展开当前样本证据与导出</span>
        <code>{report.comparison.resultId}</code>
      </summary>
      <div className="debug-content">
        <section className="debug-playback-diagnostics">
          <h3>播放质量诊断</h3>
          <dl className="debug-metrics">
            <div>
              <dt>模板重复映射</dt>
              <dd>{diagnostics.templateRepeatedMappings} / {diagnostics.alignmentTransitions} · {diagnostics.templateRepeatedPercent}%</dd>
            </div>
            <div>
              <dt>用户重复映射</dt>
              <dd>{diagnostics.userRepeatedMappings} / {diagnostics.alignmentTransitions} · {diagnostics.userRepeatedPercent}%</dd>
            </div>
            <div>
              <dt>模板峰值跳变</dt>
              <dd>{jumpLabel(diagnostics.templatePeakJump)}</dd>
            </div>
            <div>
              <dt>用户峰值跳变</dt>
              <dd>{jumpLabel(diagnostics.userPeakJump)}</dd>
            </div>
            <div>
              <dt>实际渲染 FPS</dt>
              <dd>{presentationActive ? renderFps || '采样中' : '播放后采样'}</dd>
            </div>
            <div>
              <dt>当前展示来源</dt>
              <dd>{presentationActive ? '插值 + 低延迟平滑副本' : '原始分析帧'}</dd>
            </div>
          </dl>
          <p>重复率来自不可变 DTW 对齐路径；跳变来自原始显示采样。插值和平滑只用于播放展示，暂停、拖动、六事件和导出仍读取原始分析数据。</p>
        </section>
        <section className="debug-landmark-control">
          <h3>骨架显示</h3>
          <label>
            <input
              type="checkbox"
              aria-label="显示完整 33 点"
              checked={showAllLandmarks}
              onChange={(event) => onShowAllLandmarksChange(event.target.checked)}
            />
            <span>显示完整 33 点</span>
            <small>仅用于调试；默认用户视图始终只显示语义清晰的核心关节。</small>
          </label>
        </section>
        <section>
          <h3>当前帧映射</h3>
          <dl className="debug-metrics">
            <div><dt>Sample</dt><dd>{sample.sampleIndex}</dd></div>
            <div><dt>模板帧</dt><dd>{sample.templateFrameIndex}</dd></div>
            <div><dt>用户帧</dt><dd>{sample.userFrameIndex}</dd></div>
            <div><dt>阶段</dt><dd>{sample.phaseIndex + 1} / 5</dd></div>
            <div><dt>模板点均值</dt><dd>{averageConfidence(frame.templateNormalizedSkeleton)}%</dd></div>
            <div><dt>用户点均值</dt><dd>{averageConfidence(frame.userNormalizedSkeleton)}%</dd></div>
          </dl>
        </section>

        <section>
          <h3>六事件帧映射</h3>
          <div className="debug-table-wrap">
            <table>
              <thead><tr><th>事件</th><th>Sample</th><th>模板帧</th><th>模板置信度</th><th>用户帧</th><th>用户置信度</th></tr></thead>
              <tbody>
                {REPORT_EVENTS.map((event) => {
                  const eventSample = report.comparison.renderTimeline[eventSamples[event.name]]!;
                  const templateConfidence = summary?.templateArtifactEvidence?.events[event.name]?.confidence;
                  const userConfidence = summary?.artifactEvidence?.events[event.name]?.confidence;
                  return (
                    <tr key={event.name}>
                      <td>{event.label}</td><td>{eventSample.sampleIndex}</td><td>{eventSample.templateFrameIndex}</td>
                      <td>{confidenceLabel(templateConfidence)}</td><td>{eventSample.userFrameIndex}</td><td>{confidenceLabel(userConfidence)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3>当前关键点置信度</h3>
          <div className="debug-table-wrap">
            <table>
              <thead><tr><th>关键点</th><th>模板原画</th><th>用户原画</th><th>模板归一化</th><th>用户归一化</th></tr></thead>
              <tbody>
                {landmarkConfidenceRows(frame).map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{confidenceLabel(row.templateVideo)}</td>
                    <td>{confidenceLabel(row.userVideo)}</td>
                    <td>{confidenceLabel(row.templateNormalized)}</td>
                    <td>{confidenceLabel(row.userNormalized)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="debug-curves-section">
          <h3>五区域差异曲线</h3>
          <div className="debug-curves">
            {REGION_ORDER.map((region) => (
              <DifferenceCurve key={region} report={report} region={region} currentSample={sample.sampleIndex} />
            ))}
          </div>
        </section>

        <section>
          <h3>质量检查</h3>
          {!summary && !error ? <p className="debug-loading">读取调试摘要…</p> : null}
          {error ? <p className="field-error">{error.message}</p> : null}
          {summary?.quality ? (
            <ul className="quality-checks">
              {summary.quality.checks.map((check) => (
                <li key={check.code} className={`check-${check.status}`}>
                  <span>{check.status}</span><strong>{check.code}</strong><p>{check.message}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <h3>版本、阈值与耗时</h3>
          <pre>{JSON.stringify({
            algorithm: report.comparison.provenance.comparisonAlgorithmVersion,
            thresholds: report.comparison.provenance.thresholdSnapshot,
            durationsMs: report.comparison.provenance.stageDurationsMs,
            model: summary?.artifactEvidence?.provenance ?? null,
          }, null, 2)}</pre>
        </section>

        <section>
          <h3>被排除区域</h3>
          <pre>{JSON.stringify(report.comparison.compatibility.unavailableRegions, null, 2)}</pre>
        </section>

        <section className="debug-export-section">
          <h3>原始产物导出</h3>
          <div className="debug-exports">
            <a href={apiUrl(`/debug/artifacts/${report.comparison.templateArtifactId}`)}>模板 MotionArtifact</a>
            <a href={apiUrl(`/debug/artifacts/${report.comparison.userArtifactId}`)}>用户 MotionArtifact</a>
            <a href={apiUrl(`/debug/results/${report.comparison.resultId}`)}>ComparisonResult</a>
            {summary?.job ? <a href={apiUrl(`/debug/jobs/${summary.job.id}/quality-report`)}>QualityReport</a> : null}
          </div>
          {summary ? (
            <dl className="artifact-hashes">
              <div><dt>模板产物哈希</dt><dd>{summary.artifacts.template?.artifactSha256 ?? '—'}</dd></div>
              <div><dt>用户产物哈希</dt><dd>{summary.artifacts.user?.artifactSha256 ?? '—'}</dd></div>
            </dl>
          ) : null}
        </section>
      </div>
    </details>
  );
}

function DifferenceCurve({ report, region, currentSample }: { report: ReportBundle; region: BodyRegion; currentSample: number }) {
  const values = report.comparison.renderTimeline.map((timelineSample) => {
    const difference = timelineSample.differences[region];
    return difference.angleDeltaDeg ?? (difference.positionDelta === null ? 0 : difference.positionDelta * 100);
  });
  const maximum = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 180;
    return `${x},${38 - (value / maximum) * 32}`;
  }).join(' ');
  const markerX = values.length === 1 ? 0 : (currentSample / (values.length - 1)) * 180;
  return (
    <article>
      <span>{REGION_LABELS[region]}</span>
      <svg viewBox="0 0 180 42" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="38" x2="180" y2="38" />
        <polyline points={points} />
        <line className="curve-marker" x1={markerX} y1="0" x2={markerX} y2="42" />
      </svg>
    </article>
  );
}

function averageConfidence(points: ReportFrame['templateNormalizedSkeleton']) {
  if (points.length === 0) return 0;
  return Math.round((points.reduce((sum, point) => sum + point.confidence, 0) / points.length) * 100);
}

function confidenceLabel(value: number | undefined) {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

function jumpLabel(jump: PlaybackDiagnostics['templatePeakJump']) {
  return `${jump.landmark} · ${jump.distance.toFixed(3)} · F${jump.fromDisplayFrame}→F${jump.toDisplayFrame}`;
}

function landmarkConfidenceRows(frame: ReportFrame) {
  const templateVideo = new Map(frame.templateVideoSkeleton.map((point) => [point.name, Math.min(point.visibility, point.presence)]));
  const userVideo = new Map(frame.userVideoSkeleton.map((point) => [point.name, Math.min(point.visibility, point.presence)]));
  const templateNormalized = new Map(frame.templateNormalizedSkeleton.map((point) => [point.name, point.confidence]));
  const userNormalized = new Map(frame.userNormalizedSkeleton.map((point) => [point.name, point.confidence]));
  const names = new Set([...templateVideo.keys(), ...userVideo.keys(), ...templateNormalized.keys(), ...userNormalized.keys()]);
  return [...names].sort().map((name) => ({
    name,
    templateVideo: templateVideo.get(name),
    userVideo: userVideo.get(name),
    templateNormalized: templateNormalized.get(name),
    userNormalized: userNormalized.get(name),
  }));
}
