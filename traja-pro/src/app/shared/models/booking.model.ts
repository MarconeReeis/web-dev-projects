export interface Professional {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  experienceYears: number;
  avgDurationMinutes: number;
  rating: number;
}

export interface Service {
  id: string;
  professionalId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface BookingCustomer {
  fullName: string;
  phone: string;
  whatsapp: string;
  email: string;
}

export interface BookingDraft {
  professional: Professional | null;
  service: Service | null;
  date: string | null;
  time: string | null;
  customer: BookingCustomer;
}

export interface BookingConfirmation {
  id: string;
  professional: Professional;
  service: Service;
  date: string;
  time: string;
  dateLabel: string;
  total: number;
}

export type BookingStep = 1 | 2 | 3 | 4 | 5;

export const BOOKING_STEPS_TOTAL = 4;

export const EMPTY_CUSTOMER: BookingCustomer = {
  fullName: '',
  phone: '',
  whatsapp: '',
  email: '',
};

export const EMPTY_BOOKING_DRAFT: BookingDraft = {
  professional: null,
  service: null,
  date: null,
  time: null,
  customer: { ...EMPTY_CUSTOMER },
};
