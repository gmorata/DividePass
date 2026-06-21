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
  Ban,
  ScrollText
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
  const mainCredential = Array.isArray(group.credentials) && group.credentials.length > 0
    ? group.credentials[0]
    : null;
  const hasProfiles = mainCredential?.has_profiles;
  const myProfile = hasProfiles && group.profiles
    ? group.profiles.find(p => p.assigned_to === user?.id)
    : null;

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
              {service.icon_url ? (
                <img src={service.icon_url} alt={service.name} className="credential-icon-img" />
              ) : (
                service.icon
              )}
            </div>
            <div>
              <h2 style={{ color: service.color }}>{service.full_name}</h2>
              {hasProfiles && (
                <span className="profile-badge">
                  {myProfile ? `Seu perfil: ${myProfile.profile_name}` : 'Perfil não atribuído'}
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
          {group.rules && (
            <div className="credential-rules-highlight">
              <div className="rules-highlight-header">
                <ScrollText size={20} />
                <strong>Regras do Grupo</strong>
              </div>
              <p>{group.rules}</p>
            </div>
          )}

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
                {service.icon_url ? (
                  <img src={service.icon_url} alt={service.name} className="credential-icon-img" />
                ) : (
                  service.icon
                )}
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
              {!mainCredential ? (
                <div className="no-credentials">
                  <AlertTriangle size={24} />
                  <p>Nenhuma credencial cadastrada para este grupo ainda.</p>
                </div>
              ) : (
                <>
                  <div className="cred-section">
                    <h3>Login Compartilhado</h3>
                    {renderCredentialFields(mainCredential, 'main', showPasswords, togglePassword, copiedField, handleCopy)}
                  </div>

                  {hasProfiles && (
                    <div className="cred-section" style={{ marginTop: '1.25rem' }}>
                      <h3>Seu Perfil Individual</h3>
                      {myProfile ? (
                        <div className="cred-profile-card">
                          <div className="cred-profile-header">
                            <div className="cred-profile-dot" style={{ backgroundColor: service.color }} />
                            <h4>{myProfile.profile_name}</h4>
                          </div>
                          <div className="cred-field">
                            <label>Senha do Perfil</label>
                            <div className="cred-field-box">
                              <code>{showPasswords['profile'] ? myProfile.profile_password : '•'.repeat(8)}</code>
                              <div className="cred-actions">
                                <button className="cred-action-btn" onClick={() => togglePassword('profile')} title={showPasswords['profile'] ? 'Ocultar' : 'Mostrar'}>
                                  {showPasswords['profile'] ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                                <button className="cred-action-btn" onClick={() => handleCopy(myProfile.profile_password, 'profile')} title="Copiar">
                                  {copiedField === 'profile' ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="no-credentials">
                          <AlertTriangle size={20} />
                          <p>Nenhum perfil foi atribuído a você ainda.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
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

function renderCredentialFields(cred, key, showPasswords, togglePassword, copiedField, handleCopy) {
  const isVisible = showPasswords[key];
  return (
    <>
      <div className="cred-field">
        <label>E-mail de Login</label>
        <div className="cred-field-box">
          <code>{cred.login_email || '—'}</code>
          {cred.login_email && (
            <button className="cred-action-btn" onClick={() => handleCopy(cred.login_email, `email-${key}`)} title="Copiar">
              {copiedField === `email-${key}` ? <Check size={16} /> : <Copy size={16} />}
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
              <button className="cred-action-btn" onClick={() => togglePassword(key)} title={isVisible ? 'Ocultar' : 'Mostrar'}>
                {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button className="cred-action-btn" onClick={() => handleCopy(cred.login_password, `pass-${key}`)} title="Copiar">
                {copiedField === `pass-${key}` ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ServiceCredentials;
