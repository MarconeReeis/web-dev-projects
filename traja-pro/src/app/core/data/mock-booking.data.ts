import { Professional, Service } from '../../shared/models/booking.model';

export const MOCK_PROFESSIONALS: Professional[] = [
  {
    id: 'prof-1',
    name: 'João Silva',
    initials: 'JS',
    specialty: 'Barbeiro Especialista',
    experienceYears: 15,
    avgDurationMinutes: 35,
    rating: 4.9,
  },
  {
    id: 'prof-2',
    name: 'Rafael Costa',
    initials: 'RC',
    specialty: 'Barbeiro & Designer',
    experienceYears: 8,
    avgDurationMinutes: 40,
    rating: 4.8,
  },
  {
    id: 'prof-3',
    name: 'Pedro Alves',
    initials: 'PA',
    specialty: 'Barbeiro Clássico',
    experienceYears: 12,
    avgDurationMinutes: 30,
    rating: 4.7,
  },
  {
    id: 'prof-4',
    name: 'Lucas Mendes',
    initials: 'LM',
    specialty: 'Especialista em Barba',
    experienceYears: 6,
    avgDurationMinutes: 25,
    rating: 4.6,
  },
];

export const MOCK_SERVICES: Service[] = [
  {
    id: 'svc-1',
    professionalId: 'prof-1',
    name: 'Corte Masculino',
    description: 'Corte personalizado com acabamento na máquina e tesoura.',
    price: 40,
    durationMinutes: 30,
  },
  {
    id: 'svc-2',
    professionalId: 'prof-1',
    name: 'Barba',
    description: 'Modelagem e finalização com toalha quente.',
    price: 25,
    durationMinutes: 20,
  },
  {
    id: 'svc-3',
    professionalId: 'prof-1',
    name: 'Combo Corte + Barba',
    description: 'Experiência completa: corte e barba premium.',
    price: 60,
    durationMinutes: 50,
  },
  {
    id: 'svc-4',
    professionalId: 'prof-1',
    name: 'Pezinho & Acabamento',
    description: 'Manutenção rápida entre cortes.',
    price: 18,
    durationMinutes: 15,
  },
  {
    id: 'svc-5',
    professionalId: 'prof-2',
    name: 'Corte Masculino',
    description: 'Corte moderno com design personalizado.',
    price: 45,
    durationMinutes: 35,
  },
  {
    id: 'svc-6',
    professionalId: 'prof-2',
    name: 'Barba Premium',
    description: 'Barba com toalha quente e hidratação.',
    price: 30,
    durationMinutes: 25,
  },
  {
    id: 'svc-7',
    professionalId: 'prof-2',
    name: 'Combo Corte + Barba',
    description: 'Pacote completo com acabamento premium.',
    price: 65,
    durationMinutes: 55,
  },
  {
    id: 'svc-8',
    professionalId: 'prof-3',
    name: 'Corte Clássico',
    description: 'Corte tradicional com acabamento impecável.',
    price: 38,
    durationMinutes: 30,
  },
  {
    id: 'svc-9',
    professionalId: 'prof-3',
    name: 'Barba',
    description: 'Modelagem clássica com navalha.',
    price: 22,
    durationMinutes: 20,
  },
  {
    id: 'svc-10',
    professionalId: 'prof-4',
    name: 'Design de Barba',
    description: 'Barba desenhada com técnicas avançadas.',
    price: 35,
    durationMinutes: 30,
  },
  {
    id: 'svc-11',
    professionalId: 'prof-4',
    name: 'Hidratação Capilar',
    description: 'Tratamento para cabelo e couro cabeludo.',
    price: 28,
    durationMinutes: 20,
  },
];

export const MOCK_UNAVAILABLE_SLOTS: Record<string, string[]> = {
  '2026-06-06': ['10:00', '10:30', '14:00'],
  '2026-06-07': ['09:00', '09:30', '11:00', '15:00'],
  '2026-06-08': ['11:00', '13:30'],
};

export const MOCK_BUSINESS_NAME = 'Studio Aurora';
