import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  BookingConfirmation,
  BookingDraft,
  Professional,
  Service,
  TimeSlot,
} from '../../shared/models/booking.model';
import {
  FirestoreBookingDoc,
  FirestoreProfessionalDoc,
  FirestoreServiceDoc,
  WORKING_TIME_SLOTS,
  formatDateLabel,
  generateDateRange,
  isPastTimeSlot,
  normalizePhone,
} from '../firebase/firestore.models';
import {
  mapBookingConfirmation,
  mapProfessional,
  mapService,
} from '../firebase/firestore.mappers';
import {
  bookingsPath,
  professionalsPath,
  servicesPath,
} from '../firebase/firestore.paths';
import { BookingRepository } from './booking.repository';

@Injectable({ providedIn: 'root' })
export class FirebaseBookingRepository extends BookingRepository {
  private readonly firestore = inject(Firestore);

  getProfessionals(): Observable<Professional[]> {
    const ref = collection(this.firestore, professionalsPath());
    const q = query(ref, where('active', '==', true));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs.map((doc) =>
          mapProfessional(doc.id, doc.data() as FirestoreProfessionalDoc)
        )
      )
    );
  }

  getServicesByProfessional(professionalId: string): Observable<Service[]> {
    const ref = collection(this.firestore, servicesPath());
    const q = query(
      ref,
      where('professionalId', '==', professionalId),
      where('active', '==', true)
    );

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs.map((doc) =>
          mapService(doc.id, doc.data() as FirestoreServiceDoc)
        )
      )
    );
  }

  getAvailableDates(fromDate: Date, days: number): Observable<string[]> {
    return from(Promise.resolve(generateDateRange(fromDate, days)));
  }

  getAvailableTimeSlots(
    professionalId: string,
    _serviceId: string,
    date: string
  ): Observable<TimeSlot[]> {
    const ref = collection(this.firestore, bookingsPath());
    const q = query(
      ref,
      where('professionalId', '==', professionalId),
      where('date', '==', date)
    );

    return from(getDocs(q)).pipe(
      map((snapshot) => {
        const bookedTimes = snapshot.docs
          .map((item) => item.data() as FirestoreBookingDoc)
          .filter((b) => b.status === 'confirmed' || b.status === 'pending')
          .map((b) => b.time);

        return WORKING_TIME_SLOTS.map((time) => ({
          time,
          available:
            !bookedTimes.includes(time) && !isPastTimeSlot(date, time),
        }));
      })
    );
  }

  createBooking(draft: BookingDraft): Observable<BookingConfirmation> {
    if (!draft.professional || !draft.service || !draft.date || !draft.time) {
      throw new Error('Dados incompletos para criar agendamento');
    }

    if (isPastTimeSlot(draft.date, draft.time)) {
      throw new Error('Este horário já passou. Escolha outro horário disponível.');
    }

    const bookingData: FirestoreBookingDoc = {
      professionalId: draft.professional.id,
      professionalName: draft.professional.name,
      professionalInitials: draft.professional.initials,
      serviceId: draft.service.id,
      serviceName: draft.service.name,
      durationMinutes: draft.service.durationMinutes,
      price: draft.service.price,
      date: draft.date,
      time: draft.time,
      dateLabel: formatDateLabel(draft.date),
      customerName: draft.customer.fullName.trim(),
      customerPhone: normalizePhone(draft.customer.phone),
      customerWhatsapp: normalizePhone(draft.customer.whatsapp),
      customerEmail: draft.customer.email.trim(),
      status: 'confirmed',
      createdAt: serverTimestamp(),
    };

    const ref = collection(this.firestore, bookingsPath());

    return from(addDoc(ref, bookingData)).pipe(
      map((docRef) =>
        mapBookingConfirmation(
          docRef.id,
          bookingData,
          draft.professional!,
          draft.service!
        )
      )
    );
  }
}
