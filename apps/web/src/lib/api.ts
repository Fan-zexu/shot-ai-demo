import type { JobSummary, ReportBundle, ShootingHand } from '@shot-ai/contracts';

import type {
  CreateComparisonResponse,
  CreateTemplateResponse,
  PublicApiError,
  TemplateDetails,
  TemplateSummary,
} from './types.ts';

const API_PREFIX = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1`;

export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

export class ApiRequestError extends Error {
  constructor(readonly payload: PublicApiError) {
    super(payload.message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, init);
  if (!response.ok) {
    let payload: PublicApiError;
    try {
      payload = (await response.json()) as PublicApiError;
    } catch {
      payload = {
        code: 'NETWORK_RESPONSE_INVALID',
        category: 'system',
        message: `请求失败（HTTP ${response.status}）`,
        retryable: response.status >= 500,
      };
    }
    throw new ApiRequestError(payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function templateForm(input: {
  file: File;
  shootingHand: ShootingHand;
  normalSpeedConfirmed: true;
  name?: string;
  templateId?: string;
}) {
  const form = new FormData();
  form.set('file', input.file);
  form.set('shootingHand', input.shootingHand);
  form.set('normalSpeedConfirmed', String(input.normalSpeedConfirmed));
  if (input.name) form.set('name', input.name);
  if (input.templateId) form.set('templateId', input.templateId);
  return form;
}

export async function listTemplates(status?: 'ready'): Promise<TemplateDetails[]> {
  const query = status ? `?status=${status}` : '';
  const summaries = await request<TemplateSummary[]>(`/templates${query}`);
  // The first release stores only 1–3 templates. Fetching their small detail
  // records keeps video and quality metadata out of the list contract while
  // still rendering truthful cards.
  return Promise.all(summaries.map((template) => getTemplate(template.id)));
}

export function getTemplate(templateId: string) {
  return request<TemplateDetails>(`/templates/${encodeURIComponent(templateId)}`);
}

export function createTemplate(input: {
  file: File;
  name: string;
  shootingHand: ShootingHand;
}) {
  return request<CreateTemplateResponse>('/templates', {
    method: 'POST',
    body: templateForm({ ...input, normalSpeedConfirmed: true }),
  });
}

export function deleteTemplate(templateId: string) {
  return request<{ mode: 'physical' | 'soft' }>(
    `/templates/${encodeURIComponent(templateId)}`,
    { method: 'DELETE' },
  );
}

export function createComparison(input: {
  file: File;
  templateId: string;
  shootingHand: ShootingHand;
}) {
  return request<CreateComparisonResponse>('/comparisons', {
    method: 'POST',
    body: templateForm({ ...input, normalSpeedConfirmed: true }),
  });
}

export function getJob(jobId: string) {
  return request<JobSummary>(`/jobs/${encodeURIComponent(jobId)}`);
}

export function retryJob(jobId: string) {
  return request<{ jobId: string; status: 'queued'; attempt: number }>(
    `/jobs/${encodeURIComponent(jobId)}/retry`,
    { method: 'POST' },
  );
}

export function getReport(comparisonId: string) {
  return request<ReportBundle>(`/comparisons/${encodeURIComponent(comparisonId)}/report`);
}

export function toApiError(error: unknown): PublicApiError {
  if (error instanceof ApiRequestError) return error.payload;
  return {
    code: 'NETWORK_ERROR',
    category: 'system',
    message: error instanceof Error ? error.message : '无法连接本地分析服务',
    retryable: true,
  };
}
