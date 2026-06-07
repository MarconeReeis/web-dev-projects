import { AppointmentStatus } from '../../shared/models/business.model';

export interface FirestoreProfessionalDoc {
  name: string;
  initials: string;
  specialty: string;
  experienceYears: number;
  avgDurationMinutes: number;
  rating: number;
  active: boolean;
}

export interface FirestoreServiceDoc {
  professionalId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
}

export interface FirestoreBookingDoc {
  professionalId: string;
  professionalName: string;
  professionalInitials: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  price: number;
  date: string;
  time: string;
  dateLabel: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string;
  customerEmail: string;
  status: AppointmentStatus;
  createdAt?: unknown;
}

export const WORKING_TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30',
];

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function parseBookingDateTime(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Agendamento é "próximo" enquanto o horário de término (início + duração) não passou */
export function isUpcomingBooking(
  dateKey: string,
  time: string,
  durationMinutes = 0
): boolean {
  const start = parseBookingDateTime(dateKey, time);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return end.getTime() > Date.now();
}

/** Horário já passou (usado para bloquear slots no dia atual) */
export function isPastTimeSlot(dateKey: string, time: string): boolean {
  return parseBookingDateTime(dateKey, time).getTime() <= Date.now();
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatAppointmentDateLabel(dateKey: string, time: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
    .format(date)
    .split('-')[0];
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(date)
    .replace('.', '');
  return `${weekday}, ${String(d).padStart(2, '0')} de ${month} · ${time}`;
}

export function generateDateRange(from: Date, days: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function formatBookingDisplayId(docId: string): string {
  return `#${docId.slice(-6).toUpperCase()}`;
}
