import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClientAccount, ClientAuth } from '@atrio/data';

/**
 * Quem está usando o app do cliente.
 *
 * Fachada fina sobre `ClientAuth`, para as telas lerem a conta como signal
 * sem cada uma assinar o Observable por conta própria.
 *
 * Substitui a antiga "identidade lembrada" — nome e telefone guardados no
 * aparelho, sem conta. Ela permitia que qualquer pessoa digitasse o telefone
 * de outra em "Meus horários" e visse, ou cancelasse, os horários dela. Com
 * conta, os horários passam a ser de quem entrou.
 */
@Injectable({ providedIn: 'root' })
export class ClientSession {
  private readonly auth = inject(ClientAuth);

  readonly account = toSignal<ClientAccount | null, null>(this.auth.watchSession(), {
    initialValue: null,
  });

  readonly signedIn = computed(() => this.account() !== null);
  readonly name = computed(() => this.account()?.name ?? '');
  readonly firstName = computed(() => this.name().split(' ')[0] ?? '');
  readonly phone = computed(() => this.account()?.phone ?? '');
  readonly photoUrl = computed(() => this.account()?.photoUrl ?? null);

  signOut(): Promise<void> {
    return this.auth.signOut();
  }

  /** LGPD: conta fora, sessão encerrada. Ver ClientAuth.deleteAccount. */
  deleteAccount(): Promise<void> {
    return this.auth.deleteAccount();
  }
}
