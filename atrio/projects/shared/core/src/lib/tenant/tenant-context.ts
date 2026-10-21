import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Tenant, TenantRepository } from '@atrio/data';

/**
 * A barbearia da sessão atual.
 *
 * Ponto único de leitura do tenant: o cabeçalho, o menu lateral e qualquer
 * consulta por `tenantId` passam por aqui, em vez de cada tela buscar por
 * conta própria.
 *
 * Quando a autenticação entrar, o tenant virá da custom claim do usuário —
 * nunca de parâmetro de rota no admin, que seria trocável pela URL.
 */
@Injectable({ providedIn: 'root' })
export class TenantContext {
  private readonly repository = inject(TenantRepository);

  readonly tenant = toSignal<Tenant | null, null>(this.repository.watchCurrent(), {
    initialValue: null,
  });

  readonly name = computed(() => this.tenant()?.name ?? '');
  readonly id = computed(() => this.tenant()?.id ?? null);
  readonly branding = computed(() => this.tenant()?.branding ?? null);

  /**
   * Plano Solo: 1 profissional ativo, sem atendentes, caixa sem despesas.
   * Antes de a barbearia carregar, falso — nada some da tela por engano.
   */
  readonly isSolo = computed(() => this.tenant()?.plan === 'solo');

  /**
   * Assinatura em dia. Quando falso, o app deve degradar para somente
   * leitura — a trava de verdade fica nas regras de segurança do backend,
   * esta é só a camada de interface.
   */
  readonly isActive = computed(() => {
    const status = this.tenant()?.subscription;
    return status === 'ativa' || status === 'trial';
  });
}
