import {
  BodyRegions,
  type BodyRegion,
  type DeviationWindow,
  type TimelineSample,
} from '@shot-ai/contracts';

const allRegions = BodyRegions as readonly BodyRegion[];

function nullableMaximum(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? Math.max(...available) : null;
}

function createWindow(
  timeline: TimelineSample[],
  region: BodyRegion,
  indices: number[],
): DeviationWindow {
  const differences = indices.map((index) => timeline[index]!.differences[region]);
  return {
    region,
    startSampleIndex: indices[0]!,
    endSampleIndex: indices.at(-1)!,
    maxAngleDeltaDeg: nullableMaximum(differences.map((value) => value.angleDeltaDeg)),
    maxPositionDelta: nullableMaximum(differences.map((value) => value.positionDelta)),
    minConfidence: Math.min(...differences.map((value) => value.confidence)),
  };
}

export function mergeDeviationWindows(
  timeline: TimelineSample[],
  maximumGapFrames: number,
) {
  const windows: DeviationWindow[] = [];
  for (const region of allRegions) {
    const highlighted = timeline
      .filter((sample) => sample.differences[region].highlighted)
      .map((sample) => sample.sampleIndex);
    let current: number[] = [];
    for (const sampleIndex of highlighted) {
      const previous = current.at(-1);
      if (previous === undefined || sampleIndex - previous - 1 <= maximumGapFrames) {
        current.push(sampleIndex);
      } else {
        windows.push(createWindow(timeline, region, current));
        current = [sampleIndex];
      }
    }
    if (current.length) windows.push(createWindow(timeline, region, current));
  }
  return windows.sort(
    (left, right) => left.startSampleIndex - right.startSampleIndex || left.region.localeCompare(right.region),
  );
}
