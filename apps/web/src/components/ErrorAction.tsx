import { errorCopy } from '../lib/errors.ts';
import type { PublicApiError } from '../lib/types.ts';

export function ErrorAction({ error }: { error: PublicApiError }) {
  const copy = errorCopy(error)!;
  return (
    <section className={`error-action error-${error.category}`} role="alert">
      <span className="eyebrow">下一步</span>
      <h2>{copy.action}</h2>
      <p>{copy.title}</p>
      <details>
        <summary>查看技术信息</summary>
        <dl className="technical-grid">
          <div>
            <dt>错误码</dt>
            <dd>{error.code}</dd>
          </div>
          <div>
            <dt>类型</dt>
            <dd>{error.category}</dd>
          </div>
          {error.requestId ? (
            <div>
              <dt>Request ID</dt>
              <dd>{error.requestId}</dd>
            </div>
          ) : null}
        </dl>
        {error.details ? <pre>{JSON.stringify(error.details, null, 2)}</pre> : null}
      </details>
    </section>
  );
}
