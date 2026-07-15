import type { ComparisonResult, MotionEventName } from '@shot-ai/contracts';

export const REPORT_EVENTS: Array<{ name: MotionEventName; label: string; shortLabel: string }> = [
  { name: 'prep_start', label: '准备开始', shortLabel: '准备' },
  { name: 'body_lowest', label: '身体最低点', shortLabel: '最低点' },
  { name: 'lower_body_extension_start', label: '下肢伸展开始', shortLabel: '伸展' },
  { name: 'shooting_arm_lift', label: '投篮手臂开始抬起', shortLabel: '抬臂' },
  { name: 'release_pose_proxy', label: '释放姿态代理', shortLabel: '释放代理' },
  { name: 'follow_through_end', label: '随挥结束', shortLabel: '随挥' },
];

export function eventSampleIndices(result: ComparisonResult): Record<MotionEventName, number> {
  const firstPhase = result.phases[0];
  if (!firstPhase) throw new Error('REPORT_PHASES_MISSING');
  return {
    prep_start: firstPhase.startSampleIndex,
    body_lowest: result.phases[0]!.endSampleIndex,
    lower_body_extension_start: result.phases[1]!.endSampleIndex,
    shooting_arm_lift: result.phases[2]!.endSampleIndex,
    release_pose_proxy: result.phases[3]!.endSampleIndex,
    follow_through_end: result.phases[4]!.endSampleIndex,
  };
}

export function phaseLabel(result: ComparisonResult, phaseIndex: number) {
  const phase = result.phases[phaseIndex];
  if (!phase) return '动作阶段不可用';
  const start = REPORT_EVENTS.find((event) => event.name === phase.startEvent)?.shortLabel;
  const end = REPORT_EVENTS.find((event) => event.name === phase.endEvent)?.shortLabel;
  return `${start ?? phase.startEvent} → ${end ?? phase.endEvent}`;
}
