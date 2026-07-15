import type {
  DtwFrame,
  DtwPair,
  DtwResult,
  FeatureWeights,
} from '../types.ts';
import { weightedFeatureCost } from '../features/cost.ts';

type Move = 'start' | 'diagonal' | 'template' | 'user';

interface State {
  i: number;
  j: number;
  totalCost: number;
  localCost: number;
  coverage: number;
  featureConfidence: number;
  move: Move;
  repeatCount: number;
  previous?: State;
}

export interface ConstrainedDtwInput {
  template: DtwFrame[];
  user: DtwFrame[];
  bandRatio: number;
  maxRepeatedOutputFrames: number;
  weights: FeatureWeights;
}

function progress(index: number, length: number) {
  return length <= 1 ? 0 : index / (length - 1);
}

function insideBand(i: number, j: number, rows: number, columns: number, band: number) {
  if ((i === 0 && j === 0) || (i === rows - 1 && j === columns - 1)) return true;
  return Math.abs(progress(i, rows) - progress(j, columns)) <= band + 1e-9;
}

function stateKey(move: Move, repeatCount: number) {
  return `${move}:${repeatCount}`;
}

function bestState(states: Map<string, State> | undefined) {
  if (!states?.size) return undefined;
  return [...states.values()].reduce((best, state) =>
    state.totalCost < best.totalCost ? state : best,
  );
}

export function constrainedDtw(input: ConstrainedDtwInput): DtwResult {
  const rows = input.template.length;
  const columns = input.user.length;
  if (rows < 2 || columns < 2) throw new Error('DTW requires at least two frames per side');
  const effectiveBand = Math.max(
    input.bandRatio,
    1 / Math.max(rows - 1, columns - 1),
  );
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => new Map<string, State>()),
  );

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      if (!insideBand(i, j, rows, columns, effectiveBand)) continue;
      const local = weightedFeatureCost(
        input.template[i]!.features,
        input.user[j]!.features,
        input.weights,
      );
      if (i === 0 && j === 0) {
        const start: State = {
          i,
          j,
          totalCost: local.cost,
          localCost: local.cost,
          coverage: local.coverage,
          featureConfidence: local.confidence,
          move: 'start',
          repeatCount: 1,
        };
        cells[i]![j]!.set(stateKey(start.move, start.repeatCount), start);
        continue;
      }

      const transitions: Array<{
        previous: Map<string, State> | undefined;
        move: Move;
      }> = [
        { previous: i > 0 && j > 0 ? cells[i - 1]![j - 1] : undefined, move: 'diagonal' },
        { previous: i > 0 ? cells[i - 1]![j] : undefined, move: 'template' },
        { previous: j > 0 ? cells[i]![j - 1] : undefined, move: 'user' },
      ];
      for (const transition of transitions) {
        for (const previous of transition.previous?.values() ?? []) {
          const repeatCount =
            transition.move === 'diagonal'
              ? 1
              : previous.move === transition.move
                ? previous.repeatCount + 1
                : 2;
          if (repeatCount > input.maxRepeatedOutputFrames) continue;
          const state: State = {
            i,
            j,
            totalCost: previous.totalCost + local.cost,
            localCost: local.cost,
            coverage: local.coverage,
            featureConfidence: local.confidence,
            move: transition.move,
            repeatCount,
            previous,
          };
          const key = stateKey(state.move, state.repeatCount);
          const existing = cells[i]![j]!.get(key);
          if (!existing || state.totalCost < existing.totalCost) cells[i]![j]!.set(key, state);
        }
      }
    }
  }

  const terminal = bestState(cells[rows - 1]![columns - 1]);
  if (!terminal) throw new Error('DTW_PATH_NOT_FOUND');
  const states: State[] = [];
  for (let current: State | undefined = terminal; current; current = current.previous) {
    states.push(current);
  }
  states.reverse();
  const path: DtwPair[] = states.map((state, index) => {
    const distanceFromDiagonal = Math.abs(
      progress(state.i, rows) - progress(state.j, columns),
    );
    const endpoint = index === 0 || index === states.length - 1;
    const atBoundary = !endpoint && distanceFromDiagonal >= effectiveBand * 0.9;
    return {
      templateIndex: state.i,
      userIndex: state.j,
      localCost: state.localCost,
      featureCoverage: state.coverage,
      confidence: Math.max(
        0,
        Math.min(1, Math.min(state.featureConfidence, 1 - state.localCost)),
      ),
      atBoundary,
    };
  });
  const averageCost = path.reduce((sum, pair) => sum + pair.localCost, 0) / path.length;
  const averageFeatureCoverage =
    path.reduce((sum, pair) => sum + pair.featureCoverage, 0) / path.length;
  const boundaryHitRatio = path.filter((pair) => pair.atBoundary).length / path.length;
  return {
    path,
    averageCost,
    averageFeatureCoverage,
    boundaryHitRatio,
    confidence: Math.max(
      0,
      Math.min(1, (1 - averageCost) * averageFeatureCoverage * (1 - boundaryHitRatio)),
    ),
  };
}
