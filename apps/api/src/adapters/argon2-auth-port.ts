import * as argon2 from 'argon2';
import type { AuthPort } from '../ports/auth-port.js';
import { config } from '../config.js';

export class Argon2AuthPort implements AuthPort {
  async hashPassword(plainTextPassword: string): Promise<string> {
    return argon2.hash(plainTextPassword, {
      type: argon2.argon2id,
      memoryCost: config.authArgon2.memoryCost,
      timeCost: config.authArgon2.timeCost,
      parallelism: config.authArgon2.parallelism,
    });
  }

  async verifyPassword(hash: string, plainTextPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainTextPassword);
  }
}
