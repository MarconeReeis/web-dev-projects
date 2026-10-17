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
