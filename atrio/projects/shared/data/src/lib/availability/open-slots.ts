import { Appointment } from '../models/appointment';
import { IsoDateTime } from '../models/common';
import { Professional } from '../models/professional';
import { Service } from '../models/service';
import { BusyAppointment, BusyBlock, availableSlots } from './availability';

export interface OpenSlot {
  readonly startsAt: IsoDateTime;
  /** Quem pode atender nesse horário, na ordem em que foram informados. */
  readonly professionals: readonly Professional[];
}

export interface OpenSlotsParams {
  readonly date: Date;
  readonly service: Service;
  /** Candidatos. Quem não realiza o serviço é descartado aqui mesmo. */
  readonly professionals: readonly Professional[];
  readonly existing: readonly BusyAppointment[];
  readonly blocks: readonly BusyBlock[];
  readonly now?: Date;
}

/**
 * Horários livres considerando vários profissionais ao mesmo tempo.
 *
 * Existe para o "qualquer profissional disponível" do app do cliente. Boa
 * parte das pessoas não tem preferência, e obrigar a escolher antes esconde
 * horários: o cliente vê a agenda do Rafael lotada e desiste, sem saber que o
 * Diego tinha a mesma hora livre.
 *
 * Cada horário carrega QUEM pode atendê-lo, porque a escolha final precisa
 * acontecer na confirmação — e precisa ser verificável. Devolver só a lista de
 * horários obrigaria a recalcular na hora de marcar.
 */
export function openSlots(params: OpenSlotsParams): OpenSlot[] {
  const { date, service, professionals, existing, blocks, now } = params;

  const eligible = professionals.filter(
    (professional) =>
      professional.active && professional.serviceIds.includes(service.id),
  );

  // Map preserva a ordem de inserção, então os horários saem crescentes desde
  // que o primeiro profissional já os produza em ordem — e availableSlots
  // garante isso. O sort no fim cobre o caso de profissionais com jornadas
  // começando em momentos diferentes.
  const byStart = new Map<IsoDateTime, Professional[]>();

  for (const professional of eligible) {
    const slots = availableSlots({
      date,
      professional,
      service,
      existing,
      blocks,
      now,
    });

    for (const startsAt of slots) {
      const current = byStart.get(startsAt);
      if (current) current.push(professional);
      else byStart.set(startsAt, [professional]);
    }
  }

  return [...byStart.entries()]
    .map(([startsAt, list]) => ({ startsAt, professionals: list }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Escolhe quem atende quando o cliente não tem preferência.
 *
 * Critério: quem tem menos atendimentos no dia. Distribui o movimento em vez
 * de empilhar tudo no primeiro da lista, que é o que acontece ao pegar sempre
 * o primeiro disponível — e aí um barbeiro fecha o dia cheio e outro vazio.
 */
export function leastBusy(
  candidates: readonly Professional[],
  dayAppointments: readonly Pick<Appointment, 'professionalId' | 'status'>[],
): Professional | null {
  if (candidates.length === 0) return null;

  const load = new Map<string, number>();
  for (const appointment of dayAppointments) {
    if (appointment.status === 'cancelado') continue;
    load.set(
      appointment.professionalId,
      (load.get(appointment.professionalId) ?? 0) + 1,
    );
  }

  return [...candidates].sort(
    (a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0),
  )[0];
}
