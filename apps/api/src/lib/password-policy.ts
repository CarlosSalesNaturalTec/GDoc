import { randomInt } from 'node:crypto';
import { PASSWORD_MIN_LENGTH } from '@gdoc/shared';

/**
 * Política de senha (change `troca-de-senha`, design.md D8): só tamanho
 * mínimo, sem exigência de classes de caracteres. Vale no cadastro, na troca
 * e na geração do reset — a validação de verdade é sempre esta, nunca a
 * conveniência de UX espelhada na SPA.
 */
export function isPasswordValid(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

const GENERATED_PASSWORD_LENGTH = 12;

// Sem `0`/`O`, `1`/`l`/`I` (design.md D7): a senha gerada é transcrita por
// uma pessoa para outra fora do sistema, e ambiguidade nesses caracteres
// vira chamado de suporte.
const GENERATED_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Gera a senha da redefinição administrativa por CSPRNG (`node:crypto`,
 * nunca `Math.random`), sempre satisfazendo `isPasswordValid` — comprimento
 * fixo acima do mínimo da política (design.md D7).
 */
export function generatePassword(): string {
  let password = '';
  for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
    password += GENERATED_PASSWORD_ALPHABET[randomInt(GENERATED_PASSWORD_ALPHABET.length)];
  }
  return password;
}
