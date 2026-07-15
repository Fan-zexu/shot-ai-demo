import { useEffect, useState } from 'react';

import { AppShell } from './components/AppShell.tsx';
import { NewComparisonPage } from './pages/NewComparisonPage.tsx';
import { ProcessingPage } from './pages/ProcessingPage.tsx';
import { ReportReadyPage } from './pages/ReportReadyPage.tsx';
import { TemplatesPage } from './pages/TemplatesPage.tsx';

interface Route {
  pathname: string;
  search: URLSearchParams;
}

function currentRoute(): Route {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const [pathname = '/templates', query = ''] = (raw || '/templates').split('?');
  return { pathname, search: new URLSearchParams(query) };
}

export function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  if (route.pathname === '/' || route.pathname === '/templates') return <TemplatesPage />;
  if (route.pathname === '/comparisons/new') {
    const initialTemplateId = route.search.get('template');
    return <NewComparisonPage {...(initialTemplateId ? { initialTemplateId } : {})} />;
  }
  const job = route.pathname.match(/^\/jobs\/([^/]+)$/);
  if (job?.[1]) return <ProcessingPage jobId={decodeURIComponent(job[1])} />;
  const report = route.pathname.match(/^\/reports\/([^/]+)$/);
  if (report?.[1]) return <ReportReadyPage comparisonId={decodeURIComponent(report[1])} />;

  return (
    <AppShell active="templates">
      <section className="not-found">
        <span className="eyebrow">404 / OUT OF BOUNDS</span>
        <h1>这个页面不在动作跑道上</h1>
        <a className="button button-primary" href="#/templates">返回模板页</a>
      </section>
    </AppShell>
  );
}
