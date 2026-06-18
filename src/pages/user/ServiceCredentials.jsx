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
  RefreshCw,
  X
} from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import './ServiceCredentials.css';

function ServiceCredentials() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { streamingServices, getActiveServices, isSubscribedToService } = useAppDataContext();

  const [showCredentials, setShowCredentials] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [loadingPin, setLoadingPin] = useState(false);
  const [pin, setPin] = useState(null);

  const activeServices = getActiveServices();
  const activeService = activeServices.find(item => item.service.id === serviceId);
  const service = streamingServices.find(s => s.id === serviceId);
  const isSubscribed = isSubscribedToService(serviceId);

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
          <Link to={`/dashboard/catalog/${service.id}`} className="btn btn-primary">
            Ver Grupos Disponíveis
          </Link>
        </div>
      </div>
    );
  }

  const { group } = activeService;
  const credentials = group.credentials;

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFetchPin = () => {
    setLoadingPin(true);
    setPin(null);
    setTimeout(() => {
      setPin(Math.floor(100000 + Math.random() * 900000).toString());
      setLoadingPin(false);
    }, 2000);
  };

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
              <h2 style={{ color: service.color }}>{service.fullName}</h2>
                <span className="profile-badge">{credentials.profile_assignment}</span>
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
        </div>
      </div>

      {/* Modal de Credenciais */}
      {showCredentials && (
        <div className="credentials-modal-overlay" onClick={() => setShowCredentials(false)}>
          <div className="credentials-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCredentials(false)}>
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-icon" style={{ backgroundColor: service.color }}>
                {service.icon}
              </div>
              <div>
                <h2>{service.fullName}</h2>
              <span className="profile-badge">{credentials.profile_assignment}</span>
              </div>
            </div>

            <div className="modal-body">
              <div className="info-group">
                <label>E-mail de Login</label>
                <div className="copy-box">
                  <code>{credentials.login_email}</code>
                  <button
                    className="copy-btn"
                    onClick={() => handleCopy(credentials.login_email, 'email')}
                    title="Copiar"
                  >
                    {copiedField === 'email' ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <div className="info-group">
                <label>Senha</label>
                <div className="copy-box">
                  <code>{showPassword ? credentials.login_password : '••••••••••••'}</code>
                  <div className="actions">
                    <button
                      className="toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Ocultar' : 'Mostrar'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopy(credentials.login_password, 'password')}
                      title="Copiar"
                    >
                      {copiedField === 'password' ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pin-section">
                <div className="pin-header">
                  <h3>Código de Confirmação (PIN)</h3>
                  <p>A {service.name} pediu um código por e-mail? Busque-o aqui.</p>
                </div>

                <div className="pin-box">
                  {loadingPin ? (
                    <div className="loader-container">
                      <div className="spinner"></div>
                      <span>Buscando na caixa de e-mail...</span>
                    </div>
                  ) : pin ? (
                    <div className="pin-result">
                      <span className="pin-code">{pin}</span>
                      <span className="pin-time">Recebido agora há pouco</span>
                    </div>
                  ) : (
                    <div className="pin-empty">Nenhum código recente.</div>
                  )}

                  <button
                    className="btn btn-outline fetch-pin-btn"
                    onClick={handleFetchPin}
                    disabled={loadingPin}
                  >
                    <RefreshCw size={16} className={loadingPin ? 'spin' : ''} />
                    {loadingPin ? 'Buscando...' : 'Atualizar Códigos'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceCredentials;
