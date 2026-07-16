/**
 * SecretsPort — Secret Manager em produção, variáveis de ambiente em dev.
 * O código de negócio nunca acessa `process.env` diretamente para segredos.
 */
export interface SecretsPort {
  getSecret(name: string): Promise<string>;
}
