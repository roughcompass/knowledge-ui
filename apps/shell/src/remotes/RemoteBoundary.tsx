import { Banner, BannerContent, Button, StackLayout, Text } from '@salt-ds/core';
import { LoadingPanel } from '@knowledge-ui/ui-kit';
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches a remote that fails to load, and says which one.
 *
 * A federated import fails for reasons the host cannot see: the remote's server
 * is down, its entry moved, a share was rejected. The default failure is a blank
 * screen and a console message, so naming the remote and its entry URL is most of
 * the diagnosis.
 *
 * The retry reloads the page rather than re-rendering. That is deliberate and
 * worth stating: a rejected dynamic import stays rejected in the module
 * registry, so re-mounting the same lazy component returns the same rejection.
 * Offering an in-place retry that cannot work would be worse than offering none.
 */
interface Props {
  name: string;
  entryUrl?: string | undefined;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class RemoteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logged rather than swallowed: the component stack is what tells you
    // whether the failure was the import or something the remote rendered.
    console.error(`[shell] remote "${this.props.name}" failed`, error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Banner status="error" role="alert">
        <BannerContent>
          <StackLayout gap={1}>
            <Text styleAs="label">The {this.props.name} section could not load</Text>
            <Text>{error.message}</Text>
            {this.props.entryUrl ? (
              <Text styleAs="notation" color="secondary">
                Entry: {this.props.entryUrl}
              </Text>
            ) : null}
            <Text color="secondary">
              Its dev server may not be running. A reload is needed — a failed module import stays
              failed for the lifetime of the page.
            </Text>
            <Button sentiment="accented" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </StackLayout>
        </BannerContent>
      </Banner>
    );
  }
}

export function RemoteBoundary({ name, entryUrl, children }: Props) {
  return (
    <RemoteErrorBoundary name={name} entryUrl={entryUrl}>
      <Suspense fallback={<LoadingPanel label={`Loading ${name}`} />}>{children}</Suspense>
    </RemoteErrorBoundary>
  );
}
