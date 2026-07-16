import { config } from '../config.js';
import { GcsStoragePort } from '../adapters/gcs-storage-port.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { SecretManagerSecretsPort } from '../adapters/secret-manager-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import type { StoragePort } from './storage-port.js';
import type { DatabasePort } from './database-port.js';
import type { SecretsPort } from './secrets-port.js';
import type { AuthPort } from './auth-port.js';

export interface Ports {
  storage: StoragePort;
  database: DatabasePort;
  secrets: SecretsPort;
  auth: AuthPort;
}

/**
 * Único ponto do código de negócio que sabe qual implementação de cada
 * seam está ativa. O resto da aplicação depende apenas das interfaces em
 * `ports/*`.
 */
export function createPorts(): Ports {
  const secrets = config.secretsDriver === 'secret-manager' ? new SecretManagerSecretsPort() : new EnvSecretsPort();
  return {
    storage: new GcsStoragePort(),
    database: new PgDatabasePort(),
    secrets,
    auth: new Argon2AuthPort(secrets),
  };
}
