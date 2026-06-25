import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmPayment } from "../confirm-payment/index.ts";
import { getGatewaySettings } from "../create-payment/handlers/settings.ts";

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
      const settings = await getGatewaySettings();
      const ioSecret = settings.iopay_secret || Deno.env.get("IOPAY_SECRET") || "";
      const ioEmail = settings.iopay_email || Deno.env.get("IOPAY_EMAIL") || "";
      const ioSellerId = settings.iopay_seller_id || Deno.env.get("IOPAY_SELLER_ID") || "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

      if (!ioSecret || !ioEmail || !ioSellerId) {
        return new Response("IOPay not configured", { status: 503 });
      }

      const body = await req.json();

      console.log("IOPay webhook event:", body.type);

      // IOPay webhook: { id, type, status, reference_id }
      const transactionId = body.id;
      const referenceId = body.reference_id;
      const eventType = body.type;

      if (!transactionId && !referenceId) {
        return Response.json({ received: true }, { headers: corsHeaders });
      }

      // Fetch transaction details from IOPay
      const iopayEnv = settings.iopay_env || "production";
      const apiBase = iopayEnv === "sandbox"
        ? "https://sandbox.api.iopay.com.br/api/"
        : "https://api.iopay.com.br/api/";

      // Auth via auth/login
      let bearerToken = "";
      try {
        const authResp = await fetch(`${apiBase}auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: ioEmail, secret: ioSecret, io_seller_id: ioSellerId }),
        });
        const authData = await authResp.json();
        bearerToken = authData.access_token || "";
      } catch (e) {
        console.error("IOPay webhook auth error:", e);
      }

      let transactionData: any = null;

      if (transactionId && bearerToken) {
        const txResp = await fetch(`${apiBase}v1/transaction/get/${transactionId}`, {
          headers: {
            "Authorization": `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
          },
        });

        if (txResp.ok) {
          transactionData = await txResp.json();
        }
      }

      if (!transactionData) {
        console.error("Could not fetch IOPay transaction:", transactionId);
        return Response.json({ received: true }, { headers: corsHeaders });
      }

      // Parse external reference from reference_id
      const externalRef = transactionData.reference_id || referenceId || "";
      const parts = externalRef.split(":");

      if (parts.length < 3) {
        console.error("Invalid external reference:", externalRef);
        return Response.json({ received: true }, { headers: corsHeaders });
      }

      const groupId = parts[0];
      const userId = parts[1];
      const paymentType = parts[2] as "entrance" | "subscription";

      // Map IOPay status
      let status: "approved" | "rejected" | "pending" = "pending";
      if (transactionData.status === "succeeded" || body.status === "succeeded") {
        status = "approved";
      } else if (transactionData.status === "failed" || transactionData.status === "cancelled" || body.status === "failed") {
        status = "rejected";
      }

      await confirmPayment({
        gateway: "iopay",
        group_id: groupId,
        user_id: userId,
        payment_type: paymentType,
        amount: (transactionData.amount || 0) / 100,
        status,
        gateway_payment_id: transactionData.id || transactionId,
        payment_method: transactionData.payment_method || "iopay",
      });

      return Response.json({ received: true }, { headers: corsHeaders });

    } catch (error) {
      console.error("IOPay webhook error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
