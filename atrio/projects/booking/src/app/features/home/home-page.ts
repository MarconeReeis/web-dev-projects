import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { InstallPrompt, TenantContext } from '@atrio/core';
import {
  APPOINTMENT_STATUS_LABEL,
  Appointment,
  AppointmentRepository,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  formatAddress,
  formatLongDate,
  formatMoney,
  dayRange,
  formatTime,
  shopDay,
} from '@atrio/data';
import { AtrBadge, AtrBadgeTone, AtrButton, AtrCard, AtrIcon, initialsOf } from '@atrio/ui';
import { STATUS_TONE } from '../appointments/appointment-rules';
import { ClientSession } from '../../shared/client-session';

const HORIZON_DAYS = 120;

/**
 * Vitrine da barbearia e ponto de partida do agendamento.
 *
 * Ordem da tela: destaque da barbearia, o que já está marcado (quando há),
 * a ação de agendar e o catálogo. A saudação subiu para o cabeçalho — ver
 * o shell.
 */
@Component({
  selector: 'bkg-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrCard, AtrBadge, AtrButton, AtrIcon],
  host: { class: 'block' },
  template: `
    <!-- Topo: o próximo horário do cliente, quando há; senão, o destaque da
         barbearia. Um ou outro, nunca os dois: quem tem horário marcado
         precisa achar o horário, e um banner acima empurraria o lembrete
         para baixo. -->
    <!-- Volta da exclusão de conta: confirma que deu certo. -->
    @if (accountDeleted()) {
      <p
        class="mb-4 flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3.5 text-sm text-success-soft-foreground"
        role="status"
      >
        <atr-icon name="circle-check-big" [size]="18" class="mt-px shrink-0" />
        Sua conta foi excluída. Obrigado por ter usado o app.
      </p>
    }

    @if (nextAppointment(); as next) {
      <section class="rounded-surface relative overflow-hidden bg-ink p-5 text-ink-foreground">
        <span
          class="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-primary/25 blur-2xl"
          aria-hidden="true"
        ></span>

        <div class="relative">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xs font-bold tracking-wider text-ink-muted uppercase">
              Seu próximo agendamento
            </h2>
            <atr-badge class="shrink-0" [tone]="tone(next)" [dot]="true">
              {{ statusLabel(next) }}
            </atr-badge>
          </div>

          <p class="mt-3 text-2xl leading-tight font-extrabold tracking-tight text-balance">
            {{ dateLabel(next.startsAt) }}
          </p>
          <p class="tabular mt-1 font-bold text-primary">
            {{ time(next.startsAt) }} – {{ time(next.endsAt) }}
          </p>
          <p class="mt-3 text-sm text-ink-muted">
            {{ next.serviceName }} · {{ professionalName(next.professionalId) }}
          </p>

          <a
            atrButton
            class="mt-5"
            [routerLink]="['/b', slug(), 'meus-horarios', next.id]"
          >
            Ver agendamento
            <atr-icon name="chevron-right" [size]="16" />
          </a>
        </div>
      </section>
    } @else if (highlight(); as promo) {
      <!-- Destaque da barbearia -->
      <section class="rounded-surface relative overflow-hidden bg-ink p-5 text-ink-foreground">
        <!-- Brilho decorativo: dá profundidade sem imagem, que a barbearia
             não tem como cadastrar ainda. -->
        <span
          class="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-primary/30 blur-2xl"
          aria-hidden="true"
        ></span>

        <div class="relative">
          <h2 class="text-xl font-extrabold text-balance">{{ promo.title }}</h2>
          @if (promo.subtitle) {
            <p class="mt-1.5 text-sm text-balance text-ink-muted">{{ promo.subtitle }}</p>
          }
          @if (promo.ctaLabel) {
            <a atrButton size="sm" class="mt-4" [routerLink]="['/b', slug(), 'agendar']">
              {{ promo.ctaLabel }}
            </a>
          }
        </div>
      </section>
    }

    <!-- Agendar -->
    <a atrButton size="lg" class="mt-4 w-full" [routerLink]="['/b', slug(), 'agendar']">
      <atr-icon name="plus" [size]="18" />
      Agendar horário
    </a>

    <!-- Profissionais: primeiro passo do agendamento, então vêm primeiro.
         Cards em duas colunas, como os serviços — e todos à mostra: uma
         barbearia tem poucos profissionais, e a faixa rolável de antes
         escondia parte deles fora da tela. -->
    @if (professionals().length > 0) {
      <h2 class="mt-7 text-lg font-bold">Com quem você quer agendar?</h2>

      <ul class="mt-3 grid grid-cols-2 gap-3">
        @for (professional of professionals(); track professional.id) {
          <li>
            <a
              class="surface flex h-full flex-col p-2 transition-colors hover:border-primary"
              [routerLink]="['/b', slug(), 'agendar']"
              [queryParams]="{ profissional: professional.id }"
            >
              @if (professional.photoUrl; as photo) {
                <img
                  [src]="photo"
                  [alt]="professional.name"
                  class="aspect-square w-full rounded-2xl object-cover"
                />
              } @else {
                <!-- Sem foto: iniciais grandes. A barbearia sobe a foto pelo
                     painel. -->
                <span
                  class="flex aspect-square w-full items-center justify-center rounded-2xl bg-primary-soft text-3xl font-extrabold text-primary-soft-foreground"
                  aria-hidden="true"
                >
                  {{ initials(professional.name) }}
                </span>
              }

              <span class="flex flex-1 flex-col px-1.5 pt-3 pb-1.5">
                <span class="font-bold text-balance">{{ professional.name }}</span>
                <span class="mt-0.5 mb-3 text-sm text-balance text-muted-foreground">
                  {{ describe(professional) }}
                </span>

                <!-- mt-auto: a especialidade ocupa uma ou duas linhas, e sem
                     isso os botões da mesma fileira ficam desalinhados. -->
                <span
                  class="mt-auto inline-flex h-11 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-foreground"
                  aria-hidden="true"
                >
                  Ver serviços
                </span>
              </span>
            </a>
          </li>
        }
      </ul>
    }

    <!-- Serviços -->
    <div class="mt-7 flex items-baseline justify-between gap-3">
      <h2 class="text-lg font-bold">Serviços</h2>
      <a class="text-sm font-semibold text-primary" [routerLink]="['/b', slug(), 'agendar']">Ver todos</a>
    </div>

    <ul class="mt-3 grid grid-cols-2 gap-3">
      @for (service of services(); track service.id) {
        <li>
          <a
            class="surface flex h-full flex-col overflow-hidden transition-colors hover:border-primary"
            [routerLink]="['/b', slug(), 'agendar']"
            [queryParams]="{ servico: service.id }"
          >
            <span
              class="flex h-24 items-center justify-center bg-primary-soft text-primary-soft-foreground"
            >
              <atr-icon name="scissors" [size]="30" />
            </span>

            <span class="flex flex-1 flex-col p-3.5">
              <span class="font-bold text-balance">{{ service.name }}</span>
              <span class="tabular mt-0.5 text-sm text-muted-foreground">
                {{ service.durationMinutes }} min
              </span>

              <span class="mt-3 flex items-center justify-between gap-2">
                <span class="tabular font-extrabold">{{ money(service.price) }}</span>
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-hidden="true"
                >
                  <atr-icon name="plus" [size]="16" />
                </span>
              </span>
            </span>
          </a>
        </li>
      }
    </ul>

    <!-- Onde e quando -->
    <atr-card heading="A barbearia" class="mt-4">
      <dl class="flex flex-col gap-4 text-sm">
        @if (addressLabel(); as address) {
          <div class="flex items-start gap-3">
            <atr-icon name="map-pin" [size]="18" class="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <dt class="sr-only">Endereço</dt>
              <dd>{{ address }}</dd>
            </div>
          </div>
        }
        @if (tenant.tenant()?.phone; as phone) {
          <div class="flex items-start gap-3">
            <atr-icon name="phone" [size]="18" class="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <dt class="sr-only">Telefone</dt>
              <dd><a class="hover:text-primary" [href]="'tel:' + phone">{{ phone }}</a></dd>
            </div>
          </div>
        }
      </dl>
    </atr-card>

    <!-- Instalação -->
    @if (install.state() !== 'instalado') {
      <atr-card class="mt-4">
        <div class="flex items-start gap-3">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"
          >
            <atr-icon name="smartphone" [size]="18" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-bold">Deixe na tela inicial</p>
            <p class="mt-0.5 text-sm text-muted-foreground">
              {{
                install.state() === 'disponivel'
                  ? 'Abre como aplicativo, sem passar pela loja.'
                  : 'No menu do navegador, toque em "Adicionar à tela de início".'
              }}
            </p>
            @if (install.state() === 'disponivel') {
              <button type="button" atrButton="soft" size="sm" class="mt-3" (click)="addToHome()">
                <atr-icon name="download" [size]="15" />
                Adicionar
              </button>
            }
          </div>
        </div>
      </atr-card>
    }
  `,
})
export class HomePage {
  /**
   * Slug da barbearia, vindo do parâmetro de rota.
   *
   * Os links desta tela são ABSOLUTOS de propósito. A home é o filho de
   * caminho vazio de `b/:slug` e não contribui com segmento nenhum de URL,
   * então um `../agendar` come o slug e produz `/b/agendar` — rota que não
   * existe, cai no `**` e devolve para a própria home. O botão parecia morto.
   */
  readonly slug = input<string>('');

  protected readonly tenant = inject(TenantContext);
  protected readonly install = inject(InstallPrompt);
  private readonly session = inject(ClientSession);

  /** Pelo estado da navegação, não pela URL: recarregar não repete o aviso. */
  protected readonly accountDeleted = signal(
    inject(Router).currentNavigation()?.extras.state?.['contaExcluida'] === true,
  );
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly appointmentsRepo = inject(AppointmentRepository);

  protected money = formatMoney;
  protected time = formatTime;
  protected initials = initialsOf;

  protected readonly services = toSignal(this.servicesRepo.watchAll(), {
    initialValue: [] as readonly Service[],
  });

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  // Reativo à sessão: entrar ou sair em outra tela muda o card de "próximo
  // horário" sem precisar recarregar a vitrine.
  private readonly myAppointments = toSignal(
    this.appointmentsRepo.watchMine(horizon()),
    { initialValue: [] as readonly Appointment[] },
  );

  /** Banner só aparece quando a barbearia tem algo a dizer. */
  protected readonly highlight = computed(() => {
    const promo = this.tenant.tenant()?.highlight;
    return promo?.active ? promo : null;
  });

  /**
   * O horário que ainda não acabou — pelo FIM, não pelo início: quem chega
   * cinco minutos atrasado não deve ver o lembrete sumir da tela.
   */
  protected readonly nextAppointment = computed(() => {
    const now = Date.now();
    return (
      this.myAppointments().find(
        (appointment) =>
          (appointment.status === 'agendado' || appointment.status === 'em_atendimento') &&
          new Date(appointment.endsAt).getTime() > now,
      ) ?? null
    );
  });

  protected tone(appointment: Appointment): AtrBadgeTone {
    return STATUS_TONE[appointment.status];
  }

  protected statusLabel(appointment: Appointment): string {
    return APPOINTMENT_STATUS_LABEL[appointment.status];
  }

  protected professionalName(id: string): string {
    return this.professionals().find((p) => p.id === id)?.name ?? '';
  }

  private readonly serviceNames = computed(
    () => new Map(this.services().map((service) => [service.id, service.name])),
  );

  /**
   * Linha de apoio do card. A especialidade decide a escolha — a lista de
   * serviços diz o que a pessoa PODE fazer, não o que faz bem. Sem
   * especialidade cadastrada, cai nos serviços: melhor que um espaço vazio.
   */
  protected describe(professional: Professional): string {
    if (professional.bio) return professional.bio;

    const names = this.serviceNames();
    const list = professional.serviceIds
      .map((id) => names.get(id))
      .filter((name): name is string => !!name);

    return list.length > 0 ? list.join(', ') : 'Sem serviços cadastrados';
  }

  protected readonly addressLabel = computed(() =>
    formatAddress(this.tenant.tenant()?.address),
  );

  protected dateLabel(instant: string): string {
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected async addToHome(): Promise<void> {
    await this.install.install();
  }
}

/** Daqui a quatro meses: nenhuma barbearia marca além disso. */
function horizon() {
  return dayRange(shopDay(), HORIZON_DAYS);
}
