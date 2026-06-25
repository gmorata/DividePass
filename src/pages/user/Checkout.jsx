import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Loader2, Shield, ChevronLeft, CreditCard, CheckCircle, ScrollText, Clock, QrCode, Copy, RotateCcw, AlertTriangle } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import IOPayCardForm from '../../components/IOPayCardForm';
import '../../components/IOPayCardForm.css';
import './Checkout.css';

const CYCLE_OPTIONS = {
  monthly: { label: 'Mensal', months: 1 },
  quarterly: { label: 'Trimestral', months: 3 },
  semiannual: { label: 'Semestral', months: 6 },
  annual: { label: 'Anual', months: 12 },
};

function monthsForCycle(cycle, group) {
  if (cycle === 'custom') return group?.custom_cycle_months || 1;
  return CYCLE_OPTIONS[cycle]?.months ?? 1;
}

function formatCurrency(value) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

const GATEWAY_NAMES = {
  mercadopago: 'Mercado Pago',
  stripe: 'Stripe',
  asaas: 'Asaas',
  iopay: 'IOPay',
  pagarme: 'Pagar.me',
};

const GATEWAYS_REDIRECT = ['mercadopago', 'stripe'];
const GATEWAYS_WITH_PIX = ['iopay', 'pagarme', 'asaas', 'stripe'];
const GATEWAYS_WITH_CARD_FORM = ['iopay', 'pagarme'];

function Checkout() {
  const { groupSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getGroupBySlug } = useAppDataContext();
  const referralCode = searchParams.get('ref');

  const paymentStatus = searchParams.get('payment');

  const [processing, setProcessing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [paymentAttempted, setPaymentAttempted] = useState(false);
  const [error, setError] = useState('');
  const [remoteGroup, setRemoteGroup] = useState(undefined);
  const [memberStatus, setMemberStatus] = useState(null);
  const [activeGateway, setActiveGateway] = useState('mercadopago');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [gatewayResult, setGatewayResult] = useState(null);
  const [gatewayWaiting, setGatewayWaiting] = useState(false);
  const [cardFormResetKey, setCardFormResetKey] = useState(0);
  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const [selectedCycleState, setSelectedCycleState] = useState(null);

  const localDetails = getGroupBySlug(groupSlug);
  const details = localDetails || remoteGroup || null;

  const selectedCycle = (() => {
    const d = localDetails || remoteGroup;
    const available = d?.group?.available_cycles || ['monthly'];
    if (selectedCycleState && available.includes(selectedCycleState)) return selectedCycleState;
    return available[0] || 'monthly';
  })();

  // Fetch group data
  useEffect(() => {
    if (localDetails) return;
    let cancelled = false;

    const fetchGroup = async () => {
      let groupData = null;

      const tryBySlug = await supabase
        .from('groups')
        .select(`*, service:service_id (*), members:group_members (*), credential:group_credentials (*), owner:owner_id (id, name, email)`)
        .eq('slug', groupSlug)
        .eq('status', 'open')
        .maybeSingle();

      if (!cancelled && tryBySlug.data) {
        groupData = tryBySlug.data;
      }

      if (!cancelled && !groupData) {
        const tryById = await supabase
          .from('groups')
          .select(`*, service:service_id (*), members:group_members (*), credential:group_credentials (*), owner:owner_id (id, name, email)`)
          .eq('id', groupSlug)
          .eq('status', 'open')
          .maybeSingle();

        if (!cancelled && tryById.data) {
          groupData = tryById.data;
        }
      }

      if (!cancelled && !groupData) {
        const tryByName = await supabase
          .from('groups')
          .select(`*, service:service_id (*), members:group_members (*), credential:group_credentials (*), owner:owner_id (id, name, email)`)
          .ilike('name', groupSlug)
          .eq('status', 'open')
          .maybeSingle();

        if (!cancelled && tryByName.data) {
          groupData = tryByName.data;
        }
      }

      if (cancelled || !groupData) {
        if (!cancelled) setRemoteGroup(null);
        return;
      }

      const service = groupData.service || null;

      if (!cancelled) {
        setRemoteGroup({
          group: { ...groupData, credentials: groupData.credential || {} },
          service,
          spots: groupData.has_slot_limit === false
            ? Infinity
            : Math.max(0, (service?.max_group_size || groupData.max_size) - (groupData.members?.filter(m => m.status === 'active').length || 0)),
        });
      }
    };

    fetchGroup();
    return () => { cancelled = true; };
  }, [groupSlug, localDetails]);

  // Fetch active gateway
  useEffect(() => {
    const fetchGateway = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'active_gateway')
        .maybeSingle();
      if (data?.value) setActiveGateway(data.value);
    };
    fetchGateway();
  }, []);

  // Fetch member status if logged in
  useEffect(() => {
    if (!user || !details?.group?.id) return;
    let cancelled = false;

    const fetchMember = async () => {
      const { data } = await supabase
        .from('group_members')
        .select('payment_status, entrance_paid_at, subscription_deadline, status')
        .eq('group_id', details.group.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!cancelled) setMemberStatus(data);
    };

    fetchMember();
    return () => { cancelled = true; };
  }, [user, details?.group?.id]);

  // Handle payment return
  useEffect(() => {
    if (!paymentStatus || !user || !details?.group?.id) return;

    if (paymentStatus === 'entrance_success') {
      const refresh = async () => {
        const { data } = await supabase
          .from('group_members')
          .select('payment_status, entrance_paid_at, subscription_deadline, status')
          .eq('group_id', details.group.id)
          .eq('user_id', user.id)
          .maybeSingle();
        setMemberStatus(data);
      };
      refresh();
    } else if (paymentStatus === 'subscription_success') {
      navigate(`/dashboard/services/${details.service?.slug || details.service?.id}`);
    }
  }, [paymentStatus, user, details, navigate]);

  const handleCheckPayment = async () => {
    setChecking(true);
    setError('');
    try {
      const { data } = await supabase
        .from('group_members')
        .select('payment_status, entrance_paid_at, subscription_deadline, status')
        .eq('group_id', details.group.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setMemberStatus(data);
        if (data.payment_status === 'entrance_paid' || data.payment_status === 'awaiting_subscription' || data.payment_status === 'active') {
          // Payment confirmed
        } else {
          setError('Pagamento ainda não confirmado. Aguarde alguns instantes e tente novamente.');
        }
      }
    } catch (err) {
      console.error('[Checkout] Check payment error:', err);
      setError('Erro ao verificar pagamento.');
    } finally {
      setChecking(false);
    }
  };

  const handleEntrancePayment = async (cardData = null) => {
    setProcessing(true);
    setPaymentAttempted(true);
    setError('');
    setGatewayResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Você precisa estar logado.');

      const gwPaymentMethod = GATEWAYS_WITH_PIX.includes(activeGateway) ? paymentMethod : undefined;

      const payload = {
        group_id: details.group.id,
        user_id: user.id,
        payment_type: 'entrance',
        reason: `Taxa de Entrada - ${service?.name || service?.full_name}`,
        payment_method: gwPaymentMethod,
        gateway: activeGateway,
      };

      if (GATEWAYS_WITH_CARD_FORM.includes(activeGateway) && paymentMethod === 'card' && cardData) {
        payload.card_number = cardData.card_number;
        payload.card_holder_name = cardData.card_holder_name;
        payload.card_exp_month = cardData.card_exp_month;
        payload.card_exp_year = cardData.card_exp_year;
        payload.card_cvv = cardData.card_cvv;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('[Checkout] Entrance response:', response.status, data);
      if (!response.ok) {
        const detail = typeof data.details === 'string' ? data.details : (typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data.details || 'Erro ao criar pagamento.'));
        throw new Error(detail);
      }

      if (data.gateway && (data.pix_copy_paste || data.pix_qrcode_url || data.pix_qrcode)) {
        setGatewayResult(data);
        setGatewayWaiting(true);
        startPaymentPolling();
        setProcessing(false);
        return;
      }

      if (data.needs_polling && data.transaction_id) {
        setGatewayResult(data);
        setGatewayWaiting(true);
        startIOPayCardPolling(data.transaction_id);
        setProcessing(false);
        return;
      }

      const payUrl = data.init_point || data.sandbox_init_point;
      if (payUrl) {
        window.open(payUrl, '_blank');
      } else {
        throw new Error('Link de pagamento não disponível.');
      }
    } catch (err) {
      console.error('[Checkout] Entrance error:', err);
      setError(err.message);
      setCardFormResetKey(k => k + 1);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubscriptionPayment = async (cardData = null) => {
    setProcessing(true);
    setPaymentAttempted(true);
    setError('');
    setGatewayResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Você precisa estar logado.');

      const { group: grp, service: svc } = details;
      const cycleMonths = monthsForCycle(selectedCycle, grp);
      const gwPaymentMethod = GATEWAYS_WITH_PIX.includes(activeGateway) ? paymentMethod : undefined;

      const payload = {
        group_id: grp.id,
        user_id: user.id,
        billing_cycle: selectedCycle,
        months: cycleMonths,
        payment_type: 'subscription',
        reason: `DividePass - ${svc?.name || svc?.full_name}`,
        referral_code: referralCode || null,
        force_new_plan: true,
        payment_method: gwPaymentMethod,
        gateway: activeGateway,
      };

      if (GATEWAYS_WITH_CARD_FORM.includes(activeGateway) && paymentMethod === 'card' && cardData) {
        payload.card_number = cardData.card_number;
        payload.card_holder_name = cardData.card_holder_name;
        payload.card_exp_month = cardData.card_exp_month;
        payload.card_exp_year = cardData.card_exp_year;
        payload.card_cvv = cardData.card_cvv;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('[Checkout] Subscription response:', response.status, data);
      if (!response.ok) {
        const detail = typeof data.details === 'string' ? data.details : (typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data.details || 'Erro ao criar pagamento.'));
        throw new Error(detail);
      }

      if (data.gateway && (data.pix_copy_paste || data.pix_qrcode_url || data.pix_qrcode)) {
        setGatewayResult(data);
        setGatewayWaiting(true);
        startPaymentPolling();
        setProcessing(false);
        return;
      }

      if (data.needs_polling && data.transaction_id) {
        setGatewayResult(data);
        setGatewayWaiting(true);
        startIOPayCardPolling(data.transaction_id);
        setProcessing(false);
        return;
      }

      const payUrl = data.init_point || data.sandbox_init_point;
      if (payUrl) {
        window.open(payUrl, '_blank');
      } else {
        throw new Error('Link de pagamento não disponível.');
      }
    } catch (err) {
      console.error('[Checkout] Subscription error:', err);
      setError(err.message);
      setCardFormResetKey(k => k + 1);
    } finally {
      setProcessing(false);
    }
  };

  const startPaymentPolling = () => {
    const startTime = Date.now();
    const MAX_WAIT = 10 * 60 * 1000; // 10 minutes
    const POLL_INTERVAL = 60 * 1000; // 1 minute

    const interval = setInterval(async () => {
      const elapsed = Date.now() - startTime;

      // Timeout: cancel PIX and stop
      if (elapsed >= MAX_WAIT) {
        clearInterval(interval);
        setGatewayWaiting(false);
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (accessToken && gatewayResult?.transaction_id) {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-iopay-tx`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                transaction_id: gatewayResult.transaction_id,
                action: 'cancel',
                group_id: details.group.id,
                user_id: user.id,
              }),
            });
          }
        } catch (e) {
          console.error('[Checkout] Cancel PIX error:', e);
        }
        setError('Tempo esgotado. Pagamento PIX cancelado. Tente novamente.');
        return;
      }

      // Poll IOPay transaction status
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken || !gatewayResult?.transaction_id) return;

        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-iopay-tx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ transaction_id: gatewayResult.transaction_id }),
        });

        const txResult = await resp.json();
        console.log('[Checkout] Poll result:', txResult);

        // Update pix_copy_paste if found
        if (txResult.pix_copy_paste) {
          setGatewayResult(prev => ({ ...prev, pix_copy_paste: txResult.pix_copy_paste }));
        }

        // Check if approved
        if (txResult.status === 'succeeded' || txResult.status === 'approved' || txResult.status === 'paid') {
          clearInterval(interval);
          setGatewayWaiting(false);
          handleCheckPayment();
          return;
        }

        // Check DB as well (webhook may have already confirmed)
        const { data } = await supabase
          .from('group_members')
          .select('payment_status')
          .eq('group_id', details.group.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (data?.payment_status === 'entrance_paid' || data?.payment_status === 'awaiting_subscription' || data?.payment_status === 'active') {
          clearInterval(interval);
          setGatewayWaiting(false);
          handleCheckPayment();
        }
      } catch (e) {
        console.error('[Checkout] Poll error:', e);
      }
    }, POLL_INTERVAL);

    // Store interval ref for cleanup
    pollingIntervalRef.current = interval;
  };

  const startIOPayCardPolling = (txId) => {
    const startTime = Date.now();
    const MAX_WAIT = 5 * 60 * 1000;
    const POLL_INTERVAL = 5 * 1000;

    const interval = setInterval(async () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= MAX_WAIT) {
        clearInterval(interval);
        setGatewayWaiting(false);
        setError('Tempo esgotado verificando pagamento. Verifique sua conta.');
        return;
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) return;

        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-iopay-tx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ transaction_id: txId, group_id: details.group.id, user_id: user.id }),
        });

        const txResult = await resp.json();
        console.log('[Checkout] IOPay card poll:', txResult);

        if (txResult.status === 'succeeded' || txResult.status === 'approved' || txResult.status === 'paid') {
          clearInterval(interval);
          setGatewayWaiting(false);
          handleCheckPayment();
          return;
        }

        if (txResult.status === 'failed' || txResult.status === 'cancelled' || txResult.status === 'refunded') {
          clearInterval(interval);
          setGatewayWaiting(false);
          setError('Pagamento não aprovado. Tente novamente.');
          return;
        }

        const { data } = await supabase
          .from('group_members')
          .select('payment_status')
          .eq('group_id', details.group.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (data?.payment_status === 'entrance_paid' || data?.payment_status === 'awaiting_subscription' || data?.payment_status === 'active') {
          clearInterval(interval);
          setGatewayWaiting(false);
          handleCheckPayment();
        }
      } catch (e) {
        console.error('[Checkout] Card poll error:', e);
      }
    }, POLL_INTERVAL);

    pollingIntervalRef.current = interval;
  };

  const copyPixCode = () => {
    if (gatewayResult?.pix_copy_paste) {
      navigator.clipboard.writeText(gatewayResult.pix_copy_paste);
    }
  };

  // Loading state
  if (details === undefined) {
    return (
      <div className="fade-in checkout-page">
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Carregando grupo...</p>
        </div>
      </div>
    );
  }

  // Not found
  if (!details) {
    return (
      <div className="fade-in checkout-page">
        <div className="empty-checkout">
          <h2>Grupo não encontrado</h2>
          <Link to="/dashboard/catalog" className="btn btn-primary">Voltar ao Catálogo</Link>
        </div>
      </div>
    );
  }

  const { group, service, spots } = details;
  const hasEntranceFee = group.has_entrance_fee && Number(group.entrance_fee || 0) > 0;
  const entranceAmount = hasEntranceFee ? Number(group.entrance_fee) : 0;
  const availableCycles = group.available_cycles || ['monthly'];
  const validSelectedCycle = availableCycles.includes(selectedCycle) ? selectedCycle : availableCycles[0];
  const cycleMonths = monthsForCycle(validSelectedCycle, group);
  const subscriptionAmount = Number(group.price_per_slot) * cycleMonths;

  // Full group
  if (spots <= 0) {
    return (
      <div className="fade-in checkout-page">
        <div className="empty-checkout">
          <h2>Grupo Cheio</h2>
          <p>Este grupo já atingiu o limite de membros.</p>
          <Link to={`/dashboard/catalog/${service?.slug || service?.id}`} className="btn btn-primary">Ver Outros Grupos</Link>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="fade-in checkout-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} /> Voltar
        </button>
        <div className="page-header">
          <h1>Finalizar Assinatura</h1>
          <p>Faça login ou crie uma conta para continuar.</p>
        </div>
        <div className="checkout-grid checkout-simple">
          <div className="checkout-summary">
            <h3>Resumo</h3>
            <div className="summary-item summary-service">
              <div className="summary-icon" style={{ backgroundColor: service?.color }}>{service?.icon}</div>
              <div>
                <h4>{service?.full_name}</h4>
                <p>{group.name}</p>
              </div>
            </div>
            {group.rules && (
              <div className="checkout-rules">
                <ScrollText size={18} />
                <div><strong>Regras do grupo</strong><p>{group.rules}</p></div>
              </div>
            )}
            <div className="summary-row"><span>Preço mensal</span><strong>{formatCurrency(group.price_per_slot)}</strong></div>
            {hasEntranceFee && <div className="summary-row entrance-row"><span>Taxa de entrada (única)</span><strong>{formatCurrency(entranceAmount)}</strong></div>}
            <div className="summary-row summary-total">
              <span>Total primeiro pagamento</span>
              <strong>{formatCurrency(hasEntranceFee ? entranceAmount : subscriptionAmount)}</strong>
            </div>
          </div>
          <div className="checkout-payment checkout-payment-simple">
            <div className="payment-provider">
              <div className="provider-badge"><Shield size={28} /></div>
              <h3>Entre para continuar</h3>
              <p>Faça login ou crie uma conta para finalizar.</p>
            </div>
            <div className="auth-buttons-checkout">
              <Link to={`/login${referralCode ? `?ref=${referralCode}` : ''}`} className="btn btn-primary btn-full">Entrar</Link>
              <Link to={`/register${referralCode ? `?ref=${referralCode}` : ''}`} className="btn btn-outline btn-full">Criar Conta</Link>
            </div>
            <p className="secure-note"><Shield size={14} /> Ambiente criptografado e seguro.</p>
          </div>
        </div>
      </div>
    );
  }

  const entrancePaid = hasEntranceFee && (memberStatus?.payment_status === 'entrance_paid' || memberStatus?.payment_status === 'awaiting_subscription' || memberStatus?.payment_status === 'active');
  const entranceExpired = hasEntranceFee && memberStatus?.payment_status === 'expired';

  const handleResetPayment = async () => {
    try {
      setProcessing(true);
      setError('');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ group_id: details.group.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMemberStatus({ payment_status: 'awaiting_entrance', status: 'pending' });
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // ============================================
  // EXPIRED: Prazo da taxa de entrada expirou
  // ============================================
  if (entranceExpired) {
    return (
      <div className="fade-in checkout-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} /> Voltar
        </button>
        <div className="page-header">
          <h1>Prazo Expirado</h1>
          <p>O prazo para pagamento da assinatura expirou.</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="checkout-grid checkout-simple">
          <div className="checkout-summary">
            <h3>Resumo</h3>
            <div className="summary-item summary-service">
              <div className="summary-icon" style={{ backgroundColor: service?.color }}>{service?.icon}</div>
              <div><h4>{service?.full_name}</h4><p>{group.name}</p></div>
            </div>

            <div className="entrance-fee-highlight" style={{ borderColor: 'var(--error, #ef4444)' }}>
              <div className="entrance-fee-header">
                <span className="entrance-fee-icon" style={{ background: 'var(--error, #ef4444)' }}>!</span>
                <strong>Taxa de Entrada: {formatCurrency(entranceAmount)}</strong>
              </div>
              <p className="entrance-fee-desc">Você pagou a taxa de entrada, mas não completou a assinatura dentro de 12 horas.</p>
            </div>

            <div className="payment-flow-steps">
              <div className="payment-step completed">
                <div className="step-number"><CheckCircle size={16} /></div>
                <span>Taxa de Entrada</span>
              </div>
              <div className="payment-step-line" />
              <div className="payment-step expired">
                <div className="step-number">!</div>
                <span>Assinatura — Expirada</span>
              </div>
            </div>

            <div className="summary-row summary-total">
              <span>Para reiniciar</span>
              <strong>Clique no botão ao lado</strong>
            </div>
          </div>

          <div className="checkout-payment">
            <div className="payment-provider">
              <div className="provider-badge" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                <AlertTriangle size={28} style={{ color: 'var(--error, #ef4444)' }} />
              </div>
              <h3>Pagamento Expirado</h3>
              <p>Seu prazo de 12 horas para concluir a assinatura expirou. Clique abaixo para reiniciar o processo de pagamento do zero.</p>
            </div>

            <div className="payment-buttons">
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleResetPayment}
                disabled={processing}
              >
                {processing ? (
                  <><Loader2 size={18} className="spin" /> Reiniciando...</>
                ) : (
                  <><RotateCcw size={18} /> Reiniciar Pagamento</>
                )}
              </button>
            </div>
            <p className="secure-note"><Shield size={14} /> Você pagará novamente a taxa de entrada e terá novo prazo de 12h.</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // STEP 1: Mostrar pagamento da taxa de entrada
  // ============================================
  if (hasEntranceFee && !entrancePaid && !entranceExpired) {
    return (
      <div className="fade-in checkout-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} /> Voltar
        </button>
        <div className="page-header">
          <h1>Passo 1 de 2 — Taxa de Entrada</h1>
          <p>Pagamento único para garantir sua vaga no grupo.</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="checkout-grid checkout-simple">
          <div className="checkout-summary">
            <h3>Resumo da Taxa de Entrada</h3>
            <div className="summary-item summary-service">
              <div className="summary-icon" style={{ backgroundColor: service?.color }}>{service?.icon}</div>
              <div><h4>{service?.full_name}</h4><p>{group.name}</p></div>
            </div>

            <div className="entrance-fee-highlight">
              <div className="entrance-fee-header">
                <span className="entrance-fee-icon">!</span>
                <strong>Taxa de Entrada: {formatCurrency(entranceAmount)}</strong>
              </div>
              <p className="entrance-fee-desc">Este valor é cobrado apenas UMA VEZ para garantir sua vaga no grupo.</p>
              <p className="entrance-fee-desc" style={{ marginTop: '0.5rem' }}>Após confirmação, você terá até 12 horas para concluir o pagamento da assinatura mensal.</p>
            </div>

            <div className="payment-flow-steps">
              <div className="payment-step active">
                <div className="step-number">1</div>
                <span>Taxa de Entrada</span>
              </div>
              <div className="payment-step-line" />
              <div className="payment-step">
                <div className="step-number">2</div>
                <span>Assinatura Mensal</span>
              </div>
            </div>

            <div className="summary-row summary-total">
              <span>Total agora</span>
              <strong>{formatCurrency(entranceAmount)}</strong>
            </div>
          </div>

          <div className="checkout-payment">
            {gatewayResult?.gateway && (gatewayResult?.pix_copy_paste || gatewayResult?.pix_qrcode_url || gatewayResult?.pix_qrcode) ? (
              <div className="iopay-pix-result">
                {gatewayResult.pix_qrcode && (
                  <img src={`data:image/png;base64,${gatewayResult.pix_qrcode}`} alt="QR Code PIX" className="pix-qrcode" />
                )}
                {!gatewayResult.pix_qrcode && gatewayResult.pix_qrcode_url && (
                  <img src={gatewayResult.pix_qrcode_url} alt="QR Code PIX" className="pix-qrcode" />
                )}
                {!gatewayResult.pix_qrcode && !gatewayResult.pix_qrcode_url && <QrCode size={48} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />}
                <h3>Pague via PIX</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Escaneie o QR Code acima ou copie o código abaixo
                </p>
                {gatewayResult.pix_copy_paste ? (
                  <>
                    <div className="pix-copy-paste">
                      {gatewayResult.pix_copy_paste}
                    </div>
                    <button className="btn btn-outline btn-full" onClick={copyPixCode} style={{ marginBottom: '1rem' }}>
                      <Copy size={14} /> Copiar Código PIX
                    </button>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                    Código PIX será exibido em breve...
                  </p>
                )}
                {gatewayWaiting && (
                  <div className="pix-waiting">
                    <Loader2 size={16} className="spin" /> Aguardando confirmação do pagamento...
                    <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>
                      Verificando a cada 1 minuto • Timeout em 10 minutos
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="payment-provider">
                  <div className="provider-badge"><CreditCard size={28} /></div>
                  <h3>Pagar Taxa de Entrada</h3>
                  <p>Pagamento único via {GATEWAY_NAMES[activeGateway] || activeGateway}. Após confirmação, avance para a assinatura.</p>
                </div>

                {gatewayResult?.needs_polling && gatewayWaiting ? (
                  <div className="iopay-processing">
                    <div className="processing-animation">
                      <Loader2 size={48} className="spin" />
                    </div>
                    <h3>Processando Pagamento</h3>
                    <p>Seu pagamento está sendo processado. Aguarde a confirmação...</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                      Verificando a cada 5 segundos • Timeout em 5 minutos
                    </p>
                  </div>
                ) : GATEWAYS_REDIRECT.includes(activeGateway) ? (
                  <div className="payment-buttons">
                    <button className="btn btn-primary btn-full btn-lg" onClick={() => handleEntrancePayment()} disabled={processing}>
                      {processing ? (<><Loader2 size={18} className="spin" /> Redirecionando...</>) : (<>Pagar com {GATEWAY_NAMES[activeGateway]} — {formatCurrency(entranceAmount)}</>)}
                    </button>
                    {paymentAttempted && (
                      <button className="btn btn-verify btn-full" onClick={handleCheckPayment} disabled={checking}>
                        {checking ? (<><Loader2 size={16} className="spin" /> Verificando...</>) : 'Já paguei — Verificar Pagamento'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {GATEWAYS_WITH_PIX.includes(activeGateway) && (
                      <div className="iopay-method-selector">
                        <button
                          type="button"
                          className={`iopay-method-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                          onClick={() => setPaymentMethod('card')}
                        >
                          <CreditCard size={16} /> Cartão
                        </button>
                        <button
                          type="button"
                          className={`iopay-method-btn ${paymentMethod === 'pix' ? 'active' : ''}`}
                          onClick={() => { setPaymentMethod('pix'); setGatewayResult(null); setError(''); }}
                        >
                          <QrCode size={16} /> PIX
                        </button>
                      </div>
                    )}

                    {GATEWAYS_WITH_CARD_FORM.includes(activeGateway) && paymentMethod === 'card' ? (
                      <IOPayCardForm
                        amount={entranceAmount}
                        onCardDataReady={(data) => handleEntrancePayment(data)}
                        onError={setError}
                        disabled={processing}
                        resetKey={cardFormResetKey}
                      />
                    ) : (
                      <div className="payment-buttons">
                        <button className="btn btn-primary btn-full btn-lg" onClick={() => handleEntrancePayment()} disabled={processing}>
                          {processing ? (<><Loader2 size={18} className="spin" /> Processando...</>) : (<><CreditCard size={18} /> Pagar {formatCurrency(entranceAmount)}</>)}
                        </button>
                        {paymentAttempted && (
                          <button className="btn btn-verify btn-full" onClick={handleCheckPayment} disabled={checking}>
                            {checking ? (<><Loader2 size={16} className="spin" /> Verificando...</>) : 'Já paguei — Verificar Pagamento'}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <p className="secure-note"><Shield size={14} /> Pagamento seguro</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // STEP 1.5: Entrada paga, aguardando assinatura
  // ============================================
  if (hasEntranceFee && memberStatus?.payment_status === 'entrance_paid') {
    const deadline = new Date(memberStatus.subscription_deadline);
    const now = new Date();
    const hoursLeft = Math.max(0, (deadline - now) / (1000 * 60 * 60));

    return (
      <div className="fade-in checkout-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} /> Voltar
        </button>
        <div className="page-header">
          <h1>Passo 2 de 2 — Assinatura Mensal</h1>
          <p>Taxa de entrada confirmada! Agora pague a assinatura para liberar o acesso.</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="checkout-grid checkout-simple">
          <div className="checkout-summary">
            <h3>Resumo da Assinatura</h3>

            <div className="entrance-paid-badge">
              <CheckCircle size={18} />
              <span>Taxa de entrada paga: {formatCurrency(entranceAmount)}</span>
            </div>

            <div className="deadline-warning">
              <Clock size={18} />
              <div>
                <strong>Prazo: {Math.floor(hoursLeft)}h {Math.floor((hoursLeft % 1) * 60)}min restantes</strong>
                <p>Complete o pagamento da assinatura antes do prazo para garantir sua vaga.</p>
              </div>
            </div>

            <div className="payment-flow-steps">
              <div className="payment-step completed">
                <div className="step-number"><CheckCircle size={16} /></div>
                <span>Taxa de Entrada</span>
              </div>
              <div className="payment-step-line completed" />
              <div className="payment-step active">
                <div className="step-number">2</div>
                <span>Assinatura Mensal</span>
              </div>
            </div>

            <div className="summary-row"><span>Preço mensal</span><strong>{formatCurrency(group.price_per_slot)}</strong></div>
            {validSelectedCycle !== 'monthly' && (
              <div className="summary-row"><span>Ciclo</span><strong>{CYCLE_OPTIONS[validSelectedCycle]?.label || validSelectedCycle} ({cycleMonths}x)</strong></div>
            )}
            <div className="summary-row summary-total">
              <span>Total agora</span>
              <strong>{formatCurrency(subscriptionAmount)}</strong>
            </div>
          </div>

          <div className="checkout-payment">
            {gatewayResult?.needs_polling && gatewayWaiting ? (
              <div className="iopay-processing">
                <div className="processing-animation">
                  <Loader2 size={48} className="spin" />
                </div>
                <h3>Processando Pagamento</h3>
                <p>Seu pagamento está sendo processado. Aguarde a confirmação...</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  Verificando a cada 5 segundos • Timeout em 5 minutos
                </p>
              </div>
            ) : gatewayResult?.gateway && (gatewayResult?.pix_copy_paste || gatewayResult?.pix_qrcode_url || gatewayResult?.pix_qrcode) ? (
              <div className="iopay-pix-result">
                {gatewayResult.pix_qrcode && (
                  <img src={`data:image/png;base64,${gatewayResult.pix_qrcode}`} alt="QR Code PIX" className="pix-qrcode" />
                )}
                {!gatewayResult.pix_qrcode && gatewayResult.pix_qrcode_url && (
                  <img src={gatewayResult.pix_qrcode_url} alt="QR Code PIX" className="pix-qrcode" />
                )}
                {!gatewayResult.pix_qrcode && !gatewayResult.pix_qrcode_url && <QrCode size={48} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />}
                <h3>Pague via PIX</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Escaneie o QR Code acima ou copie o código abaixo
                </p>
                {gatewayResult.pix_copy_paste ? (
                  <>
                    <div className="pix-copy-paste">
                      {gatewayResult.pix_copy_paste}
                    </div>
                    <button className="btn btn-outline btn-full" onClick={copyPixCode} style={{ marginBottom: '1rem' }}>
                      <Copy size={14} /> Copiar Código PIX
                    </button>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                    Código PIX será exibido em breve...
                  </p>
                )}
                {gatewayWaiting && (
                  <div className="pix-waiting">
                    <Loader2 size={16} className="spin" /> Aguardando confirmação do pagamento...
                    <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>
                      Verificando a cada 1 minuto • Timeout em 10 minutos
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="payment-provider">
                  <div className="provider-badge"><CreditCard size={28} /></div>
                  <h3>Pagar Assinatura</h3>
                  <p>Pagamento recorrente mensal via {GATEWAY_NAMES[activeGateway] || activeGateway}.</p>
                </div>

                {gatewayResult?.needs_polling && gatewayWaiting ? (
                  <div className="iopay-processing">
                    <div className="processing-animation">
                      <Loader2 size={48} className="spin" />
                    </div>
                    <h3>Processando Pagamento</h3>
                    <p>Seu pagamento está sendo processado. Aguarde a confirmação...</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                      Verificando a cada 5 segundos • Timeout em 5 minutos
                    </p>
                  </div>
                ) : GATEWAYS_REDIRECT.includes(activeGateway) ? (
                  <div className="payment-buttons">
                    <button className="btn btn-primary btn-full btn-lg" onClick={() => handleSubscriptionPayment()} disabled={processing}>
                      {processing ? (<><Loader2 size={18} className="spin" /> Redirecionando...</>) : (<>Pagar com {GATEWAY_NAMES[activeGateway]} — {formatCurrency(subscriptionAmount)}</>)}
                    </button>
                  </div>
                ) : (
                  <>
                    {activeGateway === 'iopay' && (
                      <div className="iopay-method-selector">
                        <button
                          type="button"
                          className={`iopay-method-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                          onClick={() => { setPaymentMethod('card'); setGatewayResult(null); setError(''); }}
                        >
                          <CreditCard size={16} /> Cartão
                        </button>
                        <button
                          type="button"
                          className={`iopay-method-btn ${paymentMethod === 'pix' ? 'active' : ''}`}
                          onClick={() => { setPaymentMethod('pix'); setGatewayResult(null); setError(''); }}
                        >
                          <QrCode size={16} /> PIX
                        </button>
                      </div>
                    )}

                    {GATEWAYS_WITH_CARD_FORM.includes(activeGateway) && paymentMethod === 'card' ? (
                      <IOPayCardForm
                        amount={subscriptionAmount}
                        onCardDataReady={(token) => handleSubscriptionPayment(token)}
                        onError={setError}
                        disabled={processing}
                        resetKey={cardFormResetKey}
                      />
                    ) : (
                      <div className="payment-buttons">
                        <button className="btn btn-primary btn-full btn-lg" onClick={() => handleSubscriptionPayment()} disabled={processing}>
                          {processing ? (<><Loader2 size={18} className="spin" /> Processando...</>) : (<><CreditCard size={18} /> Pagar {formatCurrency(subscriptionAmount)}</>)}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <p className="secure-note"><Shield size={14} /> Pagamento seguro</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // FLUXO SEM TAXA DE ENTRADA (direto à assinatura)
  // ============================================
  return (
    <div className="fade-in checkout-page">
      <button onClick={() => navigate(-1)} className="back-btn">
        <ChevronLeft size={18} /> Voltar
      </button>
      <div className="page-header">
        <h1>Finalizar Assinatura</h1>
        <p>Revise os dados e siga para o pagamento seguro.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="checkout-grid checkout-simple">
        <div className="checkout-summary">
          <h3>Resumo da Assinatura</h3>
          <div className="summary-item summary-service">
            <div className="summary-icon" style={{ backgroundColor: service?.color }}>{service?.icon}</div>
            <div><h4>{service?.full_name}</h4><p>{group.name}</p></div>
          </div>

          {group.rules && (
            <div className="checkout-rules">
              <ScrollText size={18} />
              <div><strong>Regras do grupo</strong><p>{group.rules}</p></div>
            </div>
          )}

          <div className="summary-row"><span>Preço mensal</span><strong>{formatCurrency(group.price_per_slot)}</strong></div>
          {validSelectedCycle !== 'monthly' && (
            <div className="summary-row"><span>Ciclo</span><strong>{CYCLE_OPTIONS[validSelectedCycle]?.label || validSelectedCycle} ({cycleMonths}x)</strong></div>
          )}
          <div className="summary-row"><span>Vagas restantes</span><strong>{spots === Infinity ? 'Ilimitadas' : `${spots} ${spots === 1 ? 'vaga' : 'vagas'}`}</strong></div>

          <div className="summary-row summary-total">
            <span>Total a pagar</span>
            <strong>{formatCurrency(subscriptionAmount)}</strong>
          </div>
        </div>

          <div className="checkout-payment">
            {gatewayResult?.needs_polling && gatewayWaiting ? (
              <div className="iopay-processing">
                <div className="processing-animation">
                  <Loader2 size={48} className="spin" />
                </div>
                <h3>Processando Pagamento</h3>
                <p>Seu pagamento está sendo processado. Aguarde a confirmação...</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  Verificando a cada 5 segundos • Timeout em 5 minutos
                </p>
              </div>
            ) : gatewayResult?.gateway && (gatewayResult?.pix_copy_paste || gatewayResult?.pix_qrcode_url || gatewayResult?.pix_qrcode) ? (
              <div className="iopay-pix-result">
                {gatewayResult.pix_qrcode && (
                  <img src={`data:image/png;base64,${gatewayResult.pix_qrcode}`} alt="QR Code PIX" className="pix-qrcode" />
                )}
                {!gatewayResult.pix_qrcode && gatewayResult.pix_qrcode_url && (
                  <img src={gatewayResult.pix_qrcode_url} alt="QR Code PIX" className="pix-qrcode" />
                )}
                {!gatewayResult.pix_qrcode && !gatewayResult.pix_qrcode_url && <QrCode size={48} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />}
                <h3>Pague via PIX</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Escaneie o QR Code acima ou copie o código abaixo
                </p>
                {gatewayResult.pix_copy_paste ? (
                  <>
                    <div className="pix-copy-paste">
                      {gatewayResult.pix_copy_paste}
                    </div>
                    <button className="btn btn-outline btn-full" onClick={copyPixCode} style={{ marginBottom: '1rem' }}>
                      <Copy size={14} /> Copiar Código PIX
                    </button>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                    Código PIX será exibido em breve...
                  </p>
                )}
                {gatewayWaiting && (
                  <div className="pix-waiting">
                    <Loader2 size={16} className="spin" /> Aguardando confirmação do pagamento...
                    <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>
                      Verificando a cada 1 minuto • Timeout em 10 minutos
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="payment-provider">
                  <div className="provider-badge"><CreditCard size={28} /></div>
                  <h3>Pagar Assinatura</h3>
                  <p>Pagamento recorrente mensal via {GATEWAY_NAMES[activeGateway] || activeGateway}.</p>
                </div>

                {availableCycles.length > 1 && (
                  <div className="cycle-selector">
                    <label>Ciclo de cobrança</label>
                    <div className="cycle-options">
                      {availableCycles.map(key => {
                        if (key === 'custom') {
                          const label = group.custom_cycle_label || `${group.custom_cycle_months || '?'} meses`;
                          return (
                            <button key={key} className={`cycle-btn ${validSelectedCycle === key ? 'active' : ''}`} onClick={() => setSelectedCycleState(key)}>
                              <span className="cycle-label">{label}</span>
                            </button>
                          );
                        }
                        return (
                          <button key={key} className={`cycle-btn ${validSelectedCycle === key ? 'active' : ''}`} onClick={() => setSelectedCycleState(key)}>
                            <span className="cycle-label">{CYCLE_OPTIONS[key]?.label || key}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {GATEWAYS_REDIRECT.includes(activeGateway) ? (
                  <div className="payment-buttons">
                    <button className="btn btn-primary btn-full btn-lg" onClick={() => handleSubscriptionPayment()} disabled={processing}>
                      {processing ? (<><Loader2 size={18} className="spin" /> Redirecionando...</>) : (<>Pagar com {GATEWAY_NAMES[activeGateway]} — {formatCurrency(subscriptionAmount)}</>)}
                    </button>
                  </div>
                ) : (
                  <>
                    {activeGateway === 'iopay' && (
                      <div className="iopay-method-selector">
                        <button
                          type="button"
                          className={`iopay-method-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                          onClick={() => { setPaymentMethod('card'); setGatewayResult(null); setError(''); }}
                        >
                          <CreditCard size={16} /> Cartão
                        </button>
                        <button
                          type="button"
                          className={`iopay-method-btn ${paymentMethod === 'pix' ? 'active' : ''}`}
                          onClick={() => { setPaymentMethod('pix'); setGatewayResult(null); setError(''); }}
                        >
                          <QrCode size={16} /> PIX
                        </button>
                      </div>
                    )}

                    {GATEWAYS_WITH_CARD_FORM.includes(activeGateway) && paymentMethod === 'card' ? (
                      <IOPayCardForm
                        amount={subscriptionAmount}
                        onCardDataReady={(data) => handleSubscriptionPayment(data)}
                        onError={setError}
                        disabled={processing}
                        resetKey={cardFormResetKey}
                      />
                    ) : (
                      <div className="payment-buttons">
                        <button className="btn btn-primary btn-full btn-lg" onClick={() => handleSubscriptionPayment()} disabled={processing}>
                          {processing ? (<><Loader2 size={18} className="spin" /> Processando...</>) : (<><CreditCard size={18} /> Pagar {formatCurrency(subscriptionAmount)}</>)}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <p className="secure-note"><Shield size={14} /> Pagamento seguro</p>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
