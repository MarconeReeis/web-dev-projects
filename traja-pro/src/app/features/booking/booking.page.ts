import { Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { BookingFlowService } from '../../core/services/booking-flow.service';
import { BottomNavComponent } from '../../shared/components';
import { BookingHeaderComponent } from './components/booking-header/booking-header.component';
import { BookingProgressComponent } from './components/booking-progress/booking-progress.component';
import { StepProfessionalComponent } from './steps/step-professional/step-professional.component';
import { StepServiceComponent } from './steps/step-service/step-service.component';
import { StepScheduleComponent } from './steps/step-schedule/step-schedule.component';
import { StepConfirmComponent } from './steps/step-confirm/step-confirm.component';
import { StepSuccessComponent } from './steps/step-success/step-success.component';
import { bookingStepAnimation } from './animations/booking.animations';

@Component({
  selector: 'app-booking',
  templateUrl: './booking.page.html',
  styleUrls: ['./booking.page.scss'],
  animations: [bookingStepAnimation],
  imports: [
    IonContent,
    BottomNavComponent,
    BookingHeaderComponent,
    BookingProgressComponent,
    StepProfessionalComponent,
    StepServiceComponent,
    StepScheduleComponent,
    StepConfirmComponent,
    StepSuccessComponent,
  ],
})
export class BookingPage implements OnInit {
  readonly flow = inject(BookingFlowService);
  private readonly router = inject(Router);

  isLightTheme = false;

  readonly stepLabel = computed(() => {
    const step = this.flow.currentStep();
    if (step >= 5) return null;
    return `Etapa ${step} de ${this.flow.stepsTotal}`;
  });

  readonly showProgress = computed(() => this.flow.currentStep() < 5);

  readonly showBottomNav = computed(() => this.flow.currentStep() < 5);

  readonly animationState = computed(() => this.flow.stepDirection());

  ngOnInit(): void {
    this.flow.init();
  }

  onBack(): void {
    this.flow.prevStep();
  }

  toggleTheme(): void {
    this.isLightTheme = !this.isLightTheme;
    document.documentElement.classList.toggle('light-theme', this.isLightTheme);
  }

  onBookFromNav(): void {
    const step = this.flow.currentStep();
    if (step === 3 && this.flow.canProceed()) {
      this.flow.goToStep(4);
    } else if (step < 3) {
      this.flow.goToStep(1);
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  goToAppointments(): void {
    this.router.navigate(['/agendamentos']);
  }
}
