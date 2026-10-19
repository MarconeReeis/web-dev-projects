/** Identificador de documento. String porque o Firestore gera string. */
export type Id = string;

/**
 * Instante em ISO 8601 com fuso ("2026-10-16T14:30:00-03:00").
 *
 * String, e não Date, por três motivos: serializa direto para Firestore e
 * localStorage, é comparável lexicograficamente quando normalizada em UTC, e
 * não sofre a mutabilidade silenciosa do Date. A conversão para Date acontece
 * só na borda de apresentação.
 */
export type IsoDateTime = string;

/** Data sem hora, "2026-10-16". Usada em filtros de período. */
export type IsoDate = string;

/** Hora local do estabelecimento, "09:00". Nunca carrega fuso. */
export type ClockTime = string;

/**
 * Dinheiro em CENTAVOS, sempre inteiro.
 *
 * R$ 45,00 é 4500. Ponto flutuante não representa 0,1 exatamente e o erro
 * aparece exatamente onde não pode: no fechamento de caixa do dono.
 * Formate só na exibição (ver formatMoney).
 */
export type Cents = number;

export interface DateRange {
  readonly from: IsoDateTime;
  /** Exclusivo: facilita somar períodos sem contar o limite duas vezes. */
  readonly to: IsoDateTime;
}

/**
 * Todo documento do sistema pertence a uma barbearia.
 *
 * O campo existe desde o primeiro dia mesmo com um cliente só: as regras de
 * segurança filtram por ele, e acrescentar isolamento depois significa migrar
 * dados em produção.
 */
export interface TenantScoped {
  readonly tenantId: Id;
}

export interface Audited {
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

/**
 * Id novo para algo criado no app (profissional, serviço).
 *
 * UUID v4: é o tipo da chave no banco, e nasce no app — e não no servidor —
 * porque a tela de Serviços salva o serviço e, em seguida, quem o realiza,
 * usando o mesmo id nas duas chamadas.
 *
 * `crypto.randomUUID` só existe em contexto seguro (HTTPS ou localhost).
 * Aberto pelo IP da rede local, para testar no celular, cai no
 * `getRandomValues`, que existe em qualquer contexto.
 */
export function newEntityId(): Id {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
