import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  RequestAction,
  RequestAnswer,
  RequestResponder,
  formatLongDate,
  formatTime,
  setShopTimeZone,
} from '@atrio/data';
import { AtrButton, AtrIcon } from '@atrio/ui';

type Choice = 'confirmar' | 'recusar';

/**
 * Responder um pedido pelo botão do e-mail — sem login.
 *
 * O barbeiro toca em "Confirmar" ou "Recusar" no e-mail, de qualquer
 * aparelho, e cai aqui. A página mostra o pedido e pede um segundo toque:
 * leitores de e-mail (e antivírus) abrem links sozinhos, e abrir não pode
 * confirmar nada. A prova é o token do pedido, de uso único.
 */
@Component({
  selector: 'adm-respond-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrButton, AtrIcon],
  host: { class: 'flex min-h-dvh items-center justify-center bg-background px-4 py-10' },
  template: `
    <main class="w-full max-w-md">
      <div class="mb-6 flex items-center justify-center gap-2.5">
        <span class="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <atr-icon name="scissors" [size]="20" />
        </span>
        <span class="text-lg font-extrabold tracking-tight">Átrio</span>
      </div>

      <section class="surface p-6 text-center">
        @switch (state()) {
          @case ('carregando') {
            <p class="py-6 text-sm text-muted-foreground">Carregando o pedido…</p>
          }

          @case ('pendente') {
            @if (answer(); as a) {
              <p class="text-sm font-semibold text-muted-foreground">{{ a.tenantName }}</p>
              <h1 class="mt-1 text-xl font-bold">Pedido de {{ a.clientName }}</h1>
              <p class="mt-3 text-sm">
                {{ a.serviceName }} com {{ a.professionalName }}
              </p>
              <p class="mt-1 font-bold">{{ when() }}</p>

              @if (choice() === 'confirmar') {
                <button type="button" atrButton size="lg" class="mt-6 w-full" [disabled]="busy()" (click)="send('confirmar')">
                  <atr-icon name="check" [size]="18" />
                  {{ busy() ? 'Confirmando…' : 'Confirmar horário' }}
                </button>
                <button type="button" class="mt-4 text-sm font-semibold text-muted-foreground underline underline-offset-4" (click)="choice.set('recusar')">
                  Prefiro recusar
                </button>
              } @else {
                <button type="button" atrButton="destructive" size="lg" class="mt-6 w-full" [disabled]="busy()" (click)="send('recusar')">
                  {{ busy() ? 'Recusando…' : 'Recusar pedido' }}
                </button>
                <button type="button" class="mt-4 text-sm font-semibold text-muted-foreground underline underline-offset-4" (click)="choice.set('confirmar')">
                  Prefiro confirmar
                </button>
              }
            }
          }

          @case ('confirmado') {
            <span class="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
              <atr-icon name="circle-check-big" [size]="26" />
            </span>
            <h1 class="mt-4 text-xl font-bold">Horário confirmado</h1>
            <p class="mt-2 text-sm text-balance text-muted-foreground">
              {{ answer()?.clientName }} recebe a confirmação por e-mail. {{ when() }}.
            </p>
          }

          @case ('recusado') {
            <span class="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <atr-icon name="calendar-x" [size]="26" />
            </span>
            <h1 class="mt-4 text-xl font-bold">Pedido recusado</h1>
            <p class="mt-2 text-sm text-balance text-muted-foreground">
              {{ answer()?.clientName }} é avisado por e-mail, e o horário fica livre na agenda.
            </p>
          }

          @case ('invalido') {
            <h1 class="text-xl font-bold">Este pedido não está mais aberto</h1>
            <p class="mt-2 text-sm text-balance text-muted-foreground">
              Ele já foi respondido, venceu o prazo ou o cliente desistiu. A agenda mostra como ficou.
            </p>
            <a atrButton="outline" class="mt-6" routerLink="/agenda">Abrir a agenda</a>
          }

          @case ('erro') {
            <h1 class="text-xl font-bold">Não foi possível responder agora</h1>
            <p class="mt-2 text-sm text-muted-foreground">Verifique a internet e tente de novo.</p>
            <button type="button" atrButton="outline" class="mt-6" (click)="load()">Tentar de novo</button>
          }
        }
      </section>
    </main>
  `,
})
export class RespondPage implements OnInit {
  /** Da URL do e-mail: ?token=…&acao=confirmar|recusar */
  readonly token = input<string>('');
  readonly acao = input<string>('');

  private readonly responder = inject(RequestResponder);

  protected readonly state = signal<RequestAnswer['result'] | 'carregando' | 'erro'>('carregando');
  protected readonly answer = signal<RequestAnswer | null>(null);
  protected readonly choice = signal<Choice>('confirmar');
  protected readonly busy = signal(false);

  protected readonly when = computed(() => {
    const startsAt = this.answer()?.startsAt;
    if (!startsAt) return '';
    const day = formatLongDate(startsAt);
    return `${day.charAt(0).toUpperCase()}${day.slice(1)}, às ${formatTime(startsAt)}`;
  });

  ngOnInit(): void {
    this.choice.set(this.acao() === 'recusar' ? 'recusar' : 'confirmar');
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('carregando');
    await this.call('ver');
  }

  protected async send(action: Choice): Promise<void> {
    this.busy.set(true);
    try {
      await this.call(action);
    } finally {
      this.busy.set(false);
    }
  }

  private async call(action: RequestAction): Promise<void> {
    try {
      const answer = await this.responder.respond(this.token(), action);
      // O horário no relógio da barbearia, esteja o barbeiro onde estiver.
      if (answer.timeZone) setShopTimeZone(answer.timeZone);
      if (answer.result !== 'invalido') this.answer.set(answer);
      this.state.set(answer.result);
    } catch {
      this.state.set('erro');
    }
  }
}
