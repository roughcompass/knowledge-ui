/**
 * Build-time flags, typed here rather than borrowed from the bundler's globals.
 *
 * This package is consumed as TypeScript source by three Vite apps, so
 * `import.meta.env` is populated at build time — but typechecking the package on
 * its own should not require Vite's ambient declarations to be in scope. Reading
 * the values through locally-typed accessors keeps the package compilable
 * standalone and keeps the flag names in one place.
 *
 * WHY EACH ACCESSOR REPEATS THE CAST INLINE instead of sharing one helper that
 * returns the env object: the bundler substitutes the whole member expression
 * `import.meta.env.DEV`, so that exact shape has to survive TypeScript's erasure
 * of the cast. A helper returning `import.meta.env` moves the `.DEV` to the call
 * site, where it becomes an ordinary property read on an object — still correct
 * at runtime, but no longer a constant.
 *
 * That distinction is load-bearing rather than stylistic. `loadPersonas()` guards
 * a dynamic import on these flags so the roster — which names development client
 * credentials — is dropped from a production build. Dropping it requires the
 * guard to fold to `false` at build time; with a runtime read the branch stays
 * live and the chunk is emitted anyway. It was, and the only thing that catches
 * that is the CI job which greps the built bundle.
 *
 * Deliberately no example of the credential string in this comment: a sourcemap
 * embeds every module's original text, so prose here reaches `dist/**.map` and
 * would trip that same grep from the file explaining it.
 */
interface BuildEnv {
  DEV: boolean;
  VITE_PERSONA_SWITCHER: string | undefined;
  VITE_API_BASE_URL: string | undefined;
}

/** Needed only because `env` is a bundler extension rather than part of the language. */
type MetaWithEnv = { env: BuildEnv };

export function isDevBuild(): boolean {
  return (import.meta as unknown as MetaWithEnv).env.DEV === true;
}

export function personaSwitcherFlag(): string | undefined {
  return (import.meta as unknown as MetaWithEnv).env.VITE_PERSONA_SWITCHER;
}

export function apiBaseUrl(): string {
  // Empty string means same origin, which is the normal case behind the dev
  // proxy — the API publishes no CORS headers, so a cross-origin absolute URL
  // would fail before the app saw a response.
  return (import.meta as unknown as MetaWithEnv).env.VITE_API_BASE_URL ?? '';
}
