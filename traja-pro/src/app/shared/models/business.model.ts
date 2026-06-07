export interface Business {
  initials: string;
  category: string;
  name: string;
  address: string;
  hours: string;
  instagram: string;
  phone: string;
}

export interface Appointment {
  id: string;
  serviceName: string;
  professionalName: string;
  professionalInitials: string;
  dateLabel: string;
  status: AppointmentStatus;
}

export type AppointmentStatus = 'confirmed' | 'pending' | 'cancelled';

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmado',
  pending: 'Pendente',
  cancelled: 'Cancelado',
};
