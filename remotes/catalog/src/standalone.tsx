import { SaltProviderNext } from '@salt-ds/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/pt-mono/400.css';
import '@salt-ds/theme/css/global.css';
import '@salt-ds/theme/css/theme-next.css';

// Repairs a token theme-next leaves dangling; see the file for why.
import '@knowledge-ui/ui-kit/theme-fixups.css';

import { StandaloneHarness } from './standalone/StandaloneHarness';

/**
 * Standalone entry, for developing this remote on its own.
 *
 * This is the only place the remote sets up a theme, a cache and a router, and
 * it is unreachable through the federated entry — two separate entry points is
 * simpler than one component that has to detect whether it is hosted. There is
 * nothing to get wrong at runtime because the branch happens at build time.
 */
const container = document.getElementById('root');
if (!container) throw new Error('no #root element to mount into');

createRoot(container).render(
  <StrictMode>
    <SaltProviderNext mode="light" density="low" accent="teal" corner="rounded">
      <QueryClientProvider client={new QueryClient()}>
        {/* Same future flags as the shell, so standalone and federated
            navigation resolve identically. */}
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <StandaloneHarness />
        </BrowserRouter>
      </QueryClientProvider>
    </SaltProviderNext>
  </StrictMode>,
);
