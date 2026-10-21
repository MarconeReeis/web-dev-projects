import { bootstrapApplication } from '@angular/platform-browser';
import { initMonitoring } from '@atrio/core';
import { environment } from './environments/environment';
import { appConfig } from './app/app.config';
import { App } from './app/app';

initMonitoring({ dsn: environment.sentryDsn, app: 'booking', version: '0.1.0' });

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
