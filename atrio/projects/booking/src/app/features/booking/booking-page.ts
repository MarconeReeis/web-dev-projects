import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { TenantContext } from '@atrio/core';
import {
  Appointment,
  AppointmentRepository,
  Id,
  IsoDateTime,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  TimeBlock,
  TimeBlockRepository,
  formatLongDate,
  formatMoney,
  formatTime,
  leastBusy,
  openSlots,
  startOfDay,
} from '@atrio/data';
import { AtrAvatar, AtrButton, AtrField, AtrIcon, AtrInput } from '@atrio/ui';
import { ClientIdentity } from '../../shared/client-identity';
import { ScheduleStep } from './components/schedule-step';

type Step = 'servico' | 'profissional' | 'horario' | 'confirmar' | 'pronto';

const ORDER: readonly Step[] = ['servico', 'profissional', 'horario', 'confirmar'];

const TITLES: Readonly<Record<Step, string>> = {
  servico: 'O que você vai fazer?',
  profissional: 'Com quem?',
  horario: 'Quando?',
  confirmar: 'Confirmar',
  pronto: 'Agendado',
};

/**
 * Agendamento em quatro passos.
 *
 * A ordem é serviço → profissional → horário → confirmação, e não começa pelo
 * profissional como pareceria natural. Dois motivos: o serviço define a
 * duração, que define quais horários realmente cabem; e nem todo profissional
 * faz todo serviço, então escolher a pessoa primeiro leva a becos — o cliente
 * escolhe o barbeiro, pede barba e descobre que ele não faz.
 *
 * "Qualquer profissional" existe porque boa parte das pessoas não tem
 * preferência, e obrigar a escolher esconde horários livres.
 *
 * Tela cheia, fora da barra inferior: durante o fluxo não há para onde
 * navegar senão adiante ou para trás.
 */
@Component({
  selector: 'bkg-booking-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AtrButton,
    AtrIcon,
    AtrAvatar,
    AtrField,
    AtrInput,
    ScheduleStep,
  ],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <!-- Cabeçalho -->
    <header class="sticky top-0 z-20 border-b border-border bg-card">
      <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        @if (step() === 'pronto') {
          <span class="flex-1 font-bold">{{ title() }}</span>
          <a
            class="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground"
            aria-label="Fechar"
            routerLink="../"
          >
            <atr-icon name="x" [size]="20" />
          </a>
        } @else {
          <button
            type="button"
            class="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
            aria-label="Voltar"
            (click)="back()"
          >
            <atr-icon name="chevron-left" [size]="20" />
          </button>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold">{{ title() }}</span>
            <span class="block text-xs text-muted-foreground">
              Passo {{ stepNumber() }} de {{ total }}
            </span>
          </span>
        }
      </div>

      @if (step() !== 'pronto') {
        <div class="h-1 bg-muted">
          <div
            class="h-full bg-primary transition-[width] duration-300"
            [style.width.%]="(stepNumber() / total) * 100"
          ></div>
        </div>
      }
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-32">
      @switch (step()) {
        <!-- 1. Serviço -->
        @case ('servico') {
          <ul class="flex flex-col gap-2">
            @for (service of services(); track service.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                  [class]="
                    service.id === serviceId()
                      ? 'border-primary bg-primary-soft'
                      : 'border-border bg-card hover:border-primary'
                  "
                  (click)="chooseService(service.id)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold">{{ service.name }}</span>
                    <span class="block text-sm text-balance text-muted-foreground">
                      {{ service.durationMinutes }} min
                      @if (service.description) {
                        · {{ service.description }}
                      }
                    </span>
                  </span>
                  <span class="tabular shrink-0 font-extrabold">
                    {{ money(service.price) }}
                  </span>
                </button>
              </li>
            }
          </ul>
        }

        <!-- 2. Profissional -->
        @case ('profissional') {
          <ul class="flex flex-col gap-2">
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                [class]="
                  professionalId() === null
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-card hover:border-primary'
                "
                (click)="chooseProfessional(null)"
              >
                <span
                  class="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                >
                  <atr-icon name="users" [size]="20" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block font-bold">Qualquer profissional</span>
                  <span class="block text-sm text-muted-foreground">
                    Mostra todos os horários livres
                  </span>
                </span>
              </button>
            </li>

            @for (professional of eligible(); track professional.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                  [class]="
                    professional.id === professionalId()
                      ? 'border-primary bg-primary-soft'
                      : 'border-border bg-card hover:border-primary'
                  "
                  (click)="chooseProfessional(professional.id)"
                >
                  <atr-avatar
                    [name]="professional.name"
                    [photoUrl]="professional.photoUrl"
                    size="lg"
                  />
                  <span class="min-w-0 flex-1 font-bold">{{ professional.name }}</span>
                </button>
              </li>
            }
          </ul>
        }

        <!-- 3. Dia e horário -->
        @case ('horario') {
          @if (service(); as chosen) {
            <bkg-schedule-step
              [service]="chosen"
              [professionals]="slotCandidates()"
              [existing]="dayAppointments()"
              [blocks]="dayBlocks()"
              [date]="date()"
              [selected]="startsAt()"
              (dateChange)="chooseDate($event)"
              (selectedChange)="startsAt.set($event)"
            />
          }
        }

        <!-- 4. Confirmação -->
        @case ('confirmar') {
          <div class="rounded-surface bg-ink p-5 text-ink-foreground">
            <p class="text-sm text-ink-muted">{{ service()?.name }}</p>
            <p class="tabular mt-1 text-2xl font-extrabold">
              {{ money(service()?.price ?? 0) }}
            </p>
            <div class="mt-4 flex flex-col gap-2 text-sm">
              <span class="inline-flex items-center gap-2">
                <atr-icon name="calendar-days" [size]="16" class="text-ink-muted" />
                {{ dateLabel() }}
              </span>
              <span class="tabular inline-flex items-center gap-2">
                <atr-icon name="clock" [size]="16" class="text-ink-muted" />
                {{ startsAt() ? time(startsAt()!) : '' }} ·
                {{ service()?.durationMinutes }} min
              </span>
              <span class="inline-flex items-center gap-2">
                <atr-icon name="user-round" [size]="16" class="text-ink-muted" />
                {{ assignedLabel() }}
              </span>
            </div>
          </div>

          <div class="mt-5 flex flex-col gap-4">
            <atr-field label="Seu nome" [error]="showErrors() ? nameError() : null">
              <input
                atrInput
                type="text"
                autocomplete="name"
                [invalid]="showErrors() && !!nameError()"
                [value]="name()"
                (input)="name.set($any($event.target).value)"
              />
            </atr-field>

            <atr-field
              label="Telefone"
              hint="A barbearia usa para falar com você se precisar."
              [error]="showErrors() ? phoneError() : null"
            >
              <input
                atrInput
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                placeholder="(11) 98888-7777"
                [invalid]="showErrors() && !!phoneError()"
                [value]="phone()"
                (input)="phone.set($any($event.target).value)"
              />
            </atr-field>

            <atr-field label="Observações" [optional]="true">
              <textarea
                atrInput
                rows="2"
                class="py-3"
                placeholder="Alguma preferência?"
                (input)="notes.set($any($event.target).value)"
              >{{ notes() }}</textarea>
            </atr-field>
          </div>

          @if (error(); as message) {
            <p
              class="mt-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
              role="alert"
            >
              {{ message }}
            </p>
          }
        }

        <!-- Pronto -->
        @case ('pronto') {
          <div class="flex flex-col items-center gap-4 py-10 text-center">
            <span
              class="flex size-20 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground"
            >
              <atr-icon name="check" [size]="36" [strokeWidth]="3" />
            </span>
            <h2 class="text-2xl font-extrabold tracking-tight">Horário confirmado</h2>
            <p class="text-balance text-muted-foreground">
              {{ dateLabel() }} às {{ startsAt() ? time(startsAt()!) : '' }}, com
              {{ assignedLabel() }}.
            </p>

            <div class="mt-4 flex w-full flex-col gap-2">
              <a atrButton class="w-full" routerLink="../meus-horarios">
                Ver meus horários
              </a>
              <a atrButton="ghost" class="w-full" routerLink="../">
                Voltar ao início
              </a>
            </div>
          </div>
        }
      }
    </main>

    <!-- Ação -->
    @if (step() !== 'pronto') {
      <div
        class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div class="mx-auto w-full max-w-2xl px-4 py-3">
          <button
            type="button"
            atrButton
            size="lg"
            class="w-full"
            [disabled]="!canAdvance() || busy()"
            (click)="advance()"
          >
            {{ step() === 'confirmar' ? 'Confirmar agendamento' : 'Continuar' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class BookingPage {
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);
  private readonly identity = inject(ClientIdentity);
  private readonly router = inject(Router);
  protected readonly tenant = inject(TenantContext);

  /** Atalho vindo da tela inicial: /agendar?servico=svc-corte */
  readonly servico = input<string | undefined>(undefined);
  readonly slug = input<string | undefined>(undefined);

  protected money = formatMoney;
  protected time = formatTime;
  protected readonly total = ORDER.length;

  protected readonly step = signal<Step>('servico');
  protected readonly serviceId = signal<Id | null>(null);
  protected readonly professionalId = signal<Id | null>(null);
  protected readonly date = signal(startOfDay(new Date()));
  protected readonly startsAt = signal<IsoDateTime | null>(null);

  protected readonly name = signal(this.identity.name());
  protected readonly phone = signal(this.identity.phone());
  protected readonly notes = signal('');

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly services = toSignal(this.servicesRepo.watchAll(), {
    initialValue: [] as readonly Service[],
  });

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  constructor() {
    // Chegando pelo atalho da tela inicial, o serviço já está escolhido e o
    // fluxo abre no passo seguinte — repetir a escolha seria um toque morto.
    effect(() => {
      const fromQuery = this.servico();
      if (!fromQuery) return;

      untracked(() => {
        if (this.serviceId() !== null) return;
        this.serviceId.set(fromQuery);
        this.step.set('profissional');
      });
    });
  }

  // ─── derivados ────────────────────────────────────────────────────────

  protected readonly service = computed(
    () => this.services().find((item) => item.id === this.serviceId()) ?? null,
  );

  /** Quem realiza o serviço escolhido. */
  protected readonly eligible = computed(() => {
    const service = this.service();
    if (!service) return [];
    return this.professionals().filter((professional) =>
      professional.serviceIds.includes(service.id),
    );
  });

  /** Candidatos para o cálculo de horários: o escolhido, ou todos. */
  protected readonly slotCandidates = computed(() => {
    const chosen = this.professionalId();
    if (!chosen) return this.eligible();
    return this.eligible().filter((professional) => professional.id === chosen);
  });

  private readonly dayRange = computed(() => {
    const from = this.date();
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  });

  protected readonly dayAppointments = toSignal(
    toObservable(this.dayRange).pipe(
      switchMap((range) => this.appointmentsRepo.watch({ range })),
    ),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly dayBlocks = toSignal(
    toObservable(this.dayRange).pipe(switchMap((range) => this.blocksRepo.watch(range))),
    { initialValue: [] as readonly TimeBlock[] },
  );

  /**
   * Quem vai atender.
   *
   * Com "qualquer profissional", escolhe entre os livres naquele horário o
   * que tem menos atendimentos no dia — distribui o movimento em vez de
   * empilhar tudo no primeiro da lista.
   */
  protected readonly assigned = computed<Professional | null>(() => {
    const chosen = this.professionalId();
    if (chosen) {
      return this.eligible().find((professional) => professional.id === chosen) ?? null;
    }

    const service = this.service();
    const startsAt = this.startsAt();
    if (!service || !startsAt) return null;

    const slot = openSlots({
      date: this.date(),
      service,
      professionals: this.eligible(),
      existing: this.dayAppointments(),
      blocks: this.dayBlocks(),
      now: new Date(),
    }).find((item) => item.startsAt === startsAt);

    return slot ? leastBusy(slot.professionals, this.dayAppointments()) : null;
  });

  /**
   * Quem efetivamente ficou com o atendimento, congelado na confirmação.
   *
   * `assigned` é um computed e recalcula `leastBusy` assim que o novo
   * agendamento entra na lista do dia: a carga de quem acabou de ser
   * escolhido sobe e o cálculo passa a preferir outro. Sem congelar, a tela
   * de sucesso anunciava um profissional diferente do que foi gravado — o
   * dado certo, a tela mentindo.
   */
  private readonly confirmedWith = signal<Professional | null>(null);

  protected readonly assignedLabel = computed(
    () => (this.confirmedWith() ?? this.assigned())?.name ?? 'a definir',
  );

  protected readonly title = computed(() => TITLES[this.step()]);

  protected readonly stepNumber = computed(() => {
    const index = ORDER.indexOf(this.step());
    return index < 0 ? ORDER.length : index + 1;
  });

  protected readonly dateLabel = computed(() => {
    const instant = this.startsAt() ?? this.date().toISOString();
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  // ─── validação ────────────────────────────────────────────────────────

  protected readonly nameError = computed(() =>
    this.name().trim().length < 2 ? 'Informe seu nome.' : null,
  );

  protected readonly phoneError = computed(() => {
    const digits = this.phone().replace(/\D/g, '');
    // 10 dígitos cobre fixo com DDD; 11, celular. Sem exigir formatação:
    // quem digita sem parênteses não deve ser barrado.
    if (digits.length < 10) return 'Informe um telefone com DDD.';
    return null;
  });

  protected readonly canAdvance = computed(() => {
    switch (this.step()) {
      case 'servico':
        return this.serviceId() !== null;
      case 'profissional':
        return true;
      case 'horario':
        return this.startsAt() !== null;
      case 'confirmar':
        return true;
      default:
        return false;
    }
  });

  // ─── navegação ────────────────────────────────────────────────────────

  protected chooseService(id: Id): void {
    if (this.serviceId() !== id) {
      // Trocar de serviço invalida profissional e horário: a duração mudou e
      // quem realiza pode ser outro.
      this.professionalId.set(null);
      this.startsAt.set(null);
    }
    this.serviceId.set(id);
    this.step.set('profissional');
  }

  protected chooseProfessional(id: Id | null): void {
    if (this.professionalId() !== id) this.startsAt.set(null);
    this.professionalId.set(id);
    this.step.set('horario');
  }

  protected chooseDate(date: Date): void {
    this.date.set(date);
    this.startsAt.set(null);
  }

  protected back(): void {
    const index = ORDER.indexOf(this.step());
    // No primeiro passo, voltar sai do fluxo e devolve à vitrine.
    if (index <= 0) {
      void this.router.navigate(['/b', this.slug() ?? '']);
      return;
    }
    this.step.set(ORDER[index - 1]);
  }

  protected async advance(): Promise<void> {
    if (this.step() !== 'confirmar') {
      const index = ORDER.indexOf(this.step());
      this.step.set(ORDER[index + 1]);
      return;
    }

    await this.confirm();
  }

  private async confirm(): Promise<void> {
    this.showErrors.set(true);
    this.error.set(null);

    const service = this.service();
    const startsAt = this.startsAt();
    const professional = this.assigned();

    if (this.nameError() || this.phoneError() || !service || !startsAt) return;

    if (!professional) {
      this.error.set('Esse horário acabou de ser ocupado. Escolha outro.');
      this.step.set('horario');
      this.startsAt.set(null);
      return;
    }

    this.busy.set(true);
    try {
      await this.appointmentsRepo.create({
        professionalId: professional.id,
        serviceId: service.id,
        client: {
          clientId: null,
          name: this.name().trim(),
          phone: this.phone().trim(),
        },
        startsAt,
        notes: this.notes().trim() || null,
      });

      this.confirmedWith.set(professional);
      this.identity.remember(this.name(), this.phone());
      this.step.set('pronto');
    } catch (cause) {
      // Entre escolher o horário e confirmar, alguém pode ter marcado. A
      // mensagem precisa dizer o que fazer, não só que falhou.
      this.error.set(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir o agendamento.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
