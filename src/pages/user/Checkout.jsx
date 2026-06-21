import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Loader2, Shield, ChevronLeft, CreditCard, Calendar, CheckCircle, ScrollText } from 'lucide-react';
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

function monthsForCycle(cycle) {
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

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [remoteGroup, setRemoteGroup] = useState(undefined);

  const localDetails = getGroupBySlug(groupSlug);
  const details = localDetails || remoteGroup || null;

  useEffect(() => {
    if (localDetails) return;

    let cancelled = false;

    const fetchGroup = async () => {
      let groupData = null;

      const tryBySlug = await supabase
        .from('groups')
        .select(`
          *,
          service:service_id (*),
          members:group_members (*),
          credential:group_credentials (*),
          owner:owner_id (id, name, email)
        `)
        .eq('slug', groupSlug)
        .eq('status', 'open')
        .maybeSingle();

      if (!cancelled && tryBySlug.data) {
        groupData = tryBySlug.data;
      }

      if (!cancelled && !groupData) {
        const tryById = await supabase
          .from('groups')
          .select(`
            *,
            service:service_id (*),
            members:group_members (*),
            credential:group_credentials (*),
            owner:owner_id (id, name, email)
          `)
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
          .select(`
            *,
            service:service_id (*),
            members:group_members (*),
            credential:group_credentials (*),
            owner:owner_id (id, name, email)
          `)
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

  const [selectedCycle, setSelectedCycle] = useState(() => {
    const d = localDetails || remoteGroup;
    const available = d?.group?.available_cycles || ['monthly'];
    return available[0] || 'monthly';
  });

  useEffect(() => {
    const d = localDetails || remoteGroup;
    if (d?.group?.available_cycles) {
      const available = d.group.available_cycles;
      if (!available.includes(selectedCycle)) {
        setSelectedCycle(available[0]);
      }
    }
  }, [remoteGroup, localDetails]);

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

  if (!details) {
    return (
      <div className="fade-in checkout-page">
        <div className="empty-checkout">
          <h2>Grupo não encontrado</h2>
          <Link to="/dashboard/catalog" className="btn btn-primary">
            Voltar ao Catálogo
          </Link>
        </div>
      </div>
    );
  }

  const { group, service, spots } = details;
  const availableCycles = group.available_cycles || ['monthly'];
  const validSelectedCycle = availableCycles.includes(selectedCycle) ? selectedCycle : availableCycles[0];
  const cycleMonths = monthsForCycle(validSelectedCycle);
  const cycleDiscount = Number(group.cycle_discount || 0);
  const baseTotal = Number(group.price_per_slot) * cycleMonths;
  const discountAmount = baseTotal * (cycleDiscount / 100);
  const totalAmount = baseTotal - discountAmount;

  const entranceFee = group.has_entrance_fee ? Number(group.entrance_fee || 0) : 0;
  const totalWithEntrance = totalAmount + (entranceFee > 0 && group._isFirstPayment !== false ? entranceFee : 0);

  if (spots <= 0) {
    return (
      <div className="fade-in checkout-page">
        <div className="empty-checkout">
          <h2>Grupo Cheio</h2>
          <p>Este grupo já atingiu o limite de membros.</p>
          <Link to={`/dashboard/catalog/${service?.slug || service?.id}`} className="btn btn-primary">
            Ver Outros Grupos
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fade-in checkout-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} />
          Voltar
        </button>

        <div className="page-header">
          <h1>Finalizar Assinatura</h1>
          <p>Faça login ou crie uma conta para continuar.</p>
        </div>

        <div className="checkout-grid checkout-simple">
          <div className="checkout-summary">
            <h3>Resumo da Assinatura</h3>
            <div className="summary-item summary-service">
              <div
                className="summary-icon"
                style={{ backgroundColor: service?.color }}
              >
                {service?.icon}
              </div>
              <div>
                <h4>{service?.fullName || service?.full_name}</h4>
                <p>{group.name}</p>
              </div>
            </div>

            {group.rules && (
              <div className="checkout-rules">
                <ScrollText size={18} />
                <div>
                  <strong>Regras do grupo</strong>
                  <p>{group.rules}</p>
                </div>
              </div>
            )}

            <div className="summary-row">
              <span>Preço mensal</span>
              <strong>{formatCurrency(group.price_per_slot)}</strong>
            </div>
            <div className="summary-row">
              <span>Vagas restantes</span>
              <strong>{spots === Infinity ? 'Ilimitadas' : `${spots} ${spots === 1 ? 'vaga' : 'vagas'}`}</strong>
            </div>

            <div className="summary-row summary-total">
              <span>Total a pagar</span>
              <strong>{formatCurrency(totalAmount)}</strong>
            </div>
          </div>

          <div className="checkout-payment checkout-payment-simple">
            <div className="payment-provider">
              <div className="provider-badge">
                <Shield size={28} />
              </div>
              <h3>Entre para continuar</h3>
              <p>
                Faça login na sua conta ou crie uma nova para finalizar a assinatura deste grupo.
              </p>
            </div>

            <div className="auth-buttons-checkout">
              <Link
                to={`/login${referralCode ? `?ref=${referralCode}` : ''}`}
                className="btn btn-primary btn-full"
              >
                Entrar
              </Link>
              <Link
                to={`/register${referralCode ? `?ref=${referralCode}` : ''}`}
                className="btn btn-outline btn-full"
              >
                Criar Conta
              </Link>
            </div>

            <p className="secure-note">
              <Shield size={14} />
              Ambiente criptografado e seguro.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handlePayment = async () => {
    setProcessing(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error('Você precisa estar logado para finalizar o pagamento.');
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercado-pago-create-subscription`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          group_id: details.group.id,
          user_id: user.id,
          amount: totalWithEntrance,
          billing_cycle: validSelectedCycle,
          months: cycleMonths,
          reason: `DividePass - ${service?.name || service?.full_name}`,
          back_url: `${import.meta.env.VITE_MERCADO_PAGO_BACK_URL || window.location.origin}/payment/return`,
          referral_code: referralCode || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao iniciar pagamento.');
      }

      if (data.init_point) {
        window.location.href = data.init_point;
      } else if (data.sandbox_init_point) {
        window.location.href = data.sandbox_init_point;
      } else {
        throw new Error('Link de pagamento não disponível.');
      }
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  return (
    <div className="fade-in checkout-page">
      <button onClick={() => navigate(-1)} className="back-btn">
        <ChevronLeft size={18} />
        Voltar
      </button>

      <div className="page-header">
        <h1>Finalizar Assinatura</h1>
        <p>Revise os dados e siga para o pagamento seguro.</p>
      </div>

      <div className="checkout-grid checkout-simple">
        <div className="checkout-summary">
          <h3>Resumo da Assinatura</h3>
          <div className="summary-item summary-service">
            <div
              className="summary-icon"
              style={{ backgroundColor: service?.color }}
            >
              {service?.icon}
            </div>
            <div>
              <h4>{service?.fullName || service?.full_name}</h4>
              <p>{group.name}</p>
            </div>
          </div>

          {group.rules && (
            <div className="checkout-rules">
              <ScrollText size={18} />
              <div>
                <strong>Regras do grupo</strong>
                <p>{group.rules}</p>
              </div>
            </div>
          )}

          <div className="summary-row">
            <span>Preço mensal</span>
            <strong>{formatCurrency(group.price_per_slot)}</strong>
          </div>
          <div className="summary-row">
            <span>Vagas restantes</span>
            <strong>{spots === Infinity ? 'Ilimitadas' : `${spots} ${spots === 1 ? 'vaga' : 'vagas'}`}</strong>
          </div>

          <div className="cycle-selector">
            <label>Escolha o período de assinatura</label>
            <div className="cycle-options">
              {Object.entries(CYCLE_OPTIONS)
                .filter(([key]) => availableCycles.includes(key))
                .map(([key, { label, months }]) => {
                  const isSelected = validSelectedCycle === key;
                  const monthsTotal = Number(group.price_per_slot) * months;
                  const discounted = monthsTotal * (1 - cycleDiscount / 100);
                  const perMonth = months > 1 ? formatCurrency(discounted / months) : null;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`cycle-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedCycle(key)}
                    >
                      <span className="cycle-label">{label}</span>
                      <span className="cycle-price">{formatCurrency(discounted)}</span>
                      {months > 1 && (
                        <span className="cycle-months">{months}x de {perMonth}</span>
                      )}
                      {months > 1 && cycleDiscount > 0 && (
                        <span className="cycle-discount">-{cycleDiscount}%</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {entranceFee > 0 && (
            <div className="entrance-fee-highlight">
              <div className="entrance-fee-header">
                <span className="entrance-fee-icon">!</span>
                <strong>Taxa de Entrada — Pagamento Único</strong>
              </div>
              <p className="entrance-fee-desc">
                Este valor é cobrado <strong>somente uma vez</strong> para garantir sua vaga no grupo.
                Nas renovações futuras você pagará apenas o valor da assinatura.
              </p>
              <div className="entrance-fee-amount">
                + {formatCurrency(entranceFee)}
              </div>
            </div>
          )}

          <div className="summary-row summary-total">
            <span>Total a pagar hoje</span>
            <strong>{formatCurrency(totalWithEntrance)}</strong>
          </div>

          {entranceFee > 0 && (
            <div className="renewal-note">
              <Calendar size={14} />
              <span>Próxima renovação: <strong>{formatCurrency(totalAmount)}</strong> ({formatCurrency(group.price_per_slot)}/mês)</span>
            </div>
          )}
        </div>

        <div className="checkout-payment checkout-payment-simple">
          <div className="payment-provider">
            <div className="provider-badge">
              <Shield size={28} />
            </div>
            <h3>Pagamento processado pelo Mercado Pago</h3>
            <p>
              Você será redirecionado para o Mercado Pago para concluir o pagamento
              de forma segura. Pode pagar com PIX, cartão de crédito ou saldo.
            </p>
          </div>

          <ul className="payment-benefits">
            <li>
              <CheckCircle size={18} />
              <span>Cobrança automática todo mês</span>
            </li>
            <li>
              <Calendar size={18} />
              <span>Cancele quando quiser</span>
            </li>
            <li>
              <CreditCard size={18} />
              <span>PIX, cartão e outros meios</span>
            </li>
          </ul>

          <button
            className="btn btn-primary btn-full btn-pay"
            onClick={handlePayment}
            disabled={processing}
          >
            {processing ? (
              <>
                <Loader2 size={20} className="spin" />
                Preparando pagamento...
              </>
            ) : (
              <>
                <Shield size={18} />
                Pagar {formatCurrency(totalAmount)}
              </>
            )}
          </button>

          {error && (
            <p className="secure-note" style={{ color: '#EF4444', marginTop: '0.5rem' }}>
              {error}
            </p>
          )}

          <p className="secure-note">
            <Shield size={14} />
            Ambiente criptografado e certificado pelo Mercado Pago.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
