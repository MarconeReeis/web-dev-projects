import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sunnyOutline,
  moonOutline,
  arrowForward,
  locationOutline,
  timeOutline,
  logoInstagram,
  logoWhatsapp,
} from 'ionicons/icons';
import { Business } from '../../shared/models';
import { AppointmentService } from '../../core/services/appointment.service';
import {
  AvatarComponent,
  AppointmentCardComponent,
  BottomNavComponent,
} from '../../shared/components';

addIcons({
  sunnyOutline,
  moonOutline,
  arrowForward,
  locationOutline,
  timeOutline,
  logoInstagram,
  logoWhatsapp,
});

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonContent,
    IonIcon,
    AvatarComponent,
    AppointmentCardComponent,
    BottomNavComponent,
  ],
})
export class HomePage implements ViewWillEnter {
  private readonly router = inject(Router);
  private readonly appointmentService = inject(AppointmentService);

  isLightTheme = false;

  readonly business: Business = {
    initials: 'SA',
    category: 'Barbearia & Estética Masculina',
    name: 'Studio Aurora',
    address: 'Rua das Palmeiras, 234 — Centro',
    hours: 'Seg a Sáb · 09h – 19h',
    instagram: '@studioaurora',
    phone: '(11) 9 9999-0000',
  };

  readonly upcomingAppointments = this.appointmentService.upcoming;

  ionViewWillEnter(): void {
    this.appointmentService.loadUpcomingPreview();
  }

  toggleTheme(): void {
    this.isLightTheme = !this.isLightTheme;
    document.documentElement.classList.toggle('light-theme', this.isLightTheme);
  }

  startBooking(): void {
    this.router.navigate(['/agendar']);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  goToAppointments(): void {
    this.router.navigate(['/agendamentos']);
  }

  onReschedule(_id: string): void {
    // TODO: fluxo de reagendamento
  }

  onCancel(id: string): void {
    this.appointmentService.cancel(id);
  }
}
