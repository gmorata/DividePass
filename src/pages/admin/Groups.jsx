import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  AlertCircle,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Groups.css';

function Groups() {
  const [services, setServices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedService, setExpandedService] = useState(null);
  const initialLoadDone = useRef(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const [formData, setFormData] = useState({
    service_id: '',
    name: '',
    price_per_slot: '',
    billing_cycle: 'monthly',
    cycle_discount: 0,
    max_size: 4,
    rules: '',
    tags: '',
    verified: false,
    status: 'open'
  });

  const resetForm = () => {
    setFormData({
      service_id: services[0]?.id || '',
      name: '',
      price_per_slot: '',
      billing_cycle: 'monthly',
      cycle_discount: 0,
      max_size: 4,
      rules: '',
      tags: '',
      verified: false,
      status: 'open'
    });
    setEditingGroup(null);
  };

  const handleOpenForm = (group = null, serviceId = null) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        service_id: group.service_id,
        name: group.name,
        price_per_slot: group.price_per_slot,
        billing_cycle: group.billing_cycle || 'monthly',
        cycle_discount: group.cycle_discount || 0,
        max_size: group.max_size,
        rules: group.rules || '',
        tags: Array.isArray(group.tags) ? group.tags.join(', ') : '',
        verified: group.verified || false,
        status: group.status
      });
    } else {
      resetForm();
      if (serviceId) {
        setFormData(prev => ({ ...prev, service_id: serviceId }));
      }
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        ...formData,
        price_per_slot: parseFloat(formData.price_per_slot),
        cycle_discount: parseFloat(formData.cycle_discount || 0),
        max_size: parseInt(formData.max_size, 10),
        verified: !!formData.verified,
        tags: formData.tags
          ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
          : []
      };

      if (editingGroup) {
        const { error: updateError } = await supabase
          .from('groups')
          .update(payload)
          .eq('id', editingGroup.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('groups')
          .insert(payload);

        if (insertError) throw insertError;
      }

      await fetchData();
      handleCloseForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

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
        <button className="btn btn-primary" onClick={() => handleOpenForm()}>
          <Plus size={18} />
          Novo Grupo
        </button>
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
                        handleOpenForm(null, service.id);
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
                          onClick={() => handleOpenForm(null, service.id)}
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
                                <h4>{group.name}</h4>
                                <span className={`group-tag ${full ? 'full' : 'open'}`}>
                                  {full ? 'Cheio' : `${spots} ${spots === 1 ? 'vaga' : 'vagas'}`}
                                </span>
                              </div>

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
                                <label>Membros ({activeMembers})</label>
                                <div className="member-list">
                                  {group.members?.filter(m => m.status === 'active').map(member => (
                                    <Link
                                      key={member.id}
                                      to={`/admin/users/${member.user_id}`}
                                      className="member-item"
                                    >
                                      <span className="member-avatar-sm">
                                        {member.user?.name?.[0]?.toUpperCase() || member.profile_name?.[0]?.toUpperCase() || '?'}
                                      </span>
                                      <div className="member-item-info">
                                        <strong>{member.user?.name || member.profile_name || 'Usuário'}</strong>
                                        <span>{member.profile_name ? `Perfil: ${member.profile_name}` : ''}</span>
                                      </div>
                                      <span className="member-item-status">{member.status}</span>
                                    </Link>
                                  ))}
                                  {activeMembers === 0 && (
                                    <span className="member-empty">Nenhum membro ativo</span>
                                  )}
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
                                <button
                                  className="group-btn edit"
                                  onClick={() => handleOpenForm(group)}
                                >
                                  <Pencil size={14} />
                                  Editar
                                </button>
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

      {isFormOpen && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingGroup ? 'Editar Grupo' : 'Novo Grupo'}</h2>
              <button className="modal-close" onClick={handleCloseForm}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="group-form">
              <div className="form-group">
                <label>Plataforma *</label>
                <select
                  value={formData.service_id}
                  onChange={e => setFormData({ ...formData, service_id: e.target.value })}
                  required
                >
                  <option value="">Selecione uma plataforma</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Nome do grupo *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Netflix - Grupo A"
                  required
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Preço por vaga (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price_per_slot}
                    onChange={e => setFormData({ ...formData, price_per_slot: e.target.value })}
                    placeholder="12.90"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Vagas do grupo *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_size}
                    onChange={e => setFormData({ ...formData, max_size: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Ciclo de faturamento</label>
                  <select
                    value={formData.billing_cycle}
                    onChange={e => setFormData({ ...formData, billing_cycle: e.target.value })}
                  >
                    <option value="monthly">Mensal</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="semiannual">Semestral</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Desconto do ciclo (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.cycle_discount}
                    onChange={e => setFormData({ ...formData, cycle_discount: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Regras do grupo</label>
                <textarea
                  rows={4}
                  value={formData.rules}
                  onChange={e => setFormData({ ...formData, rules: e.target.value })}
                  placeholder="Ex: Não compartilhar a senha; usar apenas 1 tela; pagar até o vencimento..."
                />
              </div>

              <div className="form-group">
                <label>Tags (separadas por vírgula)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={e => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="Ex: sem filme infantil, 4k, ultrahd"
                />
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.verified}
                    onChange={e => setFormData({ ...formData, verified: e.target.checked })}
                  />
                  Grupo verificado (DividePass)
                </label>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="open">Aberto</option>
                  <option value="closed">Fechado</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={handleCloseForm}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : (
                    <><Check size={18} /> Salvar</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Groups;
