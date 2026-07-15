import type {
  FeatureWeights,
  FrameFeatures,
  ScalarFeature,
  VectorFeature,
} from '../types.ts';

export interface WeightedFeatureCost {
  cost: number;
  coverage: number;
  confidence: number;
}

interface GroupCost {
  cost: number;
  coverage: number;
  confidence: number;
}

function commonKeys<T>(first: Record<string, T>, second: Record<string, T>) {
  return Object.keys(first).filter((key) => second[key] !== undefined);
}

function weightedMean(values: Array<{ value: number; confidence: number }>) {
  const totalConfidence = values.reduce((sum, item) => sum + item.confidence, 0);
  if (totalConfidence <= 1e-9) return 0;
  return values.reduce(
    (sum, item) => sum + item.value * item.confidence,
    0,
  ) / totalConfidence;
}

function scalarCost(
  first: Record<string, ScalarFeature>,
  second: Record<string, ScalarFeature>,
): GroupCost | undefined {
  const keys = commonKeys(first, second);
  if (!keys.length) return undefined;
  const values = keys.map((key) => {
    const left = first[key]!;
    const right = second[key]!;
    return {
      value: Math.min(1, Math.abs(left.value - right.value) / 180),
      confidence: Math.min(left.confidence, right.confidence),
    };
  });
  const unionSize = new Set([...Object.keys(first), ...Object.keys(second)]).size;
  return {
    cost: weightedMean(values),
    coverage: keys.length / unionSize,
    confidence: values.reduce((sum, item) => sum + item.confidence, 0) / values.length,
  };
}

function vectorCost(
  first: Record<string, VectorFeature>,
  second: Record<string, VectorFeature>,
  normalizeVelocity: boolean,
): GroupCost | undefined {
  const keys = commonKeys(first, second);
  if (!keys.length) return undefined;
  const values = keys.map((key) => {
    const left = first[key]!;
    const right = second[key]!;
    const raw = Math.hypot(left.x - right.x, left.y - right.y);
    return {
      value: Math.min(1, normalizeVelocity ? raw / (1 + raw) : raw),
      confidence: Math.min(left.confidence, right.confidence),
    };
  });
  const unionSize = new Set([...Object.keys(first), ...Object.keys(second)]).size;
  return {
    cost: weightedMean(values),
    coverage: keys.length / unionSize,
    confidence: values.reduce((sum, item) => sum + item.confidence, 0) / values.length,
  };
}

export function weightedFeatureCost(
  template: FrameFeatures,
  user: FrameFeatures,
  weights: FeatureWeights,
): WeightedFeatureCost {
  const groups = [
    { weight: weights.angle, result: scalarCost(template.angles, user.angles) },
    {
      weight: weights.position,
      result: vectorCost(template.positions, user.positions, false),
    },
    {
      weight: weights.velocity,
      result: vectorCost(template.velocities, user.velocities, true),
    },
  ].filter(
    (entry): entry is { weight: number; result: GroupCost } =>
      entry.weight > 0 && entry.result !== undefined,
  );
  const availableWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  if (availableWeight <= 1e-9) return { cost: 1, coverage: 0, confidence: 0 };
  return groups.reduce<WeightedFeatureCost>(
    (summary, group) => {
      const normalizedWeight = group.weight / availableWeight;
      return {
        cost: summary.cost + group.result.cost * normalizedWeight,
        coverage: summary.coverage + group.result.coverage * normalizedWeight,
        confidence: summary.confidence + group.result.confidence * normalizedWeight,
      };
    },
    { cost: 0, coverage: 0, confidence: 0 },
  );
}
