import { Appointment } from '../../shared/models/business.model';

export const MOCK_UPCOMING_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-1',
    serviceName: 'Corte Masculino',
    professionalName: 'João Silva',
    professionalInitials: 'JS',
    dateLabel: 'segunda, 08 de jun · 11:00',
    status: 'confirmed',
  },
  {
    id: 'apt-2',
    serviceName: 'Combo Corte + Barba',
    professionalName: 'João Silva',
    professionalInitials: 'JS',
    dateLabel: 'sábado, 06 de jun · 14:30',
    status: 'confirmed',
  },
];

export const MOCK_HISTORY_APPOINTMENTS: Appointment[] = [];
