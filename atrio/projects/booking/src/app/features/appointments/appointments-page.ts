import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  APPOINTMENT_STATUS_LABEL,
  Appointment,
  AppointmentRepository,
  Professional,
  ProfessionalRepository,
  formatMoney,
  formatShortDay,
  formatTime,
} from '@atrio/data';
import {
  AtrBadge,
  AtrBadgeTone,
  AtrButton,
  AtrCard,
  AtrEmptyState,
  AtrIcon,
} from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';
import { SignIn } from '../auth/sign-in';
import { STATUS_TONE, clientWindow } from './appointment-rules';

type Tab = 'proximos' | 'historico';

/**
 * Agendamentos do cliente, só com a conta aberta.
 *
 * Duas abas — próximos e histórico — com a contagem no rótulo, para a pessoa
 * saber o que há do outro lado antes de trocar. Cada card mostra o que se
 * confere de relance (dia, hora, serviço, com quem, duração, valor); tocar
 * nele abre a página do agendamento, onde ficam reagendar e cancelar.
 *
 * A consulta ainda é pelo telefone DA CONTA: é o que liga a pessoa aos
 * horários marcados no balcão, antes de ela ter conta. Com o Firebase, a
 * leitura passa a ser filtrada pelas regras de segurança (Client.userId), e
 * não pela tela.
 */
@Component({
  selector: 'bkg-appointments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrCard, AtrBadge, AtrButton, AtrIcon, AtrEmptyState, SignIn],
  host: { class: 'block' },
  template: `
    <h1 class="text-3xl font-extrabold tracking-tight">Meus horários</h1>

    @if (!session.signedIn()) {
      <bkg-sign-in
        class="mt-5"
        heading="Entre para ver seus horários"
        lead="Seus agendamentos ficam na sua conta, e só você consegue ver ou cancelar."
      />
    } @else {
      <!-- Abas em cápsula: a ativa é um "botão" claro sobre o trilho. -->
      <div class="mt-5 grid grid-cols-2 gap-1 rounded-full bg-secondary p-1" role="tablist">
        @for (option of tabs; track option.id) {
          <button
            type="button"
            role="tab"
            class="h-11 rounded-full text-sm font-semibold transition-colors"
            [class]="
              tab() === option.id
                ? 'shadow-card bg-card text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            "
            [attr.aria-selected]="tab() === option.id"
            (click)="tab.set(option.id)"
          >
            {{ option.label }}
            <span class="tabular font-medium text-muted-foreground">({{ count(option.id) }})</span>
          </button>
        }
      </div>

      @if (visible().length === 0) {
        <atr-card class="mt-5">
          @if (tab() === 'proximos') {
            <atr-empty-state
              icon="calendar-days"
              heading="Nada marcado"
              description="Quando você agendar, seus horários aparecem aqui."
            >
              <a atrButton class="mt-2" [routerLink]="['/b', slug(), 'agendar']">Agendar horário</a>
            </atr-empty-state>
          } @else {
            <atr-empty-state
              icon="clock"
              heading="Sem histórico ainda"
              description="Atendimentos passados e cancelados aparecem aqui."
            />
          }
        </atr-card>
      } @else {
        <ul class="mt-5 flex flex-col gap-3">
          @for (appointment of visible(); track appointment.id) {
            <li>
              <a
                class="surface block p-5 transition-colors hover:border-primary"
                [attr.aria-label]="'Detalhes de ' + appointment.serviceName + ', ' + dayAndTime(appointment)"
                [routerLink]="['/b', slug(), 'meus-horarios', appointment.id]"
              >
                <span class="flex items-start justify-between gap-3">
                  <span class="min-w-0">
                    <span class="tabular block text-lg font-extrabold tracking-tight">
                      {{ dayAndTime(appointment) }}
                    </span>
                    <span class="mt-0.5 block text-sm text-muted-foreground">
                      {{ appointment.serviceName }} com
                      {{ professionalName(appointment.professionalId) }}
                    </span>
                  </span>
                  <atr-badge class="shrink-0" [tone]="tone(appointment.status)" [dot]="true">
                    {{ statusLabel(appointment.status) }}
                  </atr-badge>
                </span>

                <span
                  class="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-border pt-3.5"
                >
                  <span class="tabular inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <atr-icon name="clock" [size]="16" />
                    {{ appointment.durationMinutes }} min
                  </span>
                  <span class="tabular font-extrabold">{{ money(appointment.price) }}</span>
                </span>
              </a>
            </li>
          }
        </ul>
      }

      <button
        type="button"
        atrButton="ghost"
        size="sm"
        class="mt-8 w-full"
        (click)="session.signOut()"
      >
        Sair da conta
      </button>
    }
  `,
})
export class AppointmentsPage {
  private readonly repository = inject(AppointmentRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);

  protected readonly session = inject(ClientSession);

  /** Os links são absolutos — ver o comentário de `slug` na home. */
  readonly slug = input<string>('');

  protected money = formatMoney;

  protected readonly tabs: readonly { id: Tab; label: string }[] = [
    { id: 'proximos', label: 'Próximos' },
    { id: 'historico', label: 'Histórico' },
  ];
  protected readonly tab = signal<Tab>('proximos');

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  private readonly appointments = toSignal(
    this.repository.watchMine(clientWindow()),
    { initialValue: [] as readonly Appointment[] },
  );

  /** Do mais próximo para o mais distante. */
  private readonly upcoming = computed(() => {
    const now = Date.now();
    return this.appointments().filter(
      (appointment) =>
        new Date(appointment.startsAt).getTime() >= now &&
        appointment.status !== 'cancelado',
    );
  });

  /** Do mais recente para o mais antigo; cancelados entram aqui mesmo se futuros. */
  private readonly past = computed(() => {
    const now = Date.now();
    return this.appointments()
      .filter(
        (appointment) =>
          new Date(appointment.startsAt).getTime() < now ||
          appointment.status === 'cancelado',
      )
      .reverse();
  });

  protected readonly visible = computed(() =>
    this.tab() === 'proximos' ? this.upcoming() : this.past(),
  );

  protected count(tab: Tab): number {
    return tab === 'proximos' ? this.upcoming().length : this.past().length;
  }

  protected dayAndTime(appointment: Appointment): string {
    return `${formatShortDay(appointment.startsAt)} · ${formatTime(appointment.startsAt)}`;
  }

  protected tone(status: Appointment['status']): AtrBadgeTone {
    return STATUS_TONE[status];
  }

  protected statusLabel(status: Appointment['status']): string {
    return APPOINTMENT_STATUS_LABEL[status];
  }

  protected professionalName(id: string): string {
    return this.professionals().find((p) => p.id === id)?.name ?? 'Profissional';
  }
}
