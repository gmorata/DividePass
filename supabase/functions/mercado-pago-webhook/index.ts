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

      const topic = body.type || body.topic || body.action;
      const resourceId = body.data?.id;

      if (!topic || !resourceId) {
        return new Response(
          JSON.stringify({ message: "Evento ignorado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============================================
      // STEP 1: Pagamento avulso (taxa de entrada) via "payment"
      // ============================================
      if (topic === "payment") {
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
          headers: { Authorization: `Bearer ${mpAccessToken}` },
        });

        if (!mpResponse.ok) {
          console.error("Failed to fetch payment from MP");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const payment = await mpResponse.json();
        const externalReference = payment.external_reference;

        if (!externalReference) {
          console.error("Payment without external_reference");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const parts = externalReference.split(":");
        const group_id = parts[0];
        const user_id = parts[1];
        const paymentType = parts[2] || "entrance";

        if (!group_id || !user_id) {
          console.error("Invalid external_reference", externalReference);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const amount = payment.transaction_amount || 0;
        const paidAt = payment.date_approved || new Date().toISOString();

        if (payment.status !== "approved") {
          console.log(`Payment status: ${payment.status}. Ignoring.`);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Buscar grupo
        const { data: group, error: groupError } = await supabaseAdmin
          .from("groups")
          .select("service_id, name, billing_cycle, price_per_slot, has_entrance_fee, entrance_fee, owner_id, is_official")
          .eq("id", group_id)
          .single();

        if (groupError || !group) {
          console.error("Group not found", groupError);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Taxa de entrada paga
        console.log(`Entrance fee paid for group ${group_id}, user ${user_id}`);

        const entranceDeadline = new Date();
        entranceDeadline.setHours(entranceDeadline.getHours() + 12);

        await supabaseAdmin
          .from("group_members")
          .update({
            payment_status: "entrance_paid",
            entrance_paid_at: paidAt,
            entrance_payment_id: String(resourceId),
            subscription_deadline: entranceDeadline.toISOString(),
          })
          .eq("group_id", group_id)
          .eq("user_id", user_id);

        // Registrar pagamento
        await supabaseAdmin
          .from("payments")
          .insert({
            user_id, group_id, amount,
            method: payment.payment_method_id || "mercado_pago",
            status: "paid",
            transaction_code: String(resourceId),
            paid_at: paidAt,
            payment_type: "entrance",
            notes: "Taxa de entrada - pagamento único",
          });

        // Credita wallet do dono
        if (group.owner_id && !group.is_official) {
          try {
            const { data: settingsData } = await supabaseAdmin
              .from("app_settings")
              .select("key, value")
              .in("key", ["gateway_fee_percent", "platform_fee_percent"]);

            const settings: Record<string, string> = {};
            settingsData?.forEach(s => { settings[s.key] = s.value; });

            const gatewayRate = parseFloat(settings.gateway_fee_percent || "4.98") / 100;
            const platformRate = parseFloat(settings.platform_fee_percent || "3.95") / 100;
            const totalFees = gatewayRate + platformRate;
            const ownerAmount = amount * (1 - totalFees);

            await supabaseAdmin.rpc("credit_wallet", {
              p_user_id: group.owner_id,
              p_amount: ownerAmount,
              p_description: `Taxa de entrada no grupo ${group.name}`,
              p_reference_type: "entrance",
              p_reference_id: null,
            });
          } catch (walletErr) {
            console.error("Wallet credit error:", walletErr);
          }
        }
      }

      // ============================================
      // STEP 2: Assinatura recorrente via "preapproval"
      // ============================================
      if (topic === "preapproval" || topic === "subscription_preapproval") {
        const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
          headers: { Authorization: `Bearer ${mpAccessToken}` },
        });

        if (!mpResponse.ok) {
          console.error("Failed to fetch preapproval from MP");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const preapproval = await mpResponse.json();
        const externalReference = preapproval.external_reference;

        let group_id: string;
        let user_id: string;

        if (externalReference && externalReference.includes(":")) {
          const parts = externalReference.split(":");
          group_id = parts[0];
          user_id = parts[1];
        } else if (preapproval.preapproval_plan_id) {
          // Plano checkout - buscar plano no banco e encontrar a assinatura pendente
          const planKey = null;
          const { data: planEntry } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .eq("value", preapproval.preapproval_plan_id)
            .like("key", "plan_%")
            .maybeSingle();

          if (!planEntry) {
            console.error("Plan not found in app_settings", preapproval.preapproval_plan_id);
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          // Extrair dados do plano: plan_{amount}_{freq}_{type}
          const planParts = planEntry.key.replace("plan_", "").split("_");
          const planAmount = parseFloat(planParts[0]);

          // Buscar assinatura pendente mais recente para este plano
          const { data: pendingSub } = await supabaseAdmin
            .from("user_subscriptions")
            .select("user_id, group_id")
            .eq("status", "pending")
            .eq("amount", planAmount)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!pendingSub) {
            console.error("No pending subscription found for plan", planEntry.key);
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          group_id = pendingSub.group_id;
          user_id = pendingSub.user_id;
        } else {
          console.error("Preapproval without external_reference or plan_id");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        if (!group_id || !user_id) {
          console.error("Could not resolve group_id/user_id");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        console.log(`Preapproval status: ${preapproval.status} for group ${group_id}, user ${user_id}`);

        // Só ativa quando status for "authorized"
        if (preapproval.status !== "authorized") {
          console.log(`Preapproval status ${preapproval.status}. Waiting for authorized.`);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Buscar grupo
        const { data: group, error: groupError } = await supabaseAdmin
          .from("groups")
          .select("service_id, name, billing_cycle, price_per_slot, owner_id, is_official")
          .eq("id", group_id)
          .single();

        if (groupError || !group) {
          console.error("Group not found", groupError);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const cycle = group.billing_cycle || "monthly";
        const cycleMonths =
          cycle === "quarterly" ? 3 :
          cycle === "semiannual" ? 6 :
          cycle === "annual" ? 12 : 1;

        const subscriptionAmount = group.price_per_slot;
        const paidAt = preapproval.last_date_approved || new Date().toISOString();

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + cycleMonths);

        // Atualizar assinatura
        await supabaseAdmin
          .from("user_subscriptions")
          .upsert({
            user_id, group_id,
            service_id: group.service_id,
            billing_cycle: cycle,
            amount: subscriptionAmount,
            status: "active",
            mercado_pago_status: "authorized",
            mercado_pago_subscription_id: preapproval.id,
            external_reference: externalReference,
            started_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
          }, { onConflict: "user_id, group_id" });

        // ACESSO LIBERADO
        await supabaseAdmin
          .from("group_members")
          .update({
            status: "active",
            payment_status: "active",
            joined_at: new Date().toISOString(),
          })
          .eq("group_id", group_id)
          .eq("user_id", user_id);

        // Registrar pagamento
        await supabaseAdmin
          .from("payments")
          .insert({
            user_id, group_id,
            amount: subscriptionAmount,
            method: "mercado_pago_preapproval",
            status: "paid",
            transaction_code: String(resourceId),
            paid_at: paidAt,
            payment_type: "subscription",
            notes: `Assinatura recorrente ${cycle}`,
          });

        // Credita wallet do dono
        if (group.owner_id && !group.is_official) {
          try {
            const { data: memberUser } = await supabaseAdmin
              .from("users")
              .select("name")
              .eq("id", user_id)
              .maybeSingle();

            const memberName = memberUser?.name || "Membro";

            const { data: settingsData } = await supabaseAdmin
              .from("app_settings")
              .select("key, value")
              .in("key", ["gateway_fee_percent", "platform_fee_percent"]);

            const settings: Record<string, string> = {};
            settingsData?.forEach(s => { settings[s.key] = s.value; });

            const gatewayRate = parseFloat(settings.gateway_fee_percent || "4.98") / 100;
            const platformRate = parseFloat(settings.platform_fee_percent || "3.95") / 100;
            const totalFees = gatewayRate + platformRate;
            const ownerAmount = subscriptionAmount * (1 - totalFees);

            const { data: subData } = await supabaseAdmin
              .from("user_subscriptions")
              .select("id")
              .eq("user_id", user_id)
              .eq("group_id", group_id)
              .maybeSingle();

            await supabaseAdmin.rpc("credit_wallet", {
              p_user_id: group.owner_id,
              p_amount: ownerAmount,
              p_description: `Assinatura de ${memberName} no grupo ${group.name}`,
              p_reference_type: "subscription",
              p_reference_id: subData?.id || null,
            });
          } catch (walletErr) {
            console.error("Wallet credit error:", walletErr);
          }
        }

        // Fatura
        await supabaseAdmin
          .from("invoices")
          .update({ status: "paid", paid_at: paidAt })
          .eq("user_id", user_id)
          .eq("group_id", group_id)
          .eq("status", "pending")
          .order("due_date", { ascending: true })
          .limit(1);

        const nextDue = new Date();
        nextDue.setMonth(nextDue.getMonth() + cycleMonths);

        await supabaseAdmin
          .from("invoices")
          .insert({
            user_id, group_id,
            amount: subscriptionAmount,
            due_date: nextDue.toISOString().split("T")[0],
            status: "pending",
          });

        // Referral
        try {
          const { data: referral } = await supabaseAdmin
            .from("referrals")
            .select("id, referrer_id, group_id, points")
            .eq("invitee_id", user_id)
            .eq("status", "pending")
            .maybeSingle();

          if (referral) {
            const isSameGroup = referral.group_id === group_id;
            const bonusPoints = isSameGroup ? 5 : 0;
            const totalPoints = (referral.points || 0) + 10 + bonusPoints;

            await supabaseAdmin
              .from("referrals")
              .update({
                status: "completed",
                points: totalPoints,
                completed_at: new Date().toISOString(),
                group_id,
              })
              .eq("id", referral.id);
          }
        } catch (refErr) {
          console.error("Referral error:", refErr);
        }
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
