import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, BadgeCheck, ScrollText, Search, X, Bell } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import './Catalog.css';

const CYCLE_LABELS = {
  monthly: 'mês',
  quarterly: 'trimestre',
  semiannual: 'semestre',
  annual: 'ano',
};

function Catalog() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { streamingServices, getAvailableServices, isSubscribedToService } = useAppDataContext();

  const [search, setSearch] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [interestModal, setInterestModal] = useState(false);
  const [interestMsg, setInterestMsg] = useState('');
  const [interestSent, setInterestSent] = useState(false);
  const [extraGroups, setExtraGroups] = useState([]);

  const availableServices = getAvailableServices();
  const selectedService = serviceId
    ? streamingServices.find(s => s.id === serviceId || s.slug === serviceId)
    : null;

  useEffect(() => {
    if (!selectedService || !serviceId) return;
    const serviceData = availableServices.find(s => s.id === serviceId || s.slug === serviceId);
    if (serviceData && serviceData.groups && serviceData.groups.length > 0) return;

    let cancelled = false;
    const fetchGroups = async () => {
      const { data } = await supabase
        .from('groups')
        .select(`
          *,
          service:service_id (*),
          members:group_members (*),
          credential:group_credentials (*),
          owner:owner_id (id, name, email)
        `)
        .eq('service_id', selectedService.id)
        .in('status', ['open', 'forming']);
      if (!cancelled && data) setExtraGroups(data);
    };
    fetchGroups();
    return () => { cancelled = true; };
  }, [selectedService, serviceId, availableServices]);

  const getActiveMembers = (group) =>
    group.members?.filter(m => m.status === 'active').length || 0;

  const getSpots = (group, service) => {
    if (group.has_slot_limit === false) return Infinity;
    const maxSize = service?.max_group_size || group.max_size;
    return Math.max(0, maxSize - getActiveMembers(group));
  };

  const isFull = (group, service) => {
    if (group.has_slot_limit === false) return false;
    return getSpots(group, service) === 0;
  };

  const formatCycleLabel = (group) => {
    const availableCycles = group.available_cycles || [group.billing_cycle || 'monthly'];
    if (availableCycles.length === 1) {
      return { label: `/${CYCLE_LABELS[availableCycles[0]] || 'mês'}`, multi: false };
    }
    return { label: availableCycles.map(c => CYCLE_LABELS[c] || c).join(' / '), multi: true };
  };

  const handleInterest = async () => {
    if (!selectedService || !user) return;
    try {
      const { error } = await supabase
        .from('group_interest')
        .upsert({
          service_id: selectedService.id,
          user_id: user.id,
          group_id: null,
          message: interestMsg || null,
        }, { onConflict: 'service_id, user_id', ignoreDuplicates: false });
      if (error && error.code !== '23505') {
        console.error(error);
      }
      setInterestSent(true);
      setTimeout(() => { setInterestModal(false); setInterestSent(false); setInterestMsg(''); }, 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const serviceData = selectedService
    ? availableServices.find(s => s.id === serviceId || s.slug === serviceId)
    : null;
  const allServiceGroups = useMemo(() => {
    const fromContext = serviceData?.groups || [];
    if (fromContext.length > 0) return fromContext;
    return extraGroups;
  }, [serviceData?.groups, extraGroups]);
  const alreadySubscribed = selectedService ? isSubscribedToService(serviceId) : false;

  const filteredGroups = useMemo(() => {
    let result = allServiceGroups;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g =>
        g.name?.toLowerCase().includes(q) ||
        g.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (verifiedOnly) {
      result = result.filter(g => g.verified);
    }
    return result;
  }, [allServiceGroups, search, verifiedOnly]);

  if (selectedService) {
    return (
      <div className="fade-in catalog-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ChevronLeft size={18} />
          Voltar
        </button>

        <div className="catalog-detail-header">
          <div className="page-header">
            <h1>{selectedService.fullName || selectedService.name}</h1>
            <p>Escolha um grupo para fazer parte do rateio.</p>
          </div>
          <button className="btn-interest-header" onClick={() => setInterestModal(true)}>
            <Bell size={16} />
            Lista de Espera
          </button>
        </div>

        {alreadySubscribed && (
          <div className="info-banner">
            <Check size={18} />
            Você já possui uma assinatura ativa do {selectedService.name}.
            <Link to={`/dashboard/credentials/${selectedService?.slug || serviceId}`}>Ver credenciais</Link>
          </div>
        )}

        <div className="catalog-filters">
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar grupo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <button
            className={`filter-btn ${verifiedOnly ? 'active' : ''}`}
            onClick={() => setVerifiedOnly(!verifiedOnly)}
          >
            <BadgeCheck size={16} />
            Verificados
          </button>
        </div>

        {filteredGroups.length === 0 && (
          <div className="empty-groups">
            <p>Nenhum grupo encontrado{search ? ' para sua busca' : ''}.</p>
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setInterestModal(true)}>
              <Bell size={16} /> Solicitar Novo Grupo
            </button>
          </div>
        )}

        <div className="groups-grid">
          {filteredGroups.map(group => {
            const activeMembers = getActiveMembers(group);
            const spots = getSpots(group, selectedService);
            const full = isFull(group, selectedService);
            const hasSlotLimit = group.has_slot_limit !== false;
            const maxSize = hasSlotLimit ? (selectedService.max_group_size || group.max_size) : null;
            const cycleInfo = formatCycleLabel(group);

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
                  <div className="group-card-tags">
                    {full ? (
                      <span className="tag tag-full">Cheio</span>
                    ) : hasSlotLimit ? (
                      <span className="tag tag-open">
                        {spots} {spots === 1 ? 'vaga' : 'vagas'}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="group-card-body">
                  {hasSlotLimit ? (
                    <div className="group-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${maxSize > 0 ? (activeMembers / maxSize) * 100 : 0}%`,
                            backgroundColor: full ? '#EF4444' : '#22C55E'
                          }}
                        />
                      </div>
                      <span className="progress-text">
                        {activeMembers} de {maxSize} membros
                      </span>
                    </div>
                  ) : (
                    <div className="group-progress">
                      <span className="progress-text">
                        {activeMembers} {activeMembers === 1 ? 'membro' : 'membros'}
                      </span>
                    </div>
                  )}

                  {group.tags && group.tags.length > 0 && (
                    <div className="group-tags">
                      {group.tags.map((tag, idx) => (
                        <span key={idx} className="group-tag-item">{tag}</span>
                      ))}
                    </div>
                  )}

                  {group.rules && (
                    <div className="group-rules">
                      <ScrollText size={16} />
                      <p>{group.rules}</p>
                    </div>
                  )}

                  <div className="group-price">
                    <span className="price-label">A partir de</span>
                    <span className="price-value">
                      R$ {Number(group.price_per_slot).toFixed(2).replace('.', ',')}
                      <small className={cycleInfo.multi ? 'price-cycle-multi' : ''}>{cycleInfo.label}</small>
                    </span>
                  </div>
                </div>

                <div className="group-card-footer">
                  {full || alreadySubscribed ? (
                    <button className="btn btn-disabled btn-full" disabled>
                      {full ? 'Grupo Cheio' : 'Já Assinado'}
                    </button>
                  ) : (
                    <Link
                      to={`/dashboard/checkout/${group.slug || group.name || group.id}`}
                      className="btn btn-primary btn-full btn-card-cta"
                    >
                      Entrar no Grupo
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {interestModal && (
          <div className="modal-overlay" onClick={() => setInterestModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>Lista de Espera</h3>
              <p>Receba uma notificação quando um novo grupo de <strong>{selectedService.name}</strong> for aberto.</p>
              {interestSent ? (
                <div className="interest-success">
                  <Check size={24} />
                  <p>Inscrição na lista de espera realizada!</p>
                </div>
              ) : (
                <>
                  <textarea
                    placeholder="Mensagem opcional (ex: prefiro grupo de 6 pessoas)"
                    value={interestMsg}
                    onChange={e => setInterestMsg(e.target.value)}
                    rows={3}
                  />
                  <div className="modal-actions">
                    <button className="btn btn-outline" onClick={() => setInterestModal(false)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleInterest}>
                      <Bell size={16} /> Quero Entrar na Lista
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
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
