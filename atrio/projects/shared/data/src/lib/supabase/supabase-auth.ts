import { Injectable, Provider, inject } from '@angular/core';
import { AuthError, User, createClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, filter } from 'rxjs';
import { ClientAccount, ClientAuthError, NewClientAccount } from '../models/client-account';
import {
  AppointmentRepository,
  AvailabilityRepository,
  ClientAuth,
  ProfessionalRepository,
  ServiceRepository,
  TenantRepository,
} from '../repositories/repositories';
import {
  SUPABASE_CLIENT,
  SUPABASE_CONFIG,
  SupabaseDataConfig,
  SupabaseSync,
  SupabaseTenantScope,
} from './supabase-core';
import {
  SupabaseAppointmentRepository,
  SupabaseAvailabilityRepository,
  SupabaseProfessionalRepository,
  SupabaseServiceRepository,
  SupabaseTenantRepository,
} from './supabase-repositories';

/**
 * Conta do cliente pelo Supabase Auth.
 *
 * O e-mail vem da conta; nome, telefone e foto, de `profiles`, criado pelo
 * banco no cadastro a partir dos metadados enviados aqui.
 */
@Injectable()
export class SupabaseClientAuth extends ClientAuth {
  private readonly client = inject(SUPABASE_CLIENT);

  /** `undefined` até a sessão salva no aparelho ser lida. */
  private readonly session$ = new BehaviorSubject<ClientAccount | null | undefined>(undefined);

  constructor() {
    super();
    this.client.auth.onAuthStateChange((_event, session) => {
      // A documentação do Supabase pede para não chamar o cliente de dentro
      // deste callback (ele segura uma trava interna): a leitura do perfil
      // vai para a próxima volta do loop.
      setTimeout(async () => {
        this.session$.next(session ? await this.accountOf(session.user) : null);
      });
    });
  }

  watchSession(): Observable<ClientAccount | null> {
    return this.session$.pipe(
      filter((value): value is ClientAccount | null => value !== undefined),
    );
  }

  async signIn(email: string, password: string): Promise<ClientAccount> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw translate(error);
    return this.accountOf(data.user);
  }

  async signUp(input: NewClientAccount): Promise<ClientAccount> {
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      // O gatilho do banco cria o perfil a partir destes dois.
      options: { data: { name: input.name.trim(), phone: input.phone.trim() } },
    });
    if (error) throw translate(error);

    // Com "Confirm email" ligado no projeto, a conta nasce sem sessão: só
    // entra depois de clicar no link do e-mail.
    if (!data.session || !data.user) {
      throw new ClientAuthError(
        'confirmacao-pendente',
        'Conta criada. Enviamos um link para o seu e-mail — confirme e depois entre.',
      );
    }
    return this.accountOf(data.user);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: location.origin,
    });
    // Mesmo resultado exista a conta ou não; só falha de rede chega aqui.
    if (error && error.status !== 400) throw translate(error);
  }

  private async accountOf(user: User): Promise<ClientAccount> {
    const { data } = await this.client
      .from('profiles')
      .select('name, phone, photo_url')
      .eq('id', user.id)
      .maybeSingle();

    const meta = user.user_metadata as { name?: string; phone?: string };
    return {
      id: user.id,
      email: user.email ?? '',
      name: data?.name ?? meta.name ?? user.email?.split('@')[0] ?? '',
      phone: data?.phone ?? meta.phone ?? '',
      photoUrl: data?.photo_url ?? null,
    };
  }
}

function translate(error: AuthError): ClientAuthError {
  switch (error.code) {
    case 'invalid_credentials':
      return new ClientAuthError('credenciais', 'E-mail ou senha incorretos.');
    case 'user_already_exists':
    case 'email_exists':
      return new ClientAuthError('email-em-uso', 'Já existe uma conta com este e-mail.');
    case 'email_not_confirmed':
      return new ClientAuthError(
        'confirmacao-pendente',
        'Confirme seu e-mail pelo link que enviamos antes de entrar.',
      );
    case 'weak_password':
      return new ClientAuthError('indisponivel', 'Escolha uma senha mais forte.');
    default:
      console.error('[supabase auth]', error);
      return new ClientAuthError(
        'indisponivel',
        'Não foi possível concluir agora. Tente de novo em instantes.',
      );
  }
}

/**
 * Liga o app ao Supabase. Troca `provideDemoData()` no app.config.
 *
 * Só o que o app do cliente usa: agenda da equipe, caixa e bloqueios dependem
 * do login do painel e continuam no modo demonstração.
 */
export function provideSupabaseData(config: SupabaseDataConfig): Provider[] {
  return [
    { provide: SUPABASE_CONFIG, useValue: config },
    {
      provide: SUPABASE_CLIENT,
      useFactory: () =>
        createClient(config.url, config.key, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: 'atrio.auth' },
        }),
    },
    SupabaseSync,
    SupabaseTenantScope,
    { provide: TenantRepository, useClass: SupabaseTenantRepository },
    { provide: ProfessionalRepository, useClass: SupabaseProfessionalRepository },
    { provide: ServiceRepository, useClass: SupabaseServiceRepository },
    { provide: AvailabilityRepository, useClass: SupabaseAvailabilityRepository },
    { provide: AppointmentRepository, useClass: SupabaseAppointmentRepository },
    { provide: ClientAuth, useClass: SupabaseClientAuth },
  ];
}
