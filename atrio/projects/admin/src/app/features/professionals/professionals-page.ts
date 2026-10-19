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
  TimeBlock,
  TimeBlockRepository,
  startOfDay,
} from '@atrio/data';
import {
  AtrButton,
  AtrCard,
  AtrEmptyState,
  AtrIcon,
  AtrOverlay,
  AtrPageHeading,
} from '@atrio/ui';
import { BlockDialog, BlockDialogData } from '../../shared/block-dialog';
import { ProfessionalCard } from './components/professional-card';
import {
  ProfessionalDialog,
  ProfessionalDialogData,
} from './components/professional-dialog';
import { PinGate } from '../../shared/pin/pin-gate';

/** Janela usada para "o que ainda está por vir". */
const HORIZON_DAYS = 365;

/** Só estes status seguram o horário e contam como compromisso futuro. */
const STANDING: readonly Appointment['status'][] = ['agendado', 'em_atendimento'];

/**
 * Equipe da barbearia.
 *
 * Um cartão por profissional, ativos primeiro. Inativos continuam na lista,
 * esmaecidos: o histórico de atendimentos e o financeiro apontam para eles, e
 * escondê-los faria o dono achar que o cadastro sumiu.
 *
 * Não existe excluir, só desativar — por isso mesmo.
 */
@Component({
  selector: 'adm-professionals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AtrPageHeading,
    AtrButton,
    AtrIcon,
    AtrCard,
    AtrEmptyState,
    ProfessionalCard,
  ],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Profissionais"
      description="Equipe, serviços realizados e disponibilidade."
    >
      <button type="button" atrButton (click)="openDialog(null)">
        <atr-icon name="plus" [size]="16" />
        Novo profissional
      </button>
    </atr-page-heading>

    @if (professionals().length === 0) {
      <atr-card class="mt-6">
        <atr-empty-state
          icon="users"
          heading="Nenhum profissional cadastrado"
          description="Cadastre quem atende para que a agenda tenha colunas e o app do cliente aceite agendamentos."
        >
          <button type="button" atrButton class="mt-2" (click)="openDialog(null)">
            <atr-icon name="plus" [size]="16" />
            Novo profissional
          </button>
        </atr-empty-state>
      </atr-card>
    } @else {
      <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        @for (professional of professionals(); track professional.id) {
          <adm-professional-card
            [professional]="professional"
            [services]="services()"
            [blocks]="blocksOf(professional.id)"
            [futureAppointments]="futureCountOf(professional.id)"
            (edited)="openDialog(professional)"
            (blocked)="openBlockDialog(professional.id)"
            (blockRemoved)="removeBlock($event)"
          />
        }
      </div>
    }
  `,
})
export class ProfessionalsPage {
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);
  private readonly overlay = inject(AtrOverlay);
  private readonly pinGate = inject(PinGate);

  /** Daqui até um ano: o que ainda está por vir, em agendamentos e bloqueios. */
  private readonly horizon = (() => {
    const from = startOfDay(new Date());
    const to = new Date(from);
    to.setDate(to.getDate() + HORIZON_DAYS);
    return { from: from.toISOString(), to: to.toISOString() };
  })();

  /** Inclui inativos — ver o comentário da classe. */
  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  protected readonly services = toSignal(this.servicesRepo.watchAll(true), {
    initialValue: [] as readonly Service[],
  });

  private readonly upcoming = toSignal(
    this.appointmentsRepo.watch({ range: this.horizon }),
    { initialValue: [] as readonly Appointment[] },
  );

  private readonly blocks = toSignal(this.blocksRepo.watch(this.horizon), {
    initialValue: [] as readonly TimeBlock[],
  });

  /** Contagem por profissional, calculada uma vez por mudança da lista. */
  private readonly futureCounts = computed(() => {
    const counts = new Map<Id, number>();
    const now = Date.now();

    for (const appointment of this.upcoming()) {
      if (!STANDING.includes(appointment.status)) continue;
      if (new Date(appointment.startsAt).getTime() < now) continue;
      counts.set(
        appointment.professionalId,
        (counts.get(appointment.professionalId) ?? 0) + 1,
      );
    }
    return counts;
  });

  private readonly blocksByProfessional = computed(() => {
    const grouped = new Map<Id, TimeBlock[]>();

    for (const block of this.blocks()) {
      // Bloqueio da barbearia inteira aparece no cartão de todos.
      const targets = block.professionalId
        ? [block.professionalId]
        : this.professionals().map((professional) => professional.id);

      for (const id of targets) {
        grouped.set(id, [...(grouped.get(id) ?? []), block]);
      }
    }
    return grouped;
  });

  protected futureCountOf(id: Id): number {
    return this.futureCounts().get(id) ?? 0;
  }

  protected blocksOf(id: Id): readonly TimeBlock[] {
    return this.blocksByProfessional().get(id) ?? [];
  }

  // ─── ações ────────────────────────────────────────────────────────────

  protected openDialog(professional: Professional | null): void {
    this.overlay.openDialog<ProfessionalDialog, ProfessionalDialogData, boolean>(
      ProfessionalDialog,
      {
        professional,
        futureAppointments: professional ? this.futureCountOf(professional.id) : 0,
      },
    );
  }

  protected openBlockDialog(professionalId: Id): void {
    this.overlay.openDialog<BlockDialog, BlockDialogData, boolean>(BlockDialog, {
      date: new Date(),
      professionalId,
    });
  }

  protected async removeBlock(block: TimeBlock): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Remover bloqueio',
      message: block.reason
        ? `O período bloqueado por "${block.reason}" volta a aceitar agendamentos.`
        : 'O período volta a aceitar agendamentos.',
      confirmLabel: 'Remover bloqueio',
      destructive: true,
    });
    if (!confirmed || !(await this.pinGate.ensure('remover o bloqueio'))) return;
    await this.blocksRepo.remove(block.id);
  }
}
