import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CreditCard, QrCode, Loader2, Shield, ChevronLeft } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import './Checkout.css';

function Checkout() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getGroupDetails } = useAppDataContext();

  const [paymentMethod, setPaymentMethod] = useState('pix');
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

      if (!accessToken || !user?.email) {
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
          payer_email: user.email,
          amount: Number(group.price_per_slot),
          reason: `Assinatura ${service.fullName} - ${group.name}`,
          back_url: `${import.meta.env.VITE_MERCADO_PAGO_BACK_URL || window.location.origin}/dashboard/credentials/${service.id}`,
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
        <h1>Checkout 💳</h1>
        <p>Revise os dados e finalize sua assinatura.</p>
      </div>

      <div className="checkout-grid">
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

        <div className="checkout-payment">
          <h3>Forma de Pagamento</h3>

          <div className="payment-methods">
            <button
              className={`payment-method ${paymentMethod === 'pix' ? 'active' : ''}`}
              onClick={() => setPaymentMethod('pix')}
            >
              <QrCode size={24} />
              <div>
                <strong>PIX</strong>
                <span>Aprovação instantânea</span>
              </div>
            </button>
            <button
              className={`payment-method ${paymentMethod === 'card' ? 'active' : ''}`}
              onClick={() => setPaymentMethod('card')}
            >
              <CreditCard size={24} />
              <div>
                <strong>Cartão de Crédito</strong>
                <span>Em até 12x</span>
              </div>
            </button>
          </div>

          {paymentMethod === 'pix' ? (
            <div className="payment-content">
              <div className="pix-code">
                <span>00020126580014BR.GOV.BCB.PIX0136dividepass@pagamento.com520400005303986540612.905802BR5923DividePass6009SAO PAULO62070503***6304E2CA</span>
              </div>
              <p className="payment-help">
                Copie o código PIX acima e finalize o pagamento no seu banco.
              </p>
            </div>
          ) : (
            <div className="payment-content">
              <div className="form-row">
                <label>Número do Cartão</label>
                <input type="text" placeholder="0000 0000 0000 0000" defaultValue="4111 1111 1111 1111" />
              </div>
              <div className="form-row form-row-2">
                <div>
                  <label>Validade</label>
                  <input type="text" placeholder="MM/AA" defaultValue="12/30" />
                </div>
                <div>
                  <label>CVV</label>
                  <input type="text" placeholder="123" defaultValue="123" />
                </div>
              </div>
              <div className="form-row">
                <label>Nome no Cartão</label>
                <input type="text" placeholder="JOÃO DA SILVA" defaultValue="JOÃO DA SILVA" />
              </div>
            </div>
          )}

          <button
            className="btn btn-primary btn-full btn-pay"
            onClick={handlePayment}
            disabled={processing}
          >
            {processing ? (
              <>
                <Loader2 size={20} className="spin" />
                Processando...
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
            Pagamento seguro e criptografado.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
