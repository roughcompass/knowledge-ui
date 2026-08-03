export {
  ROLES,
  isRole,
  toSession,
  type Role,
  type Session,
  type WhoamiLinks,
  type WhoamiResponse,
} from './types';

export {
  ALL_CAPABILITIES,
  CAPABILITIES,
  can,
  capabilitiesFor,
  rolesGranting,
  type Capability,
} from './capabilities';

export { findPersona, loadPersonas, personaSwitcherEnabled, type Persona } from './personas';

export {
  EXPIRY_MARGIN_SECONDS,
  clearToken,
  isUsable,
  readToken,
  tokenStorageKey,
  writeToken,
  type CachedToken,
} from './storage';

export {
  DevPersonaAuthProvider,
  decodeJwtPayload,
  type AuthProvider,
  type DevPersonaAuthProviderOptions,
} from './AuthProvider';

export { SessionProvider, useSession, type SessionContextValue } from './SessionContext';

export { RequireCapability } from './RequireCapability';

export { readSelectedPersona, writeSelectedPersona } from './storage';

export { apiBaseUrl, isDevBuild, personaSwitcherFlag } from './env';
