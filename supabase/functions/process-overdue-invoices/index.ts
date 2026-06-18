import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generatePassword(length = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const authHeader = req.headers.get("authorization") || "";
    const expectedSecret = Deno.env.get("OVERDUE_CRON_SECRET") ?? "";

    // Exige secret para chamadas via cron/painel, mas permite chamadas autenticadas.
    const isServiceRole = authHeader === `Bearer ${expectedSecret}`;
    const hasValidAuth = authHeader.startsWith("Bearer ") && isServiceRole;

    if (!hasValidAuth) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const cutoff = fiveDaysAgo.toISOString().split("T")[0];

      // Busca faturas pendentes vencidas há mais de 5 dias
      const { data: overdueInvoices, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .select("*, subscription:user_subscriptions!inner(id, status, group_id, user_id)")
        .eq("status", "pending")
        .lt("due_date", cutoff);

      if (invoiceError) {
        throw invoiceError;
      }

      const processed: string[] = [];

      for (const invoice of overdueInvoices || []) {
        const subscriptionId = invoice.subscription?.id;
        const userId = invoice.user_id;
        const groupId = invoice.group_id || invoice.subscription?.group_id;

        if (!userId || !groupId) continue;

        // 1. Marca fatura como falha/inadimplente
        await supabaseAdmin
          .from("invoices")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", invoice.id);

        // 2. Cancela/expira a assinatura
        if (subscriptionId) {
          await supabaseAdmin
            .from("user_subscriptions")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("id", subscriptionId);
        }

        // 3. Remove o membro do grupo
        await supabaseAdmin
          .from("group_members")
          .update({ status: "inactive", left_at: new Date().toISOString() })
          .eq("group_id", groupId)
          .eq("user_id", userId);

        // 4. Reseta a senha da credencial do grupo para invalidar acesso
        const newPassword = generatePassword();
        await supabaseAdmin
          .from("group_credentials")
          .update({ login_password: newPassword, updated_at: new Date().toISOString() })
          .eq("group_id", groupId);

        // 5. Log de atividade
        await supabaseAdmin.from("activity_logs").insert({
          user_id: userId,
          action: "update",
          entity_type: "subscription",
          entity_id: subscriptionId,
          description: `Membro removido por inadimplência. Fatura ${invoice.id} vencida há mais de 5 dias. Senha da credencial alterada.`,
        });

        // 6. Notifica os outros membros ativos do grupo sobre a remoção
        const { data: activeMembers } = await supabaseAdmin
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId)
          .eq("status", "active");

        const notifications = (activeMembers || [])
          .filter((m) => m.user_id !== userId)
          .map((m) => ({
            user_id: m.user_id,
            title: "Atualização de segurança no grupo",
            message: "Um membro foi removido por inadimplência e a senha da conta foi alterada. Verifique suas credenciais.",
            read: false,
            created_at: new Date().toISOString(),
          }));

        if (notifications.length > 0) {
          await supabaseAdmin.from("notifications").insert(notifications);
        }

        processed.push(invoice.id);
      }

      return Response.json(
        { processed: processed.length, invoices: processed },
        { headers: corsHeaders }
      );
    } catch (error) {
      console.error("Overdue invoices error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
