import { Signal, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Appointment, AppointmentRepository } from '@atrio/data';
import { map, switchMap } from 'rxjs';
import { clientWindow } from './appointment-rules';

/**
 * Um agendamento pelo id — desde que seja da conta aberta.
 *
 * A busca passa pela lista do próprio cliente, e não por "pegue o id X":
 * com o id na URL, qualquer um que o soubesse abriria e cancelaria o
 * horário de outra pessoa. No Firebase, quem garante isso são as regras de
 * segurança; aqui, a própria consulta.
 *
 * `undefined` enquanto carrega; `null` quando não existe ou não é seu — as
 * duas coisas se mostram iguais, de propósito.
 */
export function ownAppointment(id: Signal<string>): Signal<Appointment | null | undefined> {
  const repository = inject(AppointmentRepository);

  return toSignal(
    toObservable(id).pipe(
      switchMap((wanted) =>
        repository
          .watchMine(clientWindow())
          .pipe(map((list) => list.find((item) => item.id === wanted) ?? null)),
      ),
    ),
    { initialValue: undefined },
  );
}
