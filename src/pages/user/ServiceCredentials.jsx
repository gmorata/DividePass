import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronLeft,
  Shield,
  AlertTriangle,
  Calendar,
  RotateCcw,
  Ban
} from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import './ServiceCredentials.css';

function ServiceCredentials() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { streamingServices, getActiveServices, isSubscribedToService } = useAppDataContext();

  const [showCredentials, setShowCredentials] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});
  const [cancelling, setCancelling] = useState(false);

  const activeServices = getActiveServices();
  const activeService = activeServices.find(item => item.service.id === serviceId || item.service.slug === serviceId);
  const service = streamingServices.find(s => s.id === serviceId || s.slug === serviceId);
  const isSubscribed = isSubscribedToService(serviceId);

  const togglePassword = (index) => {
    setShowPasswords(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar esta assinatura? Você perderá o acesso imediatamente.')) {
      return;
    }

    setCancelling(true);
    try {
      const { error: memberError } = await supabase
        .from('group_members')
        .update({ status: 'cancelled', left_at: new Date().toISOString() })
        .eq('group_id', activeService.group.id)
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const { error: subError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', activeService.id);

      if (subError) throw subError;

      alert('Assinatura cancelada com sucesso.');
      navigate('/dashboard/credentials');
    } catch (err) {
      alert('Erro ao cancelar assinatura: ' + err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (!service) {
    return (
      <div className="fade-in credentials-page">
        <div className="empty-state">
          <h2>Serviço não encontrado</h2>
          <Link to="/dashboard/catalog" className="btn btn-primary">
            Explorar Catálogo
          </Link>
        </div>
      </div>
    );
  }

  if (!isSubscribed || !activeService) {
    return (
      <div className="fade-in credentials-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} />
          Voltar
        </button>
        <div className="access-denied">
          <AlertTriangle size={48} />
          <h2>Acesso Negado</h2>
          <p>
            Você não possui uma assinatura ativa do {service.name}. Assine um grupo para
            visualizar as credenciais.
          </p>
          <Link to={`/dashboard/catalog/${service.slug || service.id}`} className="btn btn-primary">
            Ver Grupos Disponíveis
          </Link>
        </div>
      </div>
    );
  }

  const { group } = activeService;
  const credentialsList = Array.isArray(group.credentials)
    ? group.credentials.filter(c => !c.assigned_to || c.assigned_to === user?.id)
    : [];

  return (
    <div key={serviceId} className="fade-in credentials-page">
      <button onClick={() => navigate(-1)} className="back-btn">
        <ChevronLeft size={18} />
        Voltar
      </button>

      <div className="page-header">
        <h1>Credenciais {service.name}</h1>
        <p>Dados de acesso do seu grupo {group.name}.</p>
      </div>

      <div className="credential-card" style={{ '--service-color': service.color }}>
        <div className="credential-header" style={{ backgroundColor: `${service.color}15` }}>
          <div className="credential-service">
            <div className="credential-icon" style={{ backgroundColor: service.color }}>
              {service.icon}
            </div>
            <div>
              <h2 style={{ color: service.color }}>{service.full_name}</h2>
              {credentialsList.length > 0 && (
                <span className="profile-badge">
                  {credentialsList.length} {credentialsList.length === 1 ? 'perfil' : 'perfis'}
                </span>
              )}
            </div>
          </div>
          <button
            className="btn btn-primary access-credentials-btn"
            onClick={() => setShowCredentials(true)}
          >
            <Shield size={18} />
            Acessar Credenciais
          </button>
        </div>

        <div className="credential-body">
          <div className="credential-info-row">
            <Shield size={20} />
            <p>
              Suas credenciais são atualizadas automaticamente e protegidas. Não compartilhe
              seus dados de acesso.
            </p>
          </div>

          <div className="credential-meta-grid">
            <div className="credential-meta-item">
              <Calendar size={18} />
              <div>
                <span>Ativada em</span>
                <strong>{new Date(activeService.started_at || activeService.created_at).toLocaleDateString('pt-BR')}</strong>
              </div>
            </div>
            <div className="credential-meta-item">
              <RotateCcw size={18} />
              <div>
                <span>Renovação</span>
                <strong>{activeService.expires_at ? new Date(activeService.expires_at).toLocaleDateString('pt-BR') : 'Mensal'}</strong>
              </div>
            </div>
          </div>

          <button
            className="btn btn-outline cancel-subscription-btn"
            onClick={handleCancelSubscription}
            disabled={cancelling}
          >
            <Ban size={18} />
            {cancelling ? 'Cancelando...' : 'Cancelar Assinatura'}
          </button>
        </div>
      </div>

      {showCredentials && (
        <div className="credentials-modal-overlay" onClick={() => setShowCredentials(false)}>
          <div className="credentials-modal" onClick={e => e.stopPropagation()}>
            <div className="credentials-modal-header">
              <div className="modal-icon" style={{ backgroundColor: service.color }}>
                {service.icon}
              </div>
              <div>
                <h2>{service.full_name}</h2>
                <span className="modal-group-name">{group.name}</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowCredentials(false)}>
                <span>&times;</span>
              </button>
            </div>

            <div className="credentials-modal-body">
              {credentialsList.length === 0 ? (
                <div className="no-credentials">
                  <AlertTriangle size={24} />
                  <p>Nenhuma credencial cadastrada para este grupo ainda.</p>
                </div>
              ) : credentialsList.length === 1 ? (
                <div className="single-credential">
                  {renderCredentialFields(credentialsList[0], 0, showPasswords, togglePassword, copiedField, handleCopy)}
                </div>
              ) : (
                <div className="multi-credentials">
                  {credentialsList.map((cred, index) => (
                    <div key={index} className="cred-profile-card">
                      <div className="cred-profile-header">
                        <div className="cred-profile-dot" style={{ backgroundColor: service.color }} />
                        <h3>{cred.profile_assignment || `Perfil ${index + 1}`}</h3>
                      </div>
                      {renderCredentialFields(cred, index, showPasswords, togglePassword, copiedField, handleCopy)}
                    </div>
                  ))}
                </div>
              )}

              <div className="credentials-modal-footer">
                <p>Não compartilhe suas credenciais com ninguém.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderCredentialFields(cred, index, showPasswords, togglePassword, copiedField, handleCopy) {
  const isVisible = showPasswords[index];
  return (
    <>
      <div className="cred-field">
        <label>E-mail de Login</label>
        <div className="cred-field-box">
          <code>{cred.login_email || '—'}</code>
          {cred.login_email && (
            <button className="cred-action-btn" onClick={() => handleCopy(cred.login_email, `email-${index}`)} title="Copiar">
              {copiedField === `email-${index}` ? <Check size={16} /> : <Copy size={16} />}
            </button>
          )}
        </div>
      </div>
      <div className="cred-field">
        <label>Senha</label>
        <div className="cred-field-box">
          <code>{isVisible ? cred.login_password : '•'.repeat(Math.max(8, cred.login_password?.length || 8))}</code>
          {cred.login_password && (
            <div className="cred-actions">
              <button className="cred-action-btn" onClick={() => togglePassword(index)} title={isVisible ? 'Ocultar' : 'Mostrar'}>
                {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button className="cred-action-btn" onClick={() => handleCopy(cred.login_password, `pass-${index}`)} title="Copiar">
                {copiedField === `pass-${index}` ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ServiceCredentials;
