import type { SecretsPort } from '../ports/secrets-port.js';

/** Dev: segredos vêm das variáveis de ambiente locais (.env). */
export class EnvSecretsPort implements SecretsPort {
  async getSecret(name: string): Promise<string> {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Secret not found in environment: ${name}`);
    }
    return value;
  }
}
