import { AppError } from '../errors.ts';
import type {
  AnalyzeMotionRequest,
  AnalyzeMotionResponse,
  RenderAlignedPreviewsRequest,
  RenderAlignedPreviewsResponse,
  WorkerClient,
  WorkerHealth,
} from './client.ts';

export class HttpWorkerClient implements WorkerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 300_000,
  ) {}

  health(): Promise<WorkerHealth> {
    return this.request('/internal/v1/health', { method: 'GET' });
  }

  analyzeMotion(request: AnalyzeMotionRequest): Promise<AnalyzeMotionResponse> {
    return this.request('/internal/v1/analyze-motion', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  renderAlignedPreviews(
    request: RenderAlignedPreviewsRequest,
  ): Promise<RenderAlignedPreviewsResponse> {
    return this.request('/internal/v1/render-aligned-previews', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        ...init,
        ...(init.body ? { headers: { 'content-type': 'application/json' } } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new AppError({
          code: response.status >= 500 ? 'WORKER_UNAVAILABLE' : 'WORKER_REQUEST_REJECTED',
          category: 'system',
          message: `Pose Worker returned HTTP ${response.status}`,
          retryable: response.status >= 500,
          details: { status: response.status, body },
        });
      }
      return body as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      throw new AppError({
        code: timeout ? 'PROCESSING_TIMEOUT' : 'WORKER_UNAVAILABLE',
        category: 'system',
        message: timeout ? 'Pose Worker request timed out' : 'Pose Worker is unavailable',
        retryable: true,
        details: { cause: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}
