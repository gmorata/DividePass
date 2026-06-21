import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDataContext } from '../../contexts/AppDataContext';
import './UserDashboard.css';

function UserDashboard() {
  const navigate = useNavigate();
  const { currentUser, getActiveServices, getAvailableServices, isSubscribedToService, announcements, dismissAnnouncement } = useAppDataContext();
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('dismissed_announcements') || '[]'));
    } catch {
      return new Set();
    }
  });

  const activeServices = getActiveServices();
  const availableServices = getAvailableServices();

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter(a => !dismissedIds.has(a.id));
  }, [announcements, dismissedIds]);

  const handleDismiss = async (id) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      const arr = [...next];
      localStorage.setItem('dismissed_announcements', JSON.stringify(arr));
      return next;
    });
    await dismissAnnouncement(id);
  };

  const totalMonthly = activeServices.reduce(
    (sum, { group }) => sum + (Number(group?.price_per_slot) || 0),
    0
  );

  const announceTypeClass = (type) => {
    const map = { info: 'info', warning: 'warning', success: 'success', urgent: 'urgent' };
    return map[type] || 'info';
  };

  return (
    <div className="fade-in">
      {visibleAnnouncements.length > 0 && (
        <div className="announcements-banner-list">
          {visibleAnnouncements.map(a => (
            <div key={a.id} className={`announcement-banner ${announceTypeClass(a.type)}`}>
              <div className="announcement-banner-content">
                <strong>{a.title}</strong>
                <span>{a.message}</span>
              </div>
              <button
                className="announcement-dismiss-btn"
                onClick={() => handleDismiss(a.id)}
                title="Dispensar"
              >
                Vi
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="page-header">
        <h1>Olá, {currentUser?.name?.split(' ')[0] || 'Usuário'}! 👋</h1>
        <p>Aqui está o resumo das suas assinaturas ativas.</p>
      </div>

      <div className="dashboard-metrics">
        <div className="metric-card highlight">
          <h3>Próximo Vencimento</h3>
          <p className="metric-value">15 de Julho</p>
          <span className="metric-subtitle">Fatura de R$ {totalMonthly.toFixed(2).replace('.', ',')}</span>
        </div>
        <div className="metric-card">
          <h3>Economia Estimada</h3>
          <p className="metric-value positive">R$ {(totalMonthly * 2).toFixed(2).replace('.', ',')}</p>
          <span className="metric-subtitle">este mês rateando</span>
        </div>
      </div>

      {/* Serviços Ativos - SEMPRE NO TOPO */}
      <section className="active-services-section">
        <div className="section-title-row">
          <h2>Minhas Assinaturas</h2>
          <Link to="/dashboard/credentials" className="btn btn-primary btn-sm">
            Ver Todas as Credenciais
          </Link>
        </div>

        {activeServices.length === 0 ? (
          <div className="empty-state">
            <p>Você ainda não possui assinaturas ativas.</p>
            <Link to="/dashboard/catalog" className="btn btn-primary">
              Explorar Catálogo
            </Link>
          </div>
        ) : (
          <div className="services-grid">
            {activeServices.map(({ service, group }) => (
              <button
                key={group.id}
                className="service-card active-service-card"
                onClick={() => navigate(`/dashboard/credentials/${service.slug || service.id}`)}
                style={{ '--service-color': service.color }}
              >
                <div className="service-icon" style={{ backgroundColor: service.color }}>
                  {service.icon_url ? (
                    <img src={service.icon_url} alt={service.name} className="service-icon-img" />
                  ) : (
                    service.icon
                  )}
                </div>
                <div className="service-info">
                  <h4>{service.fullName || service.name}</h4>
                </div>
                <span className="status active">Ativo</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Streamings Disponíveis para Assinar */}
      <section className="available-services-section">
        <div className="section-title-row">
          <h2>Streamings Disponíveis</h2>
          <Link to="/dashboard/catalog" className="btn btn-primary btn-sm">
            Ver Catálogo Completo
          </Link>
        </div>

        <div className="available-services-grid">
          {availableServices.map(service => {
            const subscribed = isSubscribedToService(service.id);

            return (
              <div key={service.id} className="available-service-card">
                <div
                  className="available-service-header"
                  style={{ backgroundColor: service.color }}
                >
                  {service.icon_url ? (
                    <img src={service.icon_url} alt={service.name} className="available-service-logo" />
                  ) : (
                    <div className="available-service-icon">{service.icon || service.name[0]}</div>
                  )}
                </div>
                <div className="available-service-body">
                  <h3>{service.name}</h3>
                  <Link
                    to={`/dashboard/catalog/${service.slug || service.id}`}
                    className={`available-service-btn ${subscribed ? 'btn-subscribed' : 'btn-primary'}`}
                  >
                    {subscribed ? 'Já Assinado' : 'Ver Grupos'}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default UserDashboard;
