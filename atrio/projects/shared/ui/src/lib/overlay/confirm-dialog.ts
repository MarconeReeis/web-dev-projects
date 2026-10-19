import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AtrButton } from '../button/button';
import { AtrSurfaceShell } from './surface-shell';

export interface AtrConfirmData {
  readonly heading: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Marca a ação como destrutiva: o botão de confirmar fica vermelho. */
  readonly destructive?: boolean;
  /**
   * Texto centralizado e botões empilhados na largura toda, a ação primeiro.
   *
   * Para o celular: lado a lado, dois botões dividem 340px e o rótulo quebra;
   * empilhados, cada um vira um alvo grande para o polegar. O painel do
   * tablet continua com a moldura de cabeçalho e botões à direita.
   */
  readonly stacked?: boolean;
}

/**
 * Confirmação de ação.
 *
 * Existe para não usar o `confirm()` do navegador: ele ignora os tokens do
 * Átrio, trava a aba inteira, e no tablet instalado como PWA aparece com o
 * endereço do site no título — o que quebra a ilusão de aplicativo na frente
 * do cliente da barbearia.
 *
 * O botão de confirmar diz o que vai acontecer ("Remover bloqueio"), nunca
 * "OK": quem lê rápido só lê o botão.
 */
@Component({
  selector: 'atr-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton],
  template: `
    @if (data.stacked) {
      <div class="bg-card px-6 pt-7 pb-6 text-center">
        <h2 class="text-xl font-extrabold tracking-tight text-balance">{{ data.heading }}</h2>
        <p class="mt-2 text-sm text-balance text-muted-foreground">{{ data.message }}</p>

        <div class="mt-6 flex flex-col gap-2">
          <button
            type="button"
            size="lg"
            class="w-full"
            [atrButton]="data.destructive ? 'destructive' : 'default'"
            (click)="confirm()"
          >
            {{ data.confirmLabel ?? 'Confirmar' }}
          </button>
          <button type="button" atrButton="outline" size="lg" class="w-full" (click)="cancel()">
            {{ data.cancelLabel ?? 'Cancelar' }}
          </button>
        </div>
      </div>
    } @else {
      <atr-surface-shell [heading]="data.heading" (closed)="cancel()">
        <p class="text-sm text-muted-foreground">{{ data.message }}</p>

        <div shell-footer class="flex w-full justify-end gap-2">
          <button type="button" atrButton="ghost" (click)="cancel()">
            {{ data.cancelLabel ?? 'Cancelar' }}
          </button>
          <button
            type="button"
            [atrButton]="data.destructive ? 'destructive' : 'default'"
            (click)="confirm()"
          >
            {{ data.confirmLabel ?? 'Confirmar' }}
          </button>
        </div>
      </atr-surface-shell>
    }
  `,
})
export class AtrConfirmDialog {
  private readonly ref = inject<DialogRef<boolean, AtrConfirmDialog>>(DialogRef);
  protected readonly data = inject<AtrConfirmData>(DIALOG_DATA);

  protected cancel(): void {
    this.ref.close(false);
  }

  protected confirm(): void {
    this.ref.close(true);
  }
}
