import { ComponentType } from '@angular/cdk/portal';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AtrConfirmData, AtrConfirmDialog } from './confirm-dialog';

/**
 * Abre diálogos e painéis laterais com configuração consistente.
 *
 * Fina camada sobre o CDK Dialog, que é headless: ele cuida de foco preso,
 * Escape, `aria-modal` e devolver o foco ao elemento de origem — tudo que um
 * overlay feito à mão costuma errar. O visual continua nosso.
 *
 * Duas formas, conforme o DESIGN.md:
 *
 *   openDialog  centralizado, para formulários curtos e confirmações;
 *   openSheet   painel colado à direita, para detalhes sem perder o contexto
 *               da tela de trás — é como a Agenda mostra um atendimento.
 *
 * No celular o painel lateral vira tela cheia: 420px numa tela de 375px
 * seria uma gaveta maior que a janela.
 */
@Injectable({ providedIn: 'root' })
export class AtrOverlay {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);

  openDialog<T, D = unknown, R = unknown>(
    component: ComponentType<T>,
    data?: D,
  ): DialogRef<R, T> {
    return this.dialog.open<R, D, T>(component, {
      data,
      width: '560px',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: 'calc(100dvh - 2rem)',
      panelClass: 'atr-overlay-panel',
      backdropClass: 'atr-overlay-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  openSheet<T, D = unknown, R = unknown>(
    component: ComponentType<T>,
    data?: D,
  ): DialogRef<R, T> {
    const narrow = window.matchMedia('(max-width: 640px)').matches;

    // O DialogConfig do CDK headless não tem `position` (isso é do Material):
    // a colagem à direita vem de uma estratégia de posicionamento global.
    const positionStrategy = narrow
      ? this.overlay.position().global().centerHorizontally().top('0')
      : this.overlay.position().global().right('0').top('0');

    return this.dialog.open<R, D, T>(component, {
      data,
      positionStrategy,
      width: narrow ? '100vw' : '440px',
      maxWidth: '100vw',
      height: '100dvh',
      panelClass: 'atr-overlay-sheet',
      backdropClass: 'atr-overlay-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  /**
   * Pergunta e espera. Resolve `true` só quando o usuário confirma —
   * fechar pelo X, pelo Escape ou clicando fora conta como desistir.
   */
  async confirm(data: AtrConfirmData): Promise<boolean> {
    const ref = this.openDialog<AtrConfirmDialog, AtrConfirmData, boolean>(
      AtrConfirmDialog,
      data,
    );
    return (await firstValueFrom(ref.closed)) === true;
  }
}
