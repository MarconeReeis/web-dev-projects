import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StaffAuth } from '@atrio/data';
import { AtrOverlay } from '@atrio/ui';
import { firstValueFrom } from 'rxjs';
import { PinDialog, PinDialogData } from './pin-dialog';

/** Por quanto tempo um PIN aceito libera as ações protegidas. */
const UNLOCK_MS = 5 * 60_000;

/**
 * Porta das ações protegidas pelo PIN do balcão.
 *
 *   if (!(await this.pinGate.ensure('remover o bloqueio'))) return;
 *
 * Um PIN aceito libera por 5 minutos, renovados a cada ação protegida: quem
 * está fechando o caixa não digita o PIN a cada despesa. O desbloqueio mora
 * só na memória — recarregar a página, sair da conta ou trocar de conta
 * trava de novo.
 */
@Injectable({ providedIn: 'root' })
export class PinGate {
  private readonly overlay = inject(AtrOverlay);
  private unlockedUntil = 0;

  constructor() {
    // Qualquer mudança de sessão (sair, entrar com outra conta) trava.
    inject(StaffAuth)
      .watchSession()
      .subscribe(() => this.lock());
  }

  /** Libera a ação: na hora, se ainda vale o último PIN; senão, pede o PIN. */
  async ensure(reason: string): Promise<boolean> {
    if (Date.now() < this.unlockedUntil) {
      this.unlockedUntil = Date.now() + UNLOCK_MS;
      return true;
    }

    const ref = this.overlay.openDialog<PinDialog, PinDialogData, boolean>(PinDialog, {
      purpose: 'desbloquear',
      reason,
    });
    const ok = (await firstValueFrom(ref.closed)) === true;
    if (ok) this.unlockedUntil = Date.now() + UNLOCK_MS;
    return ok;
  }

  /** Configurações: criar ou trocar o PIN. */
  async change(): Promise<boolean> {
    const ref = this.overlay.openDialog<PinDialog, PinDialogData, boolean>(PinDialog, {
      purpose: 'trocar',
    });
    return (await firstValueFrom(ref.closed)) === true;
  }

  lock(): void {
    this.unlockedUntil = 0;
  }
}

/**
 * Guarda de rota: a seção só abre com o PIN. Cancelado o PIN, a navegação
 * não acontece — e quem chegou direto pelo endereço (sem tela anterior para
 * ficar) vai para a Dashboard.
 */
export function pinRequired(reason: string): CanActivateFn {
  return async () => {
    const router = inject(Router);
    if (await inject(PinGate).ensure(reason)) return true;
    return router.navigated ? false : router.createUrlTree(['/dashboard']);
  };
}
