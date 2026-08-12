import { renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatTile } from '../StatTile';

describe('StatTile', () => {
  it('leads with a visual anchor and keeps the metric as the dominant reading', () => {
    renderWithProviders(
      <StatTile label="Calls" value="4,120" hint="69 failed · Worst Daily p95 412 ms" />,
    );

    const heading = screen.getByRole('heading', { level: 2, name: 'Calls' });
    const card = heading.closest('.saltCard');
    const visual = card?.querySelector('.saltAvatar');
    const value = screen.getByText('4,120');
    const hint = screen.getByText('69 failed · Worst Daily p95 412 ms');

    expect(card).not.toBeNull();
    expect(visual).not.toBeNull();
    expect(visual?.compareDocumentPosition(heading) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(value.className).toContain('saltText-h2');
    expect(hint.className).toContain('saltText-notation');
    expect(card?.querySelectorAll('.saltCard')).toHaveLength(0);
  });
});
