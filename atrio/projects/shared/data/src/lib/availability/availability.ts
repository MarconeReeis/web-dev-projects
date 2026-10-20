import { Appointment, BLOCKING_STATUSES } from '../models/appointment';
import { ClockTime, Id, IsoDateTime } from '../models/common';
import { Professional } from '../models/professional';
import { DaySchedule, TimeBlock, TimeWindow, Weekday } from '../models/schedule';
import { Service } from '../models/service';
import { shopInstant } from '../period';

/**
 * Motor de disponibilidade: funções puras, sem Angular e sem RxJS.
 *
 * Mesma lógica em dois lugares, de propósito: a tela usa para mostrar os
 * horários livres, e a Cloud Function de agendamento usa para validar a
 * marcação dentro da transação. A validação que vale é a do servidor — dois
 * celulares marcando ao mesmo tempo passam os dois por qualquer checagem
 * local. Manter isto como função pura é o que permite rodar o mesmo código nos
 * dois lados sem arrastar a camada de apresentação para dentro do backend.
 *
 * Convenções herdadas do domínio:
 *
 * - todo intervalo é `[início, fim)`, fim exclusivo. É o que faz o atendimento
 *   que termina 10:00 conviver com o que começa 10:00;
 * - `ClockTime` ("09:00") é hora local do estabelecimento e nunca carrega
 *   fuso; a conversão para instante acontece aqui, contra a data do dia;
 * - a saída é `IsoDateTime`, como o resto do sistema.
 *
 * A conversão de "09:00" para instante usa o fuso da barbearia
 * (`shopInstant`, ver period.ts), não o do aparelho — e `date` é um DIA
 * daquele arquivo: só ano, mês e dia importam.
 */

/** Passo padrão da grade de horários, em minutos. */
export const DEFAULT_GRANULARITY_MINUTES = 15;

/** O que se quer marcar, antes de existir como `Appointment`. */
export interface ConflictCandidate {
  readonly startsAt: IsoDateTime;
  readonly endsAt: IsoDateTime;
  readonly professionalId: Id;
}

/**
 * O mínimo que o cálculo precisa de um atendimento: de quem, quando, e se
 * ainda ocupa o horário. Aceitar só isso — e não o `Appointment` inteiro —
 * é o que permite calcular sobre horários ocupados sem ver nome nem
 * telefone de ninguém (ver BusyInterval).
 */
export type BusyAppointment = Pick<Appointment, 'professionalId' | 'status' | 'startsAt' | 'endsAt'>;

/** Idem para bloqueio: o motivo não entra na conta. */
export type BusyBlock = Pick<TimeBlock, 'professionalId' | 'startsAt' | 'endsAt'>;

export interface AvailabilityParams {
  /** Dia a consultar; só a parte de calendário importa, a hora é ignorada. */
  readonly date: Date;
  readonly professional: Professional;
  readonly service: Service;
  readonly existing: readonly BusyAppointment[];
  readonly blocks: readonly BusyBlock[];
  /** Instante atual. Passado, remove os horários que já vencerem. */
  readonly now?: Date;
  readonly granularityMinutes?: number;
}

/** Faixa em minutos desde a meia-noite local — a unidade de conta interna. */
interface MinuteRange {
  readonly start: number;
  readonly end: number;
}

/** "09:30" → 570. Aceita "24:00" como fim do dia. */
export function clockToMinutes(time: ClockTime): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** 570 → "09:30". */
export function minutesToClock(minutes: number): ClockTime {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Blocos de trabalho efetivos do dia: as janelas menos os intervalos.
 *
 * Um intervalo no meio de uma janela a parte em duas — é o almoço cortando o
 * expediente 09:00–18:00 em 09:00–12:00 e 13:00–18:00. O resto do motor só
 * olha para o resultado disto, então nenhuma outra função precisa saber que
 * `breaks` existe.
 *
 * Dia não-útil devolve lista vazia: não há expediente de onde subtrair.
 */
export function expandWindows(day: DaySchedule): TimeWindow[] {
  if (!day.working) return [];

  // Ordenados porque a subtração é aplicada em sequência sobre os pedaços já
  // recortados; fora de ordem, um intervalo anterior reencontraria pedaços que
  // outro acabou de criar e o resultado deixaria de ser estável.
  const breaks = day.breaks
    .map(toMinuteRange)
    .filter(isPositive)
    .sort((a, b) => a.start - b.start);

  const effective: TimeWindow[] = [];

  for (const window of day.windows) {
    let pieces = [toMinuteRange(window)].filter(isPositive);
    for (const pause of breaks) {
      pieces = pieces.flatMap((piece) => subtract(piece, pause));
    }
    effective.push(...pieces.map(toTimeWindow));
  }

  return effective;
}

/**
 * O candidato colide com algo que já ocupa a agenda?
 *
 * Só status em `BLOCKING_STATUSES` bloqueiam: horário de atendimento cancelado
 * ou de cliente que não compareceu volta a ser vendável, e não liberá-lo
 * custaria faturamento à barbearia.
 *
 * `TimeBlock` com `professionalId` nulo é bloqueio da barbearia inteira
 * (feriado, manutenção) e derruba o horário de todos.
 */
export function hasConflict(
  candidate: ConflictCandidate,
  existing: readonly BusyAppointment[],
  blocks: readonly BusyBlock[],
): boolean {
  const start = Date.parse(candidate.startsAt);
  const end = Date.parse(candidate.endsAt);

  const taken = existing.some(
    (appointment) =>
      appointment.professionalId === candidate.professionalId &&
      BLOCKING_STATUSES.includes(appointment.status) &&
      overlaps(start, end, Date.parse(appointment.startsAt), Date.parse(appointment.endsAt)),
  );
  if (taken) return true;

  return blocks.some(
    (block) =>
      (block.professionalId === null || block.professionalId === candidate.professionalId) &&
      overlaps(start, end, Date.parse(block.startsAt), Date.parse(block.endsAt)),
  );
}

/**
 * Horários em que este serviço pode começar, neste dia, com este profissional.
 *
 * O critério é o atendimento INTEIRO caber: início mais `durationMinutes`
 * dentro de um único bloco de trabalho e sem conflito. Oferecer um horário por
 * caber só o começo é o bug que faz a barbearia fechar depois da hora.
 *
 * A grade é contada a partir do início de cada bloco, não da meia-noite: um
 * bloco que começa 13:00 depois do almoço oferece 13:00, 13:15, 13:30 — e um
 * que começasse 09:10 ofereceria 09:10, 09:25. O começo do expediente é o que
 * a pessoa espera ver como primeiro horário.
 */
export function availableSlots(params: AvailabilityParams): IsoDateTime[] {
  const { date, professional, service, existing, blocks, now } = params;
  const granularity = params.granularityMinutes ?? DEFAULT_GRANULARITY_MINUTES;
  const duration = service.durationMinutes;

  // Duração ou passo não-positivos gerariam laço infinito ou grade sem
  // sentido. Devolver vazio é melhor que travar a tela.
  if (duration <= 0 || granularity <= 0) return [];

  const day = professional.schedule[date.getDay() as Weekday];
  if (!day?.working) return [];

  const slots: IsoDateTime[] = [];

  for (const window of expandWindows(day)) {
    const from = clockToMinutes(window.start);
    // Último início que ainda termina dentro do bloco.
    const latest = clockToMinutes(window.end) - duration;

    for (let minute = from; minute <= latest; minute += granularity) {
      const startsAt = shopInstant(date, minute);

      // Horário já vencido não se vende. A comparação é por instante, e não
      // "só quando `date` é hoje", porque um dia passado também não tem
      // horário livre nenhum — e o `<` deixa passar o slot que começa
      // exatamente agora.
      if (now && startsAt.getTime() < now.getTime()) continue;

      const endsAt = shopInstant(date, minute + duration);
      const candidate: ConflictCandidate = {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        professionalId: professional.id,
      };
      if (hasConflict(candidate, existing, blocks)) continue;

      slots.push(candidate.startsAt);
    }
  }

  return slots;
}

/** Sobreposição de `[início, fim)`: encosto exato não conta. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function toMinuteRange(window: TimeWindow): MinuteRange {
  return { start: clockToMinutes(window.start), end: clockToMinutes(window.end) };
}

function toTimeWindow(range: MinuteRange): TimeWindow {
  return { start: minutesToClock(range.start), end: minutesToClock(range.end) };
}

function isPositive(range: MinuteRange): boolean {
  return range.end > range.start;
}

/** `piece` menos `pause`: devolve zero, um ou dois pedaços. */
function subtract(piece: MinuteRange, pause: MinuteRange): MinuteRange[] {
  if (pause.end <= piece.start || pause.start >= piece.end) return [piece];

  const rest: MinuteRange[] = [];
  if (pause.start > piece.start) rest.push({ start: piece.start, end: pause.start });
  if (pause.end < piece.end) rest.push({ start: pause.end, end: piece.end });
  return rest;
}
