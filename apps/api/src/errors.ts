export class AppError extends Error {
  readonly code: string;
  readonly category: 'validation' | 'rejection' | 'system';
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(options: {
    code: string;
    category: 'validation' | 'rejection' | 'system';
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.category = options.category;
    this.retryable = options.retryable;
    this.details = options.details;
  }
}

