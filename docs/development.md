# 本地开发说明

只需要运行或重启 Demo 时，请直接阅读 [`startup.md`](./startup.md)；本文主要说明开发与验证细节。

## 环境

| 组件 | 版本/要求 | 用途 |
| --- | --- | --- |
| Node.js | 24.x | API、Web、契约和比较引擎 |
| pnpm | 11.11.0 | Monorepo 依赖与命令 |
| Python | 3.11.x | Pose Worker |
| FFmpeg / ffprobe | PATH 可用 | 视频探测和同步预览 |
| MediaPipe Pose Landmarker | `models/pose_landmarker_full.task` | 本地姿态推理 |

首次安装：

```bash
brew install python@3.11 ffmpeg
corepack enable
pnpm install
python3.11 -m venv .venv
.venv/bin/pip install -r services/pose-worker/requirements.lock
pnpm model:download
```

`pnpm env:check` 会读取实际可执行文件并报告版本，不假设 Homebrew 安装路径。`pnpm model:download` 会输出下载文件的 SHA-256；模型、视频、SQLite 和 gzip 产物不得提交。

## 启动与停止

```bash
pnpm dev
```

统一启动器创建 Worker、API、Vite 三个独立进程组。任一服务异常退出时会停止其余服务；`Ctrl+C` 先发送 `SIGTERM`，三秒后仍未退出才升级为 `SIGKILL`。这样不会在下一次开发时留下占用 8001、3001 或 5173 端口的孤儿进程。

也可以分别启动：

```bash
pnpm worker:dev
pnpm api:dev
pnpm web:dev
```

默认配置无需 `.env`：数据目录为仓库下的 `data/`，数据库为 `data/shot-ai.sqlite`。覆盖变量时，`SHOT_AI_DATA_ROOT`、`SHOT_AI_DATABASE_PATH` 和 `SHOT_AI_POSE_MODEL_PATH` 应使用本机绝对路径；不要提交这些值。

## 常用验证

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
pnpm verify
```

- `pnpm test`：契约、比较引擎、API、Web 和 Python Worker。
- `pnpm e2e`：启动独立 Vite 服务，用确定性网络夹具验证报告，不启动真实 Worker。
- `pnpm verify`：在上述检查前增加环境、Python 依赖和差异格式检查，并确保 Chromium/WebKit 已安装。

E2E 夹具只存在于 `apps/web/e2e/` 和测试网络拦截中。生产路由始终从 API 读取持久化的报告和视频，不提供 fixture 参数或假数据开关。

## 数据和恢复

- API 是公开入口；Worker 只监听 `127.0.0.1:8001`，且拒绝数据根目录之外的路径。
- 上传先写入 `data/tmp/*.partial`，哈希完成后再原子移动；逐帧数组存入 `.json.gz`，不写 SQLite。
- Runner 单并发。API 重启后首次中断任务重新排队，重复中断进入 `failed`。
- `rejected` 表示输入证据不足，只能换视频；`failed` 表示系统异常，可以重试原文件。
- 已有报告引用的模板会软删除，旧报告仍读取创建时的模板、模型、算法和阈值版本。

## 排查顺序

1. `pnpm env:check`：确认正在使用的 Node、pnpm、Python 和 FFmpeg。
2. `test -f models/pose_landmarker_full.task`：确认模型存在。
3. 检查 8001、3001、5173 是否被旧进程占用。
4. 直接访问 Worker `/internal/v1/health`，再检查 API 日志中的任务阶段。
5. 报告已生成时，从桌面调试区导出 `QualityReport`、两份 `MotionArtifact` 和 `ComparisonResult` 核对哈希与版本。
