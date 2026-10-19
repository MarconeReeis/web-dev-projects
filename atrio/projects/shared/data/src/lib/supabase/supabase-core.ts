import { Injectable, InjectionToken, inject } from '@angular/core';
import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  filter,
  from,
  fromEvent,
  merge,
  of,
  switchMap,
} from 'rxjs';

export interface SupabaseDataConfig {
  readonly url: string;
  /** Chave pública (anon / publishable). Nunca a service_role. */
  readonly key: string;
  /**
   * De qual barbearia é este app. No app do cliente, o slug vem da URL
   * (/b/:slug); a função é chamada uma vez, na inicialização.
   */
  readonly tenantSlug: () => string;
}

export const SUPABASE_CONFIG = new InjectionToken<SupabaseDataConfig>('SUPABASE_CONFIG');
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient>('SUPABASE_CLIENT');

/**
 * Quando reconsultar.
 *
 * O app do cliente não recebe a agenda em tempo real — sem permissão de
 * leitura, não há o que transmitir. Em vez disso, cada consulta se refaz:
 * ao ser assinada, depois de cada escrita feita por este app e quando a
 * pessoa volta para a aba (o caso de deixar o celular de lado e retomar
 * minutos depois, com a agenda já mudada).
 */
@Injectable()
export class SupabaseSync {
  private readonly written$ = new Subject<void>();

  private readonly ticks$: Observable<unknown> = merge(
    of(null),
    this.written$,
    typeof document === 'undefined'
      ? EMPTY
      : fromEvent(document, 'visibilitychange').pipe(
          filter(() => document.visibilityState === 'visible'),
        ),
  );

  /** Avisa que este app escreveu: as consultas abertas se refazem. */
  changed(): void {
    this.written$.next();
  }

  /**
   * Uma consulta que se refaz a cada sinal.
   *
   * Falha de rede não derruba a tela: o erro vai para o console e a tela
   * fica com o último resultado bom, até a próxima tentativa.
   */
  live<T>(fetch: () => Promise<T>): Observable<T> {
    return this.ticks$.pipe(
      switchMap(() =>
        from(fetch()).pipe(
          catchError((error) => {
            console.error('[supabase]', error);
            return EMPTY;
          }),
        ),
      ),
    );
  }
}

/** A barbearia deste app, resolvida pelo slug uma vez só. */
@Injectable()
export class SupabaseTenantScope {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly slug = inject(SUPABASE_CONFIG).tenantSlug();

  readonly row: Promise<TenantRow | null> = (async () => {
    const { data, error } = await this.client
      .from('tenants')
      .select('*')
      .eq('slug', this.slug)
      .maybeSingle();
    if (error) throw error;
    return data as TenantRow | null;
  })();

  async id(): Promise<string> {
    const row = await this.row;
    if (!row) throw new Error(`Barbearia "${this.slug}" não encontrada.`);
    return row.id;
  }
}

/**
 * Traduz o erro do banco para o app.
 *
 * As funções de agenda levantam erro com mensagem para gente e um código
 * estável em `hint` (ver supabase/README.md) — essas mensagens vão direto
 * para a tela. Qualquer outra coisa (rede, permissão, bug) vira uma mensagem
 * genérica, e o detalhe técnico fica no console.
 */
export function toAppError(error: PostgrestError): Error {
  if (error.hint && /^[a-z_]+$/.test(error.hint)) {
    const known = new Error(error.message);
    (known as Error & { code?: string }).code = error.hint;
    return known;
  }
  console.error('[supabase]', error);
  return new Error('Não foi possível concluir agora. Tente de novo em instantes.');
}

/** Para o que o painel ainda não faz pelo Supabase (ver supabase/README.md). */
export function notWired(operation: string): Error {
  return new Error(
    `${operation}: o painel ainda não está ligado ao Supabase. Use o modo demonstração.`,
  );
}

/** Instantes do banco ("…+00:00") no formato do app ("…Z"): o app compara como texto. */
export function iso(value: string): string;
export function iso(value: string | null): string | null;
export function iso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

// ─── formato das linhas ──────────────────────────────────────────────────

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  address: Record<string, string | null> | null;
  branding: { logoUrl?: string | null; primaryColor?: string | null } | null;
  highlight: { title: string; subtitle: string | null; ctaLabel: string | null; active: boolean } | null;
  time_zone: string;
  created_at: string;
}

export interface ProfessionalRow {
  id: string;
  tenant_id: string;
  name: string;
  photo_url: string | null;
  phone: string | null;
  bio: string | null;
  about: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  professional_services: { service_id: string }[];
  professional_schedule: { weekday: number; kind: 'expediente' | 'intervalo'; starts: string; ends: string }[];
}

export interface ServiceRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppointmentRow {
  id: string;
  tenant_id: string;
  professional_id: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  price_cents: number;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  starts_at: string;
  ends_at: string;
  status: 'agendado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'nao_compareceu';
  payment_status: 'pendente' | 'pago';
  payment_method: 'pix' | 'dinheiro' | 'cartao' | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusyRow {
  kind: 'agendamento' | 'bloqueio';
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  appointment_id: string | null;
}
