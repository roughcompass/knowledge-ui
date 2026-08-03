import { Banner, BannerContent, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * A surface that cannot exist yet, saying why.
 *
 * Distinct from `EmptyState`, and the distinction is the whole point. An empty
 * state means *the query ran and found nothing* — it will fill when data
 * arrives. This means *the data does not exist to fetch*: no endpoint publishes
 * it, so no amount of waiting or configuring will populate the panel.
 *
 * Rendering the second as the first is the failure this component prevents. A
 * reader who sees "No delivery attempts" reasonably concludes deliveries are
 * working and none have failed; the truth may be that nothing is measuring them
 * at all. A blank panel implies a series that will fill, and that implication is
 * a lie the panel tells on its own.
 *
 * Generalised out of the metrics page, which made this argument first: it names
 * the absence of request rate, latency and error rate rather than deriving
 * something plausible from unrelated counters, because a chart built from the
 * wrong series is worse than no chart — it will be believed.
 *
 * `reason` is required. A notice that says only "unavailable" moves the question
 * from the screen to a person, which is where it was before the panel existed.
 */
export function UnavailableNotice({
  title,
  reason,
  tracking,
}: {
  /** What is missing, in the reader's terms. Not "no data". */
  title: string;
  /** Why it cannot be shown. Name the gap, not the symptom. */
  reason: ReactNode;
  /** Where the decision to fix it lives, so the reader can follow it. */
  tracking?: ReactNode;
}) {
  return (
    <Banner status="info">
      <BannerContent>
        <StackLayout gap={1}>
          <Text styleAs="label">{title}</Text>
          <Text>{reason}</Text>
          {tracking !== undefined ? <Text color="secondary">{tracking}</Text> : null}
        </StackLayout>
      </BannerContent>
    </Banner>
  );
}
