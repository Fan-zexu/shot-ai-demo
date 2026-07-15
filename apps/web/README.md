# Shot Lab H5

React H5 for the local shot-comparison MVP. It implements the four hash routes defined by the PRD:

- `#/templates` — upload, inspect, select, and delete reference templates;
- `#/comparisons/new` — choose one ready template and upload one same-hand user video;
- `#/jobs/:jobId` — poll and display persisted processing stages without fake percentages;
- `#/reports/:comparisonId` — inspect one comparison through synchronized video, skeleton overlay, and motion-channel views.

## Run locally

Start the Worker and API from the repository root, then start Vite:

```bash
pnpm worker:dev
pnpm api:dev
pnpm web:dev
```

Open `http://127.0.0.1:5173/#/templates`. Vite proxies `/api` to `http://127.0.0.1:3001`. Override the API origin for a different local setup with `VITE_API_BASE_URL`.

## State and trust boundaries

- The browser validates only required fields, one file, and the 300 MB default limit.
- The API and Pose Worker remain authoritative for decoding, capture quality, action completeness, and compatibility.
- Job polling uses one-second intervals in the foreground and five seconds while the page is hidden.
- `rejected` jobs ask for replacement input and never expose retry; only `failed` jobs can retry the original file.
- All three report views share one normalized sample index, play/pause state, playback rate, and six event anchors. Switching views does not restart the comparison.
- The fifth event is explicitly labeled `释放姿态代理`; it is a pose-derived proxy and not real ball-release detection.
- Evidence highlighting requires a comparable region with confidence at or above `0.6`. Low-confidence regions stay visible as unavailable data and are never colored as a deviation.
- Side-by-side playback uses the user video as the clock, corrects template drift only beyond 40 ms, and pauses both videos while either side is buffering.
- The motion channel visualizes the current template trajectory with the server-provided radius. It is not a biomechanical tolerance or a standard-action acceptance range.
- A collapsed desktop-only debug panel exposes mappings, curves, quality checks, versions, timings, artifact hashes, and raw export links without adding a user-facing score.
