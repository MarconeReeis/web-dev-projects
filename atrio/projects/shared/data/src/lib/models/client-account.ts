import { Id } from './common';

/**
 * Conta do cliente final no app de agendamento.
 *
 * Não confundir com `Client`, que é o cadastro do cliente DENTRO de uma
 * barbearia (o atendente cria no balcão, sem conta nenhuma). A conta é da
 * pessoa e vale para qualquer barbearia que use o Átrio; `Client.userId`
 * liga os dois quando ela marca por aqui. Quem faz essa ligação é o
 * servidor, ao gravar o agendamento — nunca o app.
 */
export interface ClientAccount {
  readonly id: Id;
  readonly name: string;
  readonly email: string;
  /** Obrigatório: é por ele que a barbearia fala com o cliente. */
  readonly phone: string;
  readonly photoUrl: string | null;
}

export interface NewClientAccount {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
}

/**
 * Motivos de falha que a tela sabe explicar.
 *
 * O backend real tem dezenas de códigos; cada implementação traduz os seus
 * para estes. Assim a mensagem ao cliente mora num lugar só, e trocar de
 * provedor não muda texto de tela.
 */
export type ClientAuthErrorCode =
  /** E-mail ou senha errados — sem dizer qual, de propósito. */
  | 'credenciais'
  | 'email-em-uso'
  /** Conta criada, mas o provedor exige confirmar o e-mail antes de entrar. */
  | 'confirmacao-pendente'
  | 'indisponivel';

export class ClientAuthError extends Error {
  constructor(
    readonly code: ClientAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClientAuthError';
  }
}
