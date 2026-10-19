import { Injectable, InjectionToken, inject } from '@angular/core';
import { PostgrestError, SupabaseClient, createClient } from '@supabase/supabase-js';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  filter,
  firstValueFrom,
  from,
  fromEvent,
  merge,
  of,
  switchMap,
} from 'rxjs';
import { StaffAuth } from '../repositories/repositories';

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
 * Um cliente Supabase com a sessão guardada sob uma chave própria do app.
 *
 * Chave por app porque, publicados no mesmo domínio, os dois dividiriam o
 * armazenamento do navegador: o cliente logado para marcar um corte
 * apareceria logado no painel da barbearia — e vice-versa.
 */
export function createSupabaseClient(url: string, key: string, storageKey: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey },
  });
}

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

/**
 * De qual barbearia são as consultas.
 *
 * Duas fontes, uma por app: no app do cliente, o endereço (/b/:slug); no
 * painel, o vínculo da conta da equipe. Os repositórios não sabem qual —
 * só pedem o id.
 */
export abstract class SupabaseTenantScope {
  abstract id(): Promise<string>;
  abstract row(): Promise<TenantRow | null>;
}

/** App do cliente: a barbearia do endereço, resolvida uma vez só. */
@Injectable()
export class SlugTenantScope extends SupabaseTenantScope {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly slug = inject(SUPABASE_CONFIG).tenantSlug();

  private readonly cached: Promise<TenantRow | null> = (async () => {
    const { data, error } = await this.client
      .from('tenants')
      .select('*')
      .eq('slug', this.slug)
      .maybeSingle();
    if (error) throw error;
    return data as TenantRow | null;
  })();

  row(): Promise<TenantRow | null> {
    return this.cached;
  }

  async id(): Promise<string> {
    const row = await this.cached;
    if (!row) throw new Error(`Barbearia "${this.slug}" não encontrada.`);
    return row.id;
  }
}

/**
 * Painel: a barbearia da conta logada. Espera a sessão — antes do login não
 * há de onde saber —, e relê a cada pedido, porque a sessão pode trocar
 * (sair e entrar com outra conta) sem recarregar a página. A ficha da conta
 * (responsável, assinatura) vem junto: a equipe pode lê-la.
 */
@Injectable()
export class StaffTenantScope extends SupabaseTenantScope {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly auth = inject(StaffAuth);

  async id(): Promise<string> {
    const session = await firstValueFrom(this.auth.watchSession().pipe(filter(Boolean)));
    return session.tenantId;
  }

  async row(): Promise<TenantRow | null> {
    const { data, error } = await this.client
      .from('tenants')
      .select('*, tenant_accounts(subscription, admin_name, admin_email)')
      .eq('id', await this.id())
      .maybeSingle();
    if (error) throw error;
    return data as TenantRow | null;
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
  /** Só no painel: a equipe pode ler; o app do cliente, não. */
  tenant_accounts?: {
    subscription: 'trial' | 'ativa' | 'inadimplente' | 'cancelada';
    admin_name: string;
    admin_email: string;
  } | null;
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

export interface TimeBlockRow {
  id: string;
  tenant_id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface FinanceRow {
  id: string;
  tenant_id: string;
  kind: 'recebimento' | 'despesa';
  description: string;
  amount_cents: number;
  occurred_at: string;
  method: 'pix' | 'dinheiro' | 'cartao' | null;
  appointment_id: string | null;
  professional_id: string | null;
  category:
    | 'produtos' | 'aluguel' | 'energia' | 'agua' | 'internet' | 'manutencao' | 'marketing' | 'outros'
    | null;
  created_at: string;
  updated_at: string;
}
