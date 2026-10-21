import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  NotificationRepository,
  ShopNotification,
  formatShortDay,
  formatTime,
} from '@atrio/data';
import { AtrIcon, AtrOverlay, AtrioIconName } from '@atrio/ui';
import { AppointmentPanel, AppointmentPanelData } from '../features/agenda/components/appointment-panel';
import { Viewport } from './viewport';

const TITLE: Readonly<Record<ShopNotification['kind'], string>> = {
  novo_horario: 'Novo horário',
  cancelado: 'Cancelou',
  reagendado: 'Remarcou',
  pedido: 'Pedido para confirmar',
  sem_resposta: 'Pedido expirou',
};

const ICON: Readonly<Record<ShopNotification['kind'], AtrioIconName>> = {
  novo_horario: 'calendar-check',
  cancelado: 'calendar-x',
  reagendado: 'calendar-days',
  pedido: 'clock',
  sem_resposta: 'calendar-off',
};

/**
 * O sino do painel: o que o cliente fez pelo app — marcou, cancelou ou
 * remarcou —, em tempo real. Tocar num aviso marca como lido e abre o
 * atendimento na agenda.
 *
 * Da própria ação a barbearia já sabe: o que a equipe faz no balcão não
 * vira aviso (regra do banco, private.notify_shop).
 */
@Component({
  selector: 'adm-notifications-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: {
    class: 'relative block',
    '(document:pointerdown)': 'closeOnOutside($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button
      type="button"
      class="relative inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      [attr.aria-label]="buttonLabel()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <atr-icon name="bell" [size]="20" />
      @if (unread() > 0) {
        <span
          class="tabular absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] font-bold text-destructive-foreground"
          aria-hidden="true"
        >
          {{ unread() > 9 ? '9+' : unread() }}
        </span>
      }
    </button>

    @if (open()) {
      <div
        class="floating absolute top-full right-0 z-30 mt-2 flex max-h-[min(32rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-surface border border-border bg-card"
        role="dialog"
        aria-label="Avisos"
      >
        <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p class="font-bold">Avisos</p>
          @if (unread() > 0) {
            <button
              type="button"
              class="min-h-9 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
              (click)="markAllRead()"
            >
              Marcar todas como lidas
            </button>
          }
        </div>

        @if (items().length === 0) {
          <p class="px-5 py-8 text-center text-sm text-balance text-muted-foreground">
            Nenhum aviso por enquanto. Quando um cliente marcar, cancelar ou remarcar pelo app,
            aparece aqui.
          </p>
        } @else {
          <ul class="min-h-0 flex-1 overflow-y-auto p-2">
            @for (item of items(); track item.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent"
                  [class.bg-primary-soft]="!item.read"
                  (click)="openItem(item)"
                >
                  <span
                    class="flex size-9 shrink-0 items-center justify-center rounded-full"
                    [class]="item.kind === 'cancelado' ? 'bg-destructive-soft text-destructive-soft-foreground' : 'bg-secondary text-foreground'"
                  >
                    <atr-icon [name]="icon[item.kind]" [size]="18" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-bold">
                      {{ title[item.kind] }} · {{ item.clientName }}
                    </span>
                    <span class="mt-0.5 block text-sm text-muted-foreground">{{ when(item) }}</span>
                    <span class="mt-0.5 block text-xs text-muted-foreground">{{ ago(item.createdAt) }}</span>
                  </span>
                  @if (!item.read) {
                    <span class="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Não lido"></span>
                  }
                </button>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class NotificationsMenu {
  private readonly repository = inject(NotificationRepository);
  private readonly router = inject(Router);
  private readonly overlay = inject(AtrOverlay);
  private readonly viewport = inject(Viewport);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly title = TITLE;
  protected readonly icon = ICON;
  protected readonly open = signal(false);

  protected readonly items = toSignal(this.repository.watchRecent(30), {
    initialValue: [] as readonly ShopNotification[],
  });

  protected readonly unread = computed(() => this.items().filter((item) => !item.read).length);

  protected readonly buttonLabel = computed(() => {
    const count = this.unread();
    return count === 0 ? 'Avisos' : count === 1 ? 'Avisos: 1 não lido' : `Avisos: ${count} não lidos`;
  });

  /**
   * "Qua, 22 de out às 10:00". Na remarcação, "Agora qua, 22 de out às
   * 10:30 · antes 10:00" — o dia de antes só aparece se mudou.
   */
  protected when(item: ShopNotification): string {
    const day = formatShortDay(item.startsAt);
    const at = `${day} às ${formatTime(item.startsAt)}`;
    if (item.kind !== 'reagendado' || !item.previousStartsAt) return at;

    const previousDay = formatShortDay(item.previousStartsAt);
    const before =
      previousDay === day
        ? formatTime(item.previousStartsAt)
        : `${previousDay.toLowerCase()} às ${formatTime(item.previousStartsAt)}`;
    return `Agora ${at.charAt(0).toLowerCase()}${at.slice(1)} · antes ${before}`;
  }

  /** "agora", "há 5 min", "há 2 h", depois a data. */
  protected ago(instant: string): string {
    const minutes = Math.round((Date.now() - new Date(instant).getTime()) / 60_000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    return `${formatShortDay(instant)} às ${formatTime(instant)}`;
  }

  protected async openItem(item: ShopNotification): Promise<void> {
    this.open.set(false);
    if (!item.read) void this.repository.markRead([item.id]);
    // No celular, a grade da agenda não cabe: abre só o atendimento.
    if (this.viewport.isPhone()) {
      this.overlay.openSheet<AppointmentPanel, AppointmentPanelData>(AppointmentPanel, {
        appointmentId: item.appointmentId,
      });
      return;
    }
    await this.router.navigate(['/agenda'], { queryParams: { agendamento: item.appointmentId } });
  }

  protected async markAllRead(): Promise<void> {
    await this.repository.markAllRead();
  }

  protected closeOnOutside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
