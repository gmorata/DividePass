// create-group-email: cria a mailbox do grupo no cPanel de hospedagem.
//
// Fluxo (chamado pelo dono do grupo em /dashboard/my-groups/:id/manage):
//   1. Valida o JWT e confere que o caller é dono do grupo (ou admin).
//   2. Monta o endereço no padrão [id_do_grupo]@dominio.
//   3. Cria a mailbox no cPanel via API do provedor de hospedagem.
//   4. Grava as credenciais de IMAP em `groups` para o fetch-email-code ler.
//
// A senha da mailbox é gerada aqui e nunca volta para o navegador: só o
// e-mail e o host de IMAP são expostos na resposta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DOMAIN = Deno.env.get("GROUP_EMAIL_DOMAIN") || "dividepass.com";
const MAIL_HOST = Deno.env.get("GROUP_EMAIL_IMAP_HOST") || "mail.dividepass.com";
const MAIL_PORT = Number(Deno.env.get("GROUP_EMAIL_IMAP_PORT") || "993");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Senha ÚNICA e fixa para todas as mailboxes dos grupos.
 * Definida por decisão do dono do produto (facilita suporte/manual).
 * Excepcionalmente, se o env var existir, ele tem precedência.
 */
const SENHA_PADRAO = Deno.env.get("GROUP_EMAIL_PASSWORD") || "DianaDamGa08";

function gerarSenha(): string {
  return SENHA_PADRAO;
}

/**
 * Chama o cPanel (WHM API) para criar a conta de e-mail.
 * O token é um segredo do ambiente; a senha do cPanel nunca sai daqui.
 */
async function criarMailboxCpanel(
  email: string,
  senha: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const base = Deno.env.get("CPANEL_API_URL");
  const user = Deno.env.get("CPANEL_API_USER");
  const token = Deno.env.get("CPANEL_API_TOKEN");

  if (!base || !user || !token) {
    return {
      ok: false,
      erro:
        "Integração de hospedagem não configurada (CPANEL_API_URL, CPANEL_API_USER, CPANEL_API_TOKEN).",
    };
  }

  const url = `${base.replace(/\/$/, "")}/json-api/cpanel?api.version=1`;
  const params = new URLSearchParams({
    user,
    "api.version": "1",
    module: "Email",
    function: "add_pop_email",
    email,
    domain: DOMAIN,
    password: senha,
    quota: "1024",
  });

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const corpo = await resp.json();
    if (!resp.ok) {
      const motivo =
        corpo?.result?.errors?.[0]?.message ||
        corpo?.statusmsg ||
        `HTTP ${resp.status}`;
      // "already exists" não é erro fatal aqui: a function reusa a conta.
      if (!/already (exists|exist)/i.test(motivo)) {
        return { ok: false, erro: `Falha ao criar a mailbox: ${motivo}` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: `Erro de rede ao falar com o cPanel: ${e.message}` };
  }
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const authHeader = req.headers.get("authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return json({ error: "Token não fornecido" }, 401);
      }

      const jwt = authHeader.replace("Bearer ", "");
      const {
        data: { user: caller },
        error: callerError,
      } = await supabaseAdmin.auth.getUser(jwt);
      if (callerError || !caller) {
        return json({ error: "Token inválido" }, 401);
      }

      const body = await req.json();
      const groupId = String(body.group_id || "");
      if (!groupId) {
        return json({ error: "group_id é obrigatório" }, 400);
      }

      const { data: group, error: groupError } = await supabaseAdmin
        .from("groups")
        .select("id, name, owner_id, email_address, email_code_enabled, email_imap_server, email_imap_user")
        .eq("id", groupId)
        .single();

      if (groupError || !group) {
        return json({ error: "Grupo não encontrado" }, 404);
      }

      const isAdmin = caller.app_metadata?.role === "admin";
      if (!isAdmin && group.owner_id !== caller.id) {
        return json({ error: "Você não é o proprietário deste grupo" }, 403);
      }

      // Idempotência: se o grupo já tem e-mail configurado, devolve o estado
      // atual sem criar nada (e sem trocar a senha de uma conta em uso).
      if (group.email_address && group.email_imap_server) {
        return json({
          ok: true,
          criado: false,
          email: group.email_address,
          imap_server: group.email_imap_server,
          imap_port: MAIL_PORT,
          mensagem: "Este grupo já possui um e-mail configurado.",
        });
      }

      const email = `${group.id}@${DOMAIN}`;
      const senha = gerarSenha();

      const resultado = await criarMailboxCpanel(email, senha);
      if (!resultado.ok) {
        return json({ error: resultado.erro }, 502);
      }

      const { error: updateError } = await supabaseAdmin
        .from("groups")
        .update({
          email_code_enabled: true,
          email_code_method: "imap",
          email_address: email,
          email_imap_server: MAIL_HOST,
          email_imap_port: MAIL_PORT,
          email_imap_user: email,
          email_imap_password: senha,
          email_allowed_senders: [],
          email_blocked_subjects: [],
        })
        .eq("id", groupId);

      if (updateError) {
        return json(
          { error: `E-mail criado, mas não foi possível salvar: ${updateError.message}` },
          500,
        );
      }

      return json({
        ok: true,
        criado: true,
        email,
        imap_server: MAIL_HOST,
        imap_port: MAIL_PORT,
      });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
