import { Appointment } from '../../shared/models/business.model';
import { BookingConfirmation, Professional, Service } from '../../shared/models/booking.model';
import {
  FirestoreBookingDoc,
  FirestoreProfessionalDoc,
  FirestoreServiceDoc,
  formatAppointmentDateLabel,
  formatBookingDisplayId,
} from './firestore.models';

export function mapProfessional(id: string, data: FirestoreProfessionalDoc): Professional {
  return {
    id,
    name: data.name,
    initials: data.initials,
    specialty: data.specialty,
    experienceYears: data.experienceYears,
    avgDurationMinutes: data.avgDurationMinutes,
    rating: data.rating,
  };
}

export function mapService(id: string, data: FirestoreServiceDoc): Service {
  return {
    id,
    professionalId: data.professionalId,
    name: data.name,
    description: data.description,
    price: data.price,
    durationMinutes: data.durationMinutes,
  };
}

export function mapBookingToAppointment(id: string, data: FirestoreBookingDoc): Appointment {
  return {
    id,
    serviceName: data.serviceName,
    professionalName: data.professionalName,
    professionalInitials: data.professionalInitials,
    dateLabel: formatAppointmentDateLabel(data.date, data.time),
    status: data.status,
  };
}

export function mapBookingConfirmation(
  id: string,
  data: FirestoreBookingDoc,
  professional: Professional,
  service: Service
): BookingConfirmation {
  return {
    id: formatBookingDisplayId(id),
    professional,
    service,
    date: data.date,
    time: data.time,
    dateLabel: data.dateLabel,
    total: data.price,
  };
}
