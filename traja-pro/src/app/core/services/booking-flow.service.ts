import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, of, tap } from 'rxjs';
import { BookingRepository } from '../repositories/booking.repository';
import { AppointmentService } from './appointment.service';
import { ClientSessionService } from './client-session.service';
import {
  BOOKING_STEPS_TOTAL,
  BookingConfirmation,
  BookingCustomer,
  BookingDraft,
  BookingStep,
  EMPTY_BOOKING_DRAFT,
  Professional,
  Service,
  TimeSlot,
} from '../../shared/models/booking.model';

@Injectable({ providedIn: 'root' })
export class BookingFlowService {
  private readonly repository = inject(BookingRepository);
  private readonly router = inject(Router);
  private readonly appointmentService = inject(AppointmentService);
  private readonly clientSession = inject(ClientSessionService);

  private readonly step = signal<BookingStep>(1);
  private readonly direction = signal<'forward' | 'back'>('forward');
  private readonly draft = signal<BookingDraft>({ ...EMPTY_BOOKING_DRAFT, customer: { ...EMPTY_BOOKING_DRAFT.customer } });
  private readonly confirmation = signal<BookingConfirmation | null>(null);
  private readonly isSubmitting = signal(false);
  private readonly submitError = signal<string | null>(null);

  readonly professionals = signal<Professional[]>([]);
  readonly services = signal<Service[]>([]);
  readonly availableDates = signal<string[]>([]);
  readonly timeSlots = signal<TimeSlot[]>([]);
  readonly isLoadingProfessionals = signal(false);
  readonly isLoadingServices = signal(false);
  readonly isLoadingSlots = signal(false);

  readonly currentStep = this.step.asReadonly();
  readonly stepDirection = this.direction.asReadonly();
  readonly bookingDraft = this.draft.asReadonly();
  readonly bookingConfirmation = this.confirmation.asReadonly();
  readonly submitting = this.isSubmitting.asReadonly();
  readonly submitErrorMessage = this.submitError.asReadonly();
  readonly stepsTotal = BOOKING_STEPS_TOTAL;

  readonly canProceed = computed(() => {
    const s = this.step();
    const d = this.draft();

    switch (s) {
      case 1: return !!d.professional;
      case 2: return !!d.service;
      case 3: return !!d.date && !!d.time;
      case 4: return this.isCustomerValid(d.customer);
      default: return false;
    }
  });

  readonly availableSlotsCount = computed(
    () => this.timeSlots().filter((s) => s.available).length
  );

  init(): void {
    this.reset();
    this.loadProfessionals();
    this.loadAvailableDates();
  }

  reset(): void {
    this.step.set(1);
    this.direction.set('forward');
    this.draft.set({
      ...EMPTY_BOOKING_DRAFT,
      customer: { ...EMPTY_BOOKING_DRAFT.customer },
    });
    this.confirmation.set(null);
    this.services.set([]);
    this.timeSlots.set([]);
  }

  loadProfessionals(): void {
    this.isLoadingProfessionals.set(true);
    this.repository.getProfessionals().pipe(
      finalize(() => this.isLoadingProfessionals.set(false))
    ).subscribe((list) => this.professionals.set(list));
  }

  loadAvailableDates(): void {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    this.repository.getAvailableDates(from, 14).subscribe((dates) =>
      this.availableDates.set(dates)
    );
  }

  selectProfessional(professional: Professional): void {
    this.draft.update((d) => ({
      ...d,
      professional,
      service: null,
      date: null,
      time: null,
    }));
    this.loadServices(professional.id);
    this.goToStep(2);
  }

  selectService(service: Service): void {
    this.draft.update((d) => ({ ...d, service, date: null, time: null }));
    this.goToStep(3);

    const dates = this.availableDates();
    if (dates.length) {
      this.selectDate(dates[0]);
    }
  }

  selectDate(date: string): void {
    this.draft.update((d) => ({ ...d, date, time: null }));
    const { professional, service } = this.draft();
    if (professional && service) {
      this.loadTimeSlots(professional.id, service.id, date);
    }
  }

  selectTime(time: string): void {
    this.draft.update((d) => ({ ...d, time }));
  }

  updateCustomer(partial: Partial<BookingCustomer>): void {
    this.draft.update((d) => ({
      ...d,
      customer: { ...d.customer, ...partial },
    }));
  }

  goToStep(step: BookingStep): void {
    const current = this.step();
    this.direction.set(step > current ? 'forward' : 'back');
    this.step.set(step);
  }

  nextStep(): void {
    const current = this.step();
    if (current < 4 && this.canProceed()) {
      this.goToStep((current + 1) as BookingStep);
    }
  }

  prevStep(): void {
    const current = this.step();
    if (current === 1) {
      this.router.navigate(['/']);
      return;
    }
    if (current === 5) return;
    this.goToStep((current - 1) as BookingStep);
  }

  goToConfirm(): void {
    if (this.canProceed()) {
      this.goToStep(4);
    }
  }

  confirmBooking(): void {
    if (!this.canProceed() || this.isSubmitting()) return;

    this.submitError.set(null);
    this.isSubmitting.set(true);

    this.repository.createBooking(this.draft()).pipe(
      tap((result) => {
        this.clientSession.setPhone(this.draft().customer.phone);
        this.confirmation.set(result);
        this.appointmentService.loadUpcomingPreview();
        this.goToStep(5);
      }),
      catchError((err) => {
        console.error('[Traja Pro] Erro ao salvar agendamento:', err);
        this.submitError.set('Não foi possível confirmar o agendamento. Verifique sua conexão e tente novamente.');
        return of(null);
      }),
      finalize(() => this.isSubmitting.set(false))
    ).subscribe();
  }

  cancelFlow(): void {
    this.reset();
    this.router.navigate(['/']);
  }

  private loadServices(professionalId: string): void {
    this.isLoadingServices.set(true);
    this.repository.getServicesByProfessional(professionalId).pipe(
      finalize(() => this.isLoadingServices.set(false))
    ).subscribe((list) => this.services.set(list));
  }

  private loadTimeSlots(professionalId: string, serviceId: string, date: string): void {
    this.isLoadingSlots.set(true);
    this.repository.getAvailableTimeSlots(professionalId, serviceId, date).pipe(
      finalize(() => this.isLoadingSlots.set(false))
    ).subscribe((slots) => this.timeSlots.set(slots));
  }

  private isCustomerValid(customer: BookingCustomer): boolean {
    return (
      customer.fullName.trim().length >= 2 &&
      customer.phone.trim().length >= 10 &&
      customer.whatsapp.trim().length >= 10
    );
  }
}
