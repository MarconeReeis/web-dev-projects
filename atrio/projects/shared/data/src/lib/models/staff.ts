import { Id } from './common';

export type StaffRole = 'dono' | 'atendente';

export const STAFF_ROLE_LABEL: Readonly<Record<StaffRole, string>> = {
  dono: 'Dono',
  atendente: 'Atendente',
};

/**
 * Quem está usando o painel, e de qual barbearia.
 *
 * A barbearia vem do vínculo da conta (tenant_members no banco), nunca da
 * URL nem de escolha na tela: trocar um parâmetro no endereço não pode dar
 * acesso à agenda de outra loja.
 */
export interface StaffSession {
  readonly userId: Id;
  readonly email: string;
  readonly name: string;
  readonly tenantId: Id;
  readonly role: StaffRole;
}

export type StaffAuthErrorCode =
  /** E-mail ou senha errados — sem dizer qual. */
  | 'credenciais'
  /** A conta existe, mas não pertence a nenhuma barbearia (um cliente, por exemplo). */
  | 'sem-acesso'
  /** O link de nova senha venceu ou já foi usado. */
  | 'link-invalido'
  | 'indisponivel';

export class StaffAuthError extends Error {
  constructor(
    readonly code: StaffAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StaffAuthError';
  }
}
