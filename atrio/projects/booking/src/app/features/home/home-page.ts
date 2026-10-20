import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TenantContext } from '@atrio/core';
import {
  APPOINTMENT_STATUS_LABEL,
  Appointment,
  AppointmentRepository,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  Weekday,
  clockToMinutes,
  dayRange,
  expandWindows,
  formatAddress,
  formatLongDate,
  formatMoney,
  formatTime,
  shopDay,
} from '@atrio/data';
import { AtrBadge, AtrBadgeTone, AtrButton, AtrIcon, initialsOf } from '@atrio/ui';
import { STATUS_TONE } from '../appointments/appointment-rules';
import { ClientSession } from '../../shared/client-session';

const HORIZON_DAYS = 120;

/**
 * Vitrine da barbearia e ponto de partida do agendamento.
 *
 * Ordem da tela (referência em especificacoes-navalla-co.md): saudação, a
 * ação de agendar, o próximo horário do cliente e o destaque da barbearia,
 * o catálogo de serviços, os profissionais e, no fim, onde e quando — com
 * "Como chegar" e WhatsApp. O topo com a marca fica no shell.
 */
@Component({
  selector: 'bkg-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrBadge, AtrButton, AtrIcon],
  host: { class: 'block' },
  template: `
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

    <p class="text-sm text-muted-foreground">{{ greeting() }}</p>

    <a
      atrButton
      size="lg"
      class="mt-4 h-14 w-full text-base shadow-cta"
      [routerLink]="['/b', slug(), 'agendar']"
    >
      <atr-icon name="calendar-plus" [size]="20" />
      Agendar horário
    </a>

    <!-- O próximo horário do cliente: quem tem horário marcado abre o app
         para conferir quando é. -->
    @if (nextAppointment(); as next) {
      <section class="rounded-surface mt-4 bg-ink p-5 text-ink-foreground">
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-sans text-sm font-semibold tracking-normal text-ink-muted">
            Seu próximo horário
          </h2>
          <atr-badge class="shrink-0" [tone]="tone(next)" [dot]="true">
            {{ statusLabel(next) }}
          </atr-badge>
        </div>

        <p class="mt-3 font-display text-2xl leading-tight font-semibold tracking-tight text-balance">
          {{ dateLabel(next.startsAt) }}
        </p>
        <p class="tabular mt-1 font-semibold text-primary">
          {{ time(next.startsAt) }} – {{ time(next.endsAt) }}
        </p>
        <p class="mt-2 text-sm text-ink-muted">
          {{ next.serviceName }} · {{ professionalName(next.professionalId) }}
        </p>

        <a
          class="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold"
          [routerLink]="['/b', slug(), 'meus-horarios', next.id]"
        >
          Ver agendamento
          <atr-icon name="chevron-right" [size]="16" />
        </a>
      </section>
    }

    <!-- Destaque da barbearia, quando ela tem algo a dizer. -->
    @if (highlight(); as promo) {
      <a
        class="rounded-surface mt-4 flex items-center gap-4 bg-ink p-5 text-ink-foreground transition-transform hover:-translate-y-0.5"
        [routerLink]="['/b', slug(), 'agendar']"
      >
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink-elevated text-primary"
          aria-hidden="true"
        >
          <atr-icon name="scissors" [size]="22" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs text-ink-muted">Em destaque</span>
          <span class="mt-0.5 block font-display text-xl font-semibold tracking-tight text-balance">
            {{ promo.title }}
          </span>
          @if (promo.subtitle) {
            <span class="mt-0.5 block text-xs text-ink-muted">{{ promo.subtitle }}</span>
          }
        </span>
        <atr-icon name="chevron-right" [size]="20" class="shrink-0" />
      </a>
    }

    <!-- Serviços: lista compacta. O catálogo inteiro cabe em poucas rolagens,
         e o preço fica alinhado à direita, onde se compara de relance. -->
    @if (services().length > 0) {
      <h2 class="mt-8 text-xl font-semibold">Serviços</h2>

      <ul class="mt-3 flex flex-col gap-3">
        @for (service of services(); track service.id) {
          <li>
            <a
              class="surface flex items-center gap-3 border-transparent px-5 py-4 transition-transform hover:-translate-y-0.5"
              [routerLink]="['/b', slug(), 'agendar']"
              [queryParams]="{ servico: service.id }"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-display font-semibold text-balance">{{ service.name }}</span>
                <span class="tabular mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <atr-icon name="clock" [size]="14" />
                  {{ service.durationMinutes }} min
                </span>
              </span>
              <span class="tabular shrink-0 font-display font-bold">{{ money(service.price) }}</span>
              <span
                class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"
                aria-hidden="true"
              >
                <atr-icon name="plus" [size]="20" />
              </span>
            </a>
          </li>
        }
      </ul>
    }

    <!-- Profissionais: tocar abre o agendamento já com a pessoa escolhida. -->
    @if (professionals().length > 0) {
      <h2 class="mt-8 text-xl font-semibold">Nossos profissionais</h2>

      <ul class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        @for (professional of professionals(); track professional.id) {
          <li>
            <a
              class="surface group flex h-full flex-col border-transparent p-2 transition-transform hover:-translate-y-0.5"
              [routerLink]="['/b', slug(), 'agendar']"
              [queryParams]="{ profissional: professional.id }"
            >
              <span class="block aspect-[4/4.2] overflow-hidden rounded-2xl">
                @if (professional.photoUrl; as photo) {
                  <img
                    [src]="photo"
                    [alt]="professional.name"
                    class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                } @else {
                  <!-- Sem foto: iniciais. A barbearia sobe a foto pelo painel. -->
                  <span
                    class="flex size-full items-center justify-center bg-primary-soft font-display text-3xl font-bold text-primary-soft-foreground"
                    aria-hidden="true"
                  >
                    {{ initials(professional.name) }}
                  </span>
                }
              </span>

              <span class="px-1.5 pt-3 pb-2">
                <span class="block font-display font-semibold text-balance">{{ professional.name }}</span>
                <span class="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                  {{ describe(professional) }}
                </span>
              </span>
            </a>
          </li>
        }
      </ul>
    }

    <!-- Onde e quando -->
    <section class="mt-8 border-t border-border pt-6">
      <h2 class="text-xl font-semibold">A barbearia</h2>

      <dl class="mt-4 flex flex-col gap-3.5 text-sm">
        @if (addressLabel(); as address) {
          <div class="flex items-start gap-3">
            <atr-icon name="map-pin" [size]="18" class="mt-px shrink-0 text-primary" />
            <dt class="sr-only">Endereço</dt>
            <dd>{{ address }}</dd>
          </div>
        }
        <div class="flex items-start gap-3">
          <atr-icon name="clock" [size]="18" class="mt-px shrink-0 text-primary" />
          <dt class="sr-only">Horário de hoje</dt>
          <dd>
            <span class="text-muted-foreground">Hoje ·&nbsp;</span>
            <span class="font-bold">{{ todayHours() }}</span>
          </dd>
        </div>
        @if (tenant.tenant()?.phone; as phone) {
          <div class="flex items-start gap-3">
            <atr-icon name="phone" [size]="18" class="mt-px shrink-0 text-primary" />
            <dt class="sr-only">Telefone</dt>
            <dd><a class="hover:text-primary" [href]="'tel:' + digits(phone)">{{ phone }}</a></dd>
          </div>
        }
      </dl>

      <div class="mt-5 grid grid-cols-2 gap-3">
        @if (mapsUrl(); as maps) {
          <a atrButton="outline" size="lg" [href]="maps" target="_blank" rel="noopener">
            <atr-icon name="navigation" [size]="18" />
            Como chegar
          </a>
        }
        @if (whatsappUrl(); as whatsapp) {
          <a atrButton="soft" size="lg" [href]="whatsapp" target="_blank" rel="noopener">
            <atr-icon name="message-circle" [size]="18" />
            WhatsApp
          </a>
        }
      </div>
    </section>
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

  /** "Olá, Lucas" com conta; quem ainda não entrou é bem-vindo. */
  protected readonly greeting = computed(() => {
    const first = this.session.firstName();
    return first ? `Olá, ${first}` : 'Bem-vindo!';
  });

  /** Destaque só aparece quando a barbearia tem algo a dizer. */
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

  /**
   * O horário de hoje é a união das jornadas de quem trabalha hoje — a
   * barbearia não tem horário à parte (ver Tenant), e um campo próprio
   * anunciaria horas em que ninguém atende.
   */
  protected readonly todayHours = computed(() => {
    const weekday = shopDay().getDay() as Weekday;
    let open = Infinity;
    let close = -Infinity;
    for (const professional of this.professionals()) {
      for (const window of expandWindows(professional.schedule[weekday])) {
        open = Math.min(open, clockToMinutes(window.start));
        close = Math.max(close, clockToMinutes(window.end));
      }
    }
    return Number.isFinite(open) ? `${hoursLabel(open)} às ${hoursLabel(close)}` : 'fechado';
  });

  protected readonly mapsUrl = computed(() => {
    const address = this.addressLabel();
    return address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;
  });

  /** WhatsApp pelo telefone da barbearia, com o 55 do Brasil na frente. */
  protected readonly whatsappUrl = computed(() => {
    const digits = this.digits(this.tenant.tenant()?.phone ?? '');
    if (digits.length < 10) return null;
    return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
  });

  protected digits(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  protected dateLabel(instant: string): string {
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
}

/** 540 → "09h", 570 → "09h30". */
function hoursLabel(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Daqui a quatro meses: nenhuma barbearia marca além disso. */
function horizon() {
  return dayRange(shopDay(), HORIZON_DAYS);
}
