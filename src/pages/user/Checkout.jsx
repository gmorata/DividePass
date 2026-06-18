import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, Shield, ChevronLeft, CreditCard, Calendar, CheckCircle } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import './Checkout.css';

function Checkout() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getGroupDetails } = useAppDataContext();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

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

  if (spots <= 0) {
    return (
      <div className="fade-in checkout-page">
        <div className="empty-checkout">
          <h2>Grupo Cheio</h2>
          <p>Este grupo já atingiu o limite de membros.</p>
          <Link to={`/dashboard/catalog/${service.id}`} className="btn btn-primary">
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
          amount: Number(group.price_per_slot),
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

          <div className="summary-row">
            <span>Preço mensal</span>
            <strong>R$ {Number(group.price_per_slot).toFixed(2).replace('.', ',')}</strong>
          </div>
          <div className="summary-row">
            <span>Vagas restantes</span>
            <strong>{spots} {spots === 1 ? 'vaga' : 'vagas'}</strong>
          </div>
          <div className="summary-row summary-total">
            <span>Total a pagar hoje</span>
            <strong>R$ {Number(group.price_per_slot).toFixed(2).replace('.', ',')}</strong>
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
                Pagar R$ {Number(group.price_per_slot).toFixed(2).replace('.', ',')}
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
