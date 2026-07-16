# 项目启动与重启手册

这份文档面向本机日常使用。项目由三个服务组成，但通常只需要一条命令统一启动：

| 服务 | 地址 | 作用 |
| --- | --- | --- |
| H5 | `http://127.0.0.1:5173/#/templates` | 上传模板、创建对比和查询历史报告 |
| API | `http://127.0.0.1:3001` | 保存数据、管理任务和调用 Worker |
| Pose Worker | `http://127.0.0.1:8001` | 视频检查、姿态提取和动作分析 |

需要直接查询已有报告时，打开 `http://127.0.0.1:5173/#/comparisons`。

## 日常启动：只记这两条命令

打开 macOS「终端」，执行：

```bash
cd /Users/zn/workspace/shotAI/MvpDemo
pnpm dev
```

`pnpm dev` 会一起启动 H5、API 和 Pose Worker。保持这个终端窗口运行，然后在浏览器打开：

```text
http://127.0.0.1:5173/#/templates
```

也可以新开一个终端窗口执行：

```bash
open 'http://127.0.0.1:5173/#/templates'
```

> 启动后终端一直被占用是正常现象，表示三个服务正在运行，不是命令卡住。

## 停止和重新启动

### 停止整个项目

回到运行 `pnpm dev` 的终端，按一次 `Control + C`。统一启动器会清理三个服务，避免下次启动时端口被占用。

不要直接关闭终端窗口；优先使用 `Control + C`，等进程退出后再关闭。

### 重新启动整个项目

先按 `Control + C` 停止，再在同一个终端执行：

```bash
pnpm dev
```

如果项目是通过 `pnpm dev` 启动的，不需要单独重启某个服务：任一服务异常退出时，统一启动器会停止其余服务，此时重新执行 `pnpm dev` 即可。

## 第一次在这台电脑上安装

当前项目要求：Node.js 24.x、pnpm 11.11.0、Python 3.11.x、FFmpeg 和 ffprobe。

先进入项目目录：

```bash
cd /Users/zn/workspace/shotAI/MvpDemo
```

安装系统依赖并启用 pnpm：

```bash
brew install python@3.11 ffmpeg
corepack enable
```

然后安装项目依赖、创建 Python 虚拟环境并下载姿态模型：

```bash
pnpm install
python3.11 -m venv .venv
pnpm python:install
pnpm model:download
pnpm env:check
```

`pnpm env:check` 每一项都显示 `ok` 后，再执行 `pnpm dev`。同一台电脑只需要完成一次首次安装；日常启动不需要重复安装。

如果 `node --version` 不是 `v24.x`，先通过你使用的 Node 版本管理器切换到 Node.js 24，再执行上面的命令。

## 确认三个服务是否正常

启动项目后，新开一个终端执行：

```bash
curl -fsS http://127.0.0.1:8001/internal/v1/health
curl -fsS http://127.0.0.1:3001/api/v1/health
curl -fsS -o /dev/null -w 'H5 HTTP %{http_code}\n' http://127.0.0.1:5173/
```

正常结果应满足：

- Worker 返回 `"status":"ready"` 和 `"modelLoaded":true`。
- API 返回 `"status":"ready"`，其中 Worker 也是 `ready`。
- H5 返回 `H5 HTTP 200`。

只想快速确认能否使用时，直接打开模板页也可以；上传任务报系统错误时，再执行上面的健康检查。

## 更新代码后启动

拉取最新代码：

```bash
cd /Users/zn/workspace/shotAI/MvpDemo
git pull
pnpm install
pnpm dev
```

如果这次更新修改了 `services/pose-worker/requirements.lock`，在启动前额外执行：

```bash
pnpm python:install
```

如果姿态模型不存在，再执行：

```bash
pnpm model:download
```

## 需要分别启动三个服务时

只有在调试单个服务时才需要这种方式。打开三个终端，都先进入项目目录，再分别执行：

```bash
pnpm worker:dev
```

```bash
pnpm api:dev
```

```bash
pnpm web:dev
```

这种方式下，每个终端只管理一个服务；重启某个服务时，在对应终端按 `Control + C`，再重新执行该命令。日常使用仍建议统一执行 `pnpm dev`。

## 常见问题

### `command not found: pnpm`

```bash
corepack enable
pnpm --version
```

项目需要 pnpm 11.11.0；版本由仓库根目录的 `package.json` 声明。

### 提示 `.venv/bin/python` 不存在

```bash
python3.11 -m venv .venv
pnpm python:install
```

### Worker 提示模型不存在或 `modelLoaded` 为 `false`

```bash
pnpm model:download
```

下载完成后重启整个项目。

### 提示 `Address already in use`

先检查哪个进程占用了端口：

```bash
lsof -nP -iTCP:8001 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

如果是之前启动的 Shot AI，回到旧终端按 `Control + C`。找不到旧终端时，根据 `lsof` 输出结束对应 PID：

```bash
kill <PID>
```

确认三个端口不再被占用后，重新执行 `pnpm dev`。不要在未确认进程来源时使用 `kill -9`。

### 页面还是旧内容或无法连接

1. 确认运行 `pnpm dev` 的终端没有报错。
2. 执行上面的三个健康检查。
3. 在 Chrome 使用 `Command + Shift + R` 强制刷新。
4. 仍未恢复时，按 `Control + C` 停止，再执行 `pnpm dev`。

## 本地数据不会因重启丢失

上传视频、SQLite 数据库和分析产物默认保存在仓库的 `data/` 目录，姿态模型保存在 `models/` 目录。停止或重启服务不会删除它们。

排查问题时不要随意删除 `data/`，否则已有模板、任务和报告会一起丢失。默认启动不需要 `.env`；只有需要改变数据目录、端口或 Worker 地址时，才参考仓库根目录的 [`.env.example`](../.env.example) 设置环境变量。

## 代码验证不是日常启动步骤

`pnpm verify` 会运行测试、类型检查、生产构建并安装/执行浏览器测试，耗时明显高于启动项目。它适合代码变更后的完整验收，不需要每次打开 Demo 都运行。

需要完整验证时，请在服务停止后执行：

```bash
pnpm verify
```
