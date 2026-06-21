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

        const [group_id, user_id] = externalReference.split(":");

        if (!group_id || !user_id) {
          console.error("Invalid external_reference", externalReference);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const amount = payment.transaction_amount || 0;
        const paidAt = payment.date_approved || new Date().toISOString();

        // Só processa pagamentos aprovados
        if (payment.status !== "approved") {
          console.log(`Payment status: ${payment.status}. Ignoring.`);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Busca o grupo para obter service_id, ciclo e valor REAL da assinatura
        const { data: group, error: groupError } = await supabaseAdmin
          .from("groups")
          .select("service_id, name, billing_cycle, price_per_slot, has_entrance_fee, entrance_fee, available_cycles")
          .eq("id", group_id)
          .single();

        if (groupError || !group) {
          console.error("Group not found", groupError);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Busca assinatura existente para preservar ciclo e valor
        const { data: existingSub } = await supabaseAdmin
          .from("user_subscriptions")
          .select("billing_cycle, amount")
          .eq("user_id", user_id)
          .eq("group_id", group_id)
          .maybeSingle();

        const cycle = existingSub?.billing_cycle || group.billing_cycle || "monthly";
        const cycleMonths =
          cycle === "quarterly" ? 3 :
          cycle === "semiannual" ? 6 :
          cycle === "annual" ? 12 : 1;

        // O valor da assinatura é sempre o preço base × meses do ciclo
        // NÃO inclui entrance_fee (que é cobrado apenas 1x)
        const subscriptionAmount = group.price_per_slot * cycleMonths;

        // Atualiza ou insere a assinatura do usuário
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + cycleMonths);

        const { error: subError } = await supabaseAdmin
          .from("user_subscriptions")
          .upsert({
            user_id,
            group_id,
            service_id: group.service_id,
            billing_cycle: cycle,
            amount: subscriptionAmount,
            status: "active",
            mercado_pago_status: "approved",
            external_reference: externalReference,
            started_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
          }, { onConflict: "user_id, group_id" });

        if (subError) {
          console.error("Error upserting subscription:", subError);
        }

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

        // Registra o pagamento
        const entranceFeeAmount = group.has_entrance_fee ? Number(group.entrance_fee || 0) : 0;
        const isEntrancePayment = entranceFeeAmount > 0 && amount > subscriptionAmount;

        const { error: paymentError } = await supabaseAdmin
          .from("payments")
          .insert({
            user_id,
            amount,
            method: payment.payment_method_id || "mercado_pago",
            status: "paid",
            transaction_code: String(resourceId),
            paid_at: paidAt,
            notes: isEntrancePayment
              ? JSON.stringify({ subscription: subscriptionAmount, entrance_fee: entranceFeeAmount })
              : null,
          });

        if (paymentError) {
          console.error("Error inserting payment:", paymentError);
        }

        // Marca fatura atual como paga
        const { error: invoicePaidError } = await supabaseAdmin
          .from("invoices")
          .update({ status: "paid", paid_at: paidAt })
          .eq("user_id", user_id)
          .eq("group_id", group_id)
          .eq("status", "pending")
          .order("due_date", { ascending: true })
          .limit(1);

        if (invoicePaidError) {
          console.error("Error marking invoice as paid:", invoicePaidError);
        }

        // Cria próxima fatura para recorrência interna de acordo com o ciclo
        const nextDue = new Date();
        nextDue.setMonth(nextDue.getMonth() + cycleMonths);

        const { error: nextInvoiceError } = await supabaseAdmin
          .from("invoices")
          .insert({
            user_id,
            group_id,
            amount: subscriptionAmount,
            due_date: nextDue.toISOString().split("T")[0],
            status: "pending",
          });

        if (nextInvoiceError) {
          console.error("Error creating next invoice:", nextInvoiceError);
        }

        // Processa referral: marca como completo e dá bônus se mesmo grupo
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
            const currentPoints = referral.points || 0;
            const totalPoints = currentPoints + 10 + bonusPoints;

            await supabaseAdmin
              .from("referrals")
              .update({
                status: "completed",
                points: totalPoints,
                completed_at: new Date().toISOString(),
                group_id: group_id
              })
              .eq("id", referral.id);
          }
        } catch (refErr) {
          console.error("Error processing referral:", refErr);
        }
      } else if (topic === "subscription_preapproval" || topic === "preapproval") {
        // Mantido para compatibilidade com eventuais assinaturas antigas
        console.log("Preapproval webhook ignored. Using Checkout Pro payments.");
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
