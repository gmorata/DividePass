// IOPay handler for create-payment
// PIX: transaction → pix_qrcode_url + pix_copy_paste
// Card: auth → tokenize → auth → associate → auth → set_default → charge

import { getGatewaySettings } from "./settings.ts";

interface HandlerContext {
  supabaseAdmin: any;
  supabaseUrl: string;
  group_id: string;
  user_id: string;
  billing_cycle: string;
  months: number;
  reason: string;
  referral_code: string | null;
  payment_type: string;
  corsHeaders: Record<string, string>;
  body: any;
}

const IOPAY_PROD = "https://api.iopay.com.br/api/";
const IOPAY_SANDBOX = "https://sandbox.api.iopay.com.br/api/";

let cachedBaseUrl: string | null = null;
let cachedToken: string | null = null;
let cachedTokenExpires = 0;

function getBaseUrl(settings: Record<string, string>): string {
  if (cachedBaseUrl) return cachedBaseUrl;
  cachedBaseUrl = settings.iopay_env === "sandbox" ? IOPAY_SANDBOX : IOPAY_PROD;
  return cachedBaseUrl!;
}

async function getToken(settings: Record<string, string>): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedTokenExpires > now) return cachedToken;

  const baseUrl = getBaseUrl(settings);
  const email = settings.iopay_email || "";
  const secret = settings.iopay_secret || "";
  const sellerId = settings.iopay_seller_id || "";

  const url = `${baseUrl}auth/login?email=${encodeURIComponent(email)}&secret=${encodeURIComponent(secret)}&io_seller_id=${encodeURIComponent(sellerId)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret, io_seller_id: sellerId }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(JSON.stringify(data));
  }

  cachedToken = data.access_token;
  cachedTokenExpires = now + ((data.expires_in || 3600) * 1000) - 30000;
  return cachedToken!;
}

// Card auth: each card operation needs a fresh special token
async function getCardToken(settings: Record<string, string>): Promise<string> {
  const baseUrl = getBaseUrl(settings);
  const email = settings.iopay_email || "";
  const secret = settings.iopay_secret || "";
  const sellerId = settings.iopay_seller_id || "";

  const resp = await fetch(`${baseUrl}v1/card/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret, io_seller_id: sellerId }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error("Card auth failed: " + JSON.stringify(data));
  }
  return data.access_token;
}

async function apiRequest(
  method: string,
  path: string,
  body: any,
  token: string,
  settings: Record<string, string>,
): Promise<any> {
  const baseUrl = getBaseUrl(settings);

  const resp = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await resp.text();
  let data: any;
  try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

  console.log(`IOPay ${method} ${path} [${resp.status}]:`, rawText.substring(0, 800));

  // Extract transaction data from various response formats
  const inner = data.success || data;
  const txId = inner?.id || inner?.Id || data?.id || data?.Id || inner?.transaction_id;

  // Return whatever we got — caller will handle extraction
  return { ...inner, _raw: data, _httpStatus: resp.status, _txId: txId };
}

async function fetchPixQrCode(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.arrayBuffer();
    const bytes = new UintArray8Array(blob);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.error("Failed to fetch PIX QR code:", e);
    return null;
  }
}

// ── Tokenize card ──
async function tokenizeCard(
  cardData: { card_number: string; holder_name: string; exp_month: string; exp_year: string; cvv: string },
  settings: Record<string, string>,
): Promise<string> {
  const cardToken = await getCardToken(settings);
  const baseUrl = getBaseUrl(settings);

  // IOPay expects 2-digit year for tokenization
  const year2 = cardData.exp_year.length === 4 ? cardData.exp_year.slice(-2) : cardData.exp_year;
  const month2 = cardData.exp_month.padStart(2, "0");

  console.log("IOPay tokenize payload:", JSON.stringify({
    expiration_month: month2,
    expiration_year: year2,
  }));

  const resp = await fetch(`${baseUrl}v1/card/tokenize/token`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      card_number: cardData.card_number,
      holder_name: cardData.holder_name,
      expiration_month: month2,
      expiration_year: year2,
      security_code: cardData.cvv,
    }),
  });

  const raw = await resp.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  console.log("IOPay tokenize response:", raw.substring(0, 500));

  const tokenId = data.token || data.id || data.success?.token || data.success?.id;
  if (!resp.ok || !tokenId) {
    throw new Error("Tokenize failed: " + (typeof data === "string" ? data : JSON.stringify(data.message || data.error || data)));
  }
  return tokenId;
}

// ── Associate card to customer ──
async function associateCard(customerId: string, token: string, settings: Record<string, string>): Promise<string> {
  const cardToken = await getCardToken(settings);
  const baseUrl = getBaseUrl(settings);

  const resp = await fetch(`${baseUrl}v1/card/associate_token_with_customer`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id_customer: customerId, token }),
  });

  const raw = await resp.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  console.log("IOPay associate response:", raw.substring(0, 500));

  const cardId = data.id_card || data.id || data.Id || data.success?.id_card || data.success?.id;
  if (!resp.ok || !cardId) {
    throw new Error("Associate failed: " + (typeof data === "string" ? data : JSON.stringify(data)));
  }
  return cardId;
}

// ── Set default card ──
async function setDefaultCard(customerId: string, cardId: string, settings: Record<string, string>): Promise<void> {
  const cardToken = await getCardToken(settings);
  const baseUrl = getBaseUrl(settings);

  const resp = await fetch(`${baseUrl}v1/card/set_default/${customerId}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cardToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id_card: cardId }),
  });

  const raw = await resp.text();
  console.log("IOPay set_default response:", raw.substring(0, 300));
}

async function getTransactionDetails(txId: string, settings: Record<string, string>): Promise<any> {
  try {
    const token = await getToken(settings);
    const baseUrl = getBaseUrl(settings);
    const resp = await fetch(`${baseUrl}v1/transaction/get/${txId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const raw = await resp.text();
    console.log(`IOPay GET transaction/${txId} [${resp.status}]:`, raw.substring(0, 800));
    let data: any;
    try { data = JSON.parse(raw); } catch { data = { raw }; }
    return data.success || data;
  } catch (e) {
    console.error("Failed to fetch transaction details:", e);
    return null;
  }
}

export default async function handleIOPay(req: Request, ctx: HandlerContext) {
  const { supabaseAdmin, supabaseUrl, group_id, user_id, billing_cycle, months, reason, referral_code, payment_type, corsHeaders, body: reqBody } = ctx;
  const settings = await getGatewaySettings();

  if (!settings.iopay_secret || !settings.iopay_email || !settings.iopay_seller_id) {
    return new Response(
      JSON.stringify({ error: "Credenciais IOPAY não configuradas. Configure no Admin → Configurações." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const body = reqBody || {};
  const type = payment_type || "subscription";
  const cycle = billing_cycle || "monthly";
  const { card_number, card_holder_name, card_exp_month, card_exp_year, card_cvv, payment_method } = body;
  const isPix = payment_method === "pix";

  // Get group
  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups")
    .select("*, service:service_id(*)")
    .eq("id", group_id)
    .single();

  if (groupError || !group) {
    return new Response(JSON.stringify({ error: "Grupo não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Ensure customer exists
  const { data: userProfile } = await supabaseAdmin
    .from("users")
    .select("customer_id_iopay, name, email, phone")
    .eq("id", user_id)
    .maybeSingle();

  let customerId = userProfile?.customer_id_iopay;

  if (!customerId) {
    try {
      const token = await getToken(settings);
      const custData = await apiRequest("POST", "v1/customer/new", {
        name: userProfile?.name || "Cliente",
        email: userProfile?.email || "",
        phone: userProfile?.phone || "",
      }, token, settings);

      customerId = custData.id || custData.Id;
      if (customerId) {
        await supabaseAdmin.from("users").update({ customer_id_iopay: customerId }).eq("id", user_id);
      } else {
        throw new Error("Cliente criado sem ID");
      }
    } catch (err: any) {
      console.error("IOPay customer error:", err.message);
      return new Response(JSON.stringify({ error: "Erro ao criar cliente: " + err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // Record gateway
  await supabaseAdmin.from("group_members").update({ gateway: "iopay" }).eq("group_id", group_id).eq("user_id", user_id);

  // Tokenize card if credit
  let idCard: string | null = null;
  let cardToken: string | null = null;
  if (!isPix) {
    if (!card_number || !card_holder_name || !card_exp_month || !card_exp_year || !card_cvv) {
      return new Response(JSON.stringify({ error: "Dados do cartão incompletos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Convert 2-digit year to 4-digit for IOPay API
    let year4 = card_exp_year;
    if (year4.length === 2) year4 = "20" + year4;
    try {
      cardToken = await tokenizeCard({
        card_number: card_number.replace(/\s/g, ""),
        holder_name: card_holder_name,
        exp_month: card_exp_month,
        exp_year: year4,
        cvv: card_cvv,
      }, settings);

      console.log("IOPay card token obtained:", cardToken);

      // Associate card to customer
      idCard = await associateCard(customerId, cardToken, settings);

      console.log("IOPay card associated, id_card:", idCard);

      // Set as default card
      await setDefaultCard(customerId, idCard, settings);
    } catch (err: any) {
      console.error("IOPay card flow error:", err.message);
      return new Response(JSON.stringify({ error: "Erro ao processar cartão: " + err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const externalReference = `${group_id}:${user_id}:${type}`;

  if (type === "entrance") {
    const entranceAmount = Number(group.entrance_fee || 0);
    if (entranceAmount <= 0) {
      return new Response(JSON.stringify({ error: "Este grupo não possui taxa de entrada" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabaseAdmin.from("group_members").upsert({ group_id, user_id, status: "pending", payment_status: "awaiting_entrance", gateway: "iopay" }, { onConflict: "group_id, user_id" });

    const txBody: any = {
      amount: Math.round(entranceAmount * 100),
      currency: "BRL",
      description: `Taxa de Entrada - ${group.name}`,
      statement_descriptor: "DIVIDEPASS",
      io_seller_id: settings.iopay_seller_id,
      payment_type: isPix ? "pix" : "credit",
      reference_id: externalReference,
    };

    if (!isPix) {
      txBody.capture = true;
      txBody.installment_plan = { number_installments: 1 };
      txBody.payment_method = "credit_card";
    }

    try {
      const token = await getToken(settings);
      const txData = await apiRequest("POST", `v1/transaction/new/${customerId}`, txBody, token, settings);
      const txId = txData._txId || txData.id || txData.Id;

      if (!txId) {
        console.error("IOPay no transaction ID in response:", JSON.stringify(txData).substring(0, 500));
        return new Response(JSON.stringify({ error: "Transação criada mas sem ID de retorno. Verifique seu pagamento." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabaseAdmin.from("group_members").update({ gateway_payment_id: txId }).eq("group_id", group_id).eq("user_id", user_id);

      // For PIX, fetch full transaction details to get copy_paste code
      let pixCopyPaste = null;
      let pixQrUrl = null;
      let pixQrBase64 = null;

      if (isPix) {
        pixCopyPaste = txData.pix_copy_paste || txData.copy_paste || txData.pix_payload || txData.payload || txData.pix_code || txData.qr_code || null;
        pixQrUrl = txData.pix_qrcode_url || null;
        console.log("IOPay PIX entrance created fields:", Object.keys(txData).join(", "));

        const details = await getTransactionDetails(txId, settings);
        if (details) {
          console.log("IOPay PIX entrance detail fields:", Object.keys(details).join(", "));
          pixCopyPaste = details.pix_copy_paste || details.copy_paste || details.pix_payload || details.payload || details.pix_code || details.qr_code || details.code || pixCopyPaste;
          pixQrUrl = details.pix_qrcode_url || pixQrUrl;
        }

        if (pixQrUrl) {
          pixQrBase64 = await fetchPixQrCode(pixQrUrl);
        }
      }

      // For credit card: return processing status — frontend will poll
      const txStatus = txData.status || "pending";

      return Response.json({
        transaction_id: txId,
        payment_type: "entrance",
        gateway: "iopay",
        payment_method: isPix ? "pix" : "card",
        pix_qrcode: pixQrBase64,
        pix_qrcode_url: pixQrUrl,
        pix_copy_paste: pixCopyPaste,
        status: isPix ? txStatus : "processing",
        needs_polling: !isPix,
        raw: { created: txData },
      }, { headers: corsHeaders });
    } catch (err: any) {
      console.error("IOPay entrance error:", err.message);
      return new Response(JSON.stringify({ error: "Erro ao criar pagamento: " + err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } else {
    // Subscription
    const { data: member } = await supabaseAdmin
      .from("group_members")
      .select("payment_status, subscription_deadline")
      .eq("group_id", group_id).eq("user_id", user_id).maybeSingle();

    if (member?.payment_status === "expired") {
      return new Response(JSON.stringify({ error: "Prazo expirou. Entre novamente no grupo." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (group.has_entrance_fee && member?.payment_status !== "entrance_paid" && member?.payment_status !== "awaiting_subscription") {
      return new Response(JSON.stringify({ error: "Taxa de entrada ainda não foi paga." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (member?.subscription_deadline && new Date(member.subscription_deadline) < new Date()) {
      await supabaseAdmin.from("group_members").update({ payment_status: "expired", status: "cancelled", left_at: new Date().toISOString() }).eq("group_id", group_id).eq("user_id", user_id);
      return new Response(JSON.stringify({ error: "Prazo de 12h expirou." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const subscriptionAmount = group.price_per_slot;
    const txBody: any = {
      amount: Math.round(subscriptionAmount * 100),
      currency: "BRL",
      description: reason,
      statement_descriptor: "DIVIDEPASS",
      io_seller_id: settings.iopay_seller_id,
      payment_type: isPix ? "pix" : "credit",
      reference_id: externalReference,
    };

    if (!isPix) {
      txBody.capture = true;
      txBody.installment_plan = { number_installments: 1 };
      txBody.payment_method = "credit_card";
    }

    try {
      const token = await getToken(settings);
      const txData = await apiRequest("POST", `v1/transaction/new/${customerId}`, txBody, token, settings);
      const txId = txData._txId || txData.id || txData.Id;

      if (!txId) {
        console.error("IOPay no transaction ID in response:", JSON.stringify(txData).substring(0, 500));
        return new Response(JSON.stringify({ error: "Transação criada mas sem ID de retorno. Verifique seu pagamento." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabaseAdmin.from("user_subscriptions").upsert({
        user_id, group_id, service_id: group.service_id, billing_cycle: cycle, amount: subscriptionAmount,
        status: "pending", gateway: "iopay", gateway_subscription_id: txId, external_reference: externalReference, started_at: new Date().toISOString(),
      }, { onConflict: "user_id, group_id" });

      await supabaseAdmin.from("group_members").update({ payment_status: "awaiting_subscription", gateway: "iopay", gateway_payment_id: txId }).eq("group_id", group_id).eq("user_id", user_id);

      if (referral_code) {
        try {
          const { data: referrer } = await supabaseAdmin.from("user_referral_codes").select("user_id").eq("referral_code", referral_code).maybeSingle();
          if (referrer && referrer.user_id !== user_id) {
            const existing = await supabaseAdmin.from("referrals").select("id").eq("invitee_id", user_id).eq("referral_code", referral_code).maybeSingle();
            if (!existing.data) {
              await supabaseAdmin.from("referrals").insert({ referrer_id: referrer.user_id, invitee_id: user_id, referral_code, group_id, status: "pending", points: 10 });
            }
          }
        } catch (e) { console.error("Referral error:", e); }
      }

      // For PIX, fetch full transaction details to get copy_paste code
      let pixCopyPaste = null;
      let pixQrUrl = null;
      let pixQrBase64 = null;

      if (isPix) {
        pixCopyPaste = txData.pix_copy_paste || txData.copy_paste || txData.pix_payload || txData.payload || txData.pix_code || txData.qr_code || null;
        pixQrUrl = txData.pix_qrcode_url || null;
        console.log("IOPay PIX sub created fields:", Object.keys(txData).join(", "));

        const details = await getTransactionDetails(txId, settings);
        if (details) {
          console.log("IOPay PIX sub detail fields:", Object.keys(details).join(", "));
          pixCopyPaste = details.pix_copy_paste || details.copy_paste || details.pix_payload || details.payload || details.pix_code || details.qr_code || details.code || pixCopyPaste;
          pixQrUrl = details.pix_qrcode_url || pixQrUrl;
        }

        if (pixQrUrl) {
          pixQrBase64 = await fetchPixQrCode(pixQrUrl);
        }
      }

      const txStatus = txData.status || "pending";

      return Response.json({
        transaction_id: txId,
        payment_type: "subscription",
        gateway: "iopay",
        payment_method: isPix ? "pix" : "card",
        pix_qrcode: pixQrBase64,
        pix_qrcode_url: pixQrUrl,
        pix_copy_paste: pixCopyPaste,
        status: isPix ? txStatus : "processing",
        needs_polling: !isPix,
        raw: { created: txData },
      }, { headers: corsHeaders });
    } catch (err: any) {
      console.error("IOPay subscription error:", err.message);
      return new Response(JSON.stringify({ error: "Erro ao criar pagamento: " + err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
}
