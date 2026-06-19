import { Link, useNavigate } from 'react-router-dom';
import { useAppDataContext } from '../../contexts/AppDataContext';
import './UserDashboard.css';

function UserDashboard() {
  const navigate = useNavigate();
  const { currentUser, getActiveServices, getAvailableServices } = useAppDataContext();

  const activeServices = getActiveServices();
  const availableServices = getAvailableServices();

  const totalMonthly = activeServices.reduce(
    (sum, { group }) => sum + (Number(group?.price_per_slot) || 0),
    0
  );

  const getActiveMembers = (group) =>
    group.members?.filter(m => m.status === 'active').length || 0;

  const getSpots = (group, service) => {
    const maxSize = service?.max_group_size || group.max_size;
    return Math.max(0, maxSize - getActiveMembers(group));
  };

  const isFull = (group, service) => getSpots(group, service) === 0;

  return (
    <div className="fade-in">
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
          <h3>Serviços Ativos</h3>
          <p className="metric-value">{activeServices.length}</p>
          <span className="metric-subtitle">
            {activeServices.length > 0
              ? activeServices.map(({ service }) => service.name).join(', ')
              : 'Nenhum serviço ativo'}
          </span>
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
          <Link to="/dashboard/credentials" className="btn btn-outline btn-sm">
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
                onClick={() => navigate(`/dashboard/credentials/${service.id}`)}
                style={{ '--service-color': service.color }}
              >
                <div className="service-icon" style={{ backgroundColor: service.color }}>
                  {service.icon}
                </div>
                <div className="service-info">
                  <h4>{service.fullName || service.name}</h4>
                  <span className="group-creator-tag">
                    {group.owner_id
                      ? `Criado por: ${group.owner?.name || 'Usuário'}`
                      : <strong>Criado por: DividePass</strong>
                    }
                  </span>
                  <p>{group.credentials?.[0]?.profile_assignment || ''}</p>
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
          <Link to="/dashboard/catalog" className="btn btn-outline btn-sm">
            Ver Catálogo Completo
          </Link>
        </div>

        <div className="available-services-grid">
          {availableServices.map(service => {
            const openGroups = service.groups.filter(g => !isFull(g, service));
            const totalSpots = openGroups.reduce(
              (sum, group) => sum + getSpots(group, service),
              0
            );
            const bestPrice = service.groups.length > 0
              ? Math.min(...service.groups.map(g => Number(g.price_per_slot)))
              : 0;

            return (
              <div key={service.id} className="available-service-card">
                <div
                  className="available-service-header"
                  style={{ backgroundColor: service.color }}
                >
                  <div className="available-service-icon">{service.icon}</div>
                </div>
                <div className="available-service-body">
                  <h3>{service.name}</h3>
                  <p className="available-service-description">{service.description}</p>
                  <div className="available-service-meta">
                    <span className="available-service-price">
                      R$ {bestPrice.toFixed(2).replace('.', ',')}
                      <small>/mês</small>
                    </span>
                    <span className={`available-service-spots ${totalSpots === 0 ? 'empty' : ''}`}>
                      {totalSpots === 0
                        ? 'Sem vagas'
                        : `${totalSpots} ${totalSpots === 1 ? 'vaga' : 'vagas'}`}
                    </span>
                  </div>
                  <Link
                    to={`/dashboard/catalog/${service.slug || service.id}`}
                    className={`btn btn-full ${totalSpots === 0 ? 'btn-outline' : 'btn-primary'}`}
                  >
                    {totalSpots === 0 ? 'Ver Grupos' : 'Assinar Agora'}
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
