import { Appointment, DateRange, addDays, shopDay, shopInstant } from '@atrio/data';
import { AtrBadgeTone } from '@atrio/ui';

/**
 * Regras dos horários do cliente, num lugar só: a lista, os detalhes e o
 * reagendamento precisam concordar sobre o que pode ser mudado.
 */

/** Janela consultada: três meses para trás, quatro para frente. */
const PAST_DAYS = 90;
const AHEAD_DAYS = 120;

/**
 * Antecedência mínima para o cliente cancelar ou reagendar sozinho.
 *
 * Sem regra, a pessoa desmarca cinco minutos antes e a cadeira fica vazia
 * sem chance de reocupar. Com duas horas, a barbearia ainda consegue encaixar
 * alguém — e quem precisa mudar em cima da hora liga, que é o que já acontece
 * hoje. Reagendar segue a mesma regra porque, para a agenda, é um
 * cancelamento seguido de uma marcação.
 */
export const CHANGE_LIMIT_HOURS = 2;

export const STATUS_TONE: Readonly<Record<Appointment['status'], AtrBadgeTone>> = {
  pendente: 'warning',
  agendado: 'primary',
  em_atendimento: 'primary',
  concluido: 'success',
  cancelado: 'destructive',
  nao_compareceu: 'warning',
};

/** Ainda dá para desistir de um pedido pelo app? Mesma antecedência. */
export function canWithdraw(appointment: Appointment, now = Date.now()): boolean {
  if (appointment.status !== 'pendente') return false;
  return new Date(appointment.startsAt).getTime() > now + CHANGE_LIMIT_HOURS * 3_600_000;
}

/** Ainda dá para cancelar ou reagendar pelo app? */
export function canChange(appointment: Appointment, now = Date.now()): boolean {
  if (appointment.status !== 'agendado') return false;
  return new Date(appointment.startsAt).getTime() > now + CHANGE_LIMIT_HOURS * 3_600_000;
}

export function clientWindow(): DateRange {
  const today = shopDay();
  return {
    from: shopInstant(addDays(today, -PAST_DAYS)).toISOString(),
    to: shopInstant(addDays(today, AHEAD_DAYS)).toISOString(),
  };
}
