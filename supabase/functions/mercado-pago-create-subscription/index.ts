import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreatePaymentBody {
  group_id: string;
  user_id: string;
  amount: number;
  billing_cycle: string;
  months: number;
  reason: string;
  back_url: string;
  referral_code?: string;
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

      const { group_id, user_id, amount, billing_cycle, months, reason, back_url, referral_code }: CreatePaymentBody = await req.json();

      if (!group_id || !user_id || !amount || !reason) {
        return new Response(
          JSON.stringify({ error: "Dados incompletos para criar pagamento" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cycleMonths = months && months > 0 ? months : 1;
      const cycle = billing_cycle || "monthly";

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

      const webhookUrl = `${supabaseUrl}/functions/v1/mercado-pago-webhook`;
      const externalReference = `${group_id}:${user_id}`;

      // Cria preferência de pagamento no Mercado Pago Checkout Pro.
      // Permite que qualquer conta do Mercado Pago efetue o pagamento,
      // pois a identificação do cliente é feita pelo external_reference.
      // Verifica se tem entrada
      const hasEntrance = group.has_entrance_fee && Number(group.entrance_fee || 0) > 0;
      const entranceValue = hasEntrance ? Number(group.entrance_fee) : 0;
      const subValue = amount - entranceValue;

      const itemDescription = hasEntrance
        ? `Assinatura ${cycleMonths}x ${cycleMonths > 1 ? "meses" : "mês"}: R$ ${subValue.toFixed(2)} + Taxa de entrada: R$ ${entranceValue.toFixed(2)} (pagamento único)`
        : `Assinatura ${cycle} do grupo ${group.name} (${cycleMonths}x ${cycleMonths > 1 ? "meses" : "mês"})`;

      const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              title: reason,
              description: itemDescription,
              quantity: 1,
              currency_id: "BRL",
              unit_price: amount,
            },
          ],
          external_reference: externalReference,
          back_urls: {
            success: back_url,
            pending: back_url,
            failure: back_url,
          },
          auto_return: "approved",
          notification_url: webhookUrl,
          statement_descriptor: "DIVIDEPASS",
        }),
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error("Mercado Pago error:", mpData);
        return new Response(
          JSON.stringify({ error: "Erro ao criar pagamento no Mercado Pago", details: mpData }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Registra a assinatura pendente no Supabase
      // amount na assinatura é o valor SEM entrada (só recorrente)
      const subscriptionOnlyAmount = group.price_per_slot * cycleMonths;

      const { error: upsertError } = await supabaseAdmin
        .from("user_subscriptions")
        .upsert({
          user_id,
          group_id,
          service_id: group.service_id,
          billing_cycle: cycle,
          mercado_pago_preference_id: mpData.id,
          amount: subscriptionOnlyAmount,
          status: "pending",
          mercado_pago_status: "pending",
          external_reference: externalReference,
          started_at: new Date().toISOString(),
        }, { onConflict: "user_id, group_id" });

      if (upsertError) {
        console.error("Supabase upsert error:", upsertError);
      }

      // Cria fatura pendente para o primeiro ciclo (sem entrada)
      const { error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .insert({
          user_id,
          group_id,
          amount: subscriptionOnlyAmount,
          due_date: new Date().toISOString().split("T")[0],
          status: "pending",
        });

      if (invoiceError) {
        console.error("Invoice insert error:", invoiceError);
      }

      // Registra referral se código foi fornecido
      if (referral_code) {
        try {
          const { data: referrer } = await supabaseAdmin
            .from("user_referral_codes")
            .select("user_id")
            .eq("referral_code", referral_code)
            .maybeSingle();

          if (referrer && referrer.user_id !== user_id) {
            const existingReferral = await supabaseAdmin
              .from("referrals")
              .select("id")
              .eq("invitee_id", user_id)
              .eq("referral_code", referral_code)
              .maybeSingle();

            if (!existingReferral.data) {
              await supabaseAdmin.from("referrals").insert({
                referrer_id: referrer.user_id,
                invitee_id: user_id,
                referral_code: referral_code,
                group_id: group_id,
                status: "pending",
                points: 10
              });
            }
          }
        } catch (refErr) {
          console.error("Error creating referral:", refErr);
        }
      }

      return Response.json(
        {
          preference_id: mpData.id,
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
