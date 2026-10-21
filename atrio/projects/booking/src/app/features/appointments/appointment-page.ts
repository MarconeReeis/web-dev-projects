import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TenantContext } from '@atrio/core';
import {
  APPOINTMENT_STATUS_LABEL,
  Appointment,
  AppointmentRepository,
  Professional,
  ProfessionalRepository,
  formatAddress,
  formatLongDate,
  formatMoney,
  formatShortDay,
  formatTime,
} from '@atrio/data';
import {
  AtrBadge,
  AtrButton,
  AtrCard,
  AtrEmptyState,
  AtrIcon,
  AtrOverlay,
  initialsOf,
} from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';
import { PageHeader } from '../../shared/page-header';
import { SignIn } from '../auth/sign-in';
import { CHANGE_LIMIT_HOURS, STATUS_TONE, canChange, canWithdraw } from './appointment-rules';
import { ownAppointment } from './own-appointment';

/** Quanto tempo o aviso fica na tela. */
const TOAST_MS = 3000;

/**
 * Um agendamento do cliente: o que foi marcado e o que dá para fazer com ele.
 *
 * É página, e não painel por cima da lista, porque daqui se vai ao
 * reagendamento e se volta — e o "voltar" do celular precisa voltar para
 * cá, não fechar tudo.
 *
 * O topo escuro, com a foto, é o que se procura de relance: com quem, que dia,
 * que horas. O resto é ficha.
 */
@Component({
  selector: 'bkg-appointment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrBadge, AtrButton, AtrCard, AtrEmptyState, AtrIcon, PageHeader, SignIn],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <bkg-page-header heading="Agendamento" (back)="back()" />

    <!-- Aviso de volta do reagendamento, ou depois de cancelar -->
    @if (toast(); as message) {
      <div
        class="floating fixed inset-x-4 top-3 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-sm font-semibold"
        role="status"
      >
        <atr-icon name="circle-check-big" [size]="18" class="shrink-0 text-success" />
        {{ message }}
      </div>
    }

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 pt-2 pb-10">
      @if (!session.signedIn()) {
        <bkg-sign-in
          heading="Entre para ver este agendamento"
          lead="Seus agendamentos ficam na sua conta, e só você consegue ver ou mudar."
        />
      } @else if (appointment(); as item) {
        <div class="overflow-hidden rounded-surface border border-border bg-card shadow-card">
          <div class="flex items-center gap-4 bg-ink p-5 text-ink-foreground">
            @if (professional()?.photoUrl; as photo) {
              <img
                [src]="photo"
                [alt]="professionalName()"
                class="size-16 shrink-0 rounded-2xl object-cover"
              />
            } @else {
              <span
                class="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-ink-elevated text-lg font-extrabold"
                aria-hidden="true"
              >
                {{ initials(professionalName()) }}
              </span>
            }
            <span class="min-w-0">
              <span class="block text-xl leading-tight font-extrabold tracking-tight text-balance">
                {{ longDate(item.startsAt) }}
              </span>
              <span class="tabular mt-1 block font-bold text-primary">
                {{ time(item.startsAt) }} – {{ time(item.endsAt) }}
              </span>
            </span>
          </div>

          <dl class="flex flex-col gap-3 p-5 text-sm">
            <div class="flex items-center justify-between gap-4">
              <dt class="text-muted-foreground">Status</dt>
              <dd>
                <atr-badge [tone]="tone(item)" [dot]="true">{{ statusLabel(item) }}</atr-badge>
              </dd>
            </div>
            <div class="flex items-start justify-between gap-4">
              <dt class="shrink-0 text-muted-foreground">Serviço</dt>
              <dd class="tabular text-right font-semibold">
                {{ item.serviceName }} · {{ item.durationMinutes }} min
              </dd>
            </div>
            <div class="flex items-start justify-between gap-4">
              <dt class="shrink-0 text-muted-foreground">Profissional</dt>
              <dd class="text-right font-semibold">{{ professionalName() }}</dd>
            </div>
            <div class="flex items-start justify-between gap-4">
              <dt class="shrink-0 text-muted-foreground">Valor</dt>
              <dd class="tabular text-right font-semibold">
                {{ money(item.price) }} · pagamento na barbearia
              </dd>
            </div>
            @if (address(); as where) {
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-muted-foreground">Local</dt>
                <dd class="text-right font-semibold text-balance">{{ where }}</dd>
              </div>
            }
            @if (item.notes) {
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-muted-foreground">Observações</dt>
                <dd class="text-right text-balance">{{ item.notes }}</dd>
              </div>
            }
          </dl>
        </div>

        <!-- Pedido: a barbearia ainda vai confirmar. Dá para desistir. -->
        @if (item.status === 'pendente') {
          <div
            class="mt-5 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3.5 text-sm text-warning-soft-foreground"
            role="status"
          >
            <atr-icon name="clock" [size]="18" class="mt-px shrink-0" />
            <span>
              A barbearia ainda vai confirmar este horário — você recebe a resposta por e-mail.
              @if (item.respondBy; as deadline) {
                Sem resposta até {{ deadlineLabel(deadline) }}, o pedido é cancelado.
              }
            </span>
          </div>
          @if (withdrawable()) {
            <button
              type="button"
              atrButton="destructive-outline"
              size="lg"
              class="mt-3 w-full"
              [disabled]="busy()"
              (click)="cancel(item)"
            >
              Desistir do pedido
            </button>
          }
        }

        @if (item.status === 'agendado') {
          @if (changeable()) {
            <div class="mt-5 flex flex-col gap-2.5">
              <a
                atrButton
                size="lg"
                class="w-full"
                [routerLink]="['/', slug(), 'meus-horarios', item.id, 'reagendar']"
              >
                Reagendar
              </a>
              <button
                type="button"
                atrButton="destructive-outline"
                size="lg"
                class="w-full"
                [disabled]="busy()"
                (click)="cancel(item)"
              >
                Cancelar agendamento
              </button>
            </div>
          } @else {
            <!-- Perto demais do horário: a mudança passa pela barbearia, que
                 ainda pode tentar encaixar alguém. -->
            <div class="mt-5 rounded-2xl bg-secondary px-4 py-3.5 text-sm text-muted-foreground">
              Faltam menos de {{ limit }}h para o horário. Para reagendar ou cancelar,
              fale com a barbearia.
              @if (tenant.tenant()?.phone; as phone) {
                <a class="mt-2 block font-semibold text-primary" [href]="'tel:' + digits(phone)">
                  Ligar para {{ phone }}
                </a>
              }
            </div>
          }
        }

        @if (error(); as message) {
          <p
            class="mt-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
            role="alert"
          >
            {{ message }}
          </p>
        }
      } @else if (appointment() === null) {
        <atr-card>
          <atr-empty-state
            icon="calendar-x"
            heading="Agendamento não encontrado"
            description="Ele pode ter sido removido, ou pertencer a outra conta."
          >
            <a atrButton class="mt-2" [routerLink]="['/', slug(), 'meus-horarios']">
              Ver meus horários
            </a>
          </atr-empty-state>
        </atr-card>
      }
    </main>
  `,
})
export class AppointmentPage {
  private readonly repository = inject(AppointmentRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly overlay = inject(AtrOverlay);
  private readonly router = inject(Router);

  protected readonly session = inject(ClientSession);
  protected readonly tenant = inject(TenantContext);

  readonly slug = input<string>('');
  readonly id = input<string>('');

  protected readonly money = formatMoney;
  protected readonly time = formatTime;
  protected readonly initials = initialsOf;
  protected readonly limit = CHANGE_LIMIT_HOURS;

  protected readonly appointment = ownAppointment(this.id);

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  protected readonly professional = computed(() => {
    const item = this.appointment();
    return item ? (this.professionals().find((p) => p.id === item.professionalId) ?? null) : null;
  });

  protected readonly professionalName = computed(() => this.professional()?.name ?? 'Profissional');

  protected readonly address = computed(() => formatAddress(this.tenant.tenant()?.address));

  protected readonly changeable = computed(() => {
    const item = this.appointment();
    return item ? canChange(item) : false;
  });

  protected readonly withdrawable = computed(() => {
    const item = this.appointment();
    return item ? canWithdraw(item) : false;
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // O reagendamento volta para cá com o aviso no estado da navegação, e
    // não na URL: recarregar a página não deve repetir "Horário alterado!".
    const message = this.router.currentNavigation()?.extras.state?.['toast'];
    if (typeof message === 'string') this.notify(message);

    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  protected longDate(instant: string): string {
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected tone(item: Appointment) {
    return STATUS_TONE[item.status];
  }

  protected statusLabel(item: Appointment): string {
    return APPOINTMENT_STATUS_LABEL[item.status];
  }

  /** "qua, 22/10 às 08:00" */
  protected deadlineLabel(instant: string): string {
    return `${formatShortDay(instant).toLowerCase()} às ${formatTime(instant)}`;
  }

  protected digits(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  protected back(): void {
    void this.router.navigate(['/', this.slug(), 'meus-horarios']);
  }

  protected async cancel(item: Appointment): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Cancelar este agendamento?',
      message: `${item.serviceName} com ${this.professionalName()}, ${this.longDate(item.startsAt)} às ${formatTime(item.startsAt)}. O horário será liberado para outros clientes.`,
      confirmLabel: 'Sim, cancelar',
      cancelLabel: 'Manter',
      destructive: true,
      stacked: true,
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.repository.cancel(item.id);
      // Fica na página: o status muda para "Cancelado" na frente da pessoa,
      // que é a confirmação mais clara de que deu certo.
      this.notify('Agendamento cancelado.');
    } catch (cause) {
      // O servidor explica o motivo (prazo de 2h, já cancelado…).
      this.error.set(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível cancelar agora. Tente de novo ou fale com a barbearia.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private notify(message: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_MS);
  }
}
