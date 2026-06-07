import { Observable } from 'rxjs';
import {
  BookingConfirmation,
  BookingDraft,
  Professional,
  Service,
  TimeSlot,
} from '../../shared/models/booking.model';

/**
 * Contrato de dados do agendamento.
 * Implementações: MockBookingRepository (atual) → FirebaseBookingRepository (futuro)
 */
export abstract class BookingRepository {
  abstract getProfessionals(): Observable<Professional[]>;

  abstract getServicesByProfessional(professionalId: string): Observable<Service[]>;

  abstract getAvailableDates(from: Date, days: number): Observable<string[]>;

  abstract getAvailableTimeSlots(
    professionalId: string,
    serviceId: string,
    date: string
  ): Observable<TimeSlot[]>;

  abstract createBooking(draft: BookingDraft): Observable<BookingConfirmation>;
}
