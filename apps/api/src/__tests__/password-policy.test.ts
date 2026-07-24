import { describe, it, expect } from 'vitest';
import { PASSWORD_MIN_LENGTH } from '@gdoc/shared';
import { isPasswordValid, generatePassword } from '../lib/password-policy.js';

describe('password-policy', () => {
  it('recusa senha mais curta que o mínimo', () => {
    expect(isPasswordValid('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
  });

  it('aceita senha com o mínimo de caracteres', () => {
    expect(isPasswordValid('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
  });

  it('senha gerada satisfaz a política e não contém caracteres ambíguos', () => {
    const password = generatePassword();
    expect(isPasswordValid(password)).toBe(true);
    expect(password).not.toMatch(/[0O1lI]/);
  });

  it('gerações sucessivas diferem', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(passwords.size).toBeGreaterThan(1);
  });
});
