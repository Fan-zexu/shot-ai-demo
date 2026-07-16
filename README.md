# Shot AI 投篮动作对比 MVP

这是一个本地运行、真实视频驱动的技术 Demo：上传 1 段参考模板和 1 段同投篮手用户视频，系统完成质量门控、人体姿态提取、六事件代理、分阶段对齐和全身差异计算，再由 3 种交互读取同一份 `ComparisonResult`。

当前状态：工程链路和确定性测试已完成；真实投篮样本的精度与理解效果实验尚未执行，不能把 Demo 结果解释为训练效果、命中率提升或生物力学诊断。

## 能做什么

- 管理 1–3 个本地参考模板，保留旧报告所引用的不可变产物。
- Demo 阶段模板和用户视频都把帧率、画质、覆盖、角度与相机问题记为警告，先尝试生成真实动作产物。
- 生成双列同步视频、统一坐标骨架叠加和动态参考动作通道。
- 在同一归一化时间轴上播放、暂停、拖动并跳转六个姿态事件代理。
- 在桌面调试区追溯关键点置信度、事件帧、差异曲线、质量门控、版本、阈值、耗时和文件哈希。

它不做篮球/篮筐检测、真实离手判断、3D 推断、动作评分、好坏诊断或纠正建议。界面中的“释放姿态代理”只来自人体姿态。

## 快速开始

本机日常启动：

```bash
cd /Users/zn/workspace/shotAI/MvpDemo
pnpm dev
```

`pnpm dev` 同时启动 Worker、API 和 H5，并在退出时清理三个进程：

- H5：`http://127.0.0.1:5173/#/templates`
- API：`http://127.0.0.1:3001`
- Pose Worker：`http://127.0.0.1:8001`

在运行终端按 `Control + C` 即可停止整个项目；需要重启时，再执行一次 `pnpm dev`。首次安装、健康检查、端口占用和故障恢复见 [`docs/startup.md`](./docs/startup.md)。

默认运行数据写入 `data/`，姿态模型写入 `models/`；两者都被 Git 忽略。需要自定义路径时复制 [`.env.example`](./.env.example) 的变量到当前 shell 或本机 `.env` 管理工具，API 与 Worker 必须指向同一个 `SHOT_AI_DATA_ROOT`。

## 拍摄输入

- 用户视频需要单人、固定机位和一次完整投篮动作；Demo 阶段允许慢放或剪辑变速。
- 模板和用户视频只要速度未经确认，就只参与姿态和动作阶段比较，时间戳速度特征自动关闭。
- 竖屏或横屏均可，但必须持续看见头、髋、膝、踝和双脚。
- 使用投篮手一侧的侧面视角；模板和用户投篮手必须一致。
- 慢放、变速、分辨率、帧率、视角和相机稳定性偏差会写入质量提示；倒放、动作中间硬切或损坏时间轴仍可能导致视频无法解析。

视频不可解码、主体轨迹确实歧义、没有足够姿态数据生成六事件，或模板与用户没有必要共同区域时，任务进入 `rejected` 并给出原因，不会伪造报告；Demo 阶段其余质量检查为软门禁。系统异常才进入可重试的 `failed`。

## 工程结构

```text
apps/web/                    React H5 与三种报告渲染
apps/api/                    Fastify API、SQLite、文件与任务编排
packages/contracts/          TypeBox 运行时契约和跨语言夹具
packages/comparison-engine/  阶段对齐、受限 DTW、差异与证据窗口
services/pose-worker/        FastAPI、MediaPipe、OpenCV 和 FFmpeg 管线
docs/                        开发与验证说明
```

日常启动与重启见 [`docs/startup.md`](./docs/startup.md)，开发命令见 [`docs/development.md`](./docs/development.md)，工程证据与真实样本验收表见 [`docs/validation.md`](./docs/validation.md)。产品和算法边界以 Short AI 主工作区的 `docs/shot-comparison/prd.md` 与 `docs/shot-comparison/technical-design.md` 为实现来源；本仓库保留了对应的 [MVP 设计快照](./docs/superpowers/specs/2026-07-15-shot-comparison-mvp-design.md) 和历史实现清单，便于独立审阅。

## 验证

`pnpm verify` 依次检查本机工具链和 Python 依赖，运行 TypeScript/Python/React 测试、全量类型检查、生产构建，并用 Chromium 与 WebKit 验证报告交互。E2E 只在网络层注入确定性报告夹具，不会在产品中暴露假数据模式，也不替代真实视频实验。
