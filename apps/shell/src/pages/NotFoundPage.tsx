import { Button, StackLayout } from '@salt-ds/core';
import { EmptyState, PageHeader } from '@knowledge-ui/ui-kit';
import { useNavigate } from 'react-router-dom';

/**
 * The 404.
 *
 * Carries a `PageHeader` like every other route, and for a reason beyond
 * consistency: this was the one page in the app with no `h1` at all, so a screen
 * reader landing on a mistyped URL was given a document with no title. The
 * `EmptyState` heading below it explains; the page heading says where you are.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <StackLayout gap={3}>
      <PageHeader eyebrow="Knowledge platform" title="Page not found" />
      <EmptyState
        title="No such page"
        description="The address does not match any section of this application."
        action={
          // Salt's Button renders a button element, not an anchor, so this
          // navigates programmatically rather than pretending to be a link.
          <Button appearance="bordered" sentiment="neutral" onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
        }
      />
    </StackLayout>
  );
}
