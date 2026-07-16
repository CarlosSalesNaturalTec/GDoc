#!/usr/bin/env node
// Gera um par de chaves RSA local para assinar URLs v4 do StoragePort contra
// o fake-gcs-server. A assinatura v4 é matemática local (RS256) — o
// fake-gcs-server nunca valida contra a Google, então uma chave dummy
// gerada aqui é suficiente. NUNCA usar este arquivo em produção (lá, as
// credenciais reais vêm do Secret Manager / Workload Identity).
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outPath = fileURLToPath(new URL('../.dev/fake-gcs-signer-key.json', import.meta.url));

if (existsSync(outPath)) {
  console.log(`Signer key já existe em ${outPath} — nada a fazer.`);
  process.exit(0);
}

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const key = {
  type: 'service_account',
  client_email: 'dev-signer@gdoc-dev.iam.gserviceaccount.com',
  private_key: privateKey,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(key, null, 2));
console.log(`Signer key dev gerada em ${outPath}`);
