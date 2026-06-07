import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, sunnyOutline, moonOutline } from 'ionicons/icons';
import { AppointmentService } from '../../core/services/appointment.service';
import {
  AppointmentCardComponent,
  BottomNavComponent,
} from '../../shared/components';

addIcons({ arrowBackOutline, sunnyOutline, moonOutline });

@Component({
  selector: 'app-appointments',
  templateUrl: './appointments.page.html',
  styleUrls: ['./appointments.page.scss'],
  imports: [
    IonContent,
    IonIcon,
    AppointmentCardComponent,
    BottomNavComponent,
  ],
})
export class AppointmentsPage implements ViewWillEnter {
  private readonly appointmentService = inject(AppointmentService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  isLightTheme = false;

  readonly upcoming = this.appointmentService.upcoming;
  readonly history = this.appointmentService.history;
  readonly loading = this.appointmentService.loading;

  ionViewWillEnter(): void {
    this.appointmentService.loadAll();
  }

  toggleTheme(): void {
    this.isLightTheme = !this.isLightTheme;
    document.documentElement.classList.toggle('light-theme', this.isLightTheme);
  }

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  goToAppointments(): void {
    this.router.navigate(['/agendamentos']);
  }

  startBooking(): void {
    this.router.navigate(['/agendar']);
  }

  onReschedule(_id: string): void {
    // TODO: fluxo de reagendamento
  }

  onCancel(id: string): void {
    this.appointmentService.cancel(id);
  }
}
