import type {
  BodyRegion,
  ComparisonResult,
  MotionArtifact,
  MotionEventName,
  MotionFrame,
  QualityReport,
  RegionDifferences,
} from '../src/index.ts';

const bodyRegions: BodyRegion[] = [
  'lower_body',
  'torso',
  'shooting_arm',
  'guide_arm',
  'whole_body_timing',
] as const;

const regionConfidence = Object.fromEntries(
  bodyRegions.map((region) => [region, 0.9]),
) as MotionFrame['regionConfidence'];

const landmarks = [
  { name: 'left_hip', x: 0.45, y: 0.55, z: 0, visibility: 0.95, presence: 0.98 },
  { name: 'right_hip', x: 0.55, y: 0.55, z: 0, visibility: 0.95, presence: 0.98 },
];

const normalizedLandmarks = [
  { name: 'left_hip', x: -0.05, y: 0, confidence: 0.95 },
  { name: 'right_hip', x: 0.05, y: 0, confidence: 0.95 },
];

const eventNames: MotionEventName[] = [
  'prep_start',
  'body_lowest',
  'lower_body_extension_start',
  'shooting_arm_lift',
  'release_pose_proxy',
  'follow_through_end',
] as const;

const events = Object.fromEntries(
  eventNames.map((name, index) => [
    name,
    {
      name,
      frameIndex: index,
      timestampMs: index * 100,
      confidence: 0.9,
      evidence: { signal: 0.8 },
      isProxy: name === 'release_pose_proxy',
    },
  ]),
) as unknown as MotionArtifact['events'];

export const acceptedMotionArtifact: MotionArtifact = {
  schemaVersion: '1.0',
  artifactId: 'artifact_template_1',
  sourceType: 'template',
  sourceFileId: 'file_template_1',
  sourceSha256: 'a'.repeat(64),
  createdAt: '2026-07-15T10:00:00.000Z',
  video: {
    durationMs: 600,
    width: 1280,
    height: 720,
    rotationDeg: 0,
    nominalFps: 30,
    frameCount: 6,
    container: 'mov,mp4,m4a,3gp,3g2,mj2',
    codec: 'h264',
  },
  capture: {
    shootingHand: 'right',
    detectedView: 'shooting_side',
    facingDirection: 'right',
    normalSpeedConfirmed: true,
  },
  quality: {
    checks: [],
    overallPoseConfidence: 0.9,
    comparableRegions: [...bodyRegions],
    rejectedRegions: {},
  },
  events,
  frames: Array.from({ length: 6 }, (_, frameIndex) => ({
    frameIndex,
    timestampMs: frameIndex * 100,
    poseConfidence: 0.9,
    landmarks,
    normalizedLandmarks,
    retargetedLandmarks: normalizedLandmarks,
    jointAnglesDeg: { right_elbow: 90 + frameIndex },
    regionConfidence,
  })),
  canonicalSkeleton: {
    segmentLengths: { torso: 1 },
    root: 'hip_center',
    scaleBasis: 'torso_length',
    facingDirection: 'right',
  },
  provenance: {
    modelName: 'MediaPipe Pose Landmarker',
    modelVersion: 'test',
    modelSha256: 'b'.repeat(64),
    pipelineVersion: '1.0.0',
    thresholdSnapshot: { poseConfidence: 0.6 },
    runtime: 'python-test',
    stageDurationsMs: { pose: 10 },
  },
};

export const rejectedQualityReport: QualityReport = {
  schemaVersion: '1.0',
  sourceFileId: 'file_rejected_1',
  sourceType: 'user',
  status: 'rejected',
  checks: [
    {
      code: 'USER_BODY_OUT_OF_FRAME',
      status: 'fail',
      measuredValue: 0.82,
      threshold: 0.9,
      evidenceFrameIndices: [2, 3],
      message: '人物没有保持全身入镜',
    },
  ],
  comparableRegions: ['shooting_arm'],
  rejectedRegions: { lower_body: 'feet_missing' },
  rejectionCodes: ['USER_BODY_OUT_OF_FRAME'],
  createdAt: '2026-07-15T10:00:00.000Z',
};

const differences = Object.fromEntries(
  bodyRegions.map((region) => [
    region,
    {
      angleDeltaDeg: 12,
      positionDelta: 0.09,
      templatePhaseProgress: 0.5,
      userPhaseProgress: 0.55,
      phaseDelta: 0.05,
      confidence: 0.9,
      comparable: true,
      highlighted: region === 'shooting_arm',
    },
  ]),
) as RegionDifferences;

export const comparisonResult: ComparisonResult = {
  schemaVersion: '1.0',
  resultId: 'result_1',
  comparisonId: 'cmp_1',
  templateArtifactId: 'artifact_template_1',
  userArtifactId: 'artifact_user_1',
  createdAt: '2026-07-15T10:01:00.000Z',
  compatibility: {
    shootingHand: 'right',
    templateView: 'shooting_side',
    userView: 'shooting_side',
    comparableRegions: [...bodyRegions],
    unavailableRegions: {},
  },
  phases: eventNames.slice(0, -1).map((startEvent, index) => ({
    index,
    startEvent,
    endEvent: eventNames[index + 1]!,
    startSampleIndex: index,
    endSampleIndex: index + 1,
  })),
  renderTimeline: Array.from({ length: 6 }, (_, sampleIndex) => ({
    sampleIndex,
    progress: sampleIndex / 5,
    phaseIndex: Math.min(sampleIndex, 4),
    phaseProgress: sampleIndex === 5 ? 1 : 0,
    templateFrameIndex: sampleIndex,
    templateTimestampMs: sampleIndex * 100,
    userFrameIndex: sampleIndex,
    userTimestampMs: sampleIndex * 100,
    differences,
  })),
  deviationWindows: [
    {
      region: 'shooting_arm',
      startSampleIndex: 0,
      endSampleIndex: 5,
      maxAngleDeltaDeg: 12,
      maxPositionDelta: 0.09,
      minConfidence: 0.9,
    },
  ],
  visualization: {
    channelRadiusByRegion: Object.fromEntries(
      bodyRegions.map((region) => [region, 0.08]),
    ) as ComparisonResult['visualization']['channelRadiusByRegion'],
    highlightPersistenceFrames: 3,
  },
  previews: {
    fps: 30,
    frameCount: 6,
    durationMs: 200,
    templateVideoFileId: 'file_template_preview_1',
    userVideoFileId: 'file_user_preview_1',
  },
  provenance: {
    comparisonAlgorithmVersion: '1.0.0',
    thresholdSnapshot: { angleDeltaDeg: 10 },
    stageDurationsMs: { compare: 5 },
  },
};
