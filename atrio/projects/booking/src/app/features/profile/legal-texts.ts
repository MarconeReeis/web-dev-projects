/**
 * Textos dos Termos de uso e da Política de privacidade.
 *
 * RASCUNHO para revisão jurídica antes do lançamento. Descrevem o que o app
 * faz de fato (dados, fornecedores, exclusão de conta); quem revisa ajusta a
 * linguagem e as bases legais, não o funcionamento. Mudou o texto, muda
 * TERMS_VERSION (@atrio/data): o banco guarda qual versão cada conta aceitou.
 *
 * Os campos entre colchetes em LEGAL_ENTITY são da empresa e precisam ser
 * preenchidos antes de publicar.
 */

export const LEGAL_ENTITY = {
  name: '[RAZÃO SOCIAL]',
  cnpj: '[CNPJ]',
  /** Encarregado de dados (DPO): quem atende pedidos de titulares. */
  email: 'privacidade@atrioagenda.com.br',
} as const;

export interface LegalSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly items?: readonly string[];
}

const company = `${LEGAL_ENTITY.name}, CNPJ ${LEGAL_ENTITY.cnpj}`;

export function privacyPolicy(shop: string): readonly LegalSection[] {
  return [
    {
      title: 'Quem cuida dos seus dados',
      paragraphs: [
        // O nome da barbearia nunca no fim da frase: "Navalha & Co." + "." daria "..".
        `A ${shop} usa o Átrio Agenda para os agendamentos. Os dados da sua conta (nome, e-mail, telefone e senha) são tratados pelo Átrio — ${company} — como controlador.`,
        `Os dados dos seus atendimentos são da ${shop}, que decide como usá-los. O Átrio os guarda e processa em nome dela, como operador.`,
      ],
    },
    {
      title: 'Quais dados coletamos',
      paragraphs: [],
      items: [
        'Conta: nome, telefone, e-mail e senha. A senha fica guardada de forma cifrada — nem nós conseguimos lê-la.',
        'Agendamentos: serviço, profissional, data, horário, valor, situação (pendente, confirmado, cancelado) e observações anotadas pela barbearia.',
        'Aceite destes documentos: a versão aceita e a data.',
        'Segurança: ao entrar ou criar conta, uma verificação automática contra robôs (Cloudflare Turnstile) analisa sinais técnicos do navegador.',
        'Erros do app: registros técnicos de falhas, sem seu nome, e-mail, telefone ou endereço IP.',
      ],
    },
    {
      title: 'Para que usamos',
      paragraphs: [
        'Não vendemos seus dados, não os usamos para publicidade e o app não tem rastreadores de anúncios.',
      ],
      items: [
        'Criar e manter sua conta e permitir que você agende, reagende e cancele horários — para executar o serviço que você pediu.',
        'Enviar e-mails sobre seus horários: confirmação, lembrete, mudanças e cancelamentos — pelo mesmo motivo.',
        'Permitir que a barbearia organize a agenda e registre atendimentos e pagamentos — para executar o serviço e cumprir obrigações legais dela.',
        'Bloquear robôs e contas falsas e corrigir erros do app — por legítimo interesse em manter o serviço seguro e funcionando.',
      ],
    },
    {
      title: 'Com quem compartilhamos',
      paragraphs: [
        `A ${shop} vê seu nome, telefone, e-mail e os horários que você marcou com ela. Outras barbearias não veem nada disso.`,
        'Para funcionar, o Átrio usa fornecedores que tratam dados apenas para prestar o serviço contratado:',
      ],
      items: [
        'Supabase — banco de dados e login.',
        'Resend — envio dos e-mails.',
        'Cloudflare — hospedagem do app e verificação contra robôs.',
        'Sentry — registro de erros do app, sem dados pessoais.',
      ],
    },
    {
      title: 'Dados fora do Brasil',
      paragraphs: [
        'Alguns desses fornecedores guardam dados nos Estados Unidos. Essa transferência segue o artigo 33 da LGPD, com garantias contratuais de proteção equivalentes às da lei brasileira.',
      ],
    },
    {
      title: 'Por quanto tempo guardamos',
      paragraphs: [
        'Enquanto sua conta existir. Se você excluí-la, seus horários futuros são cancelados e seu nome, telefone e observações saem do histórico da barbearia. Os valores já pagos continuam no caixa dela, sem seu nome, porque a barbearia precisa deles para a contabilidade.',
      ],
    },
    {
      title: 'Seus direitos',
      paragraphs: [
        'Pela LGPD (artigo 18), você pode a qualquer momento:',
      ],
      items: [
        'Confirmar se tratamos seus dados e acessá-los.',
        'Corrigir dados — direto no app, em Perfil.',
        'Excluir sua conta — direto no app, em Perfil → Privacidade.',
        'Pedir a portabilidade dos dados, saber com quem foram compartilhados e revogar consentimentos.',
      ],
    },
    {
      title: 'Fale com a gente',
      paragraphs: [
        `Pedidos e dúvidas sobre seus dados: ${LEGAL_ENTITY.email}. Respondemos em até 15 dias. Se não ficar satisfeito, você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).`,
      ],
    },
    {
      title: 'Dados no seu aparelho',
      paragraphs: [
        'O app guarda sua sessão no navegador para você não precisar entrar a cada visita. Não usamos cookies de publicidade.',
      ],
    },
    {
      title: 'Mudanças nesta política',
      paragraphs: [
        'Se esta política mudar, avisaremos no app e pediremos um novo aceite antes de você continuar.',
      ],
    },
  ];
}

export function termsOfUse(shop: string): readonly LegalSection[] {
  return [
    {
      title: 'O que é o Átrio Agenda',
      paragraphs: [
        `O Átrio Agenda permite marcar horários na ${shop} pela internet. Ele é oferecido por ${company}.`,
        `O atendimento em si é prestado pela ${shop}, não pelo Átrio: serviços, preços, duração, horários de funcionamento e regras de cancelamento são definidos por ela.`,
      ],
    },
    {
      title: 'Sua conta',
      paragraphs: [],
      items: [
        'Use seus dados verdadeiros: a barbearia conta com eles para falar com você.',
        'A senha é só sua. Não a compartilhe; se suspeitar de uso indevido, troque-a em Perfil.',
        'Você responde pelo que for feito com a sua conta.',
      ],
    },
    {
      title: 'Agendamentos',
      paragraphs: [],
      items: [
        'O horário fica reservado para você assim que o agendamento é feito. Algumas barbearias confirmam o pedido antes — até lá, ele aparece como pendente.',
        'Se não puder ir, cancele ou reagende pelo app dentro do prazo indicado, para liberar o horário para outra pessoa.',
        'A barbearia pode cancelar ou remarcar um horário em caso de imprevisto; você é avisado por e-mail.',
      ],
    },
    {
      title: 'O que não é permitido',
      paragraphs: [],
      items: [
        'Usar robôs ou meios automáticos para criar contas ou marcar horários.',
        'Reservar horários que você não pretende usar.',
        'Se passar por outra pessoa ou usar dados de terceiros.',
        'Tentar acessar dados de outras pessoas ou atrapalhar o funcionamento do app.',
      ],
    },
    {
      title: 'Disponibilidade',
      paragraphs: [
        'Trabalhamos para manter o app sempre no ar, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros. Quando possível, avisaremos com antecedência.',
      ],
    },
    {
      title: 'Encerramento',
      paragraphs: [
        'Você pode excluir sua conta quando quiser, em Perfil → Privacidade. Contas que violem estes termos podem ser suspensas.',
      ],
    },
    {
      title: 'Mudanças e lei aplicável',
      paragraphs: [
        'Se estes termos mudarem, avisaremos no app e pediremos um novo aceite. Valem as leis brasileiras, incluindo o Código de Defesa do Consumidor, e o foro do seu domicílio.',
      ],
    },
  ];
}
