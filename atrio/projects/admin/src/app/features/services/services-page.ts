import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Appointment,
  AppointmentRepository,
  Id,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  dayRange,
  shopDay,
} from '@atrio/data';
import {
  AtrButton,
  AtrCard,
  AtrEmptyState,
  AtrIcon,
  AtrOverlay,
  AtrPageHeading,
} from '@atrio/ui';
import { ServiceCard } from './components/service-card';
import { ServiceDialog, ServiceDialogData } from './components/service-dialog';

const HORIZON_DAYS = 365;

/** Só estes status seguram o horário e contam como compromisso futuro. */
const STANDING: readonly Appointment['status'][] = ['agendado', 'em_atendimento'];

/**
 * Catálogo de serviços.
 *
 * Preço único por serviço nesta versão — não há tabela por profissional. A
 * alteração vale só para agendamentos novos, porque o atendimento congela o
 * preço praticado na marcação.
 *
 * Ordem de catálogo (por cadastro), não alfabética: o dono pensa nisso como
 * "a tabela", e a tabela tem uma ordem que ele definiu. Inativos vão para o
 * fim.
 */
@Component({
  selector: 'adm-services-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrPageHeading, AtrButton, AtrIcon, AtrCard, AtrEmptyState, ServiceCard],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Serviços e preços"
      description="Preço único por serviço. Alterações valem apenas para novos agendamentos."
    >
      <button type="button" atrButton (click)="openDialog(null)">
        <atr-icon name="plus" [size]="16" />
        Novo serviço
      </button>
    </atr-page-heading>

    @if (services().length === 0) {
      <atr-card class="mt-6">
        <atr-empty-state
          icon="scissors"
          heading="Nenhum serviço cadastrado"
          description="Cadastre o que a barbearia faz, com duração e preço, para que a agenda consiga marcar atendimentos."
        >
          <button type="button" atrButton class="mt-2" (click)="openDialog(null)">
            <atr-icon name="plus" [size]="16" />
            Novo serviço
          </button>
        </atr-empty-state>
      </atr-card>
    } @else {
      <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        @for (service of services(); track service.id) {
          <adm-service-card
            [service]="service"
            [professionals]="professionalsOf(service.id)"
            (edited)="openDialog(service)"
          />
        }
      </div>
    }
  `,
})
export class ServicesPage {
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly overlay = inject(AtrOverlay);

  private readonly horizon = dayRange(shopDay(), HORIZON_DAYS);

  private readonly allServices = toSignal(this.servicesRepo.watchAll(true), {
    initialValue: [] as readonly Service[],
  });

  private readonly allProfessionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  private readonly upcoming = toSignal(
    this.appointmentsRepo.watch({ range: this.horizon }),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly services = computed(() =>
    [...this.allServices()].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    }),
  );

  /** Quem realiza cada serviço — o vínculo mora em Professional.serviceIds. */
  private readonly byService = computed(() => {
    const grouped = new Map<Id, Professional[]>();

    for (const professional of this.allProfessionals()) {
      for (const serviceId of professional.serviceIds) {
        grouped.set(serviceId, [...(grouped.get(serviceId) ?? []), professional]);
      }
    }
    return grouped;
  });

  private readonly futureCounts = computed(() => {
    const counts = new Map<Id, number>();
    const now = Date.now();

    for (const appointment of this.upcoming()) {
      if (!STANDING.includes(appointment.status)) continue;
      if (new Date(appointment.startsAt).getTime() < now) continue;
      counts.set(appointment.serviceId, (counts.get(appointment.serviceId) ?? 0) + 1);
    }
    return counts;
  });

  protected professionalsOf(serviceId: Id): readonly Professional[] {
    return this.byService().get(serviceId) ?? [];
  }

  protected openDialog(service: Service | null): void {
    this.overlay.openDialog<ServiceDialog, ServiceDialogData, boolean>(ServiceDialog, {
      service,
      professionalIds: service
        ? this.professionalsOf(service.id).map((professional) => professional.id)
        : [],
      futureAppointments: service ? (this.futureCounts().get(service.id) ?? 0) : 0,
    });
  }
}
