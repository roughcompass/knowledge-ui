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
 *
 * ## Two weights, because not every absence is worth the same attention
 *
 * Naming every absence is right; giving all of them the same bordered banner is
 * not. A page that gates three panels by role and names two permanent gaps in the
 * API renders five identical blue boxes, and five identical boxes read as a
 * broken screen rather than an honest one — the reader stops distinguishing "you
 * cannot see this" from "nobody can" from "this matters to your decision", and
 * eventually stops reading any of them.
 *
 * So `tone` splits them. `notice` is the banner, for an absence the reader might
 * act on: a permission they could request, a feature they might expect to find
 * where they are looking. `quiet` is the same words as text in the panel's own
 * position — for a permanent limit of the API that applies to everyone equally
 * and that no reader can do anything about. Nothing is hidden either way; the
 * title and the reason are rendered in both. Only the volume changes.
 */
export function UnavailableNotice({
  title,
  reason,
  tracking,
  tone = 'notice',
}: {
  /** What is missing, in the reader's terms. Not "no data". */
  title: string;
  /** Why it cannot be shown. Name the gap, not the symptom. */
  reason: ReactNode;
  /** Where the decision to fix it lives, so the reader can follow it. */
  tracking?: ReactNode;
  /**
   * `quiet` for a permanent limit nobody can act on, `notice` for an absence
   * with a next step. Defaults to `notice`: a new absence should have to argue
   * its way down to quiet rather than start there.
   */
  tone?: 'notice' | 'quiet';
}) {
  const body = (
    <StackLayout gap={1}>
      <Text styleAs="label" color={tone === 'quiet' ? 'secondary' : undefined}>
        {title}
      </Text>
      <Text color={tone === 'quiet' ? 'secondary' : undefined}>{reason}</Text>
      {tracking !== undefined ? <Text color="secondary">{tracking}</Text> : null}
    </StackLayout>
  );

  if (tone === 'quiet') return body;

  /*
   * `variant="secondary"`: a refusal is information, not an alarm. The filled
   * primary banner made every gated panel the loudest thing on its page — a
   * reader who cannot act on a notice should not be shouted at by it.
   */
  return (
    <Banner status="info" variant="secondary">
      <BannerContent>{body}</BannerContent>
    </Banner>
  );
}
