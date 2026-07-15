# Short AI 投篮动作对比 MVP 设计规格

更新日期：2026-07-15

状态：已确认，书面复核通过

目标仓库：`git@github.com:Fan-zexu/shot-ai-demo.git`

## 1. 目标

实现一个供内部测试者使用的真实数据纵切：上传并解析一个参考模板，再上传一个同投篮手的用户侧面投篮视频，系统完成质量门控、2D 人体姿态提取、六个姿态事件代理、阶段对齐和五个身体区域的差异计算，最终用三种动态形式展示同一份 `ComparisonResult`。

本 MVP 用于判断技术链路和交互表达是否可行，不代表动作诊断、训练效果或命中率提升。

## 2. 已确认范围

### 2.1 必须实现

- 单个本地视频文件上传；
- 参考模板上传、自动准入、解析、版本化、列表和删除；
- 用户视频严格质量门控；
- 左右投篮手显式记录和同手约束；
- MediaPipe Pose Landmarker 的 2D 全身关键点提取；
- 六个严格有序的姿态事件代理；
- 身体尺度、朝向和骨骼比例归一化；
- 事件锚定、五阶段切分和阶段内受限 DTW；
- 五个身体区域的差异、置信度和高亮窗口；
- 一份公共 `ComparisonResult` 和公共 `renderTimeline`；
- 并排视频、骨架叠加、参考动作通道三种报告模式；
- 统一播放、暂停、拖动、倍速和六事件跳转；
- 真实任务阶段、拒绝、失败、重试和重跑；
- SQLite 状态、私有文件存储、版本与哈希证据；
- 桌面调试区和 JSON 导出；
- 移动端报告操作与桌面端调试验证。

### 2.2 明确不做

- 篮球、篮筐、球轨迹和真实离手检测；
- 3D 人体、人体网格、力学或肌肉推断；
- 多机位、正面视角、多次投篮切片和左右手镜像；
- 动作评分、严重度、主要问题和纠正建议；
- 账号、权限、云存储、模板运营后台和公网部署；
- URL 下载、H5 相机录制和生产级视觉体系。

## 3. 实现策略

采用严格纵切，不建立假数据模式。产品空状态只引导上传真实文件；测试夹具只在测试环境使用，不会作为真实报告展示。

代码按以下依赖方向组织：

```text
React H5
  -> Fastify API
    -> SQLite + 私有文件目录
    -> 单并发 Job Runner
      -> Python Pose Worker
      -> TypeScript Comparison Engine
  <- ReportBundle / Range 视频 / 调试导出
```

选择该策略的原因：PRD 的核心风险是“真实输入能否形成可信且一致的三种表达”，只完成 UI 或只完成算法都无法回答这个问题。

## 4. 技术架构

### 4.1 工作区

```text
apps/
  web/                  React 19 + TypeScript + Vite 8
  api/                  Node.js 24 + Fastify 5
packages/
  contracts/            TypeScript 类型、运行时 Schema、错误码
  comparison-engine/    兼容性、阶段、DTW、差异、时间线
services/
  pose-worker/          Python 3.11 + FastAPI + MediaPipe/OpenCV
fixtures/               清单、标注格式和测试专用小夹具
scripts/                环境检查、模型下载和开发启动
docs/                   设计、实施计划、运行和验收文档
data/                   运行数据，全部忽略 Git
```

Node 部分使用 `pnpm` workspace。Python Worker 使用项目内虚拟环境和锁定依赖。MediaPipe 模型、真实视频、运行数据库和分析产物不进入 Git。

### 4.2 进程边界

- `web`：上传、状态、报告和调试交互；不计算质量或差异。
- `api`：唯一业务入口；管理契约、文件、数据库、任务和授权边界。
- `pose-worker`：只监听 `127.0.0.1`；负责视频检查、姿态、事件、归一化和同步预览。
- `comparison-engine`：输入两个已接受的 `MotionArtifact`，输出一份 `ComparisonResult`。
- `job-runner`：单并发执行真实阶段，并将每次迁移和事件写入同一事务。

## 5. 核心数据流

### 5.1 模板

```text
上传 -> SHA-256/私有落盘 -> ffprobe -> 视频和姿态质量检查
-> 六事件 -> 归一化 -> MotionArtifact -> Schema 校验 -> ready
```

模板被拒绝时只保存 `QualityReport`，不伪造 `MotionArtifact`。重跑生成新版本，旧报告继续引用旧版本。

### 5.2 用户对比

```text
上传 + templateId + shootingHand
-> 严格门控 -> 用户 MotionArtifact -> 同手/视角/区域兼容性
-> 五阶段内受限 DTW -> 区域差异 -> renderTimeline
-> 两段 30fps 等长同步预览 -> ComparisonResult -> ReportBundle
```

同步预览只按时间映射重采样原始画面，不生成或修改人物动作。

### 5.3 公共报告

三个 renderer 只读取报告根组件持有的 `PlaybackState`、`ComparisonResult` 和当前 `TimelineSample`。模式切换不重新分析、不重置 `sampleIndex`、不丢失播放状态。

## 6. 算法边界

### 6.1 六个事件代理

事件固定为：

1. `prep_start`；
2. `body_lowest`；
3. `lower_body_extension_start`；
4. `shooting_arm_lift`；
5. `release_pose_proxy`；
6. `follow_through_end`。

`release_pose_proxy` 始终标记为人体姿态代理，界面不能称为真实离手。

### 6.2 差异区域

统一使用：`lower_body`、`torso`、`shooting_arm`、`guide_arm`、`whole_body_timing`。

低置信度区域不高亮。至少四个区域可比较，并且必须包含下肢、投篮手臂和全身时序，否则拒绝报告。

### 6.3 对齐与高亮

- 六事件形成五个硬锚定阶段；
- DTW 只在阶段内部运行，路径单调且受 15% band 限制；
- 差异读取角度、重定向位置和区域阶段差；
- 达到配置阈值且连续至少三帧才高亮；
- 高亮只表示“与当前模板差异较大”，不表示动作错误。

## 7. 页面与视觉

### 7.1 页面

- 模板页：上传、状态、版本、拒绝原因、删除；
- 新建对比页：选择 `ready` 模板、投篮手、用户视频和正常速度确认；
- 处理页：展示数据库中的真实阶段，区分 `rejected` 与 `failed`；
- 报告页：三模式、统一控制、事件跳转、不可比较区域和桌面调试证据。

### 7.2 视觉方向

界面采用“篮球动作实验台”而不是营销站：

- 深蓝灰作为工作台背景；
- 模板使用冷蓝，用户使用球场橙，差异使用克制的红；
- 等宽数字字体承担帧号、阶段和置信度；
- 报告主视觉是随统一时间线移动的全身骨架与动态参考通道；
- 结构、色彩和动效只编码模板、用户、差异与证据，不添加无意义装饰。

最小宽度为 320px，主要触摸目标至少 44px，支持键盘焦点和 `prefers-reduced-motion`。

## 8. 错误与安全

- 请求字段错误返回 `400`，文件过大返回 `413`，状态冲突返回 `409`；
- 输入内容问题进入 `rejected`，系统或依赖问题进入 `failed`；
- `failed` 可重试，`rejected` 必须更换输入；
- API 与 Worker 默认只绑定本机，不开放任意 CORS；
- 原视频不作为静态目录暴露，只通过有业务引用校验的 Range 接口读取；
- 不信任扩展名、MIME、原文件名、Worker 路径或 Worker 输出；
- FFmpeg 使用参数数组，路径必须位于项目数据根目录；
- 日志和 API 不暴露绝对路径、完整堆栈或逐帧人体数据。

## 9. 测试与验收

### 9.1 自动测试

- Node test runner：契约、兼容性、阶段、DTW、差异、状态机、SQLite 和文件引用；
- pytest：元数据、质量门控、事件、归一化和预览映射；
- 契约测试：Python 与 Node 产物都通过共享 JSON Schema；
- 集成测试：模板到 `ready`、用户到报告、拒绝、失败、恢复、重跑和导出；
- Playwright：320×568、手机竖屏和桌面视口，至少覆盖 Chromium 与 WebKit；
- 构建、类型检查、lint、Node/Python 测试和 E2E 均提供统一命令。

### 9.2 真实样本验收

仓库不包含真实个人视频。技术可行性指标必须在外部准备的 1–3 个模板、5–8 个有效用户视频和 4–6 个故意无效视频上单独执行并记录真实计数。没有样本时可以确认工程链路和自动测试，但不能宣称真实视频可行性指标已通过。

## 10. 提交与发布

仓库使用 `main` 分支。每个可独立验证的功能完成后执行完整相关检查并单独提交，提交顺序遵循：

1. 设计规格与实施计划；
2. 工作区、公共契约和配置；
3. SQLite、文件和任务状态；
4. Pose Worker 质量门控与姿态产物；
5. Comparison Engine 与统一时间线；
6. 模板和对比 API 纵切；
7. H5 模板、上传和处理页；
8. 报告公共播放与并排视频；
9. 骨架叠加；
10. 动态参考动作通道；
11. 调试、导出、文档和全量验收。

最终将完整提交历史直接推送到空仓库 `git@github.com:Fan-zexu/shot-ai-demo.git` 的 `main`。
