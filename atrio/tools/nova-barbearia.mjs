/**
 * Cadastra uma barbearia nova no Átrio.
 *
 *   npm run barbearia:nova -- --nome "Barbearia do Zé" --endereco barbearia-do-ze \
 *     --dono "José Silva" --email ze@exemplo.com [--telefone "(11) 95555-0000"] [--sem-catalogo]
 *
 * Cria a conta do dono (com senha temporária), a barbearia, o vínculo de
 * dono e um catálogo inicial de serviços — o banco faz as três últimas numa
 * transação só (public.create_tenant). Se a barbearia falhar, a conta que
 * acabou de ser criada é apagada: não sobra dono sem barbearia.
 *
 * Precisa da chave service_role do Supabase em .env.local (ver
 * .env.example). Ela ignora todas as regras de acesso do banco, por isso
 * mora só nesta máquina e só neste script — nunca nos apps.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    nome: { type: 'string' },
    endereco: { type: 'string' },
    dono: { type: 'string' },
    email: { type: 'string' },
    telefone: { type: 'string' },
    'sem-catalogo': { type: 'boolean', default: false },
  },
});

// ─── conferências antes de tocar no banco ──────────────────────────────────

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail(
    'Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY. Copie .env.example para .env.local e preencha\n' +
      '  (Supabase → Project Settings → API Keys → service_role / secret).',
  );
}

const missing = ['nome', 'endereco', 'dono', 'email'].filter((key) => !args[key]?.trim());
if (missing.length) {
  fail(
    `Falta: ${missing.map((key) => `--${key}`).join(', ')}.\n\n` +
      '  Exemplo:\n' +
      '  npm run barbearia:nova -- --nome "Barbearia do Zé" --endereco barbearia-do-ze \\\n' +
      '    --dono "José Silva" --email ze@exemplo.com',
  );
}

const slug = args.endereco.trim().toLowerCase();
if (!SLUG.test(slug)) {
  fail(
    `Endereço "${args.endereco}" inválido. Use letras minúsculas, números e hífen, sem acento:\n` +
      '  barbearia-do-ze, navalha-centro, studio-21.',
  );
}

const email = args.email.trim().toLowerCase();
if (!EMAIL.test(email)) fail(`E-mail "${args.email}" inválido.`);

// ─── conta do dono ──────────────────────────────────────────────────────────

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 12 caracteres legíveis: sem 0/O e 1/l, que se confundem ditados por WhatsApp. */
function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(12)].map((byte) => alphabet[byte % alphabet.length]).join('');
}

const password = temporaryPassword();
let createdUserId = null;

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name: args.dono.trim() },
});

if (createError) {
  // Conta já existente (o dono já é cliente, ou tem outra barbearia): usa a
  // mesma, sem mexer na senha dele.
  if (createError.code !== 'email_exists' && createError.status !== 422) {
    fail(`Não foi possível criar a conta do dono: ${createError.message}`);
  }
} else {
  createdUserId = created.user.id;
}

// ─── barbearia ──────────────────────────────────────────────────────────────

const { data: tenantId, error: tenantError } = await admin.rpc('create_tenant', {
  p_slug: slug,
  p_name: args.nome.trim(),
  p_owner_email: email,
  p_owner_name: args.dono.trim(),
  p_phone: args.telefone?.trim() || null,
  p_address: null,
  p_starter_catalog: !args['sem-catalogo'],
});

if (tenantError) {
  if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
  fail(tenantError.message);
}

// ─── resumo ─────────────────────────────────────────────────────────────────

const appCliente = process.env.APP_CLIENTE_URL ?? 'http://localhost:4300';
const appPainel = process.env.APP_PAINEL_URL ?? 'http://localhost:4200';

console.log(`
✔ ${args.nome.trim()} cadastrada (${tenantId})

  App do cliente   ${appCliente}/${slug}
  Painel           ${appPainel}

  Login do dono    ${email}
  Senha            ${createdUserId ? `${password}   ← temporária` : '(conta já existia: senha atual dele)'}
${args['sem-catalogo'] ? '' : '\n  Catálogo inicial: Corte, Barba, Corte + Barba e Acabamento — ajuste no painel.'}
  Próximos passos do dono, no painel:
    1. Profissionais → cadastrar quem atende, com os horários.
    2. Serviços e preços → ajustar o catálogo.
    3. Configurações → endereço e telefone.
${createdUserId ? '    4. Trocar a senha temporária em "Esqueci minha senha".\n' : ''}`);
