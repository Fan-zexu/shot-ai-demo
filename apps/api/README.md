# Local API

Fastify API 是 H5 的唯一后端入口。它把私有文件存储、SQLite 状态机、Python Pose Worker 和 TypeScript 比较引擎串成单并发、可恢复的本地处理链路。

## 启动

先在一个终端启动 Worker：

```bash
pnpm worker:dev
```

再在另一个终端启动 API：

```bash
pnpm api:dev
```

默认地址为 `http://127.0.0.1:3001`。API 和 Worker 必须使用同一个 `SHOT_AI_DATA_ROOT`；可从仓库根目录的 `.env.example` 复制配置，但不要提交本机绝对路径。

## 公开接口

- `POST /api/v1/templates`：上传并异步解析模板；模板不要求正常速度确认，慢放或剪辑变速不会作为输入拒绝原因。
- `GET /api/v1/templates`、`GET /api/v1/templates/:id`、`DELETE /api/v1/templates/:id`。
- `POST /api/v1/comparisons`：上传用户视频并创建对比。
- `GET /api/v1/comparisons/:id`、`GET /api/v1/comparisons/:id/report`。
- `POST /api/v1/comparisons/:id/rerun`、`DELETE /api/v1/comparisons/:id`。
- `GET /api/v1/jobs/:id`、`POST /api/v1/jobs/:id/retry`。
- `GET /api/v1/files/:id/video`：支持单段 HTTP Range。
- `/api/v1/debug/*`：导出质量报告、动作产物、比较结果和证据摘要。

所有任务阶段都来自 SQLite 的 `job_events`，前端不生成假百分比。输入不满足条件进入 `rejected`，提示重新拍摄或换模板；Worker、磁盘、预览编码等故障进入 `failed`，才允许原任务重试。

## 恢复与产物

- Runner 严格单并发，API 重启时自动检查 `running` 任务。
- 第一次中断会增加 `attempt` 并重新排队；重复中断进入 `failed`。
- 用户 `MotionArtifact` 已提交后，后续预览或报告失败的重试会从该产物继续，不重复姿态推理。
- 原始视频、gzip 产物和预览都经过临时文件、哈希和原子重命名后才写入数据库。
- 报告启用 gzip 与 `ETag`，三种模式共用同一个 `renderTimeline`。

## 验证

```bash
pnpm --filter @shot-ai/api test
pnpm --filter @shot-ai/api typecheck
```

集成测试使用测试专用 Worker 适配器，不把固定假骨架当作真实视频实验。真实 MediaPipe、FFmpeg 和 Worker HTTP 联调在端到端验证阶段单独执行。
