/// <reference types="vite/client" />

/**
 * Pulls in the types for `import.meta.env`.
 *
 * The persona roster is gated on build-time flags rather than a runtime check,
 * because the gate has to be something the bundler can fold to a constant — see
 * the comment on `loadPersonas`. Without this reference `import.meta.env` is not
 * a typed property and the gate does not compile.
 */
