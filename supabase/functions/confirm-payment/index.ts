// Shared payment confirmation logic
// Called by all webhook handlers after verifying the payment

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ConfirmParams {
  gateway: string;
  group_id: string;
  user_id: string;
  payment_type: "entrance" | "subscription";
  amount: number;
  status: "approved" | "rejected" | "pending";
  gateway_payment_id: string;
  payment_method?: string;
}

export async function confirmPayment(params: ConfirmParams) {
  const { gateway, group_id, user_id, payment_type, amount, status, gateway_payment_id, payment_method } = params;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  if (status === "approved") {
    if (payment_type === "entrance") {
      // Mark entrance as paid
      await supabaseAdmin
        .from("group_members")
        .update({
          payment_status: "entrance_paid",
          entrance_paid_at: new Date().toISOString(),
          entrance_payment_id: gateway_payment_id,
          gateway_payment_id,
          subscription_deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        })
        .eq("group_id", group_id)
        .eq("user_id", user_id);

      // Record payment
      await supabaseAdmin.from("payments").insert({
        user_id,
        amount,
        method: payment_method || "unknown",
        status: "paid",
        payment_type: "entrance",
        group_id,
        transaction_code: gateway_payment_id,
        gateway,
        notes: "Taxa de entrada paga",
      });

      // Credit wallet
      try {
        const { data: group } = await supabaseAdmin
          .from("groups")
          .select("owner_id")
          .eq("id", group_id)
          .single();

        if (group?.owner_id) {
          const { data: settings } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .in("key", ["gateway_fee_percent", "platform_fee_percent"]);

          const settingsMap: Record<string, string> = {};
          (settings || []).forEach((s: any) => { settingsMap[s.key] = s.value; });

          const gatewayFee = parseFloat(settingsMap.gateway_fee_percent || "4.98");
          const platformFee = parseFloat(settingsMap.platform_fee_percent || "3.95");
          const totalFeePercent = gatewayFee + platformFee;
          const netAmount = amount - (amount * totalFeePercent / 100);

          await supabaseAdmin.rpc("credit_wallet", {
            p_user_id: group.owner_id,
            p_amount: netAmount,
            p_description: `Taxa de entrada - ${gateway}`,
            p_reference_type: "payment",
            p_reference_id: gateway_payment_id,
          });
        }
      } catch (walletErr) {
        console.error("Wallet credit error (entrance):", walletErr);
      }

    } else if (payment_type === "subscription") {
      // Activate subscription
      await supabaseAdmin
        .from("user_subscriptions")
        .update({
          status: "active",
          gateway_status: "authorized",
          gateway_subscription_id: gateway_payment_id,
        })
        .eq("group_id", group_id)
        .eq("user_id", user_id);

      // Update member
      await supabaseAdmin
        .from("group_members")
        .update({
          status: "active",
          payment_status: "active",
          joined_at: new Date().toISOString(),
        })
        .eq("group_id", group_id)
        .eq("user_id", user_id);

      // Record payment
      await supabaseAdmin.from("payments").insert({
        user_id,
        amount,
        method: payment_method || "subscription",
        status: "paid",
        payment_type: "subscription",
        group_id,
        transaction_code: gateway_payment_id,
        gateway,
        notes: "Assinatura recorrente paga",
      });

      // Credit wallet
      try {
        const { data: group } = await supabaseAdmin
          .from("groups")
          .select("owner_id")
          .eq("id", group_id)
          .single();

        if (group?.owner_id) {
          const { data: settings } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .in("key", ["gateway_fee_percent", "platform_fee_percent"]);

          const settingsMap: Record<string, string> = {};
          (settings || []).forEach((s: any) => { settingsMap[s.key] = s.value; });

          const gatewayFee = parseFloat(settingsMap.gateway_fee_percent || "4.98");
          const platformFee = parseFloat(settingsMap.platform_fee_percent || "3.95");
          const totalFeePercent = gatewayFee + platformFee;
          const netAmount = amount - (amount * totalFeePercent / 100);

          await supabaseAdmin.rpc("credit_wallet", {
            p_user_id: group.owner_id,
            p_amount: netAmount,
            p_description: `Assinatura - ${gateway}`,
            p_reference_type: "payment",
            p_reference_id: gateway_payment_id,
          });
        }
      } catch (walletErr) {
        console.error("Wallet credit error (subscription):", walletErr);
      }

      // Mark oldest pending invoice as paid
      try {
        const { data: invoice } = await supabaseAdmin
          .from("invoices")
          .select("id")
          .eq("user_id", user_id)
          .eq("group_id", group_id)
          .eq("status", "pending")
          .order("due_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (invoice) {
          await supabaseAdmin
            .from("invoices")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", invoice.id);

          // Create next invoice
          const { data: sub } = await supabaseAdmin
            .from("user_subscriptions")
            .select("billing_cycle, amount, expires_at")
            .eq("user_id", user_id)
            .eq("group_id", group_id)
            .maybeSingle();

          if (sub) {
            const cycleMonths = sub.billing_cycle === "quarterly" ? 3
              : sub.billing_cycle === "semiannual" ? 6
              : sub.billing_cycle === "annual" ? 12 : 1;

            const nextDue = new Date();
            nextDue.setMonth(nextDue.getMonth() + cycleMonths);

            await supabaseAdmin.from("invoices").insert({
              user_id,
              group_id,
              amount: sub.amount,
              due_date: nextDue.toISOString().split("T")[0],
              status: "pending",
            });

            await supabaseAdmin
              .from("user_subscriptions")
              .update({ expires_at: nextDue.toISOString() })
              .eq("user_id", user_id)
              .eq("group_id", group_id);
          }
        }
      } catch (invoiceErr) {
        console.error("Invoice processing error:", invoiceErr);
      }

      // Process referrals
      try {
        const { data: pendingReferral } = await supabaseAdmin
          .from("referrals")
          .select("id, referrer_id")
          .eq("invitee_id", user_id)
          .eq("group_id", group_id)
          .eq("status", "pending")
          .maybeSingle();

        if (pendingReferral) {
          await supabaseAdmin
            .from("referrals")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", pendingReferral.id);

          // Credit referrer points
          await supabaseAdmin.rpc("add_referral_points", {
            p_user_id: pendingReferral.referrer_id,
            p_points: 10,
            p_type: 'subscription',
          });
        }
      } catch (refErr) {
        console.error("Referral processing error:", refErr);
      }
    }

  } else if (status === "rejected") {
    // Payment failed
    await supabaseAdmin
      .from("group_members")
      .update({ payment_status: "expired", status: "cancelled" })
      .eq("group_id", group_id)
      .eq("user_id", user_id);

    await supabaseAdmin.from("payments").insert({
      user_id,
      amount,
      method: payment_method || "unknown",
      status: "failed",
      payment_type,
      group_id,
      transaction_code: gateway_payment_id,
      gateway,
      notes: "Pagamento rejeitado",
    });
  }
}
