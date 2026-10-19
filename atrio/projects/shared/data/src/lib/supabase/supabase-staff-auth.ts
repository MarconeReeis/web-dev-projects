import {
  EnvironmentProviders,
  Injectable,
  Provider,
  inject,
  provideEnvironmentInitializer,
} from '@angular/core';
import { AuthError, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, filter } from 'rxjs';
import { StaffAuthError, StaffRole, StaffSession } from '../models/staff';
import {
  AppointmentRepository,
  AvailabilityRepository,
  FinanceRepository,
  ProfessionalRepository,
  ServiceRepository,
  StaffAuth,
  TenantRepository,
  TimeBlockRepository,
} from '../repositories/repositories';
import {
  SUPABASE_CLIENT,
  StaffTenantScope,
  SupabaseSync,
  SupabaseTenantScope,
  createSupabaseClient,
} from './supabase-core';
import {
  SupabaseAppointmentRepository,
  SupabaseAvailabilityRepository,
  SupabaseFinanceRepository,
  SupabaseProfessionalRepository,
  SupabaseRealtime,
  SupabaseServiceRepository,
  SupabaseTenantRepository,
  SupabaseTimeBlockRepository,
} from './supabase-repositories';

/**
 * Login da equipe pelo Supabase Auth.
 *
 * Entrar não basta: a conta precisa estar em `tenant_members`. Uma conta de
 * cliente — que existe no mesmo Supabase Auth — passa pela senha e é barrada
 * aqui, com a sessão encerrada na hora.
 */
@Injectable()
export class SupabaseStaffAuth extends StaffAuth {
  private readonly client = inject(SUPABASE_CLIENT);

  /** `undefined` até a sessão salva no aparelho ser lida. */
  private readonly session$ = new BehaviorSubject<StaffSession | null | undefined>(undefined);

  constructor() {
    super();
    this.client.auth.onAuthStateChange((_event, session) => {
      // Ler o vínculo fora do callback: o Supabase segura uma trava interna
      // enquanto ele roda, e uma consulta aqui dentro trava.
      setTimeout(async () => {
        this.session$.next(session ? await this.staffOf(session.user) : null);
      });
    });
  }

  watchSession(): Observable<StaffSession | null> {
    return this.session$.pipe(filter((value): value is StaffSession | null => value !== undefined));
  }

  async signIn(email: string, password: string): Promise<StaffSession> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw translate(error);

    const staff = await this.staffOf(data.user);
    if (!staff) {
      await this.client.auth.signOut();
      throw new StaffAuthError(
        'sem-acesso',
        'Esta conta não tem acesso a nenhuma barbearia. Fale com o responsável pela sua barbearia.',
      );
    }

    // A sessão é publicada AQUI, antes de devolver — e não só quando o
    // onAuthStateChange chegar. Quem chamou navega para o painel em
    // seguida, e a guarda de rota lê a sessão na hora: se ela ainda fosse a
    // antiga (nula), a guarda mandava de volta para a tela de entrar. O
    // callback do Supabase vem logo depois e publica a mesma sessão.
    this.session$.next(staff);
    return staff;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async sendPasswordReset(email: string): Promise<void> {
    // Para a tela de nova senha, não para "Entrar": o link já abre a sessão,
    // e mandar para "Entrar" levava a pessoa direto ao painel sem nunca
    // definir a senha nova.
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/nova-senha`,
    });
    if (error && error.status !== 400) throw translate(error);
  }

  async updatePassword(password: string): Promise<StaffSession> {
    const { data: current } = await this.client.auth.getSession();
    if (!current.session) {
      throw new StaffAuthError('link-invalido', 'Este link expirou ou já foi usado. Peça um novo.');
    }

    const { data, error } = await this.client.auth.updateUser({ password });
    if (error) {
      if (error.code === 'same_password') {
        throw new StaffAuthError('indisponivel', 'Escolha uma senha diferente da anterior.');
      }
      throw translate(error);
    }

    const staff = await this.staffOf(data.user);
    if (!staff) {
      await this.client.auth.signOut();
      throw new StaffAuthError(
        'sem-acesso',
        'Senha alterada, mas esta conta não tem acesso a nenhuma barbearia.',
      );
    }
    this.session$.next(staff);
    return staff;
  }

  /**
   * A barbearia da conta. Se a pessoa estiver em mais de uma, entra na mais
   * antiga — escolher entre lojas é tela que só faz sentido quando alguém
   * tiver duas.
   */
  private async staffOf(user: User): Promise<StaffSession | null> {
    const { data, error } = await this.client
      .from('tenant_members')
      .select('tenant_id, role, created_at')
      .eq('user_id', user.id)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    const meta = user.user_metadata as { name?: string };
    return {
      userId: user.id,
      email: user.email ?? '',
      name: meta.name?.trim() || user.email?.split('@')[0] || 'Equipe',
      tenantId: data.tenant_id as string,
      role: data.role as StaffRole,
    };
  }
}

function translate(error: AuthError): StaffAuthError {
  if (error.code === 'invalid_credentials') {
    return new StaffAuthError('credenciais', 'E-mail ou senha incorretos.');
  }
  console.error('[supabase auth]', error);
  return new StaffAuthError(
    'indisponivel',
    'Não foi possível entrar agora. Confira a internet e tente de novo.',
  );
}

export interface SupabaseStaffAuthConfig {
  readonly url: string;
  /** Chave pública (anon / publishable). Nunca a service_role. */
  readonly key: string;
}

/**
 * Login da equipe pelo Supabase. Pode vir junto de `provideDemoData()`
 * enquanto o painel ainda não lê os dados do banco: o login é real, os
 * dados da tela ainda são de demonstração.
 */
export function provideSupabaseStaffAuth(config: SupabaseStaffAuthConfig): Provider[] {
  return [
    {
      provide: SUPABASE_CLIENT,
      useFactory: () => createSupabaseClient(config.url, config.key, 'atrio.auth.equipe'),
    },
    { provide: StaffAuth, useClass: SupabaseStaffAuth },
  ];
}

/**
 * O painel inteiro no Supabase: login da equipe, dados da barbearia da conta
 * e tempo real da agenda. Troca `provideDemoData()` no app.config do painel.
 */
export function provideSupabaseAdminData(
  config: SupabaseStaffAuthConfig,
): (Provider | EnvironmentProviders)[] {
  return [
    ...provideSupabaseStaffAuth(config),
    SupabaseSync,
    { provide: SupabaseTenantScope, useClass: StaffTenantScope },
    { provide: TenantRepository, useClass: SupabaseTenantRepository },
    { provide: ProfessionalRepository, useClass: SupabaseProfessionalRepository },
    { provide: ServiceRepository, useClass: SupabaseServiceRepository },
    { provide: AvailabilityRepository, useClass: SupabaseAvailabilityRepository },
    { provide: AppointmentRepository, useClass: SupabaseAppointmentRepository },
    { provide: TimeBlockRepository, useClass: SupabaseTimeBlockRepository },
    { provide: FinanceRepository, useClass: SupabaseFinanceRepository },
    SupabaseRealtime,
    // Instancia o tempo real na partida: ninguém o injeta, ele só escuta.
    provideEnvironmentInitializer(() => {
      inject(SupabaseRealtime);
    }),
  ];
}
