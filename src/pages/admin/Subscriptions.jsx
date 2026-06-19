import { useState, useEffect } from 'react';
import { Search, Filter, Edit2, XCircle, Loader2, Calendar, DollarSign, RefreshCw, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Subscriptions.css';

const STATUS_OPTIONS = ['active', 'inactive', 'cancelled', 'expired', 'pending'];
const CYCLE_OPTIONS = ['monthly', 'quarterly', 'semiannual', 'annual'];

function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSubscriptions = async () => {
      if (!cancelled) {
        setLoading(true);
        setError('');
      }
      try {
        const { data, error: supabaseError } = await supabase
          .from('user_subscriptions')
          .select(`
            *,
            user:user_id (id, name, email),
            group:group_id (id, name),
            service:service_id (id, name, full_name)
          `)
          .order('created_at', { ascending: false });

        if (supabaseError) throw supabaseError;
        if (!cancelled) setSubscriptions(data || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSubscriptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = subscriptions.filter(sub => {
    const matchesSearch =
      sub.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
      sub.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
      sub.service?.name?.toLowerCase().includes(search.toLowerCase()) ||
      sub.group?.name?.toLowerCase().includes(search.toLowerCase()) ||
      sub.external_reference?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleCancel = async (sub) => {
    if (!window.confirm(`Cancelar assinatura de ${sub.user?.name} no grupo ${sub.group?.name}?`)) return;

    try {
      const now = new Date().toISOString();

      const { error: subError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', sub.id);

      if (subError) throw subError;

      const { error: memberError } = await supabase
        .from('group_members')
        .update({ status: 'inactive', left_at: now })
        .eq('group_id', sub.group_id)
        .eq('user_id', sub.user_id);

      if (memberError) throw memberError;

      window.location.reload();
    } catch (err) {
      alert('Erro ao cancelar assinatura: ' + err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { error: subError } = await supabase
        .from('user_subscriptions')
        .update({
          amount: Number(editing.amount),
          billing_cycle: editing.billing_cycle,
          status: editing.status,
          started_at: editing.started_at,
          expires_at: editing.expires_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id);

      if (subError) throw subError;

      setEditing(null);
      window.location.reload();
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = (status) => ({
    active: 'Ativa',
    inactive: 'Inativa',
    cancelled: 'Cancelada',
    expired: 'Expirada',
    pending: 'Pendente',
  }[status] || status);

  const cycleLabel = (cycle) => ({
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    annual: 'Anual',
  }[cycle] || cycle);

  return (
    <div className="fade-in subscriptions-page">
      <div className="admin-header">
        <div>
          <h1>Assinaturas dos Usuários</h1>
          <p className="page-subtitle">{subscriptions.length} assinaturas cadastradas</p>
        </div>
      </div>

      <div className="subscriptions-stats">
        <div className="stat-card">
          <Shield size={22} />
          <div>
            <span>{subscriptions.filter(s => s.status === 'active').length}</span>
            <small>Ativas</small>
          </div>
        </div>
        <div className="stat-card">
          <DollarSign size={22} />
          <div>
            <span>R$ {subscriptions
              .filter(s => s.status === 'active')
              .reduce((sum, s) => sum + Number(s.amount || 0), 0)
              .toFixed(2)}
            </span>
            <small>Receita mensal ativa</small>
          </div>
        </div>
        <div className="stat-card">
          <XCircle size={22} />
          <div>
            <span>{subscriptions.filter(s => s.status === 'cancelled' || s.status === 'expired').length}</span>
            <small>Canceladas/Expiradas</small>
          </div>
        </div>
        <div className="stat-card">
          <Calendar size={22} />
          <div>
            <span>{subscriptions.filter(s => s.status === 'pending').length}</span>
            <small>Pendentes</small>
          </div>
        </div>
      </div>

      <div className="subscriptions-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por usuário, serviço, grupo ou referência..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-box">
          <Filter size={16} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos os status</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>

        <button className="btn btn-outline" onClick={() => window.location.reload()}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {error && <div className="error-banner">Erro: {error}</div>}

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Carregando assinaturas...</p>
        </div>
      ) : (
        <div className="admin-card table-responsive">
          <table className="subscriptions-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Serviço / Grupo</th>
                <th>Valor</th>
                <th>Ciclo</th>
                <th>Status</th>
                <th>Início / Vencimento</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sub => (
                <tr key={sub.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{sub.user?.name?.[0]?.toUpperCase() || '?'}</div>
                      <div>
                        <strong>{sub.user?.name || '—'}</strong>
                        <span>{sub.user?.email || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="service-cell">
                      <strong>{sub.service?.name || '—'}</strong>
                      <span>{sub.group?.name || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <strong>R$ {Number(sub.amount || 0).toFixed(2)}</strong>
                  </td>
                  <td>{cycleLabel(sub.billing_cycle)}</td>
                  <td>
                    <span className={`status-badge ${sub.status}`}>
                      {statusLabel(sub.status)}
                    </span>
                  </td>
                  <td>
                    <div className="date-cell">
                      <span>{sub.started_at ? new Date(sub.started_at).toLocaleDateString('pt-BR') : '—'}</span>
                      <span>até {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('pt-BR') : '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button className="action-btn" onClick={() => setEditing(sub)} title="Editar">
                        <Edit2 size={16} />
                      </button>
                      {sub.status === 'active' && (
                        <button className="action-btn danger" onClick={() => handleCancel(sub)} title="Cancelar">
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && (
            <div className="empty-table">
              <p>Nenhuma assinatura encontrada.</p>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Editar Assinatura</h3>
              <button className="modal-close" onClick={() => setEditing(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="modal-form">
              <div className="form-row">
                <label>Usuário</label>
                <input type="text" value={editing.user?.name || ''} disabled />
              </div>
              <div className="form-row">
                <label>Grupo</label>
                <input type="text" value={editing.group?.name || ''} disabled />
              </div>
              <div className="form-row">
                <label>Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Ciclo de faturamento</label>
                <select
                  value={editing.billing_cycle}
                  onChange={(e) => setEditing({ ...editing, billing_cycle: e.target.value })}
                >
                  {CYCLE_OPTIONS.map(c => (
                    <option key={c} value={c}>{cycleLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </div>
              <div className="form-row-2">
                <div className="form-row">
                  <label>Início</label>
                  <input
                    type="date"
                    value={editing.started_at || ''}
                    onChange={(e) => setEditing({ ...editing, started_at: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <label>Vencimento</label>
                  <input
                    type="date"
                    value={editing.expires_at || ''}
                    onChange={(e) => setEditing({ ...editing, expires_at: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={16} className="spin" /> : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Subscriptions;
