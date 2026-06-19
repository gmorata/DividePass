import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Users, Check, BadgeCheck, ScrollText } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import './Catalog.css';

function Catalog() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { streamingServices, getAvailableServices, isSubscribedToService } = useAppDataContext();

  const availableServices = getAvailableServices();
  const selectedService = serviceId
    ? streamingServices.find(s => s.id === serviceId || s.slug === serviceId)
    : null;

  const getActiveMembers = (group) =>
    group.members?.filter(m => m.status === 'active').length || 0;

  const getSpots = (group, service) => {
    const maxSize = service?.max_group_size || group.max_size;
    return Math.max(0, maxSize - getActiveMembers(group));
  };

  const isFull = (group, service) =>
    getSpots(group, service) === 0;

  if (selectedService) {
    const serviceData = availableServices.find(s => s.id === serviceId || s.slug === serviceId);
    const groups = serviceData?.groups || [];
    const alreadySubscribed = isSubscribedToService(serviceId);

    return (
      <div className="fade-in catalog-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} />
          Voltar
        </button>

        <div className="page-header">
          <h1>{selectedService.fullName}</h1>
          <p>Escolha um grupo para fazer parte do rateio.</p>
        </div>

        {alreadySubscribed && (
          <div className="info-banner">
            <Check size={18} />
            Você já possui uma assinatura ativa do {selectedService.name}.
            <Link to={`/dashboard/credentials/${serviceId}`}>Ver credenciais</Link>
          </div>
        )}

        <div className="groups-grid">
          {groups.map(group => {
            const activeMembers = getActiveMembers(group);
            const spots = getSpots(group, selectedService);
            const full = isFull(group, selectedService);
            const maxSize = selectedService.max_group_size || group.max_size;

            return (
              <div key={group.id} className={`group-card ${full ? 'group-card-full' : ''}`}>
                <div className="group-card-header">
                  <h3>
                    {group.name}
                    {group.verified && (
                      <span className="verified-badge" title="Grupo verificado pela DividePass">
                        <BadgeCheck size={18} />
                      </span>
                    )}
                  </h3>
                  {full ? (
                    <span className="tag tag-full">Cheio</span>
                  ) : (
                    <span className="tag tag-open">
                      {spots} {spots === 1 ? 'vaga' : 'vagas'}
                    </span>
                  )}
                </div>

                <div className="group-card-body">
                  <div className="group-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(activeMembers / maxSize) * 100}%`,
                          backgroundColor: full ? '#EF4444' : '#22C55E'
                        }}
                      />
                    </div>
                    <span className="progress-text">
                      {activeMembers} de {maxSize} membros
                    </span>
                  </div>

                  {group.tags && group.tags.length > 0 && (
                    <div className="group-tags">
                      {group.tags.map((tag, idx) => (
                        <span key={idx} className="group-tag-item">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="group-members-preview">
                    <Users size={16} />
                    <div className="member-avatars">
                      {group.members?.slice(0, 4).map((member, idx) => (
                        <span key={idx} className="member-avatar">
                          {member.profile_name?.[0]?.toUpperCase() || '?'}
                        </span>
                      ))}
                      {activeMembers > 4 && (
                        <span className="member-avatar more">
                          +{activeMembers - 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {group.rules && (
                    <div className="group-rules">
                      <ScrollText size={16} />
                      <p>{group.rules}</p>
                    </div>
                  )}

                  <div className="group-price">
                    <span className="price-label">Preço por vaga</span>
                    <span className="price-value">
                      R$ {Number(group.price_per_slot).toFixed(2).replace('.', ',')}
                      <small>/mês</small>
                    </span>
                  </div>
                </div>

                <div className="group-card-footer">
                  {full || alreadySubscribed ? (
                    <button className="btn btn-outline btn-full" disabled>
                      {full ? 'Grupo Cheio' : 'Já Assinado'}
                    </button>
                  ) : (
                    <Link
                      to={`/dashboard/checkout/${group.id}`}
                      className="btn btn-primary btn-full"
                    >
                      Entrar no Grupo
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in catalog-page">
      <div className="page-header">
        <h1>Catálogo de Serviços</h1>
        <p>Assine novos serviços dividindo o valor com outras pessoas.</p>
      </div>

      <div className="catalog-grid">
        {availableServices.map((service, index) => {
          const subscribed = isSubscribedToService(service.id);

          return (
            <div
              className={`catalog-card ${subscribed ? 'subscribed' : ''}`}
              key={service.id}
              style={{ animationDelay: `${index * 0.06}s` }}
            >
              <div className="catalog-header" style={{ backgroundColor: service.color }}>
                {service.icon_url ? (
                  <img src={service.icon_url} alt={service.name} className="catalog-logo" />
                ) : (
                  <div className="catalog-icon-text">{service.icon || service.name[0]}</div>
                )}
              </div>
              <div className="catalog-body">
                <h3>{service.name}</h3>
                <Link
                  to={`/dashboard/catalog/${service.slug || service.id}`}
                  className={`catalog-btn ${subscribed ? 'catalog-btn-subscribed' : 'catalog-btn-primary'}`}
                >
                  {subscribed ? 'Já Assinado' : 'Assinar Agora'}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Catalog;
