import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getGroupDetails } = useAppDataContext();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [selectedCycle, setSelectedCycle] = useState(() => {
    const details = getGroupDetails(groupId);
    return details?.group?.billing_cycle || 'monthly';
  });

  const details = getGroupDetails(groupId);

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
  const cycleMonths = monthsForCycle(selectedCycle);
  const cycleDiscount = Number(group.cycle_discount || 0);
  const baseTotal = Number(group.price_per_slot) * cycleMonths;
  const discountAmount = baseTotal * (cycleDiscount / 100);
  const totalAmount = baseTotal - discountAmount;

  if (spots <= 0) {
    return (
      <div className="fade-in checkout-page">
        <div className="empty-checkout">
          <h2>Grupo Cheio</h2>
          <p>Este grupo já atingiu o limite de membros.</p>
          <Link to={`/dashboard/catalog/${service.slug || service.id}`} className="btn btn-primary">
            Ver Outros Grupos
          </Link>
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
          group_id: groupId,
          user_id: user.id,
          amount: totalAmount,
          billing_cycle: selectedCycle,
          months: cycleMonths,
          reason: `DividePass - ${service.name || service.full_name}`,
          back_url: `${import.meta.env.VITE_MERCADO_PAGO_BACK_URL || window.location.origin}/payment/return`,
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
              style={{ backgroundColor: service.color }}
            >
              {service.icon}
            </div>
            <div>
              <h4>{service.fullName}</h4>
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
            <strong>{spots} {spots === 1 ? 'vaga' : 'vagas'}</strong>
          </div>

          <div className="cycle-selector">
            <label>Escolha o período de assinatura</label>
            <div className="cycle-options">
              {Object.entries(CYCLE_OPTIONS).map(([key, { label, months }]) => {
                const isSelected = selectedCycle === key;
                const monthsTotal = Number(group.price_per_slot) * months;
                const discounted = monthsTotal * (1 - cycleDiscount / 100);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`cycle-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedCycle(key)}
                  >
                    <span className="cycle-label">{label}</span>
                    <span className="cycle-price">{formatCurrency(discounted)}</span>
                    {months > 1 && cycleDiscount > 0 && (
                      <span className="cycle-discount">-{cycleDiscount}%</span>
                    )}
                    {months > 1 && (
                      <span className="cycle-months">{months}x</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="summary-row summary-total">
            <span>Total a pagar hoje</span>
            <strong>{formatCurrency(totalAmount)}</strong>
          </div>
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
