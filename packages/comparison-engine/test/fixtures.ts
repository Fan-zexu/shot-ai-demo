import {
  BodyRegions,
  type BodyRegion,
  type MotionArtifact,
  type MotionEventName,
  type ShootingHand,
  type ViewType,
} from '@shot-ai/contracts';

const allRegions = BodyRegions as readonly BodyRegion[];

interface ArtifactOptions {
  sourceType: 'template' | 'user';
  frameCount?: number;
  eventFrames?: [number, number, number, number, number, number];
  shootingHand?: ShootingHand;
  view?: ViewType;
  boneScale?: number;
  shootingAngleOffset?: number;
  comparableRegions?: BodyRegion[];
  confidenceByRegion?: Partial<Record<BodyRegion, number>>;
  normalSpeedConfirmed?: boolean;
  nominalFps?: number;
}

function motionEvent<Name extends MotionEventName, Proxy extends boolean>(
  name: Name,
  frameIndex: number,
  timestampMs: number,
  isProxy: Proxy,
) {
  return {
    name,
    frameIndex,
    timestampMs,
    confidence: 0.9,
    evidence: { ordered: 1 },
    isProxy,
  };
}

function normalizedPose(progress: number, boneScale: number) {
  const crouch = Math.sin(progress * Math.PI) * 0.08;
  const armLift = Math.max(0, (progress - 0.45) / 0.55);
  return [
    { name: 'nose', x: 0.02, y: -0.92 + crouch, confidence: 0.94 },
    { name: 'left_shoulder', x: -0.16 * boneScale, y: -0.6 + crouch, confidence: 0.94 },
    { name: 'right_shoulder', x: 0.16 * boneScale, y: -0.6 + crouch, confidence: 0.94 },
    { name: 'left_elbow', x: -0.25 * boneScale, y: -0.35 - armLift * 0.08, confidence: 0.92 },
    { name: 'right_elbow', x: (0.25 + armLift * 0.12) * boneScale, y: -0.35 - armLift * 0.22, confidence: 0.92 },
    { name: 'left_wrist', x: -0.28 * boneScale, y: -0.08 - armLift * 0.18, confidence: 0.91 },
    { name: 'right_wrist', x: (0.3 + armLift * 0.28) * boneScale, y: -0.08 - armLift * 0.62, confidence: 0.91 },
    { name: 'left_hip', x: -0.12 * boneScale, y: 0, confidence: 0.95 },
    { name: 'right_hip', x: 0.12 * boneScale, y: 0, confidence: 0.95 },
    { name: 'left_knee', x: -0.14 * boneScale, y: (0.52 - crouch) * boneScale, confidence: 0.93 },
    { name: 'right_knee', x: 0.14 * boneScale, y: (0.52 - crouch) * boneScale, confidence: 0.93 },
    { name: 'left_ankle', x: -0.15 * boneScale, y: 1.02 * boneScale, confidence: 0.92 },
    { name: 'right_ankle', x: 0.15 * boneScale, y: 1.02 * boneScale, confidence: 0.92 },
    { name: 'left_heel', x: -0.18 * boneScale, y: 1.08 * boneScale, confidence: 0.9 },
    { name: 'right_heel', x: 0.12 * boneScale, y: 1.08 * boneScale, confidence: 0.9 },
    { name: 'left_foot_index', x: -0.05 * boneScale, y: 1.1 * boneScale, confidence: 0.9 },
    { name: 'right_foot_index', x: 0.25 * boneScale, y: 1.1 * boneScale, confidence: 0.9 },
  ];
}

export function makeArtifact(options: ArtifactOptions): MotionArtifact {
  const nominalFps = options.nominalFps ?? 30;
  const frameCount = options.frameCount ?? (options.sourceType === 'template' ? 31 : 41);
  const eventFrames =
    options.eventFrames ??
    (options.sourceType === 'template' ? [0, 6, 12, 18, 24, 30] : [0, 8, 16, 24, 32, 40]);
  const boneScale = options.boneScale ?? 1;
  const comparableRegions = options.comparableRegions ?? [...allRegions];
  const confidenceByRegion = Object.fromEntries(
    allRegions.map((region) => [region, options.confidenceByRegion?.[region] ?? 0.92]),
  ) as Record<BodyRegion, number>;
  const frames = Array.from({ length: frameCount }, (_, frameIndex) => {
    const progress = frameIndex / (frameCount - 1);
    const normalized = normalizedPose(progress, boneScale);
    return {
      frameIndex,
      timestampMs: frameIndex * (1000 / nominalFps),
      poseConfidence: 0.92,
      landmarks: normalized.map((point) => ({
        name: point.name,
        x: 0.5 + point.x * 0.2,
        y: 0.5 + point.y * 0.2,
        z: 0,
        visibility: point.confidence,
        presence: point.confidence,
      })),
      normalizedLandmarks: normalized,
      retargetedLandmarks: normalized.map((point) => ({ ...point })),
      jointAnglesDeg: {
        left_elbow: 100 + progress * 30,
        right_elbow: 85 + progress * 80 + (options.shootingAngleOffset ?? 0),
        left_knee: 100 + progress * 65,
        right_knee: 101 + progress * 64,
      },
      regionConfidence: confidenceByRegion,
    };
  });
  const [prep, lowest, extension, lift, release, follow] = eventFrames;
  return {
    schemaVersion: '1.0',
    artifactId: `artifact_${options.sourceType}`,
    sourceType: options.sourceType,
    sourceFileId: `file_${options.sourceType}`,
    sourceSha256: (options.sourceType === 'template' ? 'a' : 'c').repeat(64),
    createdAt: '2026-07-15T10:00:00.000Z',
    video: {
      durationMs: frameCount * (1000 / nominalFps),
      width: 1280,
      height: 720,
      rotationDeg: 0,
      nominalFps,
      frameCount,
      container: 'mp4',
      codec: 'h264',
    },
    capture: {
      shootingHand: options.shootingHand ?? 'right',
      detectedView: options.view ?? 'shooting_side',
      facingDirection: 'right',
      normalSpeedConfirmed: options.normalSpeedConfirmed ?? true,
    },
    quality: {
      checks: [],
      overallPoseConfidence: 0.92,
      comparableRegions,
      rejectedRegions: Object.fromEntries(
        allRegions
          .filter((region) => !comparableRegions.includes(region))
          .map((region) => [region, 'fixture region unavailable']),
      ),
    },
    events: {
      prep_start: motionEvent('prep_start', prep, frames[prep]!.timestampMs, false),
      body_lowest: motionEvent('body_lowest', lowest, frames[lowest]!.timestampMs, false),
      lower_body_extension_start: motionEvent(
        'lower_body_extension_start',
        extension,
        frames[extension]!.timestampMs,
        false,
      ),
      shooting_arm_lift: motionEvent('shooting_arm_lift', lift, frames[lift]!.timestampMs, false),
      release_pose_proxy: motionEvent('release_pose_proxy', release, frames[release]!.timestampMs, true),
      follow_through_end: motionEvent('follow_through_end', follow, frames[follow]!.timestampMs, false),
    },
    frames,
    canonicalSkeleton: {
      segmentLengths: {
        hip_width: 0.24 * boneScale,
        torso: 0.6 * boneScale,
        shoulder_width: 0.32 * boneScale,
        left_upper_arm: 0.28 * boneScale,
        left_forearm: 0.28 * boneScale,
        right_upper_arm: 0.28 * boneScale,
        right_forearm: 0.3 * boneScale,
        left_thigh: 0.52 * boneScale,
        left_shin: 0.5 * boneScale,
        right_thigh: 0.52 * boneScale,
        right_shin: 0.5 * boneScale,
      },
      root: 'hip_center',
      scaleBasis: 'torso_length',
      facingDirection: 'right',
    },
    provenance: {
      modelName: 'fixture',
      modelVersion: '1',
      modelSha256: 'f'.repeat(64),
      pipelineVersion: '1.0.0',
      thresholdSnapshot: {},
      runtime: 'node-test',
      stageDurationsMs: {},
    },
  };
}
