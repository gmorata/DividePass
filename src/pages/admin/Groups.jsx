import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Loader2,
  ChevronLeft,
  Pencil,
  Trash2,
  Heart,
  Search,
  X,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Groups.css';

function Groups() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const initialLoadDone = useRef(false);

  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedService, setSelectedService] = useState(null);
  const [groupSearch, setGroupSearch] = useState('');

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
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este grupo?')) return;
    try {
      const { error: deleteError } = await supabase.from('groups').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setGroups(prev => prev.filter(g => g.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const getActiveMembers = (group) =>
    group.members?.filter(m => m.status === 'active').length || 0;

  const filteredServices = services.filter(s =>
    s.name?.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.full_name?.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const selectedServiceData = services.find(s => s.id === selectedService);

  const serviceGroups = selectedService
    ? groups.filter(g => g.service_id === selectedService)
    : [];

  const filteredGroups = serviceGroups.filter(g =>
    g.name?.toLowerCase().includes(groupSearch.toLowerCase()) ||
    g.reference_code?.toLowerCase().includes(groupSearch.toLowerCase()) ||
    g.owner?.name?.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const getSpots = (group, service) => {
    const maxSize = service?.max_group_size || group.max_size;
    return Math.max(0, maxSize - getActiveMembers(group));
  };

  if (loading) {
    return (
      <div className="fade-in groups-page">
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Carregando grupos...</p>
        </div>
      </div>
    );
  }

  if (selectedService) {
    return (
      <div className="fade-in groups-page">
        <div className="admin-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="back-btn-platform" onClick={() => { setSelectedService(null); setGroupSearch(''); }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="service-icon-sm" style={{ backgroundColor: selectedServiceData?.color }}>
                {selectedServiceData?.icon_url ? (
                  <img src={selectedServiceData.icon_url} alt="" />
                ) : (
                  selectedServiceData?.icon || selectedServiceData?.name?.[0]
                )}
              </div>
              <div>
                <h1>{selectedServiceData?.full_name || selectedServiceData?.name}</h1>
                <p className="page-subtitle">{serviceGroups.length} {serviceGroups.length === 1 ? 'grupo' : 'grupos'}</p>
              </div>
            </div>
          </div>
          <div className="groups-header-actions">
            <Link to="/admin/interest" className="btn btn-outline btn-sm">
              <Heart size={16} />
              Lista de Espera
            </Link>
            <Link to={`/admin/groups/new?service=${selectedService}`} className="btn btn-primary">
              <Plus size={18} />
              Novo Grupo
            </Link>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="groups-search-bar">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por nome, código ou criador..."
            value={groupSearch}
            onChange={e => setGroupSearch(e.target.value)}
          />
          {groupSearch && (
            <button className="search-clear" onClick={() => setGroupSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        {filteredGroups.length === 0 ? (
          <div className="empty-groups">
            {serviceGroups.length === 0 ? (
              <>
                <p>Nenhum grupo cadastrado para {selectedServiceData?.name}.</p>
                <button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin/groups/new?service=${selectedService}`)}>
                  Criar primeiro grupo
                </button>
              </>
            ) : (
              <p>Nenhum grupo encontrado para "{groupSearch}".</p>
            )}
          </div>
        ) : (
          <div className="groups-grid">
            {filteredGroups.map(group => {
              const activeMembers = getActiveMembers(group);
              const spots = getSpots(group, selectedServiceData);
              const full = spots === 0;
              const maxSize = selectedServiceData?.max_group_size || group.max_size;

              return (
                <div key={group.id} className={`group-card ${full ? 'group-full' : ''}`}>
                  <div className="group-card-header">
                    <div className="group-name-wrap">
                      <h4>
                        {group.name}
                        {group.verified && (
                          <span className="verified-badge-admin" title="Verificado">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#3B82F6">
                              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                            </svg>
                          </span>
                        )}
                      </h4>
                      <div className="group-meta-row">
                        <span className="group-reference">#{group.reference_code}</span>
                        <span className="group-creator">
                          {group.owner_id
                            ? `Criado por: ${group.owner?.name || 'Usuário'}`
                            : <strong className="creator-admin">DividePass</strong>
                          }
                        </span>
                      </div>
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
                          <span className="member-item member-more">+{activeMembers - 3} mais</span>
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
                    <Link to={`/admin/groups/${group.id}/edit`} className="group-btn edit">
                      <Pencil size={14} />
                      Editar
                    </Link>
                    <button className="group-btn delete" onClick={() => handleDelete(group.id)}>
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
    );
  }

  return (
    <div className="fade-in groups-page">
      <div className="admin-header">
        <div>
          <h1>Grupos e Rateios</h1>
          <p className="page-subtitle">{groups.length} grupos cadastrados em {services.length} plataformas</p>
        </div>
        <div className="groups-header-actions">
          <Link to="/admin/interest" className="btn btn-outline btn-sm">
            <Heart size={16} />
            Lista de Espera
          </Link>
          <Link to="/admin/groups/new" className="btn btn-primary">
            <Plus size={18} />
            Novo Grupo
          </Link>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="service-search-bar">
        <Search size={16} />
        <input
          type="text"
          placeholder="Buscar plataforma..."
          value={serviceSearch}
          onChange={e => setServiceSearch(e.target.value)}
        />
        {serviceSearch && (
          <button className="search-clear" onClick={() => setServiceSearch('')}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="platform-grid">
        {filteredServices.map(service => {
          const serviceGroupCount = groups.filter(g => g.service_id === service.id).length;
          const totalSpots = groups
            .filter(g => g.service_id === service.id)
            .reduce((sum, g) => sum + getSpots(g, service), 0);

          return (
            <button
              key={service.id}
              className="platform-card"
              onClick={() => setSelectedService(service.id)}
            >
              <div className="platform-card-icon" style={{ backgroundColor: service.color }}>
                {service.icon_url ? (
                  <img src={service.icon_url} alt="" />
                ) : (
                  service.icon || service.name?.[0]
                )}
              </div>
              <div className="platform-card-info">
                <h3>{service.full_name || service.name}</h3>
                <span>{serviceGroupCount} {serviceGroupCount === 1 ? 'grupo' : 'grupos'} • {totalSpots} vagas</span>
              </div>
            </button>
          );
        })}
      </div>

      {filteredServices.length === 0 && (
        <div className="empty-groups">
          <p>Nenhuma plataforma encontrada para "{serviceSearch}".</p>
        </div>
      )}
    </div>
  );
}

export default Groups;
