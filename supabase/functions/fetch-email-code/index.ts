import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CODE_PATTERNS = [
  /c[oó]digo[:\s]*(\d{4,8})/i,
  /c[oó]digo\s+de\s+(?:verifica[çc][ãa]o|valida[çc][ãa]|acesso)[:\s]*(\d{4,8})/i,
  /verification\s+code[:\s]*(\d{4,8})/i,
  /your\s+(?:verification\s+)?code[:\s]*(\d{4,8})/i,
  /use\s+(?:this\s+)?code[:\s]*(\d{4,8})/i,
  /pin[:\s]*(\d{4,8})/i,
  /(\d{6})\s+(?:is\s+your|for\s+your|é\s+seu)/i,
  /enter\s+(\d{4,8})/i,
  /digite\s+(\d{4,8})/i,
  /insira\s+(\d{4,8})/i,
  /\b(\d{6})\b/,
  /\b(\d{8})\b/,
];

const DEFAULT_BLOCKED_SUBJECTS = [
  "password",
  "recuperação",
  "redefinição",
  "redefinição de senha",
  "recuperação de senha",
  "alteração",
  "segurança",
  "seguranca",
  "alerta",
  "suspens",
  "novo dispositivo",
  "new device",
  "unusual",
  "compromised",
  "sua senha foi alterada",
  "your password was changed",
  "login activity",
  "atividade suspeita",
  "account locked",
  "conta bloqueada",
  "verify your identity",
  "confirme sua identidade",
];

function extractCode(
  body: string,
  blockedSubjects: string[],
): { code: string | null; reason?: string } {
  const lowerBody = (body || "").toLowerCase();
  for (const pattern of blockedSubjects) {
    if (lowerBody.includes(pattern.toLowerCase())) {
      return { code: null, reason: `Assunto bloqueado: ${pattern}` };
    }
  }

  for (const regex of CODE_PATTERNS) {
    const match = body.match(regex);
    if (match && match[1]) {
      return { code: match[1] };
    }
  }

  return { code: null, reason: "Nenhum código encontrado" };
}

function isSenderAllowed(sender: string, allowedSenders: string[]): boolean {
  if (!allowedSenders || allowedSenders.length === 0) return true;
  const lowerSender = (sender || "").toLowerCase();
  return allowedSenders.some((s) => lowerSender.includes(s.toLowerCase()));
}

class ImapClient {
  private conn: Deno.TlsConn;
  private tag = 0;
  private buffer = "";

  constructor(conn: Deno.TlsConn) {
    this.conn = conn;
  }

  private nextTag(): string {
    this.tag++;
    return `A${String(this.tag).padStart(3, "0")}`;
  }

  private async readLine(): Promise<string> {
    while (true) {
      const nlIndex = this.buffer.indexOf("\r\n");
      if (nlIndex !== -1) {
        const line = this.buffer.substring(0, nlIndex);
        this.buffer = this.buffer.substring(nlIndex + 2);
        return line;
      }
      const chunk = new Uint8Array(4096);
      const n = await this.conn.read(chunk);
      if (n === null) throw new Error("Connection closed");
      this.buffer += new TextDecoder().decode(chunk.subarray(0, n));
    }
  }

  private async readUntil(tag: string): Promise<string> {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (line.startsWith(tag + " ")) break;
    }
    return lines.join("\r\n");
  }

  async connect(): Promise<void> {
    const greeting = await this.readLine();
    if (!greeting.startsWith("* OK")) {
      throw new Error(`IMAP greeting failed: ${greeting}`);
    }
  }

  async login(user: string, password: string): Promise<void> {
    const tag = this.nextTag();
    await this.conn.write(
      new TextEncoder().encode(`${tag} LOGIN "${user}" "${password}"\r\n`),
    );
    const response = await this.readUntil(tag);
    if (!response.includes(`${tag} OK`)) {
      throw new Error(`IMAP LOGIN failed: ${response}`);
    }
  }

  async selectInbox(): Promise<void> {
    const tag = this.nextTag();
    await this.conn.write(
      new TextEncoder().encode(`${tag} SELECT INBOX\r\n`),
    );
    const response = await this.readUntil(tag);
    if (!response.includes(`${tag} OK`)) {
      throw new Error(`IMAP SELECT INBOX failed: ${response}`);
    }
  }

  async searchSince(dateStr: string): Promise<number[]> {
    const tag = this.nextTag();
    await this.conn.write(
      new TextEncoder().encode(`${tag} SEARCH SINCE "${dateStr}"\r\n`),
    );
    const response = await this.readUntil(tag);

    const searchLine = response
      .split("\r\n")
      .find((l) => l.startsWith("* SEARCH"));
    if (!searchLine) return [];

    const nums = searchLine.replace("* SEARCH", "").trim();
    if (!nums) return [];
    return nums.split(/\s+/).map(Number);
  }

  async fetchBody(uid: number): Promise<string> {
    const tag = this.nextTag();
    await this.conn.write(
      new TextEncoder().encode(`${tag} FETCH ${uid} (RFC822.TEXT)\r\n`),
    );
    const response = await this.readUntil(tag);

    const bodyMatch = response.match(/\{(\d+)\}\r\n([\s\S]*)/);
    if (bodyMatch) {
      return bodyMatch[2].substring(0, parseInt(bodyMatch[1]));
    }

    return response;
  }

  async fetchHeaders(uid: number): Promise<string> {
    const tag = this.nextTag();
    await this.conn.write(
      new TextEncoder().encode(
        `${tag} FETCH ${uid} (BODY[HEADER.FIELDS (FROM SUBJECT)])\r\n`,
      ),
    );
    return await this.readUntil(tag);
  }

  async logout(): Promise<void> {
    try {
      const tag = this.nextTag();
      await this.conn.write(
        new TextEncoder().encode(`${tag} LOGOUT\r\n`),
      );
      await this.readUntil(tag);
    } catch {
      // ignore
    }
  }

  close(): void {
    try {
      this.conn.close();
    } catch {
      // ignore
    }
  }
}

function parseDate(date: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function extractSender(headerBlock: string): string {
  const fromMatch = headerBlock.match(/From:\s*(.+)/i);
  if (fromMatch) return fromMatch[1].trim();
  return "";
}

function extractSubject(headerBlock: string): string {
  const subMatch = headerBlock.match(/Subject:\s*(.+)/i);
  if (subMatch) return subMatch[1].trim();
  return "";
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
        return new Response(
          JSON.stringify({ error: "Token não fornecido" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const jwt = authHeader.replace("Bearer ", "");
      const {
        data: { user: caller },
        error: callerError,
      } = await supabaseAdmin.auth.getUser(jwt);

      if (callerError || !caller) {
        return new Response(
          JSON.stringify({ error: "Token inválido" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const body = await req.json();
      const { group_id } = body;

      if (!group_id) {
        return new Response(
          JSON.stringify({ error: "group_id é obrigatório" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Verify user is active member
      const { data: member } = await supabaseAdmin
        .from("group_members")
        .select("id")
        .eq("group_id", group_id)
        .eq("user_id", caller.id)
        .eq("status", "active")
        .maybeSingle();

      const { data: subscription } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id")
        .eq("group_id", group_id)
        .eq("user_id", caller.id)
        .eq("status", "active")
        .maybeSingle();

      if (!member && !subscription) {
        return new Response(
          JSON.stringify({ error: "Você não é membro deste grupo" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Fetch group email config
      const { data: group, error: groupError } = await supabaseAdmin
        .from("groups")
        .select(
          "email_code_enabled, email_address, email_imap_server, email_imap_port, email_imap_user, email_imap_password, email_allowed_senders, email_blocked_subjects",
        )
        .eq("id", group_id)
        .single();

      if (groupError || !group) {
        return new Response(
          JSON.stringify({ error: "Grupo não encontrado" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!group.email_code_enabled) {
        return new Response(
          JSON.stringify({
            error: "Busca de códigos não habilitada para este grupo",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (
        !group.email_imap_server ||
        !group.email_imap_user ||
        !group.email_imap_password
      ) {
        return new Response(
          JSON.stringify({
            error: "Configuração de e-mail incompleta para este grupo",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const imapPort = group.email_imap_port || 993;
      const allowedSenders = group.email_allowed_senders || [];
      const blockedSubjects = [
        ...DEFAULT_BLOCKED_SUBJECTS,
        ...(group.email_blocked_subjects || []),
      ];

      // Connect to IMAP with timeout
      let conn: Deno.TlsConn;
      try {
        conn = await Promise.race([
          Deno.connectTls({
            hostname: group.email_imap_server,
            port: imapPort,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout ao conectar em ${group.email_imap_server}:${imapPort}. Verifique se o servidor e porta estão corretos.`)), 15000)
          ),
        ]);
      } catch (e) {
        throw new Error(`Falha na conexão TLS com ${group.email_imap_server}:${imapPort}: ${e.message}`);
      }

      console.log(`Connected to IMAP: ${group.email_imap_server}:${imapPort} as ${group.email_imap_user}`);
      const client = new ImapClient(conn);

      try {
        await client.connect();
        console.log("IMAP connected, greeting OK");
        await client.login(group.email_imap_user, group.email_imap_password);
        console.log("IMAP login OK");
        await client.selectInbox();
        console.log("IMAP INBOX selected");

        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const dateStr = parseDate(tenMinAgo.toISOString().split("T")[0]);
        console.log(`Searching emails since ${dateStr}`);
        const uids = await client.searchSince(dateStr);

        console.log(`Found ${uids.length} email(s) since ${dateStr}`);

        if (uids.length === 0) {
          return Response.json(
            {
              code: null,
              message:
                "Nenhum e-mail encontrado nos últimos 10 minutos.",
            },
            { headers: corsHeaders },
          );
        }

        const sortedUids = [...uids].reverse();
        let foundCode: string | null = null;
        let foundSender = "";
        let foundSubject = "";

        for (const uid of sortedUids.slice(0, 10)) {
          const headerBlock = await client.fetchHeaders(uid);
          const sender = extractSender(headerBlock);
          const subject = extractSubject(headerBlock);

          if (!isSenderAllowed(sender, allowedSenders)) {
            continue;
          }

          const subjectLower = (subject || "").toLowerCase();
          const isBlocked = blockedSubjects.some((p) =>
            subjectLower.includes(p.toLowerCase()),
          );
          if (isBlocked) {
            continue;
          }

          const bodyText = await client.fetchBody(uid);
          const result = extractCode(bodyText, blockedSubjects);

          if (result.code) {
            foundCode = result.code;
            foundSender = sender;
            foundSubject = subject;
            break;
          }
        }

        if (!foundCode) {
          return Response.json(
            {
              code: null,
              message: "Nenhum código de verificação encontrado nos e-mails recentes.",
            },
            { headers: corsHeaders },
          );
        }

        // Save code to verification_pins
        const { error: insertError } = await supabaseAdmin
          .from("verification_pins")
          .insert({
            group_id,
            code: foundCode,
            source_email: foundSender,
            used: false,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

        if (insertError) {
          console.error("Failed to save verification pin:", insertError);
        }

        return Response.json(
          {
            code: foundCode,
            sender: foundSender,
            subject: foundSubject,
            received_at: new Date().toISOString(),
            expires_in: 600,
          },
          { headers: corsHeaders },
        );
      } finally {
        client.close();
      }
    } catch (error) {
      console.error("fetch-email-code error:", error);
      console.error("Error type:", error.constructor?.name);
      console.error("Error stack:", error.stack);
      const msg = error.message || "Erro interno ao buscar código";
      let hint = "";
      if (msg.includes("LOGIN failed")) {
        hint = " Credenciais IMAP inválidas. Se usa 2FA no Zoho, gere uma Senha de App em Settings > Security > App Passwords.";
      } else if (msg.includes("timeout") || msg.includes("Timeout")) {
        hint = " Servidor IMAP inacessível. Verifique o servidor e porta.";
      } else if (msg.includes("conexão") || msg.includes("connection") || msg.includes("Connection")) {
        hint = " Não foi possível conectar ao servidor IMAP. Verifique servidor, porta e firewall.";
      }
      return new Response(
        JSON.stringify({ error: msg + hint, type: error.constructor?.name }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  },
};