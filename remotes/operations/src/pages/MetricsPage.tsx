import {
  Accordion,
  AccordionHeader,
  AccordionPanel,
  Banner,
  BannerContent,
  FlowLayout,
  StackLayout,
  Text,
} from '@salt-ds/core';
import { gaugeValue, histogramQuantile, sumByLabel, useMetrics } from '@knowledge-ui/api-client';
import { apiBaseUrl, useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  Sparkline,
  StatTile,
} from '@knowledge-ui/ui-kit';
import { useEffect, useRef, useState } from 'react';

/**
 * What the registry actually exposes, and nothing more.
 *
 * The endpoint publishes fourteen application metrics and the default Python
 * runtime collectors. It publishes no request rate, no per-route latency and no
 * per-route error rate, because the service instruments tracing but installs no
 * meter provider. Those are the three numbers anyone opening a metrics page
 * expects, so this page names their absence rather than deriving something
 * plausible from what is available — a chart built from the wrong series is
 * worse than no chart, because it will be believed.
 *
 * Counters are cumulative since process start, so a single scrape gives totals
 * rather than rates. The sparkline is built from samples this tab has observed,
 * and is labelled as such.
 */

const SAMPLE_LIMIT = 40;

export function MetricsPage() {
  const { session } = useSession();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const query = useMetrics(scope, apiBaseUrl());

  const [series, setSeries] = useState<Array<number | undefined>>([]);
  const previous = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!query.data) return;
    const total = sumByLabel(query.data, 'registry_entitlement_calls_total', 'status_class').reduce(
      (acc, row) => acc + row.value,
      0,
    );
    setSeries((current) => {
      const last = previous.current;
      previous.current = total;
      // A decrease can only mean the process restarted, so the delta across that
      // boundary is meaningless. An undefined entry breaks the line rather than
      // drawing a plunge that never happened.
      const delta = last === undefined ? undefined : total < last ? undefined : total - last;
      return [...current, delta].slice(-SAMPLE_LIMIT);
    });
  }, [query.data]);

  const snapshot = query.data;

  /*
   * The header renders in every state. Returning `LoadingPanel` in place of the
   * whole page took the title with it, so the page appeared to navigate somewhere
   * blank and then back — and on an error the reader lost every clue about where
   * they were.
   */
  const header = (
    <PageHeader
      title="Metrics"
      description="Scraped every fifteen seconds. Counters are cumulative since the process started."
    />
  );

  if (query.isPending)
    return (
      <StackLayout gap={3}>
        {header}
        <LoadingPanel label="Reading metrics" />
      </StackLayout>
    );

  if (query.error || snapshot === undefined)
    return (
      <StackLayout gap={3}>
        {header}
        <ErrorPanel error={query.error} title="Could not read metrics" />
      </StackLayout>
    );

  return (
    <StackLayout gap={3}>
      {header}

      <Banner status="info">
        <BannerContent>
          <StackLayout gap={1}>
            <Text styleAs="label">Not exposed by this API</Text>
            <Text>
              Request rate, per-route latency and per-route error rate are not published — the
              service instruments tracing but registers no metrics meter, so those series do not
              exist. They are not shown here rather than being approximated from unrelated counters.
            </Text>
            <Text color="secondary">
              For request-level data, use the Prometheus and Grafana instances in the registry
              development stack.
            </Text>
          </StackLayout>
        </BannerContent>
      </Banner>

      <FlowLayout gap={2}>
        <GaugeCard
          label="Embedding outbox backlog"
          value={gaugeValue(snapshot, 'catalog_outbox_pending_size')}
          hint="rows waiting to be embedded"
        />
        <GaugeCard
          label="Audit partitions to archive"
          value={gaugeValue(snapshot, 'catalog_audit_partitions_eligible_for_archival')}
          hint="older than the retention window"
        />
        <GaugeCard
          label="Audit write failures"
          value={gaugeValue(snapshot, 'catalog_audit_write_failures_total')}
          hint="cumulative since start"
        />
        <StatTile
          label="Entitlement calls"
          value={<Sparkline values={series} label="Entitlement calls per scrape" />}
          hint="per-scrape change, since this tab opened"
        />
      </FlowLayout>

      {/*
        One group, not four sections. At the page's own `gap={3}` each accordion sat
        36px from the next, so four collapsed rows read as four unrelated panels
        instead of one expandable list — Salt's accordions are built to stack flush
        and share their rules.
      */}
      <StackLayout gap={0}>
        <Accordion value="entitlement">
          <AccordionHeader>Entitlement resolution</AccordionHeader>
          <AccordionPanel>
            <StackLayout gap={2}>
              <LabelledTable
                caption="Calls by status class"
                rows={sumByLabel(snapshot, 'registry_entitlement_calls_total', 'status_class')}
              />
              <LabelledTable
                caption="Cache outcomes"
                rows={sumByLabel(snapshot, 'registry_entitlement_cache_total', 'result')}
              />
              <Text styleAs="notation" color="secondary">
                p50{' '}
                {formatSeconds(
                  histogramQuantile(snapshot, 'registry_entitlement_call_duration_seconds', 0.5),
                )}{' '}
                · p95{' '}
                {formatSeconds(
                  histogramQuantile(snapshot, 'registry_entitlement_call_duration_seconds', 0.95),
                )}{' '}
                — interpolated from cumulative buckets over the lifetime of the process
              </Text>
            </StackLayout>
          </AccordionPanel>
        </Accordion>

        <Accordion value="quality">
          <AccordionHeader>Identity and entitlement data quality</AccordionHeader>
          <AccordionPanel>
            <StackLayout gap={2}>
              <Text color="secondary">
                Any non-zero row here is actionable: it means entitlement strings arriving in a
                shape the parser rejected.
              </Text>
              <LabelledTable
                caption="Dropped entitlement entries"
                rows={sumByLabel(snapshot, 'registry_entitlement_dropped_entries_total', 'reason')}
              />
              <LabelledTable
                caption="Ignored during parse"
                rows={sumByLabel(snapshot, 'registry_entitlement_parse_ignored_total', 'reason')}
              />
              <LabelledTable
                caption="Authority parse failures"
                rows={sumByLabel(snapshot, 'auth_authority_parse_failed_total', 'shape')}
              />
            </StackLayout>
          </AccordionPanel>
        </Accordion>

        <Accordion value="embedding">
          <AccordionHeader>Embedding provider</AccordionHeader>
          <AccordionPanel>
            <StackLayout gap={2}>
              <LabelledTable
                caption="Embedding calls by status class"
                rows={sumByLabel(snapshot, 'registry_embedding_calls_total', 'status_class')}
              />
              <Text styleAs="notation" color="secondary">
                p95{' '}
                {formatSeconds(
                  histogramQuantile(snapshot, 'registry_embedding_call_duration_seconds', 0.95),
                )}
              </Text>
            </StackLayout>
          </AccordionPanel>
        </Accordion>

        <Accordion value="runtime">
          <AccordionHeader>Runtime internals</AccordionHeader>
          <AccordionPanel>
            <DataTable
              caption="All families reported by the endpoint"
              columns={[
                { key: 'name', header: 'Family' },
                { key: 'type', header: 'Type' },
                { key: 'samples', header: 'Series' },
              ]}
              rows={[...snapshot.values()].map((family) => ({
                name: family.name,
                type: family.type,
                samples: family.samples.length,
              }))}
              getRowId={(row) => row.name}
            />
          </AccordionPanel>
        </Accordion>
      </StackLayout>
    </StackLayout>
  );
}

function GaugeCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | undefined;
  hint: string;
}) {
  return (
    <StatTile
      label={label}
      // Undefined and zero are different facts: one means the metric is not
      // published, the other that it is published and empty.
      value={<Text styleAs="h3">{value === undefined ? 'n/a' : value.toLocaleString()}</Text>}
      hint={value === undefined ? 'not reported by this build' : hint}
    />
  );
}

function LabelledTable({
  caption,
  rows,
}: {
  caption: string;
  rows: Array<{ label: string; value: number }>;
}) {
  return (
    <DataTable
      caption={caption}
      columns={[
        { key: 'label', header: caption },
        {
          key: 'value',
          header: 'Total',
          render: (row) => <Text>{row.value.toLocaleString()}</Text>,
        },
      ]}
      rows={rows}
      getRowId={(row) => row.label}
      emptyTitle="Not reported"
      emptyDescription="This build publishes no series for that family."
    />
  );
}

function formatSeconds(value: number | undefined): string {
  // No data is not the same as zero. A p95 of 0 ms reads as "very fast" when the
  // truth is that nothing has been measured.
  if (value === undefined) return 'no data';
  return value < 1 ? `${(value * 1000).toFixed(1)} ms` : `${value.toFixed(2)} s`;
}
