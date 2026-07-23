/**
 * Status de unidade (change `gestao-de-unidades`, design.md D5) — espelha o
 * espírito de `PersonStatus`. Desativar é reversível e não-destrutivo,
 * guardado pela precondição "unidade vazia" (D2); não cascateia para as
 * pessoas.
 */
export const UnitStatus = {
  ACTIVE: 'active',
  DISABLED: 'desativado',
} as const;

export type UnitStatus = (typeof UnitStatus)[keyof typeof UnitStatus];

export interface UnitResponse {
  id: string;
  name: string;
  status: UnitStatus;
  createdAt: string;
}

export interface CreateUnitRequest {
  name: string;
}

export interface UpdateUnitRequest {
  name?: string;
  status?: UnitStatus;
}
