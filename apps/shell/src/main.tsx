import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fonts first. Salt's type scale expects Open Sans for text and PT Mono for
// anything monospaced; without them the layout is correct and the typography is
// silently the browser default.
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/pt-mono/400.css';

// The J.P. Morgan theme, and the ONLY place in the repo these are imported.
//
// `theme-next.css` defines the `.salt-theme-next` scope that SaltProviderNext
// applies. Do NOT switch to `@salt-ds/theme/css/index.css`: that pulls in the
// legacy theme alongside this one and the two then compete for the same custom
// properties, which shows up as colours that are almost right.
//
// Federated remotes must not import these. They render inside this document, so
// the tokens are already in scope; importing again would ship the whole theme a
// second time per remote. Each remote's standalone entry does import them,
// because that page is its own document.
import '@salt-ds/theme/css/global.css';
import '@salt-ds/theme/css/theme-next.css';

// Repairs a token theme-next leaves dangling; see the file for why.
import '@knowledge-ui/ui-kit/theme-fixups.css';

import { App } from './App';

async function bootstrap() {
  // The mocked end-to-end lane runs the real build against intercepted requests,
  // so the whole app can be exercised with no backend at all. Started before
  // render so the first query cannot escape the interceptor.
  if (import.meta.env.VITE_MSW === 'on') {
    const { startWorker } = await import('@knowledge-ui/testing/browser');
    await startWorker();
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('no #root element to mount into');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
