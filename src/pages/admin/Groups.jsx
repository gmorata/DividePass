import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Heart
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Groups.css';

function Groups() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedService, setExpandedService] = useState(null);
  const initialLoadDone = useRef(false);

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este grupo?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('groups')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const getActiveMembers = (group) =>
    group.members?.filter(m => m.status === 'active').length || 0;

  const getSpots = (group, service) => {
    const maxSize = service?.max_group_size || group.max_size;
    return Math.max(0, maxSize - getActiveMembers(group));
  };

  const isFull = (group, service) => getSpots(group, service) === 0;

  const groupsByService = services.map(service => ({
    service,
    serviceGroups: groups.filter(g => g.service_id === service.id)
  }));

  const fetchData = async () => {
    try {
      setLoading(true);
      const [servicesRes, groupsRes] = await Promise.all([
        supabase.from('streaming_services').select('*').order('name'),
        supabase.from('groups').select(`
          *,
          service:service_id (*),
          owner:owner_id (id, name),
          members:group_members (*, user:user_id (id, name, email))
        `).order('name')
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (groupsRes.error) throw groupsRes.error;

      setServices(servicesRes.data || []);
      setGroups(groupsRes.data || []);
      setError('');

      if (servicesRes.data?.length > 0 && !expandedService) {
        setExpandedService(servicesRes.data[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialLoadDone.current) return;

    let cancelled = false;

    const loadData = async () => {
      try {
        if (!cancelled) setLoading(true);
        const [servicesRes, groupsRes] = await Promise.all([
          supabase.from('streaming_services').select('*').order('name'),
          supabase.from('groups').select(`
            *,
            service:service_id (*),
            owner:owner_id (id, name),
            members:group_members (*, user:user_id (id, name, email))
          `).order('name')
        ]);

        if (servicesRes.error) throw servicesRes.error;
        if (groupsRes.error) throw groupsRes.error;

        if (!cancelled) {
          setServices(servicesRes.data || []);
          setGroups(groupsRes.data || []);
          setError('');

          if (servicesRes.data?.length > 0) {
            setExpandedService(servicesRes.data[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fade-in groups-page">
      <div className="admin-header">
        <div>
          <h1>Grupos e Rateios</h1>
          <p className="page-subtitle">{groups.length} grupos cadastrados em {services.length} plataformas</p>
        </div>
        <Link to="/admin/interest" className="btn btn-outline btn-sm">
          <Heart size={16} />
          Lista de Espera
        </Link>
        <Link to="/admin/groups/new" className="btn btn-primary">
          <Plus size={18} />
          Novo Grupo
        </Link>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Carregando grupos...</p>
        </div>
      ) : (
        <div className="groups-accordion">
          {groupsByService.map(({ service, serviceGroups }) => {
            const isExpanded = expandedService === service.id;
            const totalSpots = serviceGroups.reduce(
              (sum, g) => sum + getSpots(g, service),
              0
            );

            return (
              <div key={service.id} className={`service-section ${isExpanded ? 'expanded' : ''}`}>
                <button
                  className="service-header"
                  onClick={() => setExpandedService(isExpanded ? null : service.id)}
                >
                  <div className="service-info">
                    <div
                      className="service-icon"
                      style={{ backgroundColor: service.color }}
                    >
                      {service.icon || service.name[0]}
                    </div>
                    <div>
                      <h3>{service.full_name}</h3>
                      <span className="service-meta">
                        {serviceGroups.length} {serviceGroups.length === 1 ? 'grupo' : 'grupos'} • {totalSpots} vagas disponíveis
                      </span>
                    </div>
                  </div>
                  <div className="service-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/groups/new?service=${service.id}`);
                      }}
                    >
                      <Plus size={14} />
                      Grupo
                    </button>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="service-groups">
                    {serviceGroups.length === 0 ? (
                      <div className="empty-groups">
                        <p>Nenhum grupo cadastrado para {service.name}.</p>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(`/admin/groups/new?service=${service.id}`)}
                        >
                          Criar primeiro grupo
                        </button>
                      </div>
                    ) : (
                      <div className="groups-grid">
                        {serviceGroups.map(group => {
                          const activeMembers = getActiveMembers(group);
                          const spots = getSpots(group, service);
                          const full = isFull(group, service);
                          const maxSize = service.max_group_size || group.max_size;

                          return (
                            <div key={group.id} className={`group-card ${full ? 'group-full' : ''}`}>
                              <div className="group-card-header">
                                <div className="group-name-wrap">
                                  <h4>
                                    {group.name}
                                    {group.verified && (
                                      <span className="verified-badge-admin" title="Verificado pela DividePass">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#3B82F6">
                                          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                                        </svg>
                                      </span>
                                    )}
                                  </h4>
                                  <span className="group-creator">
                                    {group.owner_id
                                      ? `Criado por: ${group.owner?.name || 'Usuário'}`
                                      : <strong className="creator-admin">Criado por: DividePass</strong>
                                    }
                                  </span>
                                </div>
                                <span className={`group-tag ${full ? 'full' : 'open'}`}>
                                  {full ? 'Cheio' : `${spots} ${spots === 1 ? 'vaga' : 'vagas'}`}
                                </span>
                              </div>

                              <div className="group-body-row">
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

                                <div className="group-members-list">
                                  <div className="member-list">
                                    {group.members?.filter(m => m.status === 'active').slice(0, 3).map(member => (
                                      <Link
                                        key={member.id}
                                        to={`/admin/users/${member.user_id}`}
                                        className="member-item"
                                      >
                                        <span className="member-avatar-sm">
                                          {member.user?.name?.[0]?.toUpperCase() || '?'}
                                        </span>
                                        <div className="member-item-info">
                                          <strong>{member.user?.name || 'Usuário'}</strong>
                                        </div>
                                      </Link>
                                    ))}
                                    {activeMembers > 3 && (
                                      <Link to={`/admin/groups`} className="member-item member-more">
                                        +{activeMembers - 3} mais
                                      </Link>
                                    )}
                                    {activeMembers === 0 && (
                                      <span className="member-empty">Nenhum membro</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="group-price">
                                <span className="price-label">Preço por vaga</span>
                                <span className="price-value">
                                  R$ {Number(group.price_per_slot).toFixed(2).replace('.', ',')}
                                  <small>/mês</small>
                                </span>
                              </div>

                              {full && (
                                <div className="group-warning">
                                  <AlertCircle size={14} />
                                  Grupo fechado. Não é possível adicionar novos membros.
                                </div>
                              )}

                              <div className="group-card-actions">
                                <Link
                                  to={`/admin/groups/${group.id}/edit`}
                                  className="group-btn edit"
                                >
                                  <Pencil size={14} />
                                  Editar
                                </Link>
                                <button
                                  className="group-btn delete"
                                  onClick={() => handleDelete(group.id)}
                                >
                                  <Trash2 size={14} />
                                  Excluir
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}


    </div>
  );
}

export default Groups;
