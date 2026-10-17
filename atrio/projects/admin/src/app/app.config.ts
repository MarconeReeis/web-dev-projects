import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideAtrioConfig } from '@atrio/core';
import { provideDemoData } from '@atrio/data';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Parâmetros de rota chegam como inputs do componente, sem ActivatedRoute.
      withComponentInputBinding(),
      // Transição discreta entre seções; o navegador ignora onde não há suporte.
      withViewTransitions(),
    ),

    provideAtrioConfig({
      productName: 'Átrio',
      appName: 'admin',
      dataSource: 'demo',
      demoMode: true,
      version: '0.1.0',
    }),

    // Única linha a trocar quando o Firebase entrar: provideFirebaseData().
    provideDemoData(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
