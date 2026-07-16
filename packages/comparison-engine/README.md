# Comparison Engine

比较引擎消费一个模板 `MotionArtifact` 和一个用户 `MotionArtifact`，生成三种报告模式共用的 `ComparisonResult`。它只描述“哪里不同、证据有多可靠”，不输出动作分数、正确性判断或训练建议。

## 固定约束

- 投篮手必须一致，两段视频都必须是可靠的投篮手侧面。
- 六个事件是硬锚点，形成五个互不跨越的对齐阶段。
- 每个阶段独立执行 15% Sakoe–Chiba band 的受限 DTW；双方速度都可信时，单个源帧最多连续映射 4 个输出帧。
- 正常速度输入的 DTW 特征权重为角度 `0.50`、重定向位置 `0.30`、归一化速度 `0.20`；任一输入速度未经确认时，速度权重强制为 `0`，并按阶段采样密度放宽 band 连通性与重复映射上限，只使用姿态与阶段证据。缺失特征不补零，剩余权重重新归一。
- 至少四个身体区域共同可比较，且必须包含下肢、投篮手臂和全身时序。
- 差异达到阈值、置信度至少 `0.60` 并持续 3 个预览帧后才高亮。
- 所有呈现模式只读取同一条 `renderTimeline`，不能自行重新对齐。

## 调用

```ts
import { compareMotions } from '@shot-ai/comparison-engine';

const result = compareMotions({
  comparisonId,
  template,
  user,
  templatePreviewFileId,
  userPreviewFileId,
});
```

不兼容或低可信对齐会抛出 `ComparisonRejected`，其中 `code` 可直接映射为任务的拒绝原因。阈值快照和算法版本写入结果，方便调试和复跑。

## 验证

```bash
pnpm --filter @shot-ai/comparison-engine test
pnpm --filter @shot-ai/comparison-engine typecheck
```
