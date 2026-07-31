import type { Persona } from './personaRoster';

export type { Persona } from './personaRoster';

/**
 * Whether the persona switcher is available at all.
 *
 * The roster carries development client secrets, so it must not reach a
 * production bundle. Gating a dynamic import — rather than an `if` around an
 * inlined array — is what lets the bundler drop the module entirely.
 */
export function personaSwitcherEnabled(): boolean {
  return (
    import.meta.env.DEV === true || import.meta.env.VITE_PERSONA_SWITCHER === 'on'
  );
}

/**
 * The persona roster, or an empty list when the switcher is disabled.
 *
 * Async because the import is dynamic; that is the point. Callers treat an empty
 * result as "no switcher", which is the correct production behaviour rather than
 * an error.
 */
export async function loadPersonas(): Promise<readonly Persona[]> {
  if (!personaSwitcherEnabled()) return [];
  const mod = await import('./personaRoster');
  return mod.PERSONA_ROSTER;
}

export async function findPersona(key: string): Promise<Persona | undefined> {
  return (await loadPersonas()).find((p) => p.key === key);
}
