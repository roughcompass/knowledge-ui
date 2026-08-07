/**
 * Both weights say the same thing; only one of them interrupts.
 *
 * The tests below check the distinction the `tone` prop exists to make, not its
 * styling. A quiet absence and a notice absence must carry identical words —
 * what varies is whether the words arrive inside a banner. Asserting on the text
 * in both cases is the point: if a future change starts abbreviating the quiet
 * variant to save space, these fail, which is the outcome we want. An absence
 * that has been shortened into "Unavailable" has stopped being a named absence.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UnavailableNotice } from '../UnavailableNotice';

describe('UnavailableNotice', () => {
  it('names both the thing and the reason at notice weight', () => {
    render(<UnavailableNotice title="Impact traversal" reason="Your role cannot read edges." />);

    expect(screen.getByText('Impact traversal')).toBeInTheDocument();
    expect(screen.getByText('Your role cannot read edges.')).toBeInTheDocument();
  });

  it('says exactly the same words at quiet weight', () => {
    render(
      <UnavailableNotice
        tone="quiet"
        title="Impact traversal"
        reason="Your role cannot read edges."
      />,
    );

    expect(screen.getByText('Impact traversal')).toBeInTheDocument();
    expect(screen.getByText('Your role cannot read edges.')).toBeInTheDocument();
  });

  it('drops the banner at quiet weight so a permanent limit does not read as news', () => {
    const notice = render(<UnavailableNotice title="Graph totals" reason="Not served." />);
    expect(notice.container.querySelector('.saltBanner')).not.toBeNull();
    notice.unmount();

    const quiet = render(
      <UnavailableNotice tone="quiet" title="Graph totals" reason="Not served." />,
    );
    expect(quiet.container.querySelector('.saltBanner')).toBeNull();
  });

  it('is a notice unless told otherwise, so a new call site errs on the loud side', () => {
    const { container } = render(<UnavailableNotice title="Something" reason="Because." />);
    expect(container.querySelector('.saltBanner')).not.toBeNull();
  });

  it('keeps a hidden title in the accessibility tree, and always renders the reason', () => {
    // For a notice directly under a card heading saying the same words: the
    // visual duplicate goes, the announced subject does not.
    render(<UnavailableNotice hideTitle title="Ontology" reason="Not readable by this role." />);

    const title = screen.getByText('Ontology');
    expect(title).toBeInTheDocument();
    expect(title.className).toContain('salt-visuallyHidden');
    expect(screen.getByText('Not readable by this role.')).toBeVisible();
  });

  it('shows the title by default', () => {
    render(<UnavailableNotice title="Ontology" reason="Not readable by this role." />);
    expect(screen.getByText('Ontology').className).not.toContain('salt-visuallyHidden');
  });

  it('renders the action control when the refusal has a next step', () => {
    render(
      <UnavailableNotice
        title="Usage across the deployment"
        reason="Only an administrator can read deployment-wide usage."
        action={<button type="button">Switch To Platform Admin</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Switch To Platform Admin' })).toBeInTheDocument();
  });
});
