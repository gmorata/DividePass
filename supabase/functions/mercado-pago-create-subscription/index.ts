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

      if (!mpAccessToken) {
        throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const body = await req.json();
      const { group_id, user_id, billing_cycle, months, reason, back_url, referral_code, payment_type } = body;

      if (!group_id || !user_id || !reason) {
        return new Response(
          JSON.stringify({ error: "Dados incompletos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const type = payment_type || "subscription";
      const cycleMonths = months && months > 0 ? months : 1;
      const cycle = billing_cycle || "monthly";

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

      if (type === "entrance") {
        // ============================================
        // STEP 1: Taxa de Entrada (pagamento avulso via Checkout Pro)
        // ============================================
        const entranceAmount = Number(group.entrance_fee || 0);

        if (entranceAmount <= 0) {
          return new Response(
            JSON.stringify({ error: "Este grupo não possui taxa de entrada" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const externalReference = `${group_id}:${user_id}:entrance`;

        const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mpAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: [
              {
                title: `Taxa de Entrada - ${group.name}`,
                description: `Pagamento único da taxa de entrada para o grupo ${group.name}`,
                quantity: 1,
                currency_id: "BRL",
                unit_price: entranceAmount,
              },
            ],
            external_reference: externalReference,
            back_urls: {
              success: `${back_url}?payment=entrance_success`,
              pending: `${back_url}?payment=entrance_pending`,
              failure: `${back_url}?payment=entrance_failure`,
            },
            auto_return: "approved",
            notification_url: webhookUrl,
            statement_descriptor: "DIVIDEPASS",
          }),
        });

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
          console.error("MP entrance error:", mpData);
          return new Response(
            JSON.stringify({ error: "Erro ao criar pagamento da taxa de entrada", details: mpData }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabaseAdmin.from("group_members").upsert({
          group_id, user_id,
          status: "pending",
          payment_status: "awaiting_entrance",
        }, { onConflict: "group_id, user_id" });

        return Response.json(
          {
            preference_id: mpData.id,
            init_point: mpData.init_point,
            sandbox_init_point: mpData.sandbox_init_point,
            payment_type: "entrance",
          },
          { headers: corsHeaders }
        );

      } else {
        // ============================================
        // STEP 2: Assinatura Recorrente (via Preapproval API)
        // ============================================

        // Verificar se a entrada foi paga
        const { data: member } = await supabaseAdmin
          .from("group_members")
          .select("payment_status, subscription_deadline")
          .eq("group_id", group_id)
          .eq("user_id", user_id)
          .maybeSingle();

        if (member?.payment_status === "expired") {
          return new Response(
            JSON.stringify({ error: "Prazo expirou. Entre novamente no grupo." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (group.has_entrance_fee && member?.payment_status !== "entrance_paid" && member?.payment_status !== "awaiting_subscription") {
          return new Response(
            JSON.stringify({ error: "Taxa de entrada ainda não foi paga." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verificar prazo 12h
        if (member?.subscription_deadline && new Date(member.subscription_deadline) < new Date()) {
          await supabaseAdmin
            .from("group_members")
            .update({ payment_status: "expired", status: "cancelled", left_at: new Date().toISOString() })
            .eq("group_id", group_id)
            .eq("user_id", user_id);

          return new Response(
            JSON.stringify({ error: "Prazo de 12h expirou." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const subscriptionAmount = group.price_per_slot;

        // Mapear ciclo para frequência do MP Preapproval
        // frequency_type: "daily" | "monthly" | "yearly"
        // frequency: número de períodos entre cobranças
        const mpFrequencyType = "monthly";
        let mpFrequency = 1;
        if (cycle === "quarterly") mpFrequency = 3;
        else if (cycle === "semiannual") mpFrequency = 6;
        else if (cycle === "annual") mpFrequency = 12;

        // Criar preapproval (assinatura recorrente) no Mercado Pago
        const preapprovalBody = {
          reason: reason,
          payer_email: "", // será coletado no checkout do MP
          frequency: mpFrequency,
          frequency_type: mpFrequencyType,
          transaction_amount: subscriptionAmount,
          currency_id: "BRL",
          back_url: `${back_url}?payment=subscription_success`,
          status: "pending",
          notification_url: webhookUrl,
          external_reference: `${group_id}:${user_id}:subscription`,
          statement_descriptor: "DIVIDEPASS",
        };

        console.log("Creating preapproval:", JSON.stringify(preapprovalBody));

        const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mpAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(preapprovalBody),
        });

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
          console.error("MP preapproval error:", mpData);
          return new Response(
            JSON.stringify({ error: "Erro ao criar assinatura recorrente", details: mpData }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Atualizar membro
        await supabaseAdmin
          .from("group_members")
          .update({
            payment_status: "awaiting_subscription",
            subscription_mp_id: mpData.id,
          })
          .eq("group_id", group_id)
          .eq("user_id", user_id);

        // Registrar assinatura pendente
        await supabaseAdmin
          .from("user_subscriptions")
          .upsert({
            user_id,
            group_id,
            service_id: group.service_id,
            billing_cycle: cycle,
            mercado_pago_subscription_id: mpData.id,
            amount: subscriptionAmount,
            status: "pending",
            mercado_pago_status: "pending",
            external_reference: `${group_id}:${user_id}:subscription`,
            started_at: new Date().toISOString(),
          }, { onConflict: "user_id, group_id" });

        // Referral
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
                  referral_code,
                  group_id,
                  status: "pending",
                  points: 10,
                });
              }
            }
          } catch (refErr) {
            console.error("Referral error:", refErr);
          }
        }

        return Response.json(
          {
            preapproval_id: mpData.id,
            init_point: mpData.init_point || mpData.sandbox_init_point,
            payment_type: "subscription",
          },
          { headers: corsHeaders }
        );
      }
    } catch (error) {
      console.error("Function error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
