import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import type { SecretsPort } from '../ports/secrets-port.js';
import { config } from '../config.js';

/** Prod: segredos vêm do Google Secret Manager, injetados via IAM do Cloud Run. */
export class SecretManagerSecretsPort implements SecretsPort {
  private readonly client = new SecretManagerServiceClient();

  async getSecret(name: string): Promise<string> {
    const [version] = await this.client.accessSecretVersion({
      name: `projects/${config.gcpProjectId}/secrets/${name}/versions/latest`,
    });
    const payload = version.payload?.data?.toString();
    if (!payload) {
      throw new Error(`Secret not found in Secret Manager: ${name}`);
    }
    return payload;
  }
}
