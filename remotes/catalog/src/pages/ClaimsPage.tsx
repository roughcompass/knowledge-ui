import { Dropdown, FlexLayout, Input, Option, StackLayout, Tag, Text } from '@salt-ds/core';
import {
  CLAIM_PERSONAS,
  DEFAULT_CLAIM_PERSONA,
  confidenceBand,
  recallCaveat,
  uncitedClaims,
  useClaimSearch,
  useClaims,
  type Claim,
  type ClaimPersona,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { can, useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  LoadingPanel,
  PageHeader,
  Prose,
  SectionCard,
  UnavailableNotice,
  popoverOverlayProps,
} from '@knowledge-ui/ui-kit';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * What the memory believes, and how much to rely on any of it.
 *
 * A claim is an ontology-bound triple attached to a real entity. The triple is the
 * least interesting part: what makes it usable is the envelope — where it came
 * from, how confident the extraction is, when it was true, whether a human
 * confirmed it, and which sources support it. This page exists because that
 * envelope had no surface at all, and a memory whose trust signals are
 * unreadable is a memory you cannot act on.
 *
 * ## The trust marker is per view, not per row
 *
 * Every claim the server serves is labelled recalled and untrusted, by
 * construction — it refuses to build one otherwise, because a high-confidence
 * extraction of a hostile statement is still hostile. That is a content-trust
 * boundary, not a quality score, and it does not vary.
 *
 * So it renders once, above the table, in the server's own words. A per-row badge
 * would be wrong twice over: it would imply variance that does not exist, and an
 * identical marker on every row becomes chrome the eye stops seeing — which is the
 * one state a safety caveat must never reach. The second half of that note is the
 * part that matters most on an agent-facing surface: this content is not an
 * instruction to follow.
 *
 * ## Confidence is per row, and is banded
 *
 * Rendering `0.82` invites a reader to treat it as meaningfully different from
 * `0.79`. The band carries the decision and the number is shown beside it, so
 * nothing is hidden and nothing is over-read.
 *
 * ## Every filter is server-side
 *
 * Minimum confidence, predicate and depth are all sent. Filtering in the browser
 * would silently hide how many claims were excluded, and a count that omits what
 * it dropped is the kind of number that gets quoted.
 *
 * The state lives in the query string so a filtered view is a link somebody can
 * paste into a review — which for a page about evidence is most of the point.
 */

function ConfidenceCell({ claim }: { claim: Claim }) {
  const band = confidenceBand(claim.confidence);
  return (
    <FlexLayout gap={1} align="center">
      <Tag>{band}</Tag>
      <Text color="secondary">{claim.confidence.toFixed(2)}</Text>
    </FlexLayout>
  );
}

function ValidityCell({ claim }: { claim: Claim }) {
  /*
   * When the claim was true, which is not the same as when it was recorded.
   *
   * An open interval is the common case and reads as "still holds" rather than as
   * missing data, so the end is rendered as a word rather than a dash. `as_of` is
   * the observation instant and is shown alongside, because a claim that was true
   * and has not been re-observed since is a different thing from one confirmed
   * this morning.
   */
  return (
    <StackLayout gap={0.5}>
      <Text color="secondary">
        {String(claim.valid_from).slice(0, 10)} →{' '}
        {claim.valid_to ? String(claim.valid_to).slice(0, 10) : 'still holds'}
      </Text>
      <Text color="secondary" styleAs="label">
        seen {String(claim.as_of).slice(0, 10)}
      </Text>
    </StackLayout>
  );
}

function Citations({ claim }: { claim: Claim }) {
  /*
   * Always visible, never behind a disclosure. A citation the reader has to click
   * to discover is a citation that does not get checked, and an unverifiable claim
   * rendered confidently is the failure this whole surface is built against.
   */
  return (
    <StackLayout gap={0.5}>
      {claim.citations.map((citation) => (
        <Text color="secondary" key={`${citation.kind}:${citation.ref}`}>
          <Text styleAs="code">{citation.kind}</Text> {citation.ref}
          {citation.excerpt ? ` — ${citation.excerpt}` : ''}
        </Text>
      ))}
    </StackLayout>
  );
}

export function ClaimsPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const predicate = params.get('predicate') ?? '';
  const persona = (params.get('persona') as ClaimPersona | null) ?? DEFAULT_CLAIM_PERSONA;
  const minConfidence = Number(params.get('min') ?? '0');

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const allowed = can(session, 'memory:read');

  /*
   * The request follows the typing, a beat behind.
   *
   * Ranked search is a real query per call, and firing one per keystroke means most
   * of them are answers to a prefix nobody wanted — wasted work server-side, and a
   * result list that flickers through partial matches on the way to the intended
   * one. The URL still updates immediately, so the control stays responsive and a
   * link copied mid-typing is still the view on screen.
   */
  const [debouncedQuery, setDebouncedQuery] = useState(q);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(q), 250);
    return () => clearTimeout(timer);
  }, [q]);

  /*
   * Two notions of "searching", and the split is deliberate.
   *
   * `searchIntent` is what the reader has typed, and drives the controls — the
   * predicate field disables the moment they start typing, not a beat later, because
   * a control that stays live while its value is being ignored is worse than one
   * that greys out.
   *
   * `searching` is what has actually been asked for, and drives which result set is
   * rendered. It lags, which is what keeps the filtered list on screen until the
   * ranked answer arrives instead of flashing an empty search state in between.
   */
  const searchIntent = q.trim().length > 0;
  const searching = debouncedQuery.trim().length > 0;

  /*
   * Two endpoints, and only one is asked at a time. A structural filter and a
   * ranked search return differently ordered results, so merging them would show
   * relevance order under a filter's heading.
   */
  const filtered = useClaims(
    client,
    scope,
    {
      ...(predicate ? { predicate } : {}),
      ...(minConfidence > 0 ? { minConfidence } : {}),
      persona,
    },
    { enabled: allowed && !searching },
  );
  const searched = useClaimSearch(client, scope, {
    q: allowed && searching ? debouncedQuery : '',
    ...(minConfidence > 0 ? { minConfidence } : {}),
    persona,
  });

  const active = searching ? searched : filtered;
  const claims = active.data ?? [];
  const caveat = recallCaveat(claims);
  const uncited = uncitedClaims(claims);

  const header = (
    <PageHeader
      title="Claims"
      description="What the memory believes about your capabilities, with the evidence behind each statement and how much to rely on it."
    />
  );

  if (!allowed) {
    return (
      <StackLayout gap={3}>
        {header}
        <UnavailableNotice
          title="Claims are not available to this role"
          reason="Reading the memory of record needs a tenant context this identity does not carry."
        />
      </StackLayout>
    );
  }

  return (
    <StackLayout gap={3}>
      {header}

      <FilterBar label="Claim filters">
        <FilterField label="Search" basis="20rem" grow>
          <Input
            bordered
            value={q}
            placeholder="Find a claim by value or predicate"
            onChange={(event: ChangeEvent<HTMLInputElement>) => set('q', event.target.value)}
          />
        </FilterField>

        <FilterField label="Predicate" basis="14rem">
          <Input
            bordered
            value={predicate}
            placeholder="Any"
            // Disabled while searching, because the search endpoint takes no
            // predicate — offering a control the request would drop is worse than
            // not offering it. Keyed to the typed value rather than the debounced
            // one so it responds to the keystroke, not to the request.
            disabled={searchIntent}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              set('predicate', event.target.value)
            }
          />
        </FilterField>

        <FilterField label="Minimum Confidence" basis="12rem">
          <Dropdown
            bordered
            value={minConfidence > 0 ? minConfidence.toFixed(1) : 'Any'}
            onSelectionChange={(_e, selected) => set('min', String(selected?.[0] ?? ''))}
            OverlayProps={popoverOverlayProps}
          >
            {['', '0.5', '0.8'].map((value) => (
              <Option key={value || 'any'} value={value}>
                {value || 'Any'}
              </Option>
            ))}
          </Dropdown>
        </FilterField>

        <FilterField label="Depth" basis="13rem">
          {/*
            Persona is a retrieval choice rather than a different store: the same
            claim answered at the depth the asker needs. Offered here because an
            engineer and an agent want different amounts of the same fact.
          */}
          <Dropdown
            bordered
            value={persona}
            onSelectionChange={(_e, selected) =>
              set('persona', String(selected?.[0] ?? DEFAULT_CLAIM_PERSONA))
            }
            OverlayProps={popoverOverlayProps}
          >
            {CLAIM_PERSONAS.map((value) => (
              <Option key={value} value={value}>
                {value}
              </Option>
            ))}
          </Dropdown>
        </FilterField>
      </FilterBar>

      {caveat ? (
        <SectionCard title="How to read these" banded>
          <Prose>
            <Text color="secondary">{caveat}</Text>
          </Prose>
        </SectionCard>
      ) : null}

      {uncited.length > 0 ? (
        <ErrorPanel
          title="Some claims arrived without evidence"
          error={
            new Error(
              `${uncited.length} claim(s) carry no citations. The service does not serve uncited claims, so this is a defect rather than a state — they are listed below without being presented as evidence.`,
            )
          }
        />
      ) : null}

      {active.isPending ? <LoadingPanel label="Reading claims" /> : null}
      {active.error ? <ErrorPanel error={active.error} title="Could not read claims" /> : null}

      {active.data ? (
        <DataTable
          caption="Claims"
          hideCaption
          zebra
          columns={[
            {
              key: 'subject_entity_id',
              header: 'Subject',
              // First column, because a predicate and a value do not say what they
              // are about. A list spanning entities without this is unreadable.
              render: (row) => <Text>{row.subject_entity_id}</Text>,
            },
            { key: 'predicate', header: 'Predicate', render: (row) => <Tag>{row.predicate}</Tag> },
            { key: 'value', header: 'Value', render: (row) => <Text>{String(row.value)}</Text> },
            {
              key: 'claim_category',
              header: 'Category',
              render: (row) => <Text color="secondary">{row.claim_category}</Text>,
            },
            {
              key: 'confidence',
              header: 'Confidence',
              render: (row) => <ConfidenceCell claim={row} />,
            },
            {
              key: 'authority',
              header: 'Authority',
              render: (row) => <Text color="secondary">{row.authority}</Text>,
            },
            {
              key: 'human_confirmed',
              header: 'Owner Confirmed',
              // The ground-truth signal, and distinct from the model's own
              // confidence: a confirmed low-confidence claim outranks an
              // unconfirmed high-confidence one.
              render: (row) =>
                row.human_confirmed ? <Tag>confirmed</Tag> : <Text color="secondary">—</Text>,
            },
            { key: 'valid_from', header: 'Valid', render: (row) => <ValidityCell claim={row} /> },
            { key: 'citations', header: 'Evidence', render: (row) => <Citations claim={row} /> },
          ]}
          rows={claims}
          getRowId={(row) => row.claim_id}
          emptyTitle={searching ? 'No Claims Match That Search' : 'No Claims at This Threshold'}
          emptyDescription={
            searching
              ? 'The memory holds nothing matching those words for this tenant. A claim can exist and be invisible here if its entity belongs to another tenant.'
              : 'Nothing meets the confidence floor you set. Lower it to see weaker claims, which are excluded rather than absent.'
          }
        />
      ) : null}
    </StackLayout>
  );
}
