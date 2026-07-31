/**
 * Build-time flags, typed here rather than borrowed from the bundler's globals.
 *
 * This package is consumed as TypeScript source by three Vite apps, so
 * `import.meta.env` is populated at build time — but typechecking the package on
 * its own should not require Vite's ambient declarations to be in scope. Reading
 * the values through a locally-typed accessor keeps the package compilable
 * standalone, and keeps the flag names in one place.
 *
 * The access has to stay a direct `import.meta.env.X` expression for the
 * bundler to fold it to a constant, which is what makes the guarded dynamic
 * import in `personas.ts` actually elide the roster from a production build.
 */
interface BuildEnv {
  DEV?: boolean;
  VITE_PERSONA_SWITCHER?: string;
  VITE_API_BASE_URL?: string;
}

function buildEnv(): BuildEnv {
  // `import.meta` is always defined in an ES module; the cast is only needed
  // because `env` is a bundler extension rather than part of the language.
  return ((import.meta as unknown as { env?: BuildEnv }).env ?? {}) as BuildEnv;
}

export function isDevBuild(): boolean {
  return buildEnv().DEV === true;
}

export function personaSwitcherFlag(): string | undefined {
  return buildEnv().VITE_PERSONA_SWITCHER;
}

export function apiBaseUrl(): string {
  // Empty string means same origin, which is the normal case behind the dev
  // proxy — the API publishes no CORS headers, so a cross-origin absolute URL
  // would fail before the app saw a response.
  return buildEnv().VITE_API_BASE_URL ?? '';
}
