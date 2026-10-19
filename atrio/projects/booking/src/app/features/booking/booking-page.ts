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
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  Appointment,
  AppointmentRepository,
  AvailabilityRepository,
  BusyInterval,
  Id,
  IsoDateTime,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  formatAddress,
  formatLongDate,
  formatMoney,
  formatShortDay,
  formatTime,
  isSameDay,
  leastBusy,
  openSlots,
  splitBusy,
  startOfDay,
} from '@atrio/data';
import {
  AtrAvatar,
  AtrButton,
  AtrField,
  AtrIcon,
  AtrInput,
  initialsOf,
} from '@atrio/ui';
import { TenantContext } from '@atrio/core';
import { ClientSession } from '../../shared/client-session';
import { SignIn } from '../auth/sign-in';
import { BOOKING_HORIZON_DAYS, ScheduleStep } from './components/schedule-step';

type Step = 'profissional' | 'servico' | 'horario' | 'confirmar' | 'pronto';

/**
 * Ordem canônica, única.
 *
 * Profissional primeiro porque a lista de serviços do passo seguinte sai
 * filtrada pelo que aquela pessoa realiza — o beco do "ele não faz barba"
 * deixa de existir. Numa barbearia a fidelidade ao barbeiro pesa mais que a
 * preferência por serviço, e quem não tem preferência escolhe "qualquer".
 *
 * Os atalhos da tela inicial apenas PRÉ-SELECIONAM; nenhum encurta o fluxo.
 * Antes havia três caminhos com contagens de passo diferentes, e manter isso
 * coerente custava mais do que valia.
 */
const ORDER: readonly Step[] = ['profissional', 'servico', 'horario', 'confirmar'];

const TITLES: Readonly<Record<Step, string>> = {
  profissional: 'Escolha o profissional',
  servico: 'Escolha o serviço',
  horario: 'Data e horário',
  confirmar: 'Revisão',
  pronto: 'Agendado',
};

/** Sentinela de "sem preferência", distinta de "ainda não escolheu". */
const ANY = 'qualquer';
type ProfessionalChoice = Id | typeof ANY | null;

@Component({
  selector: 'bkg-booking-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    AtrButton,
    AtrIcon,
    AtrAvatar,
    AtrField,
    AtrInput,
    SignIn,
    ScheduleStep,
  ],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <!-- Marcador de seleção, compartilhado pelos passos 1 e 2 -->
    <ng-template #radio let-marcado>
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        [class]="marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
        aria-hidden="true"
      >
        @if (marcado) {
          <atr-icon name="check" [size]="14" [strokeWidth]="3" />
        }
      </span>
    </ng-template>

    <!-- Linhas da revisão (passo 4) -->
    <ng-template #row let-label="label" let-value="value">
      <div class="flex items-start gap-3 py-4">
        <dt class="w-24 shrink-0 text-muted-foreground">{{ label }}</dt>
        <dd class="min-w-0 flex-1 font-semibold">{{ value }}</dd>
      </div>
    </ng-template>

    <!-- Linhas do comprovante (sucesso) -->
    <ng-template #receipt let-label="label" let-value="value">
      <div class="flex items-start justify-between gap-4">
        <dt class="shrink-0 text-muted-foreground">{{ label }}</dt>
        <dd class="min-w-0 text-right font-semibold text-balance">{{ value }}</dd>
      </div>
    </ng-template>

    <ng-template #edit let-target let-what="what">
      <button
        type="button"
        class="shrink-0 font-semibold text-primary"
        [attr.aria-label]="'Editar ' + what"
        (click)="step.set(target)"
      >
        Editar
      </button>
    </ng-template>

    <!-- Cabeçalho. Some na tela de sucesso: não há para onde voltar — o
         agendamento já existe — e etapa nenhuma a contar. -->
    @if (step() !== 'pronto') {
      <header class="sticky top-0 z-20 bg-background">
        <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            class="floating inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors hover:bg-accent"
            aria-label="Voltar"
            (click)="back()"
          >
            <atr-icon name="chevron-left" [size]="20" />
          </button>
          <span class="min-w-0 flex-1 text-center">
            <span class="block truncate font-bold">{{ title() }}</span>
            <span class="block text-xs text-muted-foreground">
              Etapa {{ stepNumber() }} de {{ total }}
            </span>
          </span>
          <span class="size-11 shrink-0"></span>
        </div>

        <!-- Progresso em segmentos: diz quantas etapas faltam, não só quanto
             já andou — uma barra contínua não informa isso. -->
        <div class="mx-auto flex w-full max-w-2xl gap-1.5 px-4 pb-3">
          @for (item of order; track item) {
            <span
              class="h-1.5 flex-1 rounded-full transition-colors"
              [class]="isDone(item) ? 'bg-primary' : 'bg-muted'"
            ></span>
          }
        </div>
      </header>
    }

    <main
      class="mx-auto w-full max-w-2xl flex-1 px-4"
      [class]="step() === 'pronto' ? 'flex flex-col pt-14 pb-8' : 'pt-2 pb-36'"
    >
      @switch (step()) {
        <!-- 1. Profissional -->
        @case ('profissional') {
          <ul class="flex flex-col gap-2">
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                [class]="cardClass(choice() === ANY)"
                (click)="choose(ANY)"
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
                <ng-container
                  *ngTemplateOutlet="radio; context: { $implicit: choice() === ANY }"
                />
              </button>
            </li>

            @for (professional of professionals(); track professional.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                  [class]="cardClass(choice() === professional.id)"
                  (click)="choose(professional.id)"
                >
                  <atr-avatar
                    [name]="professional.name"
                    [photoUrl]="professional.photoUrl"
                    size="lg"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold">{{ professional.name }}</span>
                    @if (professional.bio) {
                      <span class="block text-sm font-semibold text-primary">
                        {{ professional.bio }}
                      </span>
                    }
                  </span>
                  <ng-container
                    *ngTemplateOutlet="
                      radio;
                      context: { $implicit: choice() === professional.id }
                    "
                  />
                </button>
              </li>
            }
          </ul>
        }

        <!-- 2. Serviço -->
        @case ('servico') {
          <!-- Ficha do profissional: foto à esquerda, identificação à
               direita. Lembra com quem o cliente vai — mudar de etapa apaga
               da tela a escolha anterior — e a apresentação ajuda quem ainda
               está decidindo se é mesmo aquele barbeiro. -->
          <div class="surface mb-5 flex items-start gap-4 p-4">
            @if (chosenProfessional(); as professional) {
              @if (professional.photoUrl; as photo) {
                <img
                  [src]="photo"
                  [alt]="professional.name"
                  class="size-20 shrink-0 rounded-2xl object-cover"
                />
              } @else {
                <span
                  class="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-xl font-extrabold text-primary-soft-foreground"
                  aria-hidden="true"
                >
                  {{ initials(professional.name) }}
                </span>
              }
              <span class="min-w-0 flex-1">
                <span class="block text-2xl font-extrabold tracking-tight text-balance">
                  {{ professional.name }}
                </span>
                @if (professional.bio) {
                  <span class="mt-0.5 block font-semibold text-primary">
                    {{ professional.bio }}
                  </span>
                }
                @if (professional.about) {
                  <span class="mt-1.5 block text-sm text-balance text-muted-foreground">
                    {{ professional.about }}
                  </span>
                }
              </span>
            } @else {
              <span
                class="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground"
              >
                <atr-icon name="users" [size]="28" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-2xl font-extrabold tracking-tight">
                  Qualquer profissional
                </span>
                <span class="mt-1.5 block text-sm text-muted-foreground">
                  Mostramos o catálogo completo e, no horário escolhido, quem
                  estiver livre atende você.
                </span>
              </span>
            }
          </div>

          <h2 class="mb-3 font-bold">Serviços</h2>

          @if (visibleServices().length === 0) {
            <p class="rounded-xl bg-warning-soft px-4 py-3.5 text-sm text-warning-soft-foreground">
              Este profissional ainda não tem serviços cadastrados.
            </p>
          } @else {
            <ul class="flex flex-col gap-2">
              @for (service of visibleServices(); track service.id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                    [class]="cardClass(service.id === serviceId())"
                    (click)="serviceId.set(service.id)"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block font-bold">{{ service.name }}</span>
                      @if (service.description) {
                        <span class="block text-sm text-balance text-muted-foreground">
                          {{ service.description }}
                        </span>
                      }
                      <span
                        class="tabular mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                      >
                        <atr-icon name="clock" [size]="14" />
                        {{ service.durationMinutes }} min
                      </span>
                    </span>
                    <span class="tabular shrink-0 font-extrabold">
                      {{ money(service.price) }}
                    </span>
                    <ng-container
                      *ngTemplateOutlet="
                        radio;
                        context: { $implicit: service.id === serviceId() }
                      "
                    />
                  </button>
                </li>
              }
            </ul>
          }
        }

        <!-- 3. Dia e horário -->
        @case ('horario') {
          @if (service(); as chosen) {
            <!-- O que está sendo marcado. O lápis volta ao serviço — de lá,
                 voltar mais uma vez troca o profissional. -->
            <div class="surface mb-6 flex items-center gap-3 p-3">
              @if (chosenProfessional(); as professional) {
                @if (professional.photoUrl; as photo) {
                  <img
                    [src]="photo"
                    [alt]="professional.name"
                    class="size-14 shrink-0 rounded-xl object-cover"
                  />
                } @else {
                  <span
                    class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary-soft font-extrabold text-primary-soft-foreground"
                    aria-hidden="true"
                  >
                    {{ initials(professional.name) }}
                  </span>
                }
              } @else {
                <span
                  class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground"
                >
                  <atr-icon name="users" [size]="22" />
                </span>
              }
              <span class="min-w-0 flex-1">
                <span class="block truncate text-lg font-bold">{{ chosen.name }}</span>
                <span class="tabular block text-sm text-muted-foreground">
                  {{ chosenProfessional()?.name ?? 'Qualquer profissional' }} ·
                  {{ chosen.durationMinutes }} min · {{ money(chosen.price) }}
                </span>
              </span>
              <button
                type="button"
                class="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
                aria-label="Trocar o serviço"
                (click)="step.set('servico')"
              >
                <atr-icon name="pencil" [size]="18" />
              </button>
            </div>

            <bkg-schedule-step
              [service]="chosen"
              [professionals]="slotCandidates()"
              [existing]="horizonAppointments()"
              [blocks]="horizonBlocks()"
              [date]="date()"
              [selected]="startsAt()"
              (dateChange)="chooseDate($event)"
              (selectedChange)="startsAt.set($event)"
            />
          }
        }

        <!-- 4. Identificação, quando preciso, e revisão -->
        @case ('confirmar') {
          @if (!session.signedIn()) {
            <!-- Sem conta, a revisão espera. Fica no mesmo passo — e não numa
                 rota de login — porque sair daqui descartaria tudo o que foi
                 escolhido; ao abrir a sessão, a revisão aparece sozinha. -->
            <bkg-sign-in
              heading="Entre para continuar"
              lead="Com uma conta você acompanha, reagenda e cancela seus horários. Suas escolhas estão salvas."
            />
          } @else {
            <h2 class="text-2xl font-extrabold tracking-tight">Confira sua reserva</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              O horário só fica garantido após a confirmação.
            </p>

            <!-- Uma linha por decisão, cada uma com o caminho de volta ao passo
                 que a tomou. Duração e barbearia não têm "Editar": decorrem
                 do serviço e do link por onde o cliente entrou. -->
            <dl class="surface mt-5 divide-y divide-border px-5 text-sm">
              <ng-container
                *ngTemplateOutlet="row; context: { label: 'Barbearia', value: tenant.name() }"
              />
              <div class="flex items-start gap-3 py-4">
                <dt class="w-24 shrink-0 text-muted-foreground">Profissional</dt>
                <dd class="min-w-0 flex-1">
                  <span class="block font-semibold">{{ assignedLabel() }}</span>
                  @if (!chosenProfessional()) {
                    <span class="block text-muted-foreground">Quem estiver livre no horário</span>
                  }
                </dd>
                <ng-container *ngTemplateOutlet="edit; context: { $implicit: 'profissional', what: 'o profissional' }" />
              </div>
              <div class="flex items-start gap-3 py-4">
                <dt class="w-24 shrink-0 text-muted-foreground">Serviço</dt>
                <dd class="min-w-0 flex-1 font-semibold">{{ service()?.name }}</dd>
                <ng-container *ngTemplateOutlet="edit; context: { $implicit: 'servico', what: 'o serviço' }" />
              </div>
              <ng-container
                *ngTemplateOutlet="
                  row;
                  context: { label: 'Duração', value: (service()?.durationMinutes ?? 0) + ' min' }
                "
              />
              <div class="flex items-start gap-3 py-4">
                <dt class="w-24 shrink-0 text-muted-foreground">Data</dt>
                <dd class="min-w-0 flex-1 font-semibold">{{ dateLabel() }}</dd>
                <ng-container *ngTemplateOutlet="edit; context: { $implicit: 'horario', what: 'a data' }" />
              </div>
              <div class="flex items-start gap-3 py-4">
                <dt class="w-24 shrink-0 text-muted-foreground">Horário</dt>
                <dd class="tabular min-w-0 flex-1 font-semibold">{{ timeRange() }}</dd>
                <ng-container *ngTemplateOutlet="edit; context: { $implicit: 'horario', what: 'o horário' }" />
              </div>
              <div class="flex items-start gap-3 py-4">
                <dt class="w-24 shrink-0 text-muted-foreground">Cliente</dt>
                <dd class="min-w-0 flex-1">
                  <span class="block font-semibold">{{ session.name() }}</span>
                  <span class="tabular block text-muted-foreground">{{ session.phone() }}</span>
                </dd>
                <!-- Sair e entrar com outra conta: as escolhas ficam. -->
                <button
                  type="button"
                  class="shrink-0 font-semibold text-primary"
                  aria-label="Entrar com outra conta"
                  (click)="session.signOut()"
                >
                  Trocar
                </button>
              </div>
              <div class="flex items-center justify-between gap-3 py-4">
                <dt class="text-base font-semibold">Total</dt>
                <dd class="tabular text-2xl font-extrabold tracking-tight">
                  {{ money(service()?.price ?? 0) }}
                </dd>
              </div>
            </dl>

            <p
              class="mt-5 flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3.5 text-sm text-success-soft-foreground"
            >
              <atr-icon name="banknote" [size]="20" class="mt-px shrink-0" />
              <span>
                <strong class="font-bold">Pagamento na barbearia.</strong> Nada é cobrado
                agora.
              </span>
            </p>

            <atr-field label="Observações" [optional]="true" class="mt-6 block">
              <textarea
                atrInput
                rows="3"
                class="py-3"
                placeholder="Ex.: quero manter o comprimento em cima"
                (input)="notes.set($any($event.target).value)"
              >{{ notes() }}</textarea>
            </atr-field>

            @if (error(); as message) {
              <p
                class="mt-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
                role="alert"
              >
                {{ message }}
              </p>
            }
          }
        }

        <!-- Pronto. Tudo vem do agendamento gravado, não do que estava na
             tela: preço e serviço são os congelados na marcação. -->
        @case ('pronto') {
          @if (confirmed(); as done) {
            <div class="flex flex-col items-center text-center">
              <span
                class="flex size-16 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground"
              >
                <atr-icon name="circle-check-big" [size]="30" />
              </span>
              <h2 class="mt-5 text-3xl font-extrabold tracking-tight text-balance">
                Seu horário está marcado!
              </h2>
              <p class="mt-2 text-sm text-muted-foreground">{{ waitingLine() }}</p>
            </div>

            <div class="surface mt-8 p-5">
              <p class="text-xl font-extrabold tracking-tight">{{ longDate(done.startsAt) }}</p>
              <p class="tabular mt-0.5 text-lg font-bold text-primary">
                {{ time(done.startsAt) }} – {{ time(done.endsAt) }}
              </p>

              <dl class="mt-4 flex flex-col gap-2.5 border-t border-dashed border-border pt-4 text-sm">
                <ng-container
                  *ngTemplateOutlet="receipt; context: { label: 'Serviço', value: done.serviceName }"
                />
                <ng-container
                  *ngTemplateOutlet="receipt; context: { label: 'Profissional', value: assignedLabel() }"
                />
                <ng-container
                  *ngTemplateOutlet="
                    receipt;
                    context: { label: 'Valor', value: money(done.price) + ' · na barbearia' }
                  "
                />
                @if (address(); as where) {
                  <ng-container
                    *ngTemplateOutlet="receipt; context: { label: 'Endereço', value: where }"
                  />
                }
              </dl>
            </div>

            <div class="mt-auto flex flex-col gap-1 pt-10">
              <a atrButton size="lg" class="w-full" [routerLink]="['/b', slug(), 'meus-horarios']">
                Ver meu agendamento
              </a>
              <a atrButton="ghost" size="lg" class="w-full" [routerLink]="['/b', slug()]">
                Voltar ao início
              </a>
            </div>
          }
        }
      }
    </main>

    <!-- Rodapé: resumo da escolha + ação. Some na identificação, que tem os
         próprios botões — dois "continuar" na mesma tela seriam um a mais. -->
    @if (step() !== 'pronto' && !(step() === 'confirmar' && !session.signedIn())) {
      <div class="edge-top fixed inset-x-0 bottom-0 z-20 bg-card pb-[env(safe-area-inset-bottom)]">
        <div class="mx-auto flex w-full max-w-2xl items-center gap-4 px-4 py-3">
          <!-- Na revisão o resumo já está na tela inteira; o rodapé vira só
               a ação, com o valor no próprio botão. -->
          @if (step() !== 'confirmar') {
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-muted-foreground">{{ summaryLabel() }}</p>
              @if (summaryValue(); as value) {
                <p class="tabular truncate text-lg font-extrabold">{{ value }}</p>
              }
            </div>
          }
          <button
            type="button"
            atrButton
            size="lg"
            [class]="step() === 'confirmar' ? 'w-full' : 'shrink-0'"
            [disabled]="!canAdvance() || busy()"
            (click)="advance()"
          >
            {{ ctaLabel() }}
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
  private readonly availabilityRepo = inject(AvailabilityRepository);
  protected readonly session = inject(ClientSession);
  protected readonly tenant = inject(TenantContext);
  private readonly router = inject(Router);

  /**
   * Atalhos da tela inicial. Ambos só pré-selecionam; dá para voltar e trocar.
   *
   *   ?profissional=pro-caio   escolhe a pessoa e abre no serviço
   *   ?servico=svc-corte       deixa o serviço marcado para a etapa 2
   */
  readonly profissional = input<string | undefined>(undefined);
  readonly servico = input<string | undefined>(undefined);
  readonly slug = input<string>('');

  protected money = formatMoney;
  protected time = formatTime;
  protected initials = initialsOf;
  protected readonly order = ORDER;
  protected readonly total = ORDER.length;
  protected readonly ANY = ANY;

  protected readonly step = signal<Step>('profissional');
  protected readonly choice = signal<ProfessionalChoice>(null);
  protected readonly serviceId = signal<Id | null>(null);
  protected readonly date = signal(startOfDay(new Date()));
  protected readonly startsAt = signal<IsoDateTime | null>(null);

  protected readonly notes = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  private readonly services = toSignal(this.servicesRepo.watchAll(), {
    initialValue: [] as readonly Service[],
  });

  constructor() {
    effect(() => {
      const fromQuery = this.profissional();
      if (!fromQuery) return;

      untracked(() => {
        if (this.choice() !== null) return;
        this.choice.set(fromQuery);
        this.step.set('servico');
      });
    });

    effect(() => {
      const fromQuery = this.servico();
      if (!fromQuery) return;

      untracked(() => {
        if (this.serviceId() === null) this.serviceId.set(fromQuery);
      });
    });
  }

  // ─── derivados ────────────────────────────────────────────────────────

  /** Nulo quando o cliente escolheu "qualquer profissional". */
  private readonly professionalId = computed<Id | null>(() => {
    const value = this.choice();
    return value === null || value === ANY ? null : value;
  });

  protected readonly chosenProfessional = computed(
    () => this.professionals().find((item) => item.id === this.professionalId()) ?? null,
  );

  /** Só o que o profissional escolhido realiza; tudo, se não há preferência. */
  protected readonly visibleServices = computed(() => {
    const professional = this.chosenProfessional();
    if (!professional) return this.services();

    return this.services().filter((service) =>
      professional.serviceIds.includes(service.id),
    );
  });

  protected readonly service = computed(
    () => this.services().find((item) => item.id === this.serviceId()) ?? null,
  );

  /** Candidatos para o cálculo de horários. */
  protected readonly slotCandidates = computed(() => {
    const service = this.service();
    if (!service) return [];

    const professional = this.chosenProfessional();
    if (professional) return [professional];

    return this.professionals().filter((item) => item.serviceIds.includes(service.id));
  });

  /**
   * A janela inteira de agendamento, numa consulta só.
   *
   * O passo de horário precisa saber de antemão quais dias da semana à mostra
   * têm vaga, e qual é a próxima data livre quando o dia escolhido não tem.
   * Consultar dia a dia seriam até 21 leituras a cada troca de semana; três
   * semanas de agenda de uma barbearia são poucas centenas de documentos.
   *
   * Fixa no carregamento da página: quem atravessa a meia-noite com a tela
   * aberta continua vendo "hoje" como ontem até recarregar, como já era.
   */
  private readonly horizon = (() => {
    const from = startOfDay(new Date());
    const to = new Date(from);
    to.setDate(to.getDate() + BOOKING_HORIZON_DAYS);
    return { from: from.toISOString(), to: to.toISOString() };
  })();

  /**
   * Os trechos ocupados da janela — não a agenda: o app do cliente não vê
   * nome nem telefone de ninguém, só quem está ocupado e quando.
   */
  private readonly occupied = toSignal(this.availabilityRepo.watchBusy(this.horizon), {
    initialValue: [] as readonly BusyInterval[],
  });

  private readonly split = computed(() => splitBusy(this.occupied()));
  protected readonly horizonAppointments = computed(() => this.split().appointments);
  protected readonly horizonBlocks = computed(() => this.split().blocks);

  /** Só os do dia escolhido: é sobre eles que se mede quem está menos ocupado. */
  private readonly dayAppointments = computed(() =>
    this.horizonAppointments().filter((item) =>
      isSameDay(new Date(item.startsAt), this.date()),
    ),
  );

  /** Congelado na confirmação — ver o comentário em confirm(). */
  private readonly confirmedWith = signal<Professional | null>(null);

  /** O agendamento como foi gravado — é dele que a tela de sucesso lê. */
  protected readonly confirmed = signal<Appointment | null>(null);

  /** "Te esperamos na Navalha & Co." — sem ponto dobrado quando o nome já termina em um. */
  protected readonly waitingLine = computed(() => {
    const name = this.tenant.name().trim();
    if (!name) return 'Te esperamos lá.';
    return `Te esperamos na ${name}${name.endsWith('.') ? '' : '.'}`;
  });

  protected readonly address = computed(() => formatAddress(this.tenant.tenant()?.address));

  private readonly assigned = computed<Professional | null>(() => {
    const chosen = this.chosenProfessional();
    if (chosen) return chosen;

    const service = this.service();
    const startsAt = this.startsAt();
    if (!service || !startsAt) return null;

    const slot = openSlots({
      date: this.date(),
      service,
      professionals: this.slotCandidates(),
      existing: this.dayAppointments(),
      blocks: this.horizonBlocks(),
      now: new Date(),
    }).find((item) => item.startsAt === startsAt);

    return slot ? leastBusy(slot.professionals, this.dayAppointments()) : null;
  });

  protected readonly assignedLabel = computed(
    () => (this.confirmedWith() ?? this.assigned())?.name ?? 'a definir',
  );

  // ─── cabeçalho e rodapé ───────────────────────────────────────────────

  protected readonly title = computed(() =>
    this.step() === 'confirmar' && !this.session.signedIn()
      ? 'Identificação'
      : TITLES[this.step()],
  );

  protected readonly stepNumber = computed(() => {
    const index = ORDER.indexOf(this.step());
    return index < 0 ? ORDER.length : index + 1;
  });

  protected isDone(item: Step): boolean {
    return ORDER.indexOf(item) <= ORDER.indexOf(this.step());
  }

  /** "09:30 às 10:10" — o fim importa: é quando o cliente fica livre. */
  protected readonly timeRange = computed(() => {
    const startsAt = this.startsAt();
    const service = this.service();
    if (!startsAt || !service) return '';

    const ends = new Date(startsAt);
    ends.setMinutes(ends.getMinutes() + service.durationMinutes);
    return `${formatTime(startsAt)} às ${formatTime(ends)}`;
  });

  protected longDate(instant: IsoDateTime): string {
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected readonly dateLabel = computed(() => {
    const instant = this.startsAt() ?? this.date().toISOString();
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  /**
   * Resumo no rodapé, ao lado do botão que leva adiante.
   *
   * Num fluxo de quatro etapas é o que evita chegar na confirmação sem
   * lembrar o que foi marcado três telas atrás.
   */
  protected readonly summaryLabel = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return this.choice() === null ? 'Nenhum profissional escolhido' : 'Profissional';
      case 'servico':
        return this.service() ? 'Serviço' : 'Nenhum serviço selecionado';
      case 'horario': {
        // Aqui o rótulo carrega o horário e o valor vira o preço: quem chega
        // ao fim da escolha confere as duas coisas antes de seguir.
        const startsAt = this.startsAt();
        const service = this.service();
        if (!startsAt || !service) return 'Selecione um horário';

        return `${formatShortDay(startsAt)} · ${this.timeRange().replace(' às ', '–')}`;
      }
      default:
        return this.service()?.name ?? '';
    }
  });

  protected readonly summaryValue = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return this.choice() === null
          ? ''
          : (this.chosenProfessional()?.name ?? 'Qualquer profissional');
      case 'servico': {
        const service = this.service();
        return service ? `${service.name} · ${formatMoney(service.price)}` : '';
      }
      case 'horario': {
        const service = this.service();
        return this.startsAt() && service ? formatMoney(service.price) : '';
      }
      default:
        return formatMoney(this.service()?.price ?? 0);
    }
  });

  protected readonly ctaLabel = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return 'Ver serviços';
      case 'servico':
        return 'Escolher horário';
      case 'horario':
        return 'Continuar';
      default:
        return `Confirmar agendamento · ${formatMoney(this.service()?.price ?? 0)}`;
    }
  });

  protected cardClass(selected: boolean): string {
    return selected
      ? 'border-primary bg-primary-soft'
      : 'border-border bg-card hover:border-primary';
  }

  // ─── validação ────────────────────────────────────────────────────────

  protected readonly canAdvance = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return this.choice() !== null;
      case 'servico':
        return this.serviceId() !== null;
      case 'horario':
        return this.startsAt() !== null;
      default:
        return true;
    }
  });

  // ─── navegação ────────────────────────────────────────────────────────

  protected choose(value: ProfessionalChoice): void {
    if (this.choice() === value) return;
    this.choice.set(value);

    // O serviço só cai se quem foi escolhido não o realiza. Limpar sempre
    // apagava o serviço que veio marcado da vitrine (?servico=) logo no
    // primeiro toque, e o atalho nunca chegava à etapa 2.
    const service = this.serviceId();
    if (service && !this.visibleServices().some((item) => item.id === service)) {
      this.serviceId.set(null);
    }
    // O horário cai sempre: a agenda é de outra pessoa.
    this.startsAt.set(null);
  }

  protected chooseDate(date: Date): void {
    this.date.set(date);
    this.startsAt.set(null);
  }

  protected back(): void {
    const index = ORDER.indexOf(this.step());

    // No primeiro passo, voltar sai do fluxo e devolve à vitrine.
    if (index <= 0) {
      void this.router.navigate(['/b', this.slug()]);
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
    this.error.set(null);

    const service = this.service();
    const startsAt = this.startsAt();
    const professional = this.assigned();

    const account = this.session.account();

    if (!account || !service || !startsAt) return;

    if (!professional) {
      this.error.set('Esse horário acabou de ser ocupado. Escolha outro.');
      this.step.set('horario');
      this.startsAt.set(null);
      return;
    }

    this.busy.set(true);
    try {
      // Quem é o cliente, o servidor tira da conta logada — o app não tem
      // como marcar em nome de outro.
      const created = await this.appointmentsRepo.book({
        professionalId: professional.id,
        serviceId: service.id,
        startsAt,
        notes: this.notes().trim() || null,
      });

      // `assigned` recalcula leastBusy assim que o novo agendamento entra na
      // lista do dia e passaria a apontar outra pessoa. A tela de sucesso
      // precisa dizer quem de fato ficou com o atendimento.
      this.confirmedWith.set(professional);
      this.confirmed.set(created);
      this.step.set('pronto');
    } catch (cause) {
      // Entre escolher o horário e confirmar, alguém pode ter marcado.
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
