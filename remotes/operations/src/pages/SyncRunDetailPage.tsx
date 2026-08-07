import { StackLayout, Tag, Text } from '@salt-ds/core';
import { useSyncRun, type RegistryClient } from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  DescriptionList,
  ErrorPanel,
  KLink,
  LoadingPanel,
  PageHeader,
  SectionCard,
  displayText,
  instantText,
  termText,
} from '@knowledge-ui/ui-kit';
import { useParams } from 'react-router-dom';

/**
 * One sync run.
 *
 * The runs table listed failures and could not open one: a failed run was a row with
 * a status and a message, and the endpoint carrying the detail had no client. An
 * operator's next question after "which run failed" is "what did it say", and the
 * answer was to read the server logs.
 *
 * This is also the operations remote's first detail route of any kind. Until now
 * every page there was a list that terminated in itself.
 */
export function SyncRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const query = useSyncRun(client, scope, runId);

  const header = (
    <PageHeader
      title="Sync run"
      description="What one connector run did, and what it reported."
      actions={<KLink to="../runs">All Runs</KLink>}
    />
  );

  if (query.isPending)
    return (
      <StackLayout gap={3}>
        {header}
        <LoadingPanel label="Reading the run" />
      </StackLayout>
    );

  if (query.error)
    return (
      <StackLayout gap={3}>
        {header}
        <ErrorPanel title="Run not available" error={query.error} />
      </StackLayout>
    );

  const run = (query.data ?? {});
  const failure = typeof run.error_message === 'string' ? run.error_message : undefined;

  return (
    <StackLayout gap={3}>
      {header}

      <SectionCard title="Outcome" description="What the run reported when it finished." banded>
        <DescriptionList
          caption="Outcome"
          hideCaption
          items={['status', 'started_at', 'finished_at', 'source_id']
            .filter((key) => key in run)
            .map((key) => ({
              term: termText(key),
              detail:
                key === 'status' ? (
                  <Tag>{displayText(run[key])}</Tag>
                ) : key.endsWith('_at') ? (
                  <Text>{instantText(run[key])}</Text>
                ) : (
                  <Text>{displayText(run[key])}</Text>
                ),
            }))}
        />
      </SectionCard>

      {failure ? (
        <SectionCard
          title="Failure"
          description="What the connector reported, verbatim. Not summarised — a paraphrased error is one an operator cannot search for."
          banded
        >
          <Text styleAs="code">{failure}</Text>
        </SectionCard>
      ) : null}
    </StackLayout>
  );
}
