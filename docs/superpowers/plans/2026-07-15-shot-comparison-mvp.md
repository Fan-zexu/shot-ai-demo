# Shot Comparison MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, real-video vertical slice that turns one reference-template video and one same-hand user video into one traceable comparison result rendered in three synchronized report modes.

**Architecture:** A pnpm monorepo contains a React H5, a Fastify API, shared runtime contracts, and a TypeScript comparison engine. A Python 3.11 FastAPI worker performs video inspection, MediaPipe pose extraction, event detection, normalization, and aligned-preview generation; SQLite and a private data directory persist state and artifacts.

**Tech Stack:** Node.js 24 LTS, pnpm 11, React 19, TypeScript, Vite 8, Fastify 5, TypeBox, better-sqlite3, Python 3.11, FastAPI, MediaPipe, OpenCV, NumPy, SciPy, FFmpeg, Node test runner, pytest, Vitest, Playwright.

## Global Constraints

- Treat `/Users/zn/workspace/shotAI/docs/shot-comparison/prd.md` and `/Users/zn/workspace/shotAI/docs/shot-comparison/technical-design.md` as the implementation source of truth; this plan narrows execution order but does not replace either document.
- Keep all source code and repository metadata inside `/Users/zn/workspace/shotAI/MvpDemo`.
- Use one local video, one parsed template, one shooting hand, one `ComparisonResult`, and one shared `renderTimeline` per report.
- Do not implement basketball or hoop detection, real release detection, 3D inference, multi-view capture, mirroring, scoring, diagnosis, correction advice, accounts, cloud storage, URL ingestion, or H5 camera capture.
- `release_pose_proxy` is always a pose-only proxy and must never be presented as actual ball release.
- A rejected input produces a `QualityReport` but never a fabricated `MotionArtifact` or report.
- Low-confidence regions are unavailable and never highlighted.
- Runtime data, MediaPipe model files, and real videos must remain untracked.
- Bind API and Worker to `127.0.0.1`; the Worker accepts only paths below the configured data root.
- Tests may use deterministic fixtures, but the product must not expose a fake-data mode.
- Every task ends with relevant fresh verification and one focused commit.

---

## File Map

```text
.github/workflows/ci.yml                         CI for Node, Python, and web checks
.gitignore                                       Runtime/model/video exclusion
.node-version                                    Node 24 floor
package.json                                     Workspace commands
pnpm-workspace.yaml                              Node workspace boundaries
tsconfig.base.json                               Shared strict TypeScript settings
playwright.config.ts                             Chromium/WebKit E2E configuration
scripts/check-env.mjs                            Toolchain diagnostics
scripts/download-pose-model.mjs                  Explicit model download and hash output
scripts/dev.mjs                                  Starts Worker, API, and web with cleanup
packages/contracts/src/*                         Runtime schemas, types, errors, fixtures
packages/comparison-engine/src/*                 Compatibility, phases, DTW, differences
apps/api/src/*                                   Fastify routes, SQLite, files, jobs, reports
apps/web/src/*                                   Upload flows, processing, reports, renderers
services/pose-worker/app/*                       Video, pose, quality, events, normalization
services/pose-worker/tests/*                     Python unit and API tests
fixtures/manifest.example.json                   Real-sample manifest format only
docs/development.md                              Setup and daily commands
docs/validation.md                               Engineering and real-sample acceptance
```

## Task 1: Workspace and shared contracts

**Files:**
- Create: `.gitignore`, `.node-version`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `scripts/check-env.mjs`, `scripts/download-pose-model.mjs`
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/enums.ts`, `motion-artifact.ts`, `comparison-result.ts`, `api.ts`, `errors.ts`, `index.ts`
- Create: `packages/contracts/test/contracts.test.ts`, `packages/contracts/test/fixtures.ts`
- Create: `fixtures/manifest.example.json`

**Interfaces:**
- Consumes: the enums and schemas in the approved design specification.
- Produces: `MotionArtifactSchema`, `ComparisonResultSchema`, `QualityReportSchema`, `ReportBundleSchema`, `ApiErrorSchema`, `IdPrefix`, and their static TypeScript types.

- [ ] **Step 1: Add workspace configuration and write failing contract tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { Value } from '@sinclair/typebox/value';
import {
  ComparisonResultSchema,
  MotionArtifactSchema,
  QualityReportSchema,
} from '../src/index.ts';
import {
  acceptedMotionArtifact,
  comparisonResult,
  rejectedQualityReport,
} from './fixtures.ts';

test('accepted motion artifacts contain six ordered events', () => {
  assert.equal(Value.Check(MotionArtifactSchema, acceptedMotionArtifact), true);
  assert.deepEqual(Object.keys(acceptedMotionArtifact.events), [
    'prep_start',
    'body_lowest',
    'lower_body_extension_start',
    'shooting_arm_lift',
    'release_pose_proxy',
    'follow_through_end',
  ]);
});

test('rejected quality reports do not require an artifact', () => {
  assert.equal(Value.Check(QualityReportSchema, rejectedQualityReport), true);
});

test('one result owns the shared render timeline', () => {
  assert.equal(Value.Check(ComparisonResultSchema, comparisonResult), true);
  assert.equal(comparisonResult.previews.frameCount, comparisonResult.renderTimeline.length);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `pnpm install && pnpm --filter @shot-ai/contracts test`

Expected: FAIL because `../src/index.ts` and the schemas do not exist.

- [ ] **Step 3: Implement closed TypeBox schemas and exports**

```ts
export const MotionEventNames = [
  'prep_start',
  'body_lowest',
  'lower_body_extension_start',
  'shooting_arm_lift',
  'release_pose_proxy',
  'follow_through_end',
] as const;

export const BodyRegions = [
  'lower_body',
  'torso',
  'shooting_arm',
  'guide_arm',
  'whole_body_timing',
] as const;

export const IdPrefix = {
  file: 'file_',
  template: 'tpl_',
  comparison: 'cmp_',
  job: 'job_',
  artifact: 'artifact_',
  result: 'result_',
} as const;
```

Every schema uses `{ additionalProperties: false }`; `release_pose_proxy` requires `isProxy: true`; `ComparisonResult.previews.fps` is `Type.Literal(30)`; and all confidence/progress fields use inclusive `0..1` bounds.

- [ ] **Step 4: Verify GREEN and the environment script**

Run: `pnpm --filter @shot-ai/contracts test && pnpm typecheck && node scripts/check-env.mjs`

Expected: contract tests and typecheck PASS; the environment script exits non-zero until Python 3.11 and FFmpeg are installed, while naming each missing executable.

- [ ] **Step 5: Commit**

```bash
git add .gitignore .node-version package.json pnpm-workspace.yaml tsconfig.base.json scripts packages/contracts fixtures/manifest.example.json pnpm-lock.yaml
git commit -m "feat: establish workspace contracts"
```

## Task 2: SQLite, private files, and job state

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/api/migrations/001_initial.sql`
- Create: `apps/api/src/config.ts`, `db/database.ts`, `db/migrate.ts`
- Create: `apps/api/src/files/file-store.ts`
- Create: `apps/api/src/repositories/files.ts`, `templates.ts`, `comparisons.ts`, `jobs.ts`
- Create: `apps/api/src/jobs/state-machine.ts`, `jobs/recovery.ts`
- Create: `apps/api/test/database.test.ts`, `file-store.test.ts`, `job-state.test.ts`

**Interfaces:**
- Consumes: `ApiError`, ID prefixes, job/entity statuses from `@shot-ai/contracts`.
- Produces: `createDatabase(path)`, `FileStore`, repositories, `transitionJob()`, `recoverInterruptedJobs()`.

- [ ] **Step 1: Write failing persistence tests**

```ts
test('job transitions append an event in the same transaction', () => {
  const app = createTestDatabase();
  const job = app.jobs.create({ type: 'template', entityId: 'tpl_1' });
  app.jobs.transition(job.id, { status: 'running', stage: 'validating_file' });
  assert.equal(app.jobs.get(job.id)?.stage, 'validating_file');
  assert.deepEqual(app.jobs.events(job.id).map((event) => event.stage), [null, 'validating_file']);
});

test('rejected jobs cannot be retried', () => {
  assert.throws(() => retryJob(rejectedJob), /JOB_NOT_RETRYABLE/);
});

test('file store hashes bytes and never uses the original name as a path', async () => {
  const stored = await store.write(streamOf('video-bytes'), { originalName: '../../shot.mp4' });
  assert.match(stored.relativePath, /^uploads\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}$/);
  assert.equal(stored.sha256, sha256('video-bytes'));
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @shot-ai/api test --test-name-pattern="job|file store"`

Expected: FAIL because database, state-machine, and file-store modules are missing.

- [ ] **Step 3: Implement migration, repositories, atomic writes, and recovery**

```ts
export const JobTransitions = {
  queued: new Set(['running', 'failed']),
  running: new Set(['queued', 'ready', 'rejected', 'failed']),
  ready: new Set<string>(),
  rejected: new Set<string>(),
  failed: new Set(['queued']),
} as const;

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!JobTransitions[from].has(to)) {
    throw apiError('INVALID_JOB_TRANSITION', 'validation', false, { from, to });
  }
}
```

The migration enables foreign keys, WAL, and a 5000ms busy timeout; creates `files`, `motion_artifacts`, `templates`, `comparisons`, `comparison_results`, `jobs`, and `job_events`; and places each state update plus event insert in one SQLite transaction. `FileStore.write()` streams to `data/tmp/*.partial`, hashes while writing, validates size, and atomically renames into a generated path.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @shot-ai/api test && pnpm --filter @shot-ai/api typecheck`

Expected: all persistence, reference-count, soft-delete, retry, and restart-recovery tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/contracts pnpm-lock.yaml
git commit -m "feat: persist files and job state"
```

## Task 3: Pose Worker analysis pipeline

**Files:**
- Create: `services/pose-worker/pyproject.toml`, `requirements.lock`, `.python-version`
- Create: `services/pose-worker/app/config.py`, `models.py`
- Create: `services/pose-worker/app/video/probe.py`, `timing.py`, `camera.py`
- Create: `services/pose-worker/app/pose/backend.py`, `mediapipe_backend.py`, `tracking.py`
- Create: `services/pose-worker/app/quality/evaluate.py`, `thresholds.py`
- Create: `services/pose-worker/app/events/detect.py`, `signals.py`
- Create: `services/pose-worker/app/normalization/coordinates.py`, `retarget.py`
- Create: `services/pose-worker/app/pipeline.py`
- Create: `services/pose-worker/tests/test_probe.py`, `test_quality.py`, `test_events.py`, `test_normalization.py`, `test_pipeline.py`

**Interfaces:**
- Consumes: a local video path, `sourceType`, `shootingHand`, `normalSpeedConfirmed`, and versioned thresholds.
- Produces: `AnalyzeMotionAccepted(qualityReport, motionArtifact)` or `AnalyzeMotionRejected(qualityReport, rejectionCodes)`.

- [ ] **Step 1: Write failing quality, event, and normalization tests**

```py
def test_rejects_user_when_required_landmarks_leave_frame():
    report = evaluate_quality(user_sequence(body_coverage=0.82), USER_THRESHOLDS)
    assert report.status == "rejected"
    assert "USER_BODY_OUT_OF_FRAME" in report.rejection_codes

def test_detects_six_strictly_ordered_pose_events():
    events = detect_events(synthetic_shot_signals())
    frames = [events[name].frame_index for name in MOTION_EVENT_NAMES]
    assert frames == sorted(frames)
    assert events["release_pose_proxy"].is_proxy is True

def test_retargeting_preserves_joint_directions_not_segment_lengths():
    user, template = different_body_proportion_sequences()
    normalized = retarget_pair(user, template)
    assert normalized.user.segment_lengths == normalized.template.segment_lengths
    assert normalized.user.elbow_angle == pytest.approx(user.elbow_angle)
```

- [ ] **Step 2: Verify RED**

Run: `cd services/pose-worker && python3.11 -m pytest tests/test_quality.py tests/test_events.py tests/test_normalization.py -q`

Expected: FAIL because `app.quality`, `app.events`, and `app.normalization` do not exist.

- [ ] **Step 3: Implement the deterministic pipeline and MediaPipe adapter**

```py
def analyze_motion(request: AnalyzeMotionRequest, backend: PoseBackend) -> AnalyzeMotionResponse:
    metadata = probe_video(request.file_path)
    timing = inspect_timing(request.file_path, metadata)
    raw_frames = backend.analyze_video(request.file_path, metadata)
    tracked = select_continuous_subject(raw_frames)
    quality = evaluate_quality(metadata, timing, tracked, request.source_type, request.thresholds)
    if quality.status == "rejected":
        return AnalyzeMotionRejected(quality_report=quality, rejection_codes=quality.rejection_codes)
    filtered = smooth_for_features(tracked)
    events = detect_events(filtered, request.shooting_hand, request.thresholds)
    quality = quality.with_event_checks(events)
    if quality.status == "rejected":
        return AnalyzeMotionRejected(quality_report=quality, rejection_codes=quality.rejection_codes)
    normalized = normalize_and_retarget(tracked, filtered)
    return AnalyzeMotionAccepted(
        quality_report=quality,
        motion_artifact=build_motion_artifact(request, metadata, tracked, normalized, events, quality),
    )
```

Use `ffprobe` JSON output for real container, codec, duration, dimensions, frame rate, rotation, and timestamp evidence instead of trusting MIME or extensions. Use a 3-frame median followed by a 7-frame, order-2 Savitzky-Golay filter only for features. Keep raw landmarks immutable. Pass monotonic source timestamps to MediaPipe VIDEO mode and preserve all 33 landmark visibility/presence values.

- [ ] **Step 4: Verify GREEN**

Run: `cd services/pose-worker && python3.11 -m pytest -q`

Expected: probe, gate, event order, confidence, normalization, and accepted/rejected union tests PASS without requiring a real user video.

- [ ] **Step 5: Commit**

```bash
git add services/pose-worker scripts/download-pose-model.mjs
git commit -m "feat: analyze pose motion artifacts"
```

## Task 4: Comparison Engine and common timeline

**Files:**
- Create: `packages/comparison-engine/package.json`, `tsconfig.json`
- Create: `packages/comparison-engine/src/compatibility/check.ts`
- Create: `packages/comparison-engine/src/phases/split.ts`
- Create: `packages/comparison-engine/src/dtw/constrained-dtw.ts`, `features.ts`
- Create: `packages/comparison-engine/src/differences/regions.ts`, `windows.ts`
- Create: `packages/comparison-engine/src/timeline/build.ts`, `index.ts`
- Create: `packages/comparison-engine/test/compatibility.test.ts`, `dtw.test.ts`, `differences.test.ts`, `timeline.test.ts`

**Interfaces:**
- Consumes: one accepted template `MotionArtifact`, one accepted user `MotionArtifact`, and comparison thresholds.
- Produces: `compareMotions(input): ComparisonResult` and `ComparisonRejected` for incompatibility or low-confidence alignment.

- [ ] **Step 1: Write failing engine tests**

```ts
test('same-hand compatibility is mandatory', () => {
  assert.throws(() => checkCompatibility(rightTemplate, leftUser), /HAND_MISMATCH/);
});

test('DTW is monotonic and never crosses event phases', () => {
  const path = alignPhases(templateArtifact, userArtifact, thresholds);
  assert.equal(path.every((pair, index) => index === 0 || pair.user >= path[index - 1]!.user), true);
  assert.equal(path.every((pair) => pair.templatePhase === pair.userPhase), true);
});

test('low-confidence regions are never highlighted', () => {
  const samples = calculateDifferences(lowConfidencePair);
  assert.equal(samples.every((sample) => sample.differences.torso.highlighted === false), true);
});

test('preview frames and render timeline have identical cardinality', () => {
  const result = compareMotions(validPair);
  assert.equal(result.renderTimeline.length, result.previews.frameCount);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @shot-ai/comparison-engine test`

Expected: FAIL because compatibility, alignment, and timeline functions are missing.

- [ ] **Step 3: Implement compatibility, five phase-local DTWs, differences, and windows**

```ts
export function compareMotions(input: CompareInput): ComparisonResult {
  const compatibility = checkCompatibility(input.template, input.user);
  const phases = splitPhases(input.template.events, input.user.events);
  const paths = phases.map((phase) => constrainedDtw({
    template: phase.templateFrames,
    user: phase.userFrames,
    bandRatio: 0.15,
    maxRepeatedOutputFrames: 4,
    cost: weightedFeatureCost,
  }));
  const renderTimeline = buildTimeline(paths, input.template, input.user, input.thresholds);
  return buildComparisonResult({
    input,
    compatibility,
    phases,
    renderTimeline,
    deviationWindows: mergeDeviationWindows(renderTimeline, 2),
  });
}
```

Weights are angle `0.50`, retargeted position `0.30`, and normalized velocity `0.20`; absent dimensions are removed and remaining weights renormalized. Highlighting requires confidence `>=0.60`, one configured difference threshold, and three consecutive preview frames.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @shot-ai/comparison-engine test && pnpm --filter @shot-ai/comparison-engine typecheck`

Expected: compatibility, hard anchors, band, monotonicity, missing-feature weights, confidence, persistence, window merge, and timeline tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/comparison-engine packages/contracts pnpm-lock.yaml
git commit -m "feat: align and compare shot motion"
```

## Task 5: Worker HTTP API and aligned previews

**Files:**
- Create: `services/pose-worker/app/api/main.py`, `security.py`
- Create: `services/pose-worker/app/previews/render.py`
- Create: `services/pose-worker/tests/test_api.py`, `test_preview.py`, `test_security.py`

**Interfaces:**
- Consumes: `/internal/v1/analyze-motion` and `/internal/v1/render-aligned-previews` request models.
- Produces: local-only health, analysis, and preview endpoints with discriminated accepted/rejected responses.

- [ ] **Step 1: Write failing API and preview tests**

```py
def test_worker_rejects_paths_outside_data_root(client, tmp_path):
    response = client.post("/internal/v1/analyze-motion", json=request_for("/etc/passwd"))
    assert response.status_code == 400
    assert response.json()["code"] == "PATH_OUTSIDE_DATA_ROOT"

def test_preview_mapping_has_one_output_frame_per_timeline_sample(tmp_path):
    result = render_aligned_previews(video_pair(tmp_path), timeline_of_length(18), fps=30)
    assert result.template.frame_count == 18
    assert result.user.frame_count == 18
    assert result.template.duration_ms == 600
```

- [ ] **Step 2: Verify RED**

Run: `cd services/pose-worker && python3.11 -m pytest tests/test_api.py tests/test_preview.py tests/test_security.py -q`

Expected: FAIL because API, path security, and preview renderer modules are missing.

- [ ] **Step 3: Implement the local Worker surface**

```py
@app.post("/internal/v1/analyze-motion", response_model=AnalyzeMotionResponse)
def analyze(request: AnalyzeMotionRequest) -> AnalyzeMotionResponse:
    source = require_data_path(request.file_path, settings.data_root)
    output = require_data_path(request.output_path, settings.data_root)
    return analyze_motion(request.model_copy(update={"file_path": source, "output_path": output}), app.state.pose_backend)

@app.post("/internal/v1/render-aligned-previews", response_model=PreviewResponse)
def render(request: PreviewRequest) -> PreviewResponse:
    return render_aligned_previews(validate_preview_request(request, settings.data_root))
```

Render H.264 MP4 without audio at exactly 30fps and one output frame per `renderTimeline` sample. Invoke FFmpeg through argument arrays only and write `.partial` outputs before atomic rename.

- [ ] **Step 4: Verify GREEN**

Run: `cd services/pose-worker && python3.11 -m pytest -q`

Expected: all Worker unit/API tests PASS and health reports `modelLoaded` truthfully.

- [ ] **Step 5: Commit**

```bash
git add services/pose-worker
git commit -m "feat: expose local pose worker"
```

## Task 6: Fastify API vertical slice

**Files:**
- Create: `apps/api/src/server.ts`, `app.ts`
- Create: `apps/api/src/worker-client/client.ts`, `http-worker-client.ts`
- Create: `apps/api/src/jobs/runner.ts`, `template-job.ts`, `comparison-job.ts`
- Create: `apps/api/src/routes/templates.ts`, `comparisons.ts`, `jobs.ts`, `files.ts`, `debug.ts`
- Create: `apps/api/src/report/build-report.ts`, `range.ts`
- Create: `apps/api/test/templates.integration.test.ts`, `comparisons.integration.test.ts`, `retry.integration.test.ts`, `range.test.ts`

**Interfaces:**
- Consumes: Worker endpoints, comparison engine, SQLite repositories, private file store.
- Produces: all `/api/v1` template, comparison, job, report, file, rerun, retry, delete, and debug endpoints from the technical design.

- [ ] **Step 1: Write failing API integration tests with a test-only Worker adapter**

```ts
test('template upload becomes ready only after a valid artifact', async () => {
  const response = await app.inject(templateUploadRequest(validVideoBytes));
  assert.equal(response.statusCode, 202);
  await runner.drain();
  const template = await app.inject({ method: 'GET', url: `/api/v1/templates/${response.json().templateId}` });
  assert.equal(template.json().status, 'ready');
});

test('same-hand mismatch is rejected by the API even if the client submits it', async () => {
  const response = await app.inject(comparisonUploadRequest({ templateId: rightTemplate.id, shootingHand: 'left' }));
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'HAND_MISMATCH');
});

test('rejected jobs return 409 from retry', async () => {
  const response = await app.inject({ method: 'POST', url: `/api/v1/jobs/${rejectedJob.id}/retry` });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'JOB_NOT_RETRYABLE');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @shot-ai/api test`

Expected: FAIL because Fastify app, routes, clients, and runners are missing.

- [ ] **Step 3: Implement upload, jobs, reports, Range video, rerun, retry, and exports**

```ts
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger, bodyLimit: 300 * 1024 * 1024 });
  await app.register(multipart, { limits: { files: 1, fileSize: 300 * 1024 * 1024 } });
  await app.register(templateRoutes, { prefix: '/api/v1', ...deps });
  await app.register(comparisonRoutes, { prefix: '/api/v1', ...deps });
  await app.register(jobRoutes, { prefix: '/api/v1', ...deps });
  await app.register(fileRoutes, { prefix: '/api/v1', ...deps });
  await app.register(debugRoutes, { prefix: '/api/v1', ...deps });
  app.setErrorHandler(toPublicApiError);
  return app;
}
```

The runner is single-concurrency, persists each real stage, validates every Worker artifact and engine result against TypeBox before storing it, and maps input failures to `rejected` while mapping dependency/process/storage failures to `failed`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @shot-ai/api test && pnpm --filter @shot-ai/api typecheck`

Expected: upload, ready, rejection, failure, retry, rerun-version, restart-recovery, Range, schema, soft-delete, and hash/export tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/contracts packages/comparison-engine pnpm-lock.yaml
git commit -m "feat: serve template and comparison workflows"
```

## Task 7: H5 template, comparison, and processing flows

**Files:**
- Create: `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `apps/web/src/main.tsx`, `app.tsx`, `styles/tokens.css`, `styles/global.css`
- Create: `apps/web/src/api/client.ts`, `poll-job.ts`
- Create: `apps/web/src/features/templates/template-page.tsx`, `template-form.tsx`, `template-list.tsx`
- Create: `apps/web/src/features/comparisons/create-comparison-page.tsx`
- Create: `apps/web/src/features/jobs/processing-page.tsx`, `job-stage-list.tsx`, `error-action.tsx`
- Create: `apps/web/test/template-page.test.tsx`, `create-comparison.test.tsx`, `processing-page.test.tsx`

**Interfaces:**
- Consumes: the public API and shared API types.
- Produces: hash routes `/templates`, `/comparisons/new`, `/jobs/:id`, `/reports/:id` and accessible upload/status screens.

- [ ] **Step 1: Write failing UI behavior tests**

```tsx
it('only lists ready templates when creating a comparison', async () => {
  render(<CreateComparisonPage api={apiWithTemplates(['ready', 'running', 'rejected'])} />);
  expect(await screen.findAllByRole('radio')).toHaveLength(1);
});

it('blocks a shooting-hand mismatch before upload', async () => {
  render(<CreateComparisonPage api={apiWithRightHandTemplate()} />);
  await userEvent.click(screen.getByLabelText('左手'));
  expect(screen.getByText('用户投篮手与模板不一致')).toBeVisible();
  expect(screen.getByRole('button', { name: '开始分析' })).toBeDisabled();
});

it('renders rejected input as retake guidance, not a retry button', async () => {
  render(<ProcessingPage api={apiWithRejectedJob('USER_BODY_OUT_OF_FRAME')} />);
  expect(await screen.findByText('固定手机并确保头和脚完整可见后重拍')).toBeVisible();
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @shot-ai/web test`

Expected: FAIL because the pages and API client do not exist.

- [ ] **Step 3: Implement the upload/status workflow and visual foundation**

```ts
export async function pollJob(api: ApiClient, jobId: string, visible: () => boolean): Promise<JobSummary> {
  for (;;) {
    const job = await api.getJob(jobId);
    if (job.status === 'ready' || job.status === 'rejected' || job.status === 'failed') return job;
    await delay(visible() ? 1000 : 5000);
  }
}
```

Use deep blue-gray work surfaces, template blue, user orange, and evidence red. Keep labels explicit, use at least 44px controls, show real completed stages without fake percentages, and preserve keyboard focus plus reduced-motion support.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @shot-ai/web test && pnpm --filter @shot-ai/web typecheck && pnpm --filter @shot-ai/web build`

Expected: H5 behavior tests, strict types, and production build PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/contracts pnpm-lock.yaml
git commit -m "feat: add upload and processing flows"
```

## Task 8: Shared playback and side-by-side report

**Files:**
- Create: `apps/web/src/features/report/report-page.tsx`, `report-mode-tabs.tsx`
- Create: `apps/web/src/playback/state.ts`, `controller.ts`, `timeline.ts`
- Create: `apps/web/src/components/skeleton.tsx`
- Create: `apps/web/src/renderers/side-by-side/side-by-side.tsx`, `video-sync.ts`
- Create: `apps/web/test/playback.test.ts`, `report-state.test.tsx`, `side-by-side.test.tsx`

**Interfaces:**
- Consumes: one `ReportBundle`.
- Produces: one root `PlaybackState`, shared controls, event navigation, and synchronized preview videos with optional source-coordinate skeletons.

- [ ] **Step 1: Write failing playback and renderer tests**

```ts
test('switching modes preserves sample and playing state', () => {
  const before = { ...initialPlaybackState, mode: 'side_by_side', playing: true, sampleIndex: 37 };
  const after = playbackReducer(before, { type: 'setMode', mode: 'skeleton_overlay' });
  assert.equal(after.playing, true);
  assert.equal(after.sampleIndex, 37);
});

test('event selection jumps to the shared sample and pauses', () => {
  const after = playbackReducer(playingState, { type: 'selectEvent', event: 'body_lowest', sampleIndex: 18 });
  assert.equal(after.sampleIndex, 18);
  assert.equal(after.playing, false);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @shot-ai/web test -- playback report-state side-by-side`

Expected: FAIL because the playback reducer and renderer do not exist.

- [ ] **Step 3: Implement the root controller and side-by-side synchronization**

```ts
export function sampleFromProgress(progress: number, length: number): number {
  return Math.round(Math.max(0, Math.min(1, progress)) * (length - 1));
}

export function correctVideoDrift(master: HTMLVideoElement, follower: HTMLVideoElement): void {
  if (Math.abs(master.currentTime - follower.currentTime) > 0.04) {
    follower.currentTime = master.currentTime;
  }
}
```

Use the user preview as master clock, pause both videos when either buffers, seek both on scrub, drive SVG overlays with `requestVideoFrameCallback` and an animation-frame fallback, and make the skeleton toggle visual-only.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @shot-ai/web test && pnpm --filter @shot-ai/web build`

Expected: playback, shared-state, drift, buffering, seek, event, and skeleton-toggle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add synchronized video report"
```

## Task 9: Unified-coordinate skeleton overlay

**Files:**
- Create: `apps/web/src/renderers/skeleton-overlay/skeleton-overlay.tsx`, `layout.ts`
- Create: `apps/web/src/components/difference-highlight.tsx`
- Create: `apps/web/test/skeleton-overlay.test.tsx`

**Interfaces:**
- Consumes: current normalized/retargeted skeletons and server-computed differences.
- Produces: overlay/separated SVG layouts that do not mutate playback or recompute differences.

- [ ] **Step 1: Write the failing overlay test**

```tsx
it('changes only SVG transforms when toggling separated view', async () => {
  const { rerender } = render(<SkeletonOverlay frame={frame} sample={sample} layout="overlay" />);
  const before = screen.getByTestId('user-skeleton').getAttribute('data-sample-index');
  rerender(<SkeletonOverlay frame={frame} sample={sample} layout="separated" />);
  expect(screen.getByTestId('user-skeleton')).toHaveAttribute('data-sample-index', before);
  expect(screen.getByTestId('user-skeleton').getAttribute('transform')).not.toBe('translate(0 0)');
});

it('does not render a difference highlight for an unavailable region', () => {
  render(<SkeletonOverlay frame={frame} sample={sampleWithUnavailableTorso} layout="overlay" />);
  expect(screen.queryByTestId('highlight-torso')).toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @shot-ai/web test -- skeleton-overlay`

Expected: FAIL because the overlay renderer is missing.

- [ ] **Step 3: Implement the SVG renderer**

```ts
export const skeletonLayout = {
  overlay: { template: 'translate(0 0)', user: 'translate(0 0)' },
  separated: { template: 'translate(-0.55 0)', user: 'translate(0.55 0)' },
} as const;
```

Render the template as translucent dashed lines, the user as solid foreground lines, and only server-flagged persistent differences as connectors or region outlines. Label them “差异较大”, never “错误动作”.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @shot-ai/web test -- skeleton-overlay && pnpm --filter @shot-ai/web build`

Expected: overlay/separated, unavailable-region, semantic copy, and build checks PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: render normalized skeleton overlay"
```

## Task 10: Dynamic reference motion channel

**Files:**
- Create: `apps/web/src/renderers/motion-channel/motion-channel.tsx`, `channel-geometry.ts`, `region-tracks.tsx`
- Create: `apps/web/test/motion-channel.test.tsx`, `channel-geometry.test.ts`

**Interfaces:**
- Consumes: current template/user retargeted skeletons, `channelRadiusByRegion`, region confidence, and `phaseDelta` from the same timeline sample.
- Produces: a moving reference channel, user skeleton, out-of-channel evidence, and five region phase tracks.

- [ ] **Step 1: Write failing channel tests**

```ts
test('channel geometry uses configured template radii', () => {
  const channel = buildReferenceChannel(templateSkeleton, radiusByRegion);
  assert.equal(channel.segments.find((segment) => segment.region === 'shooting_arm')?.radius, 0.08);
});

it('renders five region tracks without a score', () => {
  render(<MotionChannel frame={frame} sample={sample} visualization={visualization} />);
  expect(screen.getAllByTestId(/^region-track-/)).toHaveLength(5);
  expect(screen.queryByText(/分|评分|标准范围/)).toBeNull();
  expect(screen.getByText('参考动作通道')).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @shot-ai/web test -- motion-channel channel-geometry`

Expected: FAIL because channel geometry and renderer are missing.

- [ ] **Step 3: Implement channel geometry and tracks**

```ts
export function trackOffset(phaseDelta: number | null, comparable: boolean): number | null {
  if (!comparable || phaseDelta === null) return null;
  return Math.max(-1, Math.min(1, phaseDelta));
}

export function isOutsideReferenceChannel(distance: number, radius: number, confidence: number): boolean {
  return confidence >= 0.60 && distance > radius;
}
```

Build thick translucent template segments and joint circles from the current template skeleton, place the user skeleton above them, and show out-of-channel emphasis only when the server sample is comparable and highlighted. Use `referenceChannel` in data/UI semantics and never `standardRange`. Do not include the old fake match/deviation switch.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @shot-ai/web test -- motion-channel channel-geometry && pnpm --filter @shot-ai/web build`

Expected: dynamic channel, confidence, semantics, five tracks, and build tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: render dynamic reference channel"
```

## Task 11: Debug evidence, E2E, operations, and documentation

**Files:**
- Create: `apps/web/src/features/report/debug-panel.tsx`, `difference-chart.tsx`, `export-links.tsx`
- Create: `apps/web/e2e/workflow.spec.ts`, `report.spec.ts`
- Create: `playwright.config.ts`, `scripts/dev.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`, `docs/development.md`, `docs/validation.md`
- Modify: `docs/superpowers/specs/2026-07-15-shot-comparison-mvp-design.md`

**Interfaces:**
- Consumes: debug summary/export endpoints, all app commands, and a test-only API fixture harness.
- Produces: traceable desktop evidence, responsive E2E coverage, reproducible setup, and CI.

- [ ] **Step 1: Write failing E2E and debug tests**

```ts
test('three report modes preserve the exact sample and playing state', async ({ page }) => {
  await openReadyReport(page);
  await page.getByRole('button', { name: '播放' }).click();
  await scrubToSample(page, 42);
  await page.getByRole('tab', { name: '骨架叠加' }).click();
  await expect(page.getByTestId('report-root')).toHaveAttribute('data-sample-index', '42');
  await page.getByRole('tab', { name: '动作通道' }).click();
  await expect(page.getByTestId('report-root')).toHaveAttribute('data-sample-index', '42');
});

test('320px report has no horizontal overflow and exposes 44px controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openReadyReport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect((await page.getByRole('button', { name: '播放' }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm e2e`

Expected: FAIL because the fixture harness, debug panel, config, and full routes are incomplete.

- [ ] **Step 3: Implement evidence UI, scripts, CI, and operator docs**

The debug panel must show current raw/normalized frames, point confidence, six event pairs, frame mapping, five regional difference curves, unavailable regions, quality checks, hashes, versions, thresholds, and stage durations. Export links must download `MotionArtifact`, `QualityReport`, and `ComparisonResult` from guarded API endpoints.

`README.md` must provide these exact entry commands:

```bash
brew install python@3.11 ffmpeg
corepack enable
pnpm install
python3.11 -m venv .venv
.venv/bin/pip install -r services/pose-worker/requirements.lock
pnpm model:download
pnpm dev
pnpm verify
```

`docs/validation.md` must separate automated engineering evidence from the unexecuted real-video experiment and provide a table for 1–3 templates, 5–8 valid user clips, 4–6 invalid clips, six-event median error, repeatability, false highlights, and cross-mode mapping mismatch.

- [ ] **Step 4: Run fresh full verification**

Run: `pnpm verify`

Expected: formatting/lint, TypeScript, Node tests, Python tests, web build, and Playwright Chromium/WebKit PASS with zero failures. Then run `git diff --check` and confirm no tracked model, video, database, artifact, preview, export, temporary, virtualenv, or secret files.

- [ ] **Step 5: Commit**

```bash
git add .github README.md docs apps/web playwright.config.ts scripts package.json pnpm-lock.yaml
git commit -m "docs: complete MVP validation workflow"
```

## Task 12: Final repository audit and push

**Files:**
- Verify only; modify the smallest relevant file if an audit exposes a real defect.

**Interfaces:**
- Consumes: the complete repository and remote `git@github.com:Fan-zexu/shot-ai-demo.git`.
- Produces: a clean `main` with focused history pushed to GitHub.

- [ ] **Step 1: Audit requirements and repository contents**

Run:

```bash
pnpm verify
git diff --check
git status --short
git log --oneline --reverse
git ls-files | rg '\.(mp4|mov|avi|mkv|task|db|sqlite|json\.gz)$' || true
```

Expected: verification exits `0`, working tree is clean, commit history is feature-oriented, and no runtime/model/video/database artifacts are tracked.

- [ ] **Step 2: Confirm remote and push**

Run:

```bash
git remote get-url origin
git push -u origin main
git ls-remote --symref origin HEAD
```

Expected: remote URL is exactly `git@github.com:Fan-zexu/shot-ai-demo.git`; push succeeds; remote HEAD resolves to `refs/heads/main`.

- [ ] **Step 3: Read back the pushed commit**

Run: `git ls-remote origin refs/heads/main`

Expected: remote `main` hash equals local `git rev-parse HEAD`.
