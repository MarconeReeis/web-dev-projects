import { BusyInterval } from '../models/schedule';
import { BusyAppointment, BusyBlock } from './availability';

export interface SplitBusy {
  /** Com `id` quando conhecido — o reagendamento usa para ignorar o próprio. */
  readonly appointments: readonly (BusyAppointment & { readonly id: string | null })[];
  readonly blocks: readonly BusyBlock[];
}

/**
 * Separa os trechos ocupados no formato que o motor de disponibilidade usa.
 *
 * Todo agendamento que chega aqui ocupa o horário (o servidor só devolve os
 * que bloqueiam), então o status é o de "agendado" — basta para o cálculo,
 * e para o `leastBusy` contar atendimentos do dia.
 */
export function splitBusy(intervals: readonly BusyInterval[]): SplitBusy {
  const appointments: (BusyAppointment & { id: string | null })[] = [];
  const blocks: BusyBlock[] = [];

  for (const item of intervals) {
    if (item.kind === 'bloqueio') {
      blocks.push({ professionalId: item.professionalId, startsAt: item.startsAt, endsAt: item.endsAt });
    } else if (item.professionalId) {
      appointments.push({
        id: item.appointmentId,
        professionalId: item.professionalId,
        status: 'agendado',
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      });
    }
  }

  return { appointments, blocks };
}
