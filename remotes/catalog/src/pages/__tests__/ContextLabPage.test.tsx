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

describe('retrieval tests', () => {
  it('starts as a compact workbench with separate result, test-case, and history views', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Retrieval Tests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test Setup' })).toBeInTheDocument();
    expect(screen.getByText('Ready to Test')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Results' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Test Cases (0)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Run History (0)' })).toBeInTheDocument();
    expect(screen.queryByText('All Sources')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Test Cases (0)' }));
    expect(screen.getByText('No Saved Test Cases')).toBeInTheDocument();
    expect(screen.queryByText('Ready to Test')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Run History (0)' }));
    expect(screen.getByText('No Runs Yet')).toBeInTheDocument();
  });

  it('asks exactly one source and presents returned records in an evaluation grid', async () => {
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

    expect(screen.getByText(/stored records, not a generated answer/i)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /agent task/i }), 'Salt components');
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('heading', { name: 'Catalog Records Results' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Match' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Why It Matched' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Verdict' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Include salt-design-system' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exclude salt-design-system' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Run History (1)' })).toBeInTheDocument();
    expect(
      screen.getByText(/Catalog Records test completed. Results are ready for review/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Catalog Records test run' })).toHaveFocus(),
    );
    await waitFor(() => expect(calls).toEqual(['catalog']));
  });

  it('uses claims-specific controls and states the recall warning once', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /context source/i }));
    await user.click(await screen.findByRole('option', { name: 'Recalled Claims' }));
    expect(screen.getByRole('combobox', { name: /claims view/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /agent task/i }), 'depends_on');
    await user.click(screen.getByRole('button', { name: 'Run Retrieval Test' }));

    expect(await screen.findByText(/design-tokens/)).toBeInTheDocument();
    expect(screen.getAllByText(/not an instruction to follow/i)).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Trust' })).toBeInTheDocument();
    expect(screen.getByText('Owner Confirmed')).toBeInTheDocument();
    expect(screen.getAllByText(/ev-9002/).length).toBeGreaterThan(0);
  });

  it('saves direct row judgments and missing context as a session-scoped test case', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /agent task/i }), 'Salt');
    await user.click(screen.getByRole('button', { name: 'Run Retrieval Test' }));
    const include = await screen.findByRole('button', { name: 'Include salt-design-system' });
    await user.click(include);
    expect(include).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^1 of \d+ Reviewed$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save as Test Case' }));
    expect(screen.getByRole('dialog', { name: 'Save as Test Case' })).toBeInTheDocument();
    const caseName = screen.getByRole('textbox', { name: /test case name/i });
    expect(caseName).toHaveValue('Catalog Records: Salt');
    await user.clear(caseName);
    await user.type(caseName, 'Salt retrieval baseline');
    await user.type(
      screen.getByRole('textbox', { name: /missing context/i }),
      'Expected the migration guidance.',
    );
    await user.click(screen.getByRole('button', { name: 'Save Test Case' }));

    expect(screen.getByText('Saved as Salt retrieval baseline')).toBeInTheDocument();
    const saved = loadSavedContextCases({ personaKey: 'consumer', tenantSlug: 'dev' });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.expected_ids).toContain('salt-design-system');
    expect(saved[0]?.missing_context).toBe('Expected the migration guidance.');
    expect(loadSavedContextCases({ personaKey: 'producer', tenantSlug: 'dev' })).toEqual([]);

    await user.click(screen.getByRole('tab', { name: 'Test Cases (1)' }));
    const savedRow = screen.getByText('Salt retrieval baseline').closest('tr');
    expect(savedRow).not.toBeNull();
    expect(
      within(savedRow as HTMLElement).getByText('1 included · 0 excluded'),
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
    await user.click(within(savedRow as HTMLElement).getByRole('button', { name: 'Run Again' }));
    expect(screen.getByRole('button', { name: 'Running Test…' })).toBeDisabled();
    releaseRerun?.();
    expect(await screen.findByRole('heading', { name: 'Baseline Comparison' })).toBeInTheDocument();
    expect(screen.getByText(/Expected Results Missing/)).toBeInTheDocument();
  });

  it('keeps empty and failed runs distinct in the run history', async () => {
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
    const task = screen.getByRole('textbox', { name: /agent task/i });

    await user.type(task, 'nothing');
    await user.click(screen.getByRole('button', { name: 'Run Retrieval Test' }));
    expect(await screen.findByText('No Records Matched')).toBeInTheDocument();

    await user.type(task, 'fail');
    await user.click(screen.getByRole('button', { name: 'Run Retrieval Test' }));
    expect(await screen.findByText('Catalog Records test failed')).toBeInTheDocument();
    expect(screen.getByText(/catalog search unavailable/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Run History (2)' }));
    const emptyRun = screen.getByText('nothing').closest('tr');
    const failedRun = screen.getByText('fail').closest('tr');
    expect(emptyRun).not.toBeNull();
    expect(failedRun).not.toBeNull();
    expect(within(emptyRun as HTMLElement).getByText('Ready')).toBeInTheDocument();
    expect(within(failedRun as HTMLElement).getByText('Failed')).toBeInTheDocument();

    await user.click(within(emptyRun as HTMLElement).getByRole('button', { name: 'View Results' }));
    expect(screen.getByText('No Records Matched')).toBeInTheDocument();
  });

  it('gives the source and task fields distinct guidance', () => {
    renderPage();
    expect(screen.getAllByText(/facts that made it relevant/)).toHaveLength(1);
    expect(screen.getByText(/Describe the real task/)).toBeInTheDocument();
  });

  it('uses Shift+Enter for a newline and Enter to run', async () => {
    const user = userEvent.setup();
    renderPage();
    const task = screen.getByRole('textbox', { name: /agent task/i });

    await user.type(task, 'first line');
    await user.keyboard('{Shift>}{Enter}{/Shift}second line');
    expect(
      screen.queryByRole('heading', { name: 'Catalog Records Results' }),
    ).not.toBeInTheDocument();
    expect(task).toHaveValue('first line\nsecond line');

    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { name: 'Catalog Records Results' }),
    ).toBeInTheDocument();
  });
});
