import { describe, expect, it } from 'vitest';

import { Appointment, AppointmentStatus } from '../models/appointment';
import { Id } from '../models/common';
import { Professional } from '../models/professional';
import { DaySchedule, EMPTY_DAY, TimeBlock, WeeklySchedule, workingDay } from '../models/schedule';
import { Service } from '../models/service';
import { availableSlots, expandWindows, hasConflict } from './availability';

/**
 * Datas fixas, construídas com `new Date(ano, mês, dia, hora, minuto)`.
 *
 * Construtor local, e não string ISO: o motor converte `ClockTime` contra o
 * fuso local, então o teste precisa falar a mesma língua. Com string ISO em
 * UTC, a suíte passaria na máquina de quem a escreveu e quebraria em outro
 * fuso — exatamente o tipo de teste que ninguém confia.
 *
 * 19/10/2026 é uma segunda-feira; 18/10/2026, um domingo.
 */
const MONDAY = new Date(2026, 9, 19);
const SUNDAY = new Date(2026, 9, 18);

const TENANT = 'tenant-teste';
const PRO_ID = 'pro-ze';
const OTHER_PRO_ID = 'pro-maria';

/** Segunda a sábado 09:00–18:00, com almoço das 12:00 às 13:00. */
const SCHEDULE: WeeklySchedule = {
  0: EMPTY_DAY,
  1: workingDay('09:00', '18:00', [{ start: '12:00', end: '13:00' }]),
  2: workingDay('09:00', '18:00', [{ start: '12:00', end: '13:00' }]),
  3: workingDay('09:00', '18:00', [{ start: '12:00', end: '13:00' }]),
  4: workingDay('09:00', '18:00', [{ start: '12:00', end: '13:00' }]),
  5: workingDay('09:00', '18:00', [{ start: '12:00', end: '13:00' }]),
  6: workingDay('09:00', '18:00', [{ start: '12:00', end: '13:00' }]),
};

const AUDIT = { createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' };

const PROFESSIONAL: Professional = {
  id: PRO_ID,
  tenantId: TENANT,
  name: 'Zé',
  photoUrl: null,
  phone: null,
  serviceIds: ['svc-corte'],
  schedule: SCHEDULE,
  active: true,
  ...AUDIT,
};

function service(durationMinutes: number): Service {
  return {
    id: 'svc-corte',
    tenantId: TENANT,
    name: 'Corte',
    description: null,
    durationMinutes,
    price: 4500,
    professionalIds: [PRO_ID],
    active: true,
    ...AUDIT,
  };
}

/** Hora do dia de um horário retornado, para asserções legíveis ("09:15"). */
function hhmm(instant: string): string {
  const d = new Date(instant);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function at(day: Date, hour: number, minute = 0): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function appointment(options: {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status?: AppointmentStatus;
  readonly professionalId?: Id;
}): Appointment {
  const startsAt = options.startsAt.toISOString();
  const endsAt = options.endsAt.toISOString();
  return {
    id: `ap-${startsAt}`,
    tenantId: TENANT,
    professionalId: options.professionalId ?? PRO_ID,
    serviceId: 'svc-corte',
    serviceName: 'Corte',
    client: { clientId: null, name: 'Cliente', phone: null },
    startsAt,
    endsAt,
    durationMinutes: Math.round((options.endsAt.getTime() - options.startsAt.getTime()) / 60000),
    price: 4500,
    status: options.status ?? 'agendado',
    payment: { status: 'pendente', method: null, paidAt: null },
    notes: null,
    ...AUDIT,
  };
}

function block(options: {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly professionalId: Id | null;
}): TimeBlock {
  return {
    id: 'bl-1',
    tenantId: TENANT,
    professionalId: options.professionalId,
    startsAt: options.startsAt.toISOString(),
    endsAt: options.endsAt.toISOString(),
    reason: 'Folga',
  };
}

describe('expandWindows', () => {
  it('parte a janela em duas ao aplicar o intervalo do almoço', () => {
    const day = workingDay('09:00', '18:00', [{ start: '12:00', end: '13:00' }]);

    expect(expandWindows(day)).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '18:00' },
    ]);
  });

  it('devolve a janela intacta quando não há intervalos', () => {
    expect(expandWindows(workingDay('08:00', '18:00'))).toEqual([{ start: '08:00', end: '18:00' }]);
  });

  it('apenas apara quando o intervalo encosta na borda da janela', () => {
    const day = workingDay('09:00', '18:00', [{ start: '09:00', end: '10:00' }]);

    expect(expandWindows(day)).toEqual([{ start: '10:00', end: '18:00' }]);
  });

  it('aplica vários intervalos, mesmo fora de ordem', () => {
    const day = workingDay('09:00', '18:00', [
      { start: '15:00', end: '15:30' },
      { start: '12:00', end: '13:00' },
    ]);

    expect(expandWindows(day)).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '15:00' },
      { start: '15:30', end: '18:00' },
    ]);
  });

  it('some com a janela coberta inteira por um intervalo', () => {
    const day = workingDay('09:00', '10:00', [{ start: '08:00', end: '11:00' }]);

    expect(expandWindows(day)).toEqual([]);
  });

  it('preserva as duas janelas de quem fecha para o almoço', () => {
    const day: DaySchedule = {
      working: true,
      windows: [
        { start: '09:00', end: '12:00' },
        { start: '14:00', end: '19:00' },
      ],
      breaks: [{ start: '16:00', end: '16:15' }],
    };

    expect(expandWindows(day)).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '14:00', end: '16:00' },
      { start: '16:15', end: '19:00' },
    ]);
  });

  it('devolve vazio em dia não-útil', () => {
    expect(expandWindows(EMPTY_DAY)).toEqual([]);
  });
});

describe('hasConflict', () => {
  const candidate = {
    startsAt: at(MONDAY, 10).toISOString(),
    endsAt: at(MONDAY, 10, 30).toISOString(),
    professionalId: PRO_ID,
  };

  it('acusa sobreposição parcial com atendimento agendado', () => {
    const existing = [appointment({ startsAt: at(MONDAY, 10, 15), endsAt: at(MONDAY, 10, 45) })];

    expect(hasConflict(candidate, existing, [])).toBe(true);
  });

  it('não acusa conflito quando um termina exatamente onde o outro começa', () => {
    const antes = appointment({ startsAt: at(MONDAY, 9, 30), endsAt: at(MONDAY, 10) });
    const depois = appointment({ startsAt: at(MONDAY, 10, 30), endsAt: at(MONDAY, 11) });

    expect(hasConflict(candidate, [antes, depois], [])).toBe(false);
  });

  it.each<AppointmentStatus>(['agendado', 'em_atendimento', 'concluido'])(
    'status %s ocupa o horário',
    (status) => {
      const existing = [
        appointment({ startsAt: at(MONDAY, 10), endsAt: at(MONDAY, 10, 30), status }),
      ];

      expect(hasConflict(candidate, existing, [])).toBe(true);
    },
  );

  it.each<AppointmentStatus>(['cancelado', 'nao_compareceu'])(
    'status %s libera o horário',
    (status) => {
      const existing = [
        appointment({ startsAt: at(MONDAY, 10), endsAt: at(MONDAY, 10, 30), status }),
      ];

      expect(hasConflict(candidate, existing, [])).toBe(false);
    },
  );

  it('ignora atendimento de outro profissional no mesmo horário', () => {
    const existing = [
      appointment({
        startsAt: at(MONDAY, 10),
        endsAt: at(MONDAY, 10, 30),
        professionalId: OTHER_PRO_ID,
      }),
    ];

    expect(hasConflict(candidate, existing, [])).toBe(false);
  });

  it('respeita bloqueio do próprio profissional', () => {
    const blocks = [
      block({ startsAt: at(MONDAY, 9), endsAt: at(MONDAY, 12), professionalId: PRO_ID }),
    ];

    expect(hasConflict(candidate, [], blocks)).toBe(true);
  });

  it('bloqueio da barbearia inteira (professionalId nulo) atinge todos', () => {
    const blocks = [
      block({ startsAt: at(MONDAY, 9), endsAt: at(MONDAY, 12), professionalId: null }),
    ];

    expect(hasConflict(candidate, [], blocks)).toBe(true);
    expect(hasConflict({ ...candidate, professionalId: OTHER_PRO_ID }, [], blocks)).toBe(true);
  });

  it('ignora bloqueio de outro profissional', () => {
    const blocks = [
      block({ startsAt: at(MONDAY, 9), endsAt: at(MONDAY, 12), professionalId: OTHER_PRO_ID }),
    ];

    expect(hasConflict(candidate, [], blocks)).toBe(false);
  });

  it('não acusa conflito com bloqueio que termina na hora de começar', () => {
    const blocks = [
      block({ startsAt: at(MONDAY, 9), endsAt: at(MONDAY, 10), professionalId: PRO_ID }),
    ];

    expect(hasConflict(candidate, [], blocks)).toBe(false);
  });
});

describe('availableSlots', () => {
  function slots(
    options: {
      readonly date?: Date;
      readonly durationMinutes?: number;
      readonly existing?: readonly Appointment[];
      readonly blocks?: readonly TimeBlock[];
      readonly now?: Date;
      readonly granularityMinutes?: number;
    } = {},
  ): string[] {
    return availableSlots({
      date: options.date ?? MONDAY,
      professional: PROFESSIONAL,
      service: service(options.durationMinutes ?? 30),
      existing: options.existing ?? [],
      blocks: options.blocks ?? [],
      now: options.now,
      granularityMinutes: options.granularityMinutes,
    }).map(hhmm);
  }

  it('devolve vazio em dia não-útil', () => {
    expect(slots({ date: SUNDAY })).toEqual([]);
  });

  it('usa granularidade de 15 minutos por padrão', () => {
    expect(slots().slice(0, 4)).toEqual(['09:00', '09:15', '09:30', '09:45']);
  });

  it('não oferece horário cujo atendimento ultrapassaria o fim do expediente', () => {
    // Expediente até 18:00, atendimento de 45 min: o último início possível é
    // 17:15. 17:30 e 17:45 terminariam com a barbearia fechada.
    const grade = slots({ durationMinutes: 45 });

    expect(grade.at(-1)).toBe('17:15');
    expect(grade).not.toContain('17:30');
    expect(grade).not.toContain('17:45');
  });

  it('não oferece horário cujo atendimento cairia em cima do almoço', () => {
    // Almoço 12:00–13:00. Com 30 min, 11:30 é o último que cabe antes dele, e
    // a grade retoma às 13:00.
    const grade = slots();

    expect(grade).toContain('11:30');
    expect(grade).not.toContain('11:45');
    expect(grade).not.toContain('12:00');
    expect(grade).not.toContain('12:30');
    expect(grade).toContain('13:00');
  });

  it('retira os horários ocupados por atendimento agendado', () => {
    const existing = [appointment({ startsAt: at(MONDAY, 10), endsAt: at(MONDAY, 10, 30) })];
    const grade = slots({ existing });

    expect(grade).not.toContain('09:45');
    expect(grade).not.toContain('10:00');
    expect(grade).not.toContain('10:15');
    expect(grade).toContain('09:30');
    expect(grade).toContain('10:30');
  });

  it('mantém o horário de atendimento cancelado ou com falta', () => {
    const cancelado = appointment({
      startsAt: at(MONDAY, 10),
      endsAt: at(MONDAY, 10, 30),
      status: 'cancelado',
    });
    const faltou = appointment({
      startsAt: at(MONDAY, 11),
      endsAt: at(MONDAY, 11, 30),
      status: 'nao_compareceu',
    });

    const grade = slots({ existing: [cancelado, faltou] });

    expect(grade).toContain('10:00');
    expect(grade).toContain('11:00');
  });

  it('ignora a agenda de outro profissional', () => {
    const existing = [
      appointment({
        startsAt: at(MONDAY, 10),
        endsAt: at(MONDAY, 10, 30),
        professionalId: OTHER_PRO_ID,
      }),
    ];

    expect(slots({ existing })).toContain('10:00');
  });

  it('bloqueio da barbearia inteira esvazia o dia', () => {
    const blocks = [
      block({ startsAt: at(MONDAY, 0), endsAt: at(MONDAY, 23, 59), professionalId: null }),
    ];

    expect(slots({ blocks })).toEqual([]);
  });

  it('bloqueio parcial da barbearia tira só a faixa bloqueada', () => {
    const blocks = [
      block({ startsAt: at(MONDAY, 9), endsAt: at(MONDAY, 10), professionalId: null }),
    ];
    const grade = slots({ blocks });

    expect(grade).not.toContain('09:00');
    expect(grade).not.toContain('09:45');
    expect(grade[0]).toBe('10:00');
  });

  it('oferece o horário que começa exatamente quando o anterior termina', () => {
    const existing = [appointment({ startsAt: at(MONDAY, 9, 30), endsAt: at(MONDAY, 10) })];

    expect(slots({ existing })).toContain('10:00');
  });

  it('remove os horários já vencidos quando o dia é hoje', () => {
    const grade = slots({ now: at(MONDAY, 10, 7) });

    expect(grade).not.toContain('09:00');
    expect(grade).not.toContain('10:00');
    expect(grade[0]).toBe('10:15');
  });

  it('mantém o horário que começa exatamente agora', () => {
    expect(slots({ now: at(MONDAY, 10) })[0]).toBe('10:00');
  });

  it('não corta nada quando o dia consultado ainda está por vir', () => {
    // Sexta 23h consultando a segunda: nada do dia consultado está no passado.
    const grade = slots({ now: new Date(2026, 9, 16, 23) });

    expect(grade[0]).toBe('09:00');
  });

  it('respeita granularidade customizada', () => {
    expect(slots({ granularityMinutes: 60, durationMinutes: 60 }).slice(0, 3)).toEqual([
      '09:00',
      '10:00',
      '11:00',
    ]);
  });

  it('devolve vazio para serviço com duração maior que qualquer bloco de trabalho', () => {
    // 09:00–12:00 e 13:00–18:00: nenhum bloco acomoda 6 horas seguidas.
    expect(slots({ durationMinutes: 360 })).toEqual([]);
  });
});
