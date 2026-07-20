import { z } from 'zod';
import type { AuthenticatedIdentity } from '@gdoc/shared';
import { UserRole } from '@gdoc/shared';

/**
 * Valida a fronteira com a API, espelhando `@gdoc/shared` (fonte única de
 * DTOs — design.md D5). `z.ZodType<T>` amarra o schema ao tipo compartilhado:
 * se o DTO mudar sem o schema acompanhar, o `tsc` acusa a divergência.
 */
export const authenticatedIdentitySchema: z.ZodType<AuthenticatedIdentity> = z.object({
  id: z.string(),
  unitId: z.string(),
  role: z.enum([UserRole.COLLABORATOR, UserRole.UNIT_ADMIN, UserRole.GLOBAL_ADMIN]),
});
