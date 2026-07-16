# Pose Worker

本地 Python Worker 负责把原始投篮视频转换为可比较的 `MotionArtifact`，并根据统一时间轴生成两条对齐预览视频。它只监听本机，由 Node API 通过内部接口调用，不直接暴露给 H5。

## 处理流程

1. 使用 `ffprobe` 读取视频元数据和逐帧时间戳，拒绝异常时间轴、重复帧和不可解码文件。
2. 使用 MediaPipe Pose Landmarker（VIDEO 模式）提取 33 个关键点，并连续跟踪同一人物。
3. 检查时长、分辨率、帧率、全身覆盖、姿态置信度、拍摄视角和相机稳定性。
4. 对关键点做髋中心平移和躯干尺度归一化，同时保留原始二维坐标。
5. 从平滑后的运动信号中检测六个有序事件；`release_pose_proxy` 只是出手姿态代理点，不代表真实离手时刻。
6. 原子写入 gzip 压缩的 `MotionArtifact`，避免中断后留下半成品。

## 本地运行

在仓库根目录执行：

```bash
pnpm env:check
pnpm model:download
pnpm python:install
pnpm worker:dev
```

默认数据根目录为仓库下的 `data/`，模型路径为 `models/pose_landmarker_full.task`。两者都不会提交到 Git。可通过 `SHOT_AI_DATA_ROOT` 和 `SHOT_AI_POSE_MODEL_PATH` 覆盖。

## 内部接口

- `GET /internal/v1/health`：返回模型摘要和 Worker 忙闲状态。
- `POST /internal/v1/analyze-motion`：执行质量门禁、姿态分析、事件检测并产出动作文件。
- `POST /internal/v1/render-aligned-previews`：按比较引擎生成的共同时间轴输出固定 30 FPS、H.264、无音轨的双视频。

所有输入、输出路径都必须位于配置的数据根目录中。Worker 使用进程内互斥锁串行处理重任务，MVP 不并行加载多个 MediaPipe 推理任务。

参考模板可以包含慢放或剪辑变速：Worker 仍检查可解码性和单调时间戳，但不会因重复帧或未确认正常速度而拒绝；产物会将 `normalSpeedConfirmed` 记录为 `false`，供比较引擎关闭时间戳速度特征。用户视频继续执行完整的正常速度与重复帧门控。

## 验证

```bash
pnpm test:python
pnpm test
pnpm typecheck
```

`packages/contracts/test/python-contract.test.ts` 会启动 Python fixture 生成器，再用 TypeBox 校验结果，确保 Python 与 TypeScript 对 `MotionArtifact` 的理解一致。
