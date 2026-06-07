import { Observable } from 'rxjs';
import { Appointment } from '../../shared/models/business.model';

/**
 * Contrato de dados de agendamentos do cliente.
 * Implementações: MockAppointmentRepository (atual) → FirebaseAppointmentRepository (futuro)
 */
export abstract class AppointmentRepository {
  abstract getUpcoming(): Observable<Appointment[]>;

  abstract getHistory(): Observable<Appointment[]>;

  abstract cancelAppointment(id: string): Observable<void>;

  abstract addUpcoming(appointment: Appointment): Observable<void>;
}
