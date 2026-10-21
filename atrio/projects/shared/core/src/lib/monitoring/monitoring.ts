import { ErrorHandler, Injectable, Provider, isDevMode } from '@angular/core';
import type { Breadcrumb, Event } from '@sentry/angular';

type SentrySdk = typeof import('@sentry/angular');

export interface MonitoringOptions {
  /** DSN do projeto no Sentry. Nulo: monitoramento desligado. */
  readonly dsn: string | null;
  readonly app: 'admin' | 'booking';
  readonly version: string;
}

/** O SDK, carregado à parte — só existe com DSN. */
let sdk: Promise<SentrySdk> | null = null;

/**
 * Monitoramento de erros (Sentry): o erro que o cliente ou o barbeiro vê na
 * tela chega até nós, com a tela e o passo que levaram a ele.
 *
 * Só erros — sem medir desempenho nem gravar a sessão. E sem dados pessoais:
 * nada de quem é a pessoa (nem IP), cookies ou cabeçalhos, e endereços chegam
 * sem `?…` e `#…`, onde moram o token do e-mail de confirmação
 * (`/responder?token=`) e o do link de senha (`#access_token=`).
 *
 * O SDK (~120 kB) carrega em segundo plano e só com DSN: não atrasa a
 * abertura do app no celular do cliente. Erro que acontece antes de ele
 * chegar vai junto quando chegar.
 *
 * Chamado no main.ts, antes do bootstrap.
 */
export function initMonitoring({ dsn, app, version }: MonitoringOptions): void {
  if (!dsn) return;
  sdk = import('@sentry/angular').then((Sentry) => {
    Sentry.init({
      dsn,
      release: `atrio-${app}@${version}`,
      environment: isDevMode() ? 'desenvolvimento' : 'producao',
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      initialScope: { tags: { app } },
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    return Sentry;
  });
  // Sem rede para baixar o SDK: o app segue, só sem monitoramento.
  sdk.catch((cause) => console.error('[monitoramento]', cause));
}

/** Erros que o Angular pega: no console, como sempre, e no Sentry. */
@Injectable()
class MonitoringErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error(error);
    sdk?.then((Sentry) => Sentry.captureException(error)).catch(() => undefined);
  }
}

/** Erros do Angular para o Sentry. Sem DSN, fica o tratamento padrão. */
export function provideMonitoring(dsn: string | null): Provider[] {
  return dsn ? [{ provide: ErrorHandler, useClass: MonitoringErrorHandler }] : [];
}

/** Endereço sem busca (`?…`) nem âncora (`#…`). */
export function stripUrl(url: string): string {
  return url.replace(/[?#].*$/s, '');
}

export function scrubEvent<E extends Event>(event: E): E {
  const request = event.request;
  if (request) {
    if (request.url) request.url = stripUrl(request.url);
    delete request.query_string;
    delete request.cookies;
    // O Referer é um endereço como outro qualquer.
    if (request.headers) delete request.headers['Referer'];
  }
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    // Navegação (from/to) e chamadas de rede (url).
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = stripUrl(data[key]);
    }
  }
  return breadcrumb;
}
