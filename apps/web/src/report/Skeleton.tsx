import type {
  BodyRegion,
  Landmark2D,
  NormalizedLandmark2D,
  RegionDifferences,
  ShootingHand,
} from '@shot-ai/contracts';

import { regionIsAvailable } from './regions.ts';

type SkeletonPoint = Landmark2D | NormalizedLandmark2D;
type CoordinateSpace = 'video' | 'normalized';
type LayerVariant = 'template' | 'user' | 'channel';

interface SkeletonLayerProps {
  points: SkeletonPoint[];
  coordinateSpace: CoordinateSpace;
  variant: LayerVariant;
  shootingHand: ShootingHand;
  differences: RegionDifferences;
  centerX?: number;
  scale?: number;
  channelRadiusByRegion?: Record<BodyRegion, number>;
  showAllLandmarks?: boolean;
}

interface Connection {
  from: string;
  to: string;
  region: BodyRegion;
}

export const CORE_DISPLAY_LANDMARKS = [
  'nose',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
] as const;

const coreDisplayLandmarks = new Set<string>(CORE_DISPLAY_LANDMARKS);

export function SkeletonLayer({
  points,
  coordinateSpace,
  variant,
  shootingHand,
  differences,
  centerX = 240,
  scale = 150,
  channelRadiusByRegion,
  showAllLandmarks = false,
}: SkeletonLayerProps) {
  const pointMap = new Map(points.map((point) => [point.name, point]));
  const connections = skeletonConnections(shootingHand);
  const displayPoints = showAllLandmarks
    ? points
    : points.filter((point) => coreDisplayLandmarks.has(point.name));

  return (
    <g className={`skeleton-layer skeleton-${variant}`} aria-hidden="true">
      {connections.map((connection) => {
        const from = pointMap.get(connection.from);
        const to = pointMap.get(connection.to);
        if (!from || !to || confidence(from) < 0.35 || confidence(to) < 0.35) return null;
        const start = coordinates(from, coordinateSpace, centerX, scale);
        const end = coordinates(to, coordinateSpace, centerX, scale);
        const difference = differences[connection.region];
        const evidence = difference.highlighted && regionIsAvailable(difference);
        const showEvidence = evidence && variant !== 'channel';
        const channelWidth = channelRadiusByRegion?.[connection.region];
        return (
          <line
            key={`${connection.from}-${connection.to}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            className={showEvidence ? 'is-evidence' : ''}
            data-region={connection.region}
            data-highlighted-region={showEvidence ? connection.region : undefined}
            style={
              variant === 'channel' && channelWidth
                ? { strokeWidth: Math.max(18, channelWidth * scale * 2.2) }
                : undefined
            }
          />
        );
      })}
      {displayPoints.map((point) => {
        if (confidence(point) < 0.35) return null;
        const position = coordinates(point, coordinateSpace, centerX, scale);
        const region = jointRegion(point.name, shootingHand);
        const difference = region ? differences[region] : null;
        const evidence = Boolean(difference?.highlighted && regionIsAvailable(difference));
        const showEvidence = evidence && variant !== 'channel';
        return (
          <circle
            key={point.name}
            cx={position.x}
            cy={position.y}
            r={variant === 'channel' ? 9 : coordinateSpace === 'video' ? 8 : 4.5}
            className={showEvidence ? 'is-evidence' : ''}
            data-landmark={point.name}
            data-region={region ?? undefined}
            data-highlighted-region={showEvidence ? region ?? undefined : undefined}
          />
        );
      })}
    </g>
  );
}

function coordinates(
  point: SkeletonPoint,
  coordinateSpace: CoordinateSpace,
  centerX: number,
  scale: number,
) {
  if (coordinateSpace === 'video') return { x: point.x * 1000, y: point.y * 1000 };
  return { x: centerX + point.x * scale, y: 175 + point.y * scale };
}

function confidence(point: SkeletonPoint) {
  return 'confidence' in point ? point.confidence : Math.min(point.visibility, point.presence);
}

function skeletonConnections(shootingHand: ShootingHand): Connection[] {
  const guideHand = shootingHand === 'right' ? 'left' : 'right';
  return [
    { from: 'nose', to: 'left_shoulder', region: 'torso' },
    { from: 'nose', to: 'right_shoulder', region: 'torso' },
    { from: 'left_shoulder', to: 'right_shoulder', region: 'torso' },
    { from: 'left_shoulder', to: 'left_hip', region: 'torso' },
    { from: 'right_shoulder', to: 'right_hip', region: 'torso' },
    { from: 'left_hip', to: 'right_hip', region: 'lower_body' },
    { from: `${shootingHand}_shoulder`, to: `${shootingHand}_elbow`, region: 'shooting_arm' },
    { from: `${shootingHand}_elbow`, to: `${shootingHand}_wrist`, region: 'shooting_arm' },
    { from: `${guideHand}_shoulder`, to: `${guideHand}_elbow`, region: 'guide_arm' },
    { from: `${guideHand}_elbow`, to: `${guideHand}_wrist`, region: 'guide_arm' },
    { from: 'left_hip', to: 'left_knee', region: 'lower_body' },
    { from: 'left_knee', to: 'left_ankle', region: 'lower_body' },
    { from: 'left_ankle', to: 'left_heel', region: 'lower_body' },
    { from: 'left_heel', to: 'left_foot_index', region: 'lower_body' },
    { from: 'right_hip', to: 'right_knee', region: 'lower_body' },
    { from: 'right_knee', to: 'right_ankle', region: 'lower_body' },
    { from: 'right_ankle', to: 'right_heel', region: 'lower_body' },
    { from: 'right_heel', to: 'right_foot_index', region: 'lower_body' },
  ];
}

function jointRegion(name: string, shootingHand: ShootingHand): BodyRegion | null {
  if (name.includes('knee') || name.includes('ankle') || name.includes('heel') || name.includes('foot')) {
    return 'lower_body';
  }
  if (name.includes(`${shootingHand}_elbow`) || name.includes(`${shootingHand}_wrist`)) {
    return 'shooting_arm';
  }
  const guideHand = shootingHand === 'right' ? 'left' : 'right';
  if (name.includes(`${guideHand}_elbow`) || name.includes(`${guideHand}_wrist`)) {
    return 'guide_arm';
  }
  if (name.includes('shoulder') || name.includes('hip') || name === 'nose') return 'torso';
  return null;
}
