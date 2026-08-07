import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadSavedContextCases } from '../../contextLabModel';
import { ContextLabPage } from '../ContextLabPage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

function renderPage(personaKey = 'consumer') {
  return renderWithProviders(<ContextLabPage />, {
    route: '/context',
    session: makeSession({ role: 'consumer', personaKey }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor('knowledge-ui-consumer'),
    }),
  });
}

beforeEach(() => sessionStorage.clear());

describe('the context probe conversation', () => {
  it('asks exactly one source per turn and labels the response as context, not an answer', async () => {
    const calls: string[] = [];
    server.use(
      http.get('*/v1/search', () => {
        calls.push('catalog');
        return HttpResponse.json({
          items: [
            {
              entity_id: 'salt-design-system',
              name: 'salt-design-system',
              entity_type: 'capability',
              score: 0.94,
              citations: [{ fact_id: 'salt-overview', category: 'overview' }],
            },
          ],
          total: 1,
          took_ms: 8,
        });
      }),
      http.get('*/v1/memory/claims/search', () => {
        calls.push('claims');
        return HttpResponse.json([]);
      }),
      http.get('*/v1/workspaces/search', () => {
        calls.push('workspaces');
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );

    const user = userEvent.setup();
    renderPage();

    /*
      The framing moved from a banner into the page description — same promise,
      one surface: evidence, never generated answers.
    */
    expect(screen.getByText(/raw records, never generated answers/i)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /task or query/i }), 'Salt components');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Context Layer Returned')).toBeInTheDocument();
    expect(screen.getByText(/Exact records from the selected source/i)).toBeInTheDocument();
    expect(screen.getByText('Server Relevance')).toBeInTheDocument();
    expect(
      screen.getByText(/Catalog probe completed. Context is ready for review/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Catalog probe turn' })).toHaveFocus(),
    );
    await waitFor(() => expect(calls).toEqual(['catalog']));
  });

  it('uses claims-specific retrieval controls and keeps the recall warning visible once', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^source$/i }));
    await user.click(await screen.findByRole('option', { name: 'Claims' }));
    expect(screen.getByRole('combobox', { name: /claim persona/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /task or query/i }), 'depends_on');
    await user.click(screen.getByRole('button', { name: 'Probe Context' }));

    expect(await screen.findByText(/design-tokens/)).toBeInTheDocument();
    expect(screen.getAllByText(/not an instruction to follow/i)).toHaveLength(1);
    expect(screen.getByText('Extractor Confidence')).toBeInTheDocument();
    expect(screen.getByText('Owner Confirmed')).toBeInTheDocument();
    expect(screen.getAllByText(/ev-9002/).length).toBeGreaterThan(0);
  });

  it('captures item labels and missing context in a session-scoped regression case', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /task or query/i }), 'Salt');
    await user.click(screen.getByRole('button', { name: 'Probe Context' }));
    await screen.findByText('Context Layer Returned');

    await user.click(screen.getByRole('combobox', { name: 'Evaluation for salt-design-system' }));
    await user.click(await screen.findByRole('option', { name: 'Expected' }));
    await user.type(
      screen.getByRole('textbox', { name: /missing context/i }),
      'Expected the migration guidance.',
    );
    await user.click(screen.getByRole('button', { name: 'Save Regression Case' }));
    await user.type(screen.getByRole('textbox', { name: /case name/i }), 'Salt retrieval baseline');
    await user.click(screen.getByRole('button', { name: 'Save Regression Case' }));

    expect(await screen.findByText(/available in this tab for this persona/i)).toBeInTheDocument();
    const saved = loadSavedContextCases({ personaKey: 'consumer', tenantSlug: 'dev' });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.expected_ids).toContain('salt-design-system');
    expect(saved[0]?.missing_context).toBe('Expected the migration guidance.');
    expect(loadSavedContextCases({ personaKey: 'producer', tenantSlug: 'dev' })).toEqual([]);

    const savedSection = screen.getByText('Saved Cases').parentElement?.parentElement;
    expect(savedSection).toBeTruthy();
    expect(
      within(savedSection as HTMLElement).getByText('Salt retrieval baseline'),
    ).toBeInTheDocument();

    let releaseRerun: (() => void) | undefined;
    server.use(
      http.get(
        '*/v1/search',
        () =>
          new Promise<HttpResponse<{ items: never[]; total: number; took_ms: number }>>(
            (resolve) => {
              releaseRerun = () => resolve(HttpResponse.json({ items: [], total: 0, took_ms: 4 }));
            },
          ),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Rerun Case' }));
    expect(screen.getByRole('button', { name: 'Rerunning Case…' })).toBeDisabled();
    releaseRerun?.();
    expect(
      await screen.findByText('Regression Check · Salt retrieval baseline'),
    ).toBeInTheDocument();
  });

  it('keeps zero results distinct from a failed later turn', async () => {
    server.use(
      http.get('*/v1/search', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        if (q === 'fail') {
          return HttpResponse.json(
            { errors: [{ code: 'unavailable', message: 'catalog search unavailable' }] },
            { status: 503 },
          );
        }
        return HttpResponse.json({ items: [], total: 0, took_ms: 3 });
      }),
    );

    const user = userEvent.setup();
    renderPage();
    const task = screen.getByRole('textbox', { name: /task or query/i });

    await user.type(task, 'nothing');
    await user.click(screen.getByRole('button', { name: 'Probe Context' }));
    expect(await screen.findByText('No Context Matched This Probe')).toBeInTheDocument();

    await user.type(task, 'fail');
    await user.click(screen.getByRole('button', { name: 'Probe Context' }));
    expect(await screen.findByText('Catalog probe failed')).toBeInTheDocument();
    expect(screen.getByText(/catalog search unavailable/i)).toBeInTheDocument();
    // The earlier snapshot remains in the transcript instead of being replaced.
    expect(screen.getByText('No Context Matched This Probe')).toBeInTheDocument();
  });

  it('uses Shift+Enter for a newline and Enter to submit', async () => {
    const user = userEvent.setup();
    renderPage();
    const task = screen.getByRole('textbox', { name: /task or query/i });

    await user.type(task, 'first line');
    await user.keyboard('{Shift>}{Enter}{/Shift}second line');
    expect(screen.queryByText('Context Layer Returned')).not.toBeInTheDocument();
    expect(task).toHaveValue('first line\nsecond line');

    await user.keyboard('{Enter}');
    expect(await screen.findByText('Context Layer Returned')).toBeInTheDocument();
  });
});
