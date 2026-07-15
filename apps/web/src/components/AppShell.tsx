import type { PropsWithChildren } from 'react';

interface AppShellProps extends PropsWithChildren {
  active: 'templates' | 'comparison' | 'job' | 'report';
}

export function AppShell({ active, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/templates" aria-label="Shot Lab 模板页">
          <span className="brand-court" aria-hidden="true">
            <span />
          </span>
          <span>
            <strong>SHOT LAB</strong>
            <small>投篮动作实验台</small>
          </span>
        </a>
        <span className="mvp-badge">LOCAL MVP / 01</span>
      </header>

      <main className="main-content">{children}</main>

      <nav className="bottom-nav" aria-label="主要功能">
        <a className={active === 'templates' ? 'is-active' : ''} href="#/templates">
          <NavIcon name="stack" />
          模板
        </a>
        <a className={active === 'comparison' ? 'is-active' : ''} href="#/comparisons/new">
          <NavIcon name="compare" />
          新建对比
        </a>
      </nav>
    </div>
  );
}

function NavIcon({ name }: { name: 'stack' | 'compare' }) {
  if (name === 'stack') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 8 8-4 8 4-8 4-8-4Zm0 4 8 4 8-4M4 16l8 4 8-4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h12m0 0-3-3m3 3-3 3M19 17H7m0 0 3-3m-3 3 3 3" />
    </svg>
  );
}
