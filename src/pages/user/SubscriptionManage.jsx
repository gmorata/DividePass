import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft,
  Calendar,
  RotateCcw,
  CreditCard,
  Ban,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Shield,
  ExternalLink
} from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import './SubscriptionManage.css';

function SubscriptionManage() {
  const { subscriptionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { streamingServices, getActiveServices } = useAppDataContext();

  const [cancelling, setCancelling] = useState(false);
  const [cancelledIds, setCancelledIds] = useState(new Set());

  const activeServices = getActiveServices();
  const baseSubscription = activeServices.find(s => s.id === subscriptionId) || null;
  const subscription = baseSubscription && cancelledIds.has(baseSubscription.id)
    ? { ...baseSubscription, status: 'cancelled' }
    : baseSubscription;

  const handleCancel = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar esta assinatura? Você perderá o acesso imediatamente.')) {
      return;
    }

    setCancelling(true);
    try {
      const { error: memberError } = await supabase
        .from('group_members')
        .update({ status: 'cancelled', left_at: new Date().toISOString() })
        .eq('group_id', subscription.group.id)
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const { error: subError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', subscription.id);

      if (subError) throw subError;

      setCancelledIds(prev => new Set([...prev, subscription.id]));
    } catch (err) {
      alert('Erro ao cancelar assinatura: ' + err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (!subscription) {
    return (
      <div className="fade-in subscription-manage-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} />
          Voltar
        </button>
        <div className="empty-state">
          <h2>Assinatura não encontrada</h2>
          <Link to="/dashboard/credentials" className="btn btn-primary">
            Ver Credenciais
          </Link>
        </div>
      </div>
    );
  }

  const service = streamingServices.find(s => s.id === subscription.service?.id);
  const { group } = subscription;
  const isActive = subscription.status === 'active';

  return (
    <div className="fade-in subscription-manage-page">
      <button onClick={() => navigate(-1)} className="back-btn">
        <ChevronLeft size={18} />
        Voltar
      </button>

      <div className="page-header">
        <h1>Gerenciar Assinatura</h1>
        <p>Detalhes e opções da sua assinatura {service?.name}.</p>
      </div>

      <div className="sub-manage-card" style={{ '--service-color': service?.color || '#4F46E5' }}>
        <div className="sub-manage-header" style={{ backgroundColor: `${service?.color}15` }}>
          <div className="credential-service">
            <div className="credential-icon" style={{ backgroundColor: service?.color }}>
              {service?.icon_url ? (
                <img src={service.icon_url} alt={service.name} className="credential-icon-img" />
              ) : (
                service?.icon
              )}
            </div>
            <div>
              <h2 style={{ color: service?.color }}>{service?.full_name}</h2>
              <span className="modal-group-name">{group.name}</span>
            </div>
          </div>
          <div className={`sub-status-badge ${isActive ? 'active' : 'cancelled'}`}>
            {isActive ? <CheckCircle size={16} /> : <Ban size={16} />}
            {isActive ? 'Ativa' : 'Cancelada'}
          </div>
        </div>

        <div className="sub-manage-body">
          <div className="sub-detail-grid">
            <div className="sub-detail-item">
              <Calendar size={18} />
              <div>
                <span>Data de início</span>
                <strong>{new Date(subscription.started_at || subscription.created_at).toLocaleDateString('pt-BR')}</strong>
              </div>
            </div>
            <div className="sub-detail-item">
              <RotateCcw size={18} />
              <div>
                <span>Próxima renovação</span>
                <strong>{subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString('pt-BR') : 'Mensal'}</strong>
              </div>
            </div>
            <div className="sub-detail-item">
              <CreditCard size={18} />
              <div>
                <span>Valor mensal</span>
                <strong>R$ {parseFloat(subscription.amount || group.price_per_slot || 0).toFixed(2)}</strong>
              </div>
            </div>
            <div className="sub-detail-item">
              <Shield size={18} />
              <div>
                <span>Ciclo de cobrança</span>
                <strong>
                  {subscription.billing_cycle === 'custom'
                    ? (subscription.group?.custom_cycle_label || `${subscription.custom_cycle_months || '?'} meses`)
                    : ({ monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' }[subscription.billing_cycle] || 'Mensal')
                  }
                </strong>
              </div>
            </div>
          </div>

          {service?.official_url && (
            <a
              href={service.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-full sub-site-link"
            >
              <ExternalLink size={16} />
              Acessar site oficial
            </a>
          )}

          {isActive && (
            <div className="sub-danger-zone">
              <h3>Zona de perigo</h3>
              <p>Cancelar sua assinatura resultará na perda imediata de acesso às credenciais e ao grupo.</p>
              <button
                className="btn btn-danger btn-full"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    Cancelando...
                  </>
                ) : (
                  <>
                    <Ban size={16} />
                    Cancelar Assinatura
                  </>
                )}
              </button>
            </div>
          )}

          {!isActive && (
            <div className="sub-cancelled-notice">
              <AlertTriangle size={20} />
              <p>Esta assinatura foi cancelada. Para acessar novamente, assine um novo grupo.</p>
              <Link to={`/dashboard/catalog/${service?.slug || service?.id}`} className="btn btn-primary">
                Ver Grupos Disponíveis
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubscriptionManage;
