import { Injectable, Provider, inject } from '@angular/core';
import { AuthError, User } from '@supabase/supabase-js';
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
  SlugTenantScope,
  SupabaseTenantScope,
  createSupabaseClient,
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
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly scope = inject(SupabaseTenantScope);

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
    return this.publish(await this.accountOf(data.user));
  }

  async signUp(input: NewClientAccount): Promise<ClientAccount> {
    const tenant = await this.scope.row().catch(() => null);
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        // O gatilho do banco cria o perfil a partir de name e phone. O nome
        // da barbearia vai para os e-mails (supabase/templates): quem se
        // cadastrou na "Barbearia X" recebe um e-mail da Barbearia X.
        data: {
          name: input.name.trim(),
          phone: input.phone.trim(),
          ...(tenant ? { barbearia: tenant.name } : {}),
        },
        // O link de confirmação volta para esta barbearia, já logado.
        emailRedirectTo: this.confirmationRedirect(),
      },
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
    return this.publish(await this.accountOf(data.user));
  }

  /**
   * Publica a conta já na resposta do login, sem esperar o onAuthStateChange
   * — quem chamou pode reagir à sessão logo em seguida (ver o mesmo caso em
   * SupabaseStaffAuth.signIn, onde a demora mandava de volta ao login).
   */
  private publish(account: ClientAccount): ClientAccount {
    this.session$.next(account);
    return account;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async sendPasswordReset(email: string): Promise<void> {
    // O link do e-mail volta para a tela de nova senha DESTA barbearia. O
    // endereço precisa estar em "Redirect URLs" no Supabase — senão ele
    // manda para a Site URL e a pessoa cai fora do app.
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/b/${this.config.tenantSlug()}/nova-senha`,
    });
    // Mesmo resultado exista a conta ou não; só falha de rede chega aqui.
    if (error && error.status !== 400) throw translate(error);
  }

  async resendConfirmation(email: string): Promise<void> {
    const { error } = await this.client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: this.confirmationRedirect() },
    });
    if (!error) return;
    // O limite de envios tem resposta própria. O resto — conta que não
    // existe ou já confirmada — resolve calado, como o "esqueci a senha".
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      throw new ClientAuthError('indisponivel', TOO_MANY_EMAILS);
    }
    if (error.status !== 400 && error.status !== 422) throw translate(error);
  }

  private confirmationRedirect(): string {
    return `${location.origin}/b/${this.config.tenantSlug()}`;
  }

  /**
   * A sessão aberta pelo link do e-mail é a credencial: sem ela, o link
   * venceu ou já foi usado.
   */
  async updatePassword(password: string): Promise<ClientAccount> {
    const { data: current } = await this.client.auth.getSession();
    if (!current.session) {
      throw new ClientAuthError('link-invalido', 'Este link expirou ou já foi usado. Peça um novo.');
    }

    const { data, error } = await this.client.auth.updateUser({ password });
    if (error) throw translate(error);
    return this.publish(await this.accountOf(data.user));
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.client.rpc('delete_my_account');
    if (error) {
      if (error.hint === 'conta_da_equipe') {
        throw new ClientAuthError('conta-da-equipe', error.message);
      }
      console.error('[supabase]', error);
      throw new ClientAuthError(
        'indisponivel',
        'Não foi possível excluir a conta agora. Tente de novo em instantes.',
      );
    }
    // A conta não existe mais: a sessão guardada no aparelho também sai.
    await this.client.auth.signOut({ scope: 'local' });
    this.session$.next(null);
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

const TOO_MANY_EMAILS = 'Muitos e-mails em pouco tempo. Espere alguns minutos e tente de novo.';

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
    case 'over_email_send_rate_limit':
      return new ClientAuthError('indisponivel', TOO_MANY_EMAILS);
    case 'same_password':
      return new ClientAuthError('indisponivel', 'Escolha uma senha diferente da anterior.');
    default:
      console.error('[supabase auth]', error);
      return new ClientAuthError(
        'indisponivel',
        'Não foi possível concluir agora. Tente de novo em instantes.',
      );
  }
}

/**
 * Liga o app do CLIENTE ao Supabase. Troca `provideDemoData()` no app.config.
 *
 * A barbearia vem do endereço (/b/:slug). O painel tem o seu:
 * provideSupabaseAdminData.
 */
export function provideSupabaseData(config: SupabaseDataConfig): Provider[] {
  return [
    { provide: SUPABASE_CONFIG, useValue: config },
    {
      provide: SUPABASE_CLIENT,
      useFactory: () => createSupabaseClient(config.url, config.key, 'atrio.auth.cliente'),
    },
    SupabaseSync,
    { provide: SupabaseTenantScope, useClass: SlugTenantScope },
    { provide: TenantRepository, useClass: SupabaseTenantRepository },
    { provide: ProfessionalRepository, useClass: SupabaseProfessionalRepository },
    { provide: ServiceRepository, useClass: SupabaseServiceRepository },
    { provide: AvailabilityRepository, useClass: SupabaseAvailabilityRepository },
    { provide: AppointmentRepository, useClass: SupabaseAppointmentRepository },
    { provide: ClientAuth, useClass: SupabaseClientAuth },
  ];
}
