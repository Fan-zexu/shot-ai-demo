# Shot Lab H5

React H5 for the local shot-comparison MVP. It implements the four hash routes defined by the PRD:

- `#/templates` — upload, inspect, select, and delete reference templates;
- `#/comparisons/new` — choose one ready template and upload one same-hand user video;
- `#/jobs/:jobId` — poll and display persisted processing stages without fake percentages;
- `#/reports/:comparisonId` — consume the generated report bundle (interactive modes are built on this route).

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
