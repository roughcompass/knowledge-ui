import { Banner, BannerContent, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * The one place an API failure becomes something a reader can act on.
 *
 * The error is duck-typed rather than imported. This package deliberately has no
 * dependency on the API client — it is bundled into every remote, and a shared
 * package that pulls the client in would drag the whole request layer with it.
 * Checking for the fields we need costs a few lines and keeps ui-kit standalone.
 */

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  retryAfterSeconds?: unknown;
  items?: unknown;
}

interface Normalised {
  status: number | undefined;
  code: string | undefined;
  message: string;
  retryAfterSeconds: number | undefined;
}

function normalise(error: unknown): Normalised {
  if (typeof error === 'object' && error !== null) {
    const e = error as ErrorLike;
    const hasEnvelope = Array.isArray(e.items) || typeof e.code === 'string';
    if (hasEnvelope) {
      return {
        status: typeof e.status === 'number' ? e.status : undefined,
        code: typeof e.code === 'string' ? e.code : undefined,
        message: typeof e.message === 'string' ? e.message : 'the request failed',
        retryAfterSeconds:
          typeof e.retryAfterSeconds === 'number' ? e.retryAfterSeconds : undefined,
      };
    }
  }
  if (error instanceof Error) {
    return {
      status: undefined,
      code: undefined,
      message: error.message,
      retryAfterSeconds: undefined,
    };
  }
  return {
    status: undefined,
    code: undefined,
    message: String(error),
    retryAfterSeconds: undefined,
  };
}

export function ErrorPanel({
  error,
  title,
  action,
}: {
  error: unknown;
  title?: string;
  action?: ReactNode;
}) {
  const { status, code, message, retryAfterSeconds } = normalise(error);

  return (
    <Banner status="error" role="alert">
      <BannerContent>
        <StackLayout gap={1}>
          <Text styleAs="label">{title ?? 'Request failed'}</Text>
          <Text>{message}</Text>
          {code || status !== undefined ? (
            // Surfaced because the code is what makes a support conversation
            // short — it is the same identifier the server logs.
            <Text color="secondary" styleAs="notation">
              {[code, status !== undefined ? `HTTP ${status}` : undefined]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {retryAfterSeconds !== undefined ? (
            <Text color="secondary">Retry in {retryAfterSeconds}s.</Text>
          ) : null}
          {action}
        </StackLayout>
      </BannerContent>
    </Banner>
  );
}
