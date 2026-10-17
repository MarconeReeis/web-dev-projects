import {
  Appointment,
  AppointmentStatus,
  PaymentMethod,
} from '../models/appointment';
import { Cents, Id, IsoDateTime } from '../models/common';
import { FinanceEntry } from '../models/finance';
import { Professional } from '../models/professional';
import {
  DaySchedule,
  EMPTY_DAY,
  TimeBlock,
  TimeWindow,
  WeeklySchedule,
  workingDay,
} from '../models/schedule';
import { clockToMinutes, minutesToClock } from '../availability/availability';
import { Service } from '../models/service';
import { Tenant } from '../models/tenant';

/**
 * Dados de demonstração.
 *
 * Gerados em relação ao "agora", não fixos: assim a Dashboard sempre abre com
 * atendimentos já concluídos, um em andamento e os próximos ainda por vir.
 * Um seed estático envelhece em um dia e passa a impressão de app quebrado na
 * hora de mostrar o sistema para um cliente.
 *
 * Nada aqui vai para produção — é o conteúdo do "Modo demonstração".
 */

export const DEMO_TENANT_ID = 'demo-tenant';

export interface DemoDataset {
  readonly tenant: Tenant;
  readonly professionals: readonly Professional[];
  readonly services: readonly Service[];
  readonly appointments: readonly Appointment[];
  readonly entries: readonly FinanceEntry[];
  readonly blocks: readonly TimeBlock[];
  /** Dia que originou este conjunto; se mudar, regeramos. */
  readonly seededFor: string;
}

const SHOP_SCHEDULE: WeeklySchedule = {
  0: EMPTY_DAY,
  1: workingDay('09:00', '20:00', [{ start: '12:00', end: '13:00' }]),
  2: workingDay('09:00', '20:00', [{ start: '12:00', end: '13:00' }]),
  3: workingDay('09:00', '20:00', [{ start: '12:00', end: '13:00' }]),
  4: workingDay('09:00', '20:00', [{ start: '12:00', end: '13:00' }]),
  5: workingDay('09:00', '21:00', [{ start: '12:00', end: '13:00' }]),
  6: workingDay('08:00', '18:00'),
};

/** Hora do dia em que a grade de demonstração fica "no meio do movimento". */
const DEMO_ANCHOR_HOUR = 14;

/**
 * Limites do deslocamento, em minutos.
 *
 * A grade vai das 09:00 às 19:45 (início do último atendimento às 18:30 mais
 * 75 min). Deslocar além destes limites empurraria atendimentos para o dia
 * seguinte ou para antes da meia-noite — e eles sumiriam do período "hoje",
 * derrubando os indicadores. O dia tem de continuar fechado em si mesmo.
 */
const MAX_SHIFT_FORWARD = 24 * 60 - (19 * 60 + 45);
const MAX_SHIFT_BACKWARD = -(9 * 60);

/**
 * Deslocamento aplicado à grade do dia.
 *
 * Dentro do horário comercial, zero: os atendimentos ficam nos horários reais.
 * Fora dele — alguém abrindo a demonstração de madrugada, ou mostrando o
 * sistema para um cliente às 23h — a grade desliza para que "agora" caia no
 * meio do expediente. Sem isso, a Dashboard abre com o dia encerrado e a lista
 * de próximos vazia: a pior primeira impressão possível numa demonstração.
 */
function demoShiftMinutes(now: Date): number {
  const hour = now.getHours();
  if (hour >= 9 && hour < 19) return 0;

  const desired = hour * 60 + now.getMinutes() - DEMO_ANCHOR_HOUR * 60;
  return Math.max(MAX_SHIFT_BACKWARD, Math.min(MAX_SHIFT_FORWARD, desired));
}

function at(base: Date, hour: number, minute: number, shift = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return shift === 0 ? d : new Date(d.getTime() + shift * 60_000);
}

function iso(d: Date): IsoDateTime {
  return d.toISOString();
}

function plusMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}


/**
 * Desloca o expediente junto com a grade de atendimentos.
 *
 * Sem isso o deslocamento da demonstração criava uma incoerência visível: a
 * loja "fechava" às 20h com atendimentos marcados às 22h, as faixas de fora
 * do expediente apareciam por baixo dos cartões e o motor de disponibilidade
 * — corretamente — não oferecia horário nenhum.
 *
 * Expediente, atendimentos e bloqueios precisam andar juntos para o dia de
 * demonstração ser internamente coerente.
 */
function shiftSchedule(schedule: WeeklySchedule, minutes: number): WeeklySchedule {
  if (minutes === 0) return schedule;

  const shiftWindow = (window: TimeWindow): TimeWindow => ({
    start: minutesToClock(clamp(clockToMinutes(window.start) + minutes)),
    end: minutesToClock(clamp(clockToMinutes(window.end) + minutes)),
  });

  const shiftDay = (day: DaySchedule): DaySchedule =>
    day.working
      ? {
          working: true,
          windows: day.windows.map(shiftWindow),
          breaks: day.breaks.map(shiftWindow),
        }
      : day;

  const days = [0, 1, 2, 3, 4, 5, 6] as const;
  return Object.fromEntries(
    days.map((weekday) => [weekday, shiftDay(schedule[weekday])]),
  ) as unknown as WeeklySchedule;
}

function clamp(minutes: number): number {
  return Math.max(0, Math.min(24 * 60, minutes));
}

export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function buildDemoDataset(now: Date): DemoDataset {
  const stamp = iso(now);
  const shift = demoShiftMinutes(now);
  const schedule = shiftSchedule(SHOP_SCHEDULE, shift);

  const tenant: Tenant = {
    id: DEMO_TENANT_ID,
    slug: 'navalha-e-co',
    name: 'Navalha & Co.',
    phone: '(11) 98888-1234',
    address: {
      street: 'Rua Augusta',
      number: '1472',
      complement: 'Loja 3',
      district: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01304-001',
    },
    openingHours: schedule,
    branding: { logoUrl: null, primaryColor: null },
    subscription: 'trial',
    timeZone: 'America/Sao_Paulo',
    createdAt: stamp,
  };

  const services: Service[] = [
    svc('svc-corte', 'Corte', 'Corte na máquina ou tesoura, com finalização.', 45, 4500, stamp),
    svc('svc-barba', 'Barba', 'Toalha quente, navalha e hidratação.', 30, 3500, stamp),
    svc('svc-combo', 'Corte + Barba', 'O combo completo.', 75, 7000, stamp),
    svc('svc-acab', 'Acabamento', 'Pezinho e contorno.', 20, 2500, stamp),
  ];

  const allServiceIds = services.map((s) => s.id);

  const professionals: Professional[] = [
    pro('pro-rafael', 'Rafael Lima', '(11) 97777-0001', allServiceIds, stamp),
    pro('pro-diego', 'Diego Nunes', '(11) 97777-0002', allServiceIds, stamp),
    pro('pro-caio', 'Caio Prado', '(11) 97777-0003', ['svc-corte', 'svc-acab'], stamp),
    pro('pro-marcos', 'Marcos Vieira', null, ['svc-barba', 'svc-combo'], stamp, false),
  ];

  const active = professionals.filter((p) => p.active);

  // Grade do dia: cada profissional atende em horários cheios e meias-horas.
  const plan: ReadonlyArray<[proId: Id, hour: number, minute: number, svcId: Id, client: string, phone: string]> = [
    ['pro-rafael', 9, 0, 'svc-corte', 'Bruno Tavares', '(11) 99100-2201'],
    ['pro-diego', 9, 30, 'svc-combo', 'Henrique Sales', '(11) 99100-2202'],
    ['pro-caio', 9, 30, 'svc-acab', 'Leandro Dias', '(11) 99100-2203'],
    ['pro-rafael', 10, 0, 'svc-barba', 'Paulo Menezes', '(11) 99100-2204'],
    ['pro-caio', 10, 30, 'svc-corte', 'Vitor Andrade', '(11) 99100-2205'],
    ['pro-diego', 11, 0, 'svc-corte', 'Fernando Rocha', '(11) 99100-2206'],
    ['pro-rafael', 11, 0, 'svc-combo', 'Thiago Barros', '(11) 99100-2207'],
    ['pro-caio', 11, 30, 'svc-acab', 'Igor Peixoto', '(11) 99100-2208'],
    ['pro-diego', 13, 0, 'svc-barba', 'Rodrigo Freitas', '(11) 99100-2209'],
    ['pro-rafael', 13, 30, 'svc-corte', 'André Camargo', '(11) 99100-2210'],
    ['pro-caio', 14, 0, 'svc-corte', 'Gustavo Pinto', '(11) 99100-2211'],
    ['pro-diego', 14, 30, 'svc-combo', 'Wesley Moura', '(11) 99100-2212'],
    ['pro-rafael', 15, 0, 'svc-barba', 'Eduardo Nunes', '(11) 99100-2213'],
    ['pro-caio', 15, 30, 'svc-acab', 'Samuel Reis', '(11) 99100-2214'],
    ['pro-diego', 16, 0, 'svc-corte', 'Felipe Araújo', '(11) 99100-2215'],
    ['pro-rafael', 16, 30, 'svc-combo', 'Murilo Castro', '(11) 99100-2216'],
    ['pro-caio', 17, 0, 'svc-corte', 'Danilo Prado', '(11) 99100-2217'],
    ['pro-diego', 17, 30, 'svc-barba', 'Otávio Lins', '(11) 99100-2218'],
    ['pro-rafael', 18, 0, 'svc-corte', 'Renato Bastos', '(11) 99100-2219'],
    ['pro-caio', 18, 30, 'svc-combo', 'Alexandre Dutra', '(11) 99100-2220'],
  ];

  const appointments: Appointment[] = [];
  const entries: FinanceEntry[] = [];
  const methods: PaymentMethod[] = ['pix', 'dinheiro', 'cartao'];

  plan.forEach(([proId, hour, minute, svcId, clientName, phone], index) => {
    const service = services.find((s) => s.id === svcId)!;
    const startsAt = at(now, hour, minute, shift);
    const endsAt = plusMinutes(startsAt, service.durationMinutes);

    let status: AppointmentStatus;
    if (endsAt <= now) {
      // Um a cada sete vira falta: o estado precisa aparecer na demonstração.
      status = index % 7 === 3 ? 'nao_compareceu' : 'concluido';
    } else if (startsAt <= now) {
      status = 'em_atendimento';
    } else {
      status = 'agendado';
    }

    // Parte dos concluídos fica pendente — é o caso que alimenta o KPI
    // "Pagamentos pendentes" e o fluxo de registrar pagamento.
    const paid = status === 'concluido' && index % 4 !== 1;
    const method = methods[index % methods.length];
    const paidAt = paid ? iso(endsAt) : null;

    const appointment: Appointment = {
      id: `apt-${index + 1}`,
      tenantId: DEMO_TENANT_ID,
      professionalId: proId,
      serviceId: svcId,
      serviceName: service.name,
      client: { clientId: null, name: clientName, phone },
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      durationMinutes: service.durationMinutes,
      price: service.price,
      status,
      payment: {
        status: paid ? 'pago' : 'pendente',
        method: paid ? method : null,
        paidAt,
      },
      notes: index % 9 === 0 ? 'Cliente prefere máquina 2 nas laterais.' : null,
      createdAt: stamp,
      updatedAt: stamp,
    };

    appointments.push(appointment);

    if (paid && paidAt) {
      entries.push({
        id: `fin-apt-${index + 1}`,
        tenantId: DEMO_TENANT_ID,
        kind: 'recebimento',
        description: `${service.name} — ${clientName}`,
        amount: service.price,
        occurredAt: paidAt,
        method,
        appointmentId: appointment.id,
        professionalId: proId,
        category: null,
        createdAt: paidAt,
        updatedAt: paidAt,
      });
    }
  });

  entries.push(
    expense('fin-exp-1', 'Lâminas e navalhas', 4500, iso(at(now, 9, 15, shift)), 'produtos'),
    expense('fin-exp-2', 'Pomada modeladora (caixa)', 12000, iso(at(now, 10, 40, shift)), 'produtos'),
  );

  const blocks: TimeBlock[] = [
    {
      id: 'blk-1',
      tenantId: DEMO_TENANT_ID,
      professionalId: 'pro-diego',
      startsAt: iso(at(now, 12, 0, shift)),
      endsAt: iso(at(now, 13, 0, shift)),
      reason: 'Almoço',
    },
  ];

  return {
    tenant,
    professionals,
    services,
    appointments,
    entries,
    blocks,
    seededFor: todayKey(now),
  };

  function svc(
    id: Id,
    name: string,
    description: string,
    durationMinutes: number,
    price: Cents,
    ts: IsoDateTime,
  ): Service {
    return {
      id,
      tenantId: DEMO_TENANT_ID,
      name,
      description,
      durationMinutes,
      price,
      professionalIds: [],
      active: true,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  function pro(
    id: Id,
    name: string,
    phone: string | null,
    serviceIds: readonly Id[],
    ts: IsoDateTime,
    isActive = true,
  ): Professional {
    return {
      id,
      tenantId: DEMO_TENANT_ID,
      name,
      photoUrl: null,
      phone,
      serviceIds,
      schedule,
      active: isActive,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  function expense(
    id: Id,
    description: string,
    amount: Cents,
    occurredAt: IsoDateTime,
    category: FinanceEntry['category'],
  ): FinanceEntry {
    return {
      id,
      tenantId: DEMO_TENANT_ID,
      kind: 'despesa',
      description,
      amount,
      occurredAt,
      method: null,
      appointmentId: null,
      professionalId: null,
      category,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
  }
}

/** Profissionais ativos primeiro — a ordem que as telas usam. */
export function sortProfessionals(list: readonly Professional[]): Professional[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}
