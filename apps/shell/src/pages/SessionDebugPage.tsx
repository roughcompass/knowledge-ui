import { StackLayout, Text } from '@salt-ds/core';
import { apiBaseUrl, type Session } from '@knowledge-ui/auth';
import { CopyButton, DataTable, PageHeader, SectionCard } from '@knowledge-ui/ui-kit';

/**
 * What the app currently believes about identity and configuration.
 *
 * Exists because the two questions that come up when something is refused are
 * "who does the server think I am" and "which server am I talking to", and both
 * are otherwise invisible. The resolved API origin is on here specifically: an
 * empty base URL means same-origin through the dev proxy, and confusion about
 * that accounts for a good share of "it works in curl" reports.
 *
 * Uses `DataTable` rather than hand-rolling Salt's table primitives. The hand-rolled
 * version predated the wrapper and had drifted: no zebra, Salt's heavier row rules,
 * and a caption that was visible where every other table in the app hides it under
 * the section heading.
 */
export function SessionDebugPage({ session }: { session: Session }) {
  const rows: Array<{ field: string; value: string }> = [
    { field: 'Actor', value: session.actorId },
    { field: 'Display name', value: session.actorDisplayName ?? '\u2014' },
    { field: 'Email', value: session.actorEmail ?? '\u2014' },
    { field: 'Tenant', value: `${session.tenantDisplayName} (${session.tenantSlug})` },
    { field: 'Tenant id', value: session.tenantId },
    { field: 'Role', value: session.role },
    { field: 'Persona', value: session.personaKey ?? '\u2014' },
    {
      field: 'API origin',
      value: apiBaseUrl() === '' ? 'same origin (proxied)' : apiBaseUrl(),
    },
  ];

  return (
    <StackLayout gap={3}>
      <PageHeader title="Session" description="Resolved from the registry, not from local state." />

      <SectionCard title="Current session" banded flush>
        <DataTable
          caption="Current session"
          hideCaption
          columns={[
            {
              key: 'field',
              header: 'Field',
              render: (row) => <Text styleAs="label">{row.field}</Text>,
            },
            { key: 'value', header: 'Value', render: (row) => <Text>{row.value}</Text> },
            {
              key: 'copy',
              header: 'Copy',
              align: 'right',
              render: (row) => (
                <CopyButton value={row.value} label="Copy" aria-label={`Copy ${row.field}`} />
              ),
            },
          ]}
          rows={rows}
          getRowId={(row) => row.field}
          emptyHeadingLevel="h3"
        />
      </SectionCard>
    </StackLayout>
  );
}
