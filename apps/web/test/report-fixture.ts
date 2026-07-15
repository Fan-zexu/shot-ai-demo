import type {
  BodyRegion,
  MotionEventName,
  NormalizedLandmark2D,
  RegionDifferences,
  ReportBundle,
} from '@shot-ai/contracts';

const regions: BodyRegion[] = [
  'lower_body',
  'torso',
  'shooting_arm',
  'guide_arm',
  'whole_body_timing',
];

const eventNames: MotionEventName[] = [
  'prep_start',
  'body_lowest',
  'lower_body_extension_start',
  'shooting_arm_lift',
  'release_pose_proxy',
  'follow_through_end',
];

const basePose: NormalizedLandmark2D[] = [
  { name: 'nose', x: 0, y: -0.9, confidence: 0.94 },
  { name: 'left_shoulder', x: -0.16, y: -0.58, confidence: 0.93 },
  { name: 'right_shoulder', x: 0.16, y: -0.58, confidence: 0.94 },
  { name: 'left_elbow', x: -0.26, y: -0.28, confidence: 0.91 },
  { name: 'right_elbow', x: 0.28, y: -0.36, confidence: 0.93 },
  { name: 'left_wrist', x: -0.28, y: 0, confidence: 0.9 },
  { name: 'right_wrist', x: 0.36, y: -0.14, confidence: 0.92 },
  { name: 'left_hip', x: -0.12, y: 0, confidence: 0.95 },
  { name: 'right_hip', x: 0.12, y: 0, confidence: 0.95 },
  { name: 'left_knee', x: -0.14, y: 0.5, confidence: 0.93 },
  { name: 'right_knee', x: 0.14, y: 0.5, confidence: 0.93 },
  { name: 'left_ankle', x: -0.15, y: 1, confidence: 0.91 },
  { name: 'right_ankle', x: 0.15, y: 1, confidence: 0.91 },
  { name: 'left_heel', x: -0.18, y: 1.07, confidence: 0.9 },
  { name: 'right_heel', x: 0.12, y: 1.07, confidence: 0.9 },
  { name: 'left_foot_index', x: -0.05, y: 1.1, confidence: 0.9 },
  { name: 'right_foot_index', x: 0.25, y: 1.1, confidence: 0.9 },
];

function differences(): RegionDifferences {
  return Object.fromEntries(regions.map((region) => [
    region,
    {
      angleDeltaDeg: 12,
      positionDelta: 0.09,
      templatePhaseProgress: 0.5,
      userPhaseProgress: 0.56,
      phaseDelta: 0.06,
      confidence: region === 'guide_arm' ? 0.4 : 0.9,
      comparable: true,
      highlighted: region === 'shooting_arm' || region === 'guide_arm',
    },
  ])) as RegionDifferences;
}

export function reportFixture(): ReportBundle {
  const renderTimeline = Array.from({ length: 6 }, (_, sampleIndex) => ({
    sampleIndex,
    progress: sampleIndex / 5,
    phaseIndex: Math.min(sampleIndex, 4),
    phaseProgress: sampleIndex === 5 ? 1 : 0,
    templateFrameIndex: sampleIndex * 2,
    templateTimestampMs: sampleIndex * 100,
    userFrameIndex: sampleIndex * 3,
    userTimestampMs: sampleIndex * 110,
    differences: differences(),
  }));
  return {
    comparison: {
      schemaVersion: '1.0',
      resultId: 'result_test',
      comparisonId: 'cmp_test',
      templateArtifactId: 'artifact_template',
      userArtifactId: 'artifact_user',
      createdAt: '2026-07-15T10:00:00.000Z',
      compatibility: {
        shootingHand: 'right',
        templateView: 'shooting_side',
        userView: 'shooting_side',
        comparableRegions: [...regions],
        unavailableRegions: {},
      },
      phases: eventNames.slice(0, -1).map((startEvent, index) => ({
        index,
        startEvent,
        endEvent: eventNames[index + 1]!,
        startSampleIndex: index,
        endSampleIndex: index + 1,
      })),
      renderTimeline,
      deviationWindows: [{
        region: 'shooting_arm',
        startSampleIndex: 1,
        endSampleIndex: 4,
        maxAngleDeltaDeg: 12,
        maxPositionDelta: 0.09,
        minConfidence: 0.9,
      }],
      visualization: {
        channelRadiusByRegion: Object.fromEntries(regions.map((region) => [region, 0.08])) as Record<BodyRegion, number>,
        highlightPersistenceFrames: 3,
      },
      previews: {
        fps: 30,
        frameCount: 6,
        durationMs: 200,
        templateVideoFileId: 'file_template_preview',
        userVideoFileId: 'file_user_preview',
      },
      provenance: {
        comparisonAlgorithmVersion: '1.0.0-test',
        thresholdSnapshot: { confidence: 0.6 },
        stageDurationsMs: { compare: 4 },
      },
    },
    template: {
      name: '右手侧面模板',
      shootingHand: 'right',
      previewVideoUrl: '/api/v1/files/file_template_preview/video',
    },
    user: { previewVideoUrl: '/api/v1/files/file_user_preview/video' },
    renderFrames: renderTimeline.map((timelineSample) => ({
      sampleIndex: timelineSample.sampleIndex,
      templateVideoSkeleton: basePose.map((point) => ({
        ...point,
        x: 0.5 + point.x * 0.2,
        y: 0.5 + point.y * 0.2,
        z: 0,
        visibility: point.confidence,
        presence: point.confidence,
      })),
      userVideoSkeleton: basePose.map((point) => ({
        ...point,
        x: 0.51 + point.x * 0.2,
        y: 0.5 + point.y * 0.2,
        z: 0,
        visibility: point.confidence,
        presence: point.confidence,
      })),
      templateNormalizedSkeleton: basePose,
      userNormalizedSkeleton: basePose.map((point) => ({
        ...point,
        x: point.name === 'right_wrist' ? point.x + 0.12 : point.x,
      })),
    })),
  };
}
