import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Loader2, Shield, ChevronLeft, CreditCard, CheckCircle, ScrollText, Clock } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
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

function Checkout() {
  const { groupSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getGroupBySlug } = useAppDataContext();
  const referralCode = searchParams.get('ref');

  const paymentStatus = searchParams.get('payment');

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [remoteGroup, setRemoteGroup] = useState(undefined);
  const [memberStatus, setMemberStatus] = useState(null);

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
      // Refresh member status after entrance payment
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
      // Subscription paid - redirect to credentials
      navigate(`/dashboard/services/${details.service?.slug || details.service?.id}`);
    }
  }, [paymentStatus, user, details, navigate]);

  const handleEntrancePayment = async () => {
    setProcessing(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Você precisa estar logado.');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercado-pago-create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          group_id: details.group.id,
          user_id: user.id,
          payment_type: 'entrance',
          reason: `Taxa de Entrada - ${service?.name || service?.full_name}`,
          back_url: `${window.location.origin}/checkout/${groupSlug}`,
        }),
      });

      const data = await response.json();
      console.log('[Checkout] Entrance response:', response.status, data);
      if (!response.ok) {
        const detail = data.details?.message || data.error || 'Erro ao criar pagamento.';
        throw new Error(detail);
      }

      if (data.init_point) window.location.href = data.init_point;
      else if (data.sandbox_init_point) window.location.href = data.sandbox_init_point;
      else throw new Error('Link de pagamento não disponível.');
    } catch (err) {
      console.error('[Checkout] Entrance error:', err);
      setError(err.message);
      setProcessing(false);
    }
  };

  const handleSubscriptionPayment = async () => {
    setProcessing(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Você precisa estar logado.');

      const { group, service } = details;
      const cycleMonths = monthsForCycle(selectedCycle, group);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercado-pago-create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          group_id: group.id,
          user_id: user.id,
          billing_cycle: selectedCycle,
          months: cycleMonths,
          payment_type: 'subscription',
          reason: `DividePass - ${service?.name || service?.full_name}`,
          back_url: `${window.location.origin}/checkout/${groupSlug}`,
          referral_code: referralCode || null,
        }),
      });

      const data = await response.json();
      console.log('[Checkout] Subscription response:', response.status, data);
      if (!response.ok) {
        const detail = data.details?.message || data.error || 'Erro ao criar pagamento.';
        throw new Error(detail);
      }

      if (data.init_point) window.location.href = data.init_point;
      else if (data.sandbox_init_point) window.location.href = data.sandbox_init_point;
      else throw new Error('Link de pagamento não disponível.');
    } catch (err) {
      console.error('[Checkout] Subscription error:', err);
      setError(err.message);
      setProcessing(false);
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
            <div className="payment-provider">
              <div className="provider-badge"><CreditCard size={28} /></div>
              <h3>Pagar Taxa de Entrada</h3>
              <p>Pagamento único via Mercado Pago. Após confirmação, avance para a assinatura.</p>
            </div>
            <button className="btn btn-primary btn-full btn-lg" onClick={handleEntrancePayment} disabled={processing}>
              {processing ? (<><Loader2 size={18} className="spin" /> Processando...</>) : (<><CreditCard size={18} /> Pagar {formatCurrency(entranceAmount)}</>)}
            </button>
            <p className="secure-note"><Shield size={14} /> Pagamento seguro via Mercado Pago</p>
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
            <div className="payment-provider">
              <div className="provider-badge"><CreditCard size={28} /></div>
              <h3>Pagar Assinatura</h3>
              <p>Pagamento recorrente mensal via Mercado Pago.</p>
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

            <button className="btn btn-primary btn-full btn-lg" onClick={handleSubscriptionPayment} disabled={processing}>
              {processing ? (<><Loader2 size={18} className="spin" /> Processando...</>) : (<><CreditCard size={18} /> Pagar {formatCurrency(subscriptionAmount)}</>)}
            </button>
            <p className="secure-note"><Shield size={14} /> Pagamento seguro via Mercado Pago</p>
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
          <div className="payment-provider">
            <div className="provider-badge"><CreditCard size={28} /></div>
            <h3>Pagar Assinatura</h3>
            <p>Pagamento recorrente mensal via Mercado Pago.</p>
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

          <button className="btn btn-primary btn-full btn-lg" onClick={handleSubscriptionPayment} disabled={processing}>
            {processing ? (<><Loader2 size={18} className="spin" /> Processando...</>) : (<><CreditCard size={18} /> Pagar {formatCurrency(subscriptionAmount)}</>)}
          </button>
          <p className="secure-note"><Shield size={14} /> Pagamento seguro via Mercado Pago</p>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
