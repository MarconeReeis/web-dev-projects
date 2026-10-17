import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { BrandingService, TenantContext, provideAtrioConfig } from '@atrio/core';
import { provideDemoData } from '@atrio/data';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),

    provideAtrioConfig({
      productName: 'Átrio',
      appName: 'booking',
      dataSource: 'demo',
      demoMode: true,
      version: '0.1.0',
    }),

    provideDemoData(),

    /**
     * Aplica a identidade da barbearia antes da primeira pintura.
     *
     * Se isso rodasse dentro de um componente, o cliente veria o roxo do
     * Átrio piscar antes da cor da barbearia — o oposto do que um produto
     * white-label deve parecer.
     */
    provideAppInitializer(() => {
      const tenant = inject(TenantContext);
      const branding = inject(BrandingService);
      branding.apply(tenant.branding());
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
