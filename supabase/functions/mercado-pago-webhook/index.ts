import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
      const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? "";

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const body = await req.json();
      console.log("Webhook received:", JSON.stringify(body));

      // Mercado Pago envia notificações com tipo e id do recurso
      const topic = body.type || body.topic;
      const resourceId = body.data?.id;

      if (!topic || !resourceId) {
        return new Response(
          JSON.stringify({ message: "Evento ignorado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (topic === "subscription_preapproval" || topic === "preapproval") {
        // Busca detalhes da assinatura no Mercado Pago
        const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
          headers: { Authorization: `Bearer ${mpAccessToken}` },
        });

        if (!mpResponse.ok) {
          console.error("Failed to fetch preapproval from MP");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const preapproval = await mpResponse.json();
        const [group_id, user_id] = (preapproval.external_reference || "").split(":");

        if (!group_id || !user_id) {
          console.error("Invalid external_reference", preapproval.external_reference);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Atualiza assinatura no Supabase
        const { error: updateError } = await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: preapproval.status === "authorized" ? "active" : preapproval.status,
            mercado_pago_status: preapproval.status,
            updated_at: new Date().toISOString(),
          })
          .eq("mercado_pago_subscription_id", resourceId);

        if (updateError) {
          console.error("Error updating subscription:", updateError);
        }

        // Se a assinatura foi cancelada, remove usuário do grupo
        if (preapproval.status === "cancelled" || preapproval.status === "paused") {
          const { error: cancelError } = await supabaseAdmin
            .from("user_subscriptions")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("mercado_pago_subscription_id", resourceId);

          if (cancelError) {
            console.error("Error cancelling subscription:", cancelError);
          }
        }

        // Se a assinatura foi autorizada, adiciona usuário ao grupo
        if (preapproval.status === "authorized") {
          // Busca próxima data de cobrança
          const nextPaymentDate = preapproval.auto_recurring?.next_payment_date;

          // Adiciona membro ao grupo
          const { error: memberError } = await supabaseAdmin
            .from("group_members")
            .upsert({
              group_id,
              user_id,
              status: "active",
              joined_at: new Date().toISOString(),
            }, { onConflict: "group_id, user_id" });

          if (memberError) {
            console.error("Error adding group member:", memberError);
          }

          // Cria ou atualiza user_subscriptions
          const { error: subError } = await supabaseAdmin
            .from("user_subscriptions")
            .upsert({
              user_id,
              group_id,
              service_id: preapproval.external_reference ? undefined : null,
              status: "active",
              started_at: new Date().toISOString(),
              expires_at: nextPaymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }, { onConflict: "user_id, group_id" });

          if (subError) {
            console.error("Error updating user_subscriptions:", subError);
          }

          // Cria pagamento confirmado
          const { error: paymentError } = await supabaseAdmin
            .from("payments")
            .insert({
              user_id,
              amount: preapproval.auto_recurring?.transaction_amount || 0,
              method: "mercado_pago",
              status: "paid",
              transaction_code: resourceId,
              paid_at: new Date().toISOString(),
            });

          if (paymentError) {
            console.error("Error inserting payment:", paymentError);
          }

          // Marca fatura atual como paga se existir
          const { error: invoiceError } = await supabaseAdmin
            .from("invoices")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("user_id", user_id)
            .eq("status", "pending")
            .order("due_date", { ascending: true })
            .limit(1);

          if (invoiceError) {
            console.error("Error updating invoice:", invoiceError);
          }
        }
      } else if (topic === "payment") {
        // Pagamento avulso (se usar preferências no futuro)
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
          headers: { Authorization: `Bearer ${mpAccessToken}` },
        });

        if (!mpResponse.ok) {
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const payment = await mpResponse.json();
        console.log("Payment notification:", payment);
      }

      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
