import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateSubscriptionBody {
  group_id: string;
  user_id: string;
  payer_email: string;
  amount: number;
  reason: string;
  back_url: string;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
      const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? "";

      if (!mpAccessToken) {
        throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const { group_id, user_id, payer_email, amount, reason, back_url }: CreateSubscriptionBody = await req.json();

      if (!group_id || !user_id || !payer_email || !amount) {
        return new Response(
          JSON.stringify({ error: "Dados incompletos para criar assinatura" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Busca dados do grupo e serviço para referência
      const { data: group, error: groupError } = await supabaseAdmin
        .from("groups")
        .select("*, service:service_id(*)")
        .eq("id", group_id)
        .single();

      if (groupError || !group) {
        return new Response(
          JSON.stringify({ error: "Grupo não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cria assinatura recorrente no Mercado Pago
      const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payer_email,
          back_url,
          reason,
          external_reference: `${group_id}:${user_id}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: amount,
            currency_id: "BRL",
          },
          status: "pending",
        }),
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error("Mercado Pago error:", mpData);
        return new Response(
          JSON.stringify({ error: "Erro ao criar assinatura no Mercado Pago", details: mpData }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Registra a assinatura pendente no Supabase
      const { error: insertError } = await supabaseAdmin
        .from("user_subscriptions")
        .upsert({
          user_id,
          group_id,
          service_id: group.service_id,
          mercado_pago_subscription_id: mpData.id,
          amount,
          status: "pending",
          mercado_pago_status: "pending",
          external_reference: `${group_id}:${user_id}`,
          started_at: new Date().toISOString(),
        }, { onConflict: "user_id, group_id" });

      if (insertError) {
        console.error("Supabase insert error:", insertError);
      }

      return Response.json(
        {
          subscription_id: mpData.id,
          init_point: mpData.init_point,
          sandbox_init_point: mpData.sandbox_init_point,
        },
        { headers: corsHeaders }
      );
    } catch (error) {
      console.error("Function error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
