import type { ApiKey, ApiKeyId } from '../auth/api-key.js';

/** Stored API keys. The server only finds them; the keys command creates and revokes them. */
export interface ApiKeyStore {
  /** Returns the key, revoked or not, or undefined when unknown. */
  find(id: ApiKeyId, signal: AbortSignal): Promise<ApiKey | undefined>;
  /** Stores a new key; an existing id is an error, never overwritten. */
  create(key: ApiKey, signal: AbortSignal): Promise<void>;
  /** Marks a key revoked; returns false when it is unknown or already revoked. */
  revoke(id: ApiKeyId, at: Date, signal: AbortSignal): Promise<boolean>;
  /** Every key, oldest first. */
  list(signal: AbortSignal): Promise<ApiKey[]>;
}
