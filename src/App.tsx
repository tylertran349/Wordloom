import { useEffect, type MouseEvent } from 'react';
import { useRoute } from './hooks/useRoute';
import { routeKey } from './lib/router';
import { pluralize } from './lib/utils';
import { useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { ToastHost } from './components/Toast';
import { Dashboard } from './views/Dashboard';
import { Levels } from './views/Levels';
import { Study } from './views/Study';
import { Review } from './views/Review';
import { Progress } from './views/Progress';
import { Settings } from './views/Settings';

function App() {
  const route = useRoute();
  const { stats, sheetSync, sheetPhase } = useApp();
  const key = routeKey(route);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [key]);

  useEffect(() => {
    const suffix =
      route.name === 'dashboard'
        ? 'Today'
        : route.name === 'level'
          ? `${route.level} vocabulary`
          : route.name === 'word'
            ? 'Word study'
            : route.name === 'review'
              ? 'Review'
              : route.name === 'progress'
                ? 'Progress'
                : 'Settings';
    document.title = `Wordloom · ${suffix}`;
  }, [route]);

  function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const main = document.getElementById('main-content');
    main?.focus();
    main?.scrollIntoView();
  }

  let content;
  switch (route.name) {
    case 'level':
      content = <Levels level={route.level} />;
      break;
    case 'word':
      content = <Study level={route.level} wordId={route.wordId} />;
      break;
    case 'review':
      content = <Review practice={route.practice ?? false} />;
      break;
    case 'progress':
      content = <Progress />;
      break;
    case 'settings':
      content = <Settings />;
      break;
    case 'dashboard':
    default:
      content = <Dashboard />;
      break;
  }

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        Skip to content
      </a>
      <div className="app-shell">
        <Sidebar route={route} />
        <main className="main" id="main-content" tabIndex={-1}>
          <div className="view-transition" key={key}>
            {content}
          </div>
          <footer className="app-foot">
            <span>Wordloom · words that stick</span>
            <span className="app-foot-meta">
              {stats.studied} {pluralize(stats.studied, 'word')} in rotation ·{' '}
              {sheetSync.email
                ? sheetPhase === 'error'
                  ? 'sync issue — check Settings'
                  : sheetPhase === 'disconnected'
                      ? 'sync not set up'
                      : sheetPhase === 'unsaved' || sheetPhase === 'syncing'
                        ? 'syncing…'
                        : `backed up as ${sheetSync.email}`
                : 'saved on this device'}
            </span>
          </footer>
        </main>
      </div>
      <ToastHost />
    </>
  );
}

export default App;
