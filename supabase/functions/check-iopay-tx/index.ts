import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGatewaySettings } from "../create-payment/handlers/settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IOPAY_PROD = "https://api.iopay.com.br/api/";
const IOPAY_SANDBOX = "https://sandbox.api.iopay.com.br/api/";

async function getToken(settings: Record<string, string>): Promise<string> {
  const baseUrl = settings.iopay_env === "sandbox" ? IOPAY_SANDBOX : IOPAY_PROD;
  const resp = await fetch(`${baseUrl}auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: settings.iopay_email,
      secret: settings.iopay_secret,
      io_seller_id: settings.iopay_seller_id,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) throw new Error("Auth failed: " + JSON.stringify(data));
  return data.access_token;
}

const APPROVED_STATUSES = ["succeeded", "approved", "paid", "authorized", "captured"];

async function confirmIOPayment(
  supabaseAdmin: any,
  group_id: string,
  user_id: string,
  payment_type: "entrance" | "subscription",
  amount: number,
  gateway_payment_id: string,
) {
  if (payment_type === "entrance") {
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

    await supabaseAdmin.from("payments").insert({
      user_id, amount, method: "credit_card", status: "paid",
      payment_type: "entrance", group_id, transaction_code: gateway_payment_id,
      gateway: "iopay", notes: "Taxa de entrada paga via cartão",
    });

    try {
      const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", group_id).single();
      if (group?.owner_id) {
        const { data: settings } = await supabaseAdmin.from("app_settings").select("key, value").in("key", ["gateway_fee_percent", "platform_fee_percent"]);
        const map: Record<string, string> = {};
        (settings || []).forEach((s: any) => { map[s.key] = s.value; });
        const fee = parseFloat(map.gateway_fee_percent || "4.98") + parseFloat(map.platform_fee_percent || "3.95");
        const net = amount - (amount * fee / 100);
        await supabaseAdmin.rpc("credit_wallet", {
          p_user_id: group.owner_id, p_amount: net,
          p_description: "Taxa de entrada - iopay",
          p_reference_type: "payment", p_reference_id: gateway_payment_id,
        });
      }
    } catch (e) { console.error("Wallet credit error:", e); }

  } else {
    await supabaseAdmin
      .from("user_subscriptions")
      .update({ status: "active", gateway_status: "authorized", gateway_subscription_id: gateway_payment_id })
      .eq("group_id", group_id).eq("user_id", user_id);

    await supabaseAdmin
      .from("group_members")
      .update({ status: "active", payment_status: "active", joined_at: new Date().toISOString() })
      .eq("group_id", group_id).eq("user_id", user_id);

    await supabaseAdmin.from("payments").insert({
      user_id, amount, method: "credit_card", status: "paid",
      payment_type: "subscription", group_id, transaction_code: gateway_payment_id,
      gateway: "iopay", notes: "Assinatura paga via cartão",
    });

    try {
      const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", group_id).single();
      if (group?.owner_id) {
        const { data: settings } = await supabaseAdmin.from("app_settings").select("key, value").in("key", ["gateway_fee_percent", "platform_fee_percent"]);
        const map: Record<string, string> = {};
        (settings || []).forEach((s: any) => { map[s.key] = s.value; });
        const fee = parseFloat(map.gateway_fee_percent || "4.98") + parseFloat(map.platform_fee_percent || "3.95");
        const net = amount - (amount * fee / 100);
        await supabaseAdmin.rpc("credit_wallet", {
          p_user_id: group.owner_id, p_amount: net,
          p_description: "Assinatura - iopay",
          p_reference_type: "payment", p_reference_id: gateway_payment_id,
        });
      }
    } catch (e) { console.error("Wallet credit error:", e); }
  }
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const settings = await getGatewaySettings();
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

      const { transaction_id, action, group_id, user_id } = await req.json();

      if (!transaction_id) {
        return new Response(JSON.stringify({ error: "transaction_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const baseUrl = settings.iopay_env === "sandbox" ? IOPAY_SANDBOX : IOPAY_PROD;
      const token = await getToken(settings);

      if (action === "cancel") {
        const cancelResp = await fetch(`${baseUrl}v1/transaction/void/${transaction_id}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        });
        const cancelData = await cancelResp.text();
        console.log(`IOPay void ${transaction_id}:`, cancelData);

        if (group_id && user_id) {
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
          await supabaseAdmin.from("group_members").update({ payment_status: "expired" }).eq("group_id", group_id).eq("user_id", user_id);
        }

        return Response.json({ cancelled: true }, { headers: corsHeaders });
      }

      const txResp = await fetch(`${baseUrl}v1/transaction/get/${transaction_id}`, {
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      });

      const txData = await txResp.json();
      console.log(`IOPay get tx ${transaction_id}:`, JSON.stringify(txData).substring(0, 500));

      const tx = txData.success || txData;
      const status = tx.status || "unknown";

      // If approved and have context, confirm in DB
      if (APPROVED_STATUSES.includes(status) && group_id && user_id) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const { data: member } = await supabaseAdmin
          .from("group_members")
          .select("payment_status, gateway_payment_id")
          .eq("group_id", group_id)
          .eq("user_id", user_id)
          .maybeSingle();

        if (member && member.payment_status !== "entrance_paid" && member.payment_status !== "active") {
          const extRef = member.gateway_payment_id || "";
          const paymentType: "entrance" | "subscription" = extRef.includes("entrance") ? "entrance" : "subscription";
          const amount = tx.amount ? tx.amount / 100 : 0;

          console.log(`IOPay polling confirm: type=${paymentType} status=${status} txId=${transaction_id}`);

          await confirmIOPayment(supabaseAdmin, group_id, user_id, paymentType, amount, transaction_id);
        }
      }

      return Response.json({
        transaction_id,
        status,
        amount: tx.amount,
        payment_method: tx.payment_method,
        pix_copy_paste: tx.pix_copy_paste || tx.copy_paste || tx.pix_payload || tx.pix_code || tx.payload || null,
        pix_qrcode_url: tx.pix_qrcode_url || null,
      }, { headers: corsHeaders });

    } catch (error: any) {
      console.error("check-iopay-tx error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
