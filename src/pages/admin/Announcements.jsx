import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './Announcements.css';

function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'info',
    target: 'all',
    targetEmail: '',
  });
  const [error, setError] = useState(null);

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('announcements')
      .select('*, target_user:target_user_id(id, name, email)')
      .order('created_at', { ascending: false });

    if (!fetchErr) setAnnouncements(data || []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error: fetchErr } = await supabase
        .from('announcements')
        .select('*, target_user:target_user_id(id, name, email)')
        .order('created_at', { ascending: false });

      if (!cancelled) {
        if (!fetchErr) setAnnouncements(data || []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => {
    setForm({ title: '', message: '', type: 'info', target: 'all', targetEmail: '' });
    setError(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setError('Título e mensagem são obrigatórios.');
      return;
    }

    setSaving(true);
    setError(null);

    let targetUserId = null;
    if (form.target === 'specific' && form.targetEmail.trim()) {
      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id')
        .eq('email', form.targetEmail.trim())
        .single();

      if (userErr || !user) {
        setError('Usuário não encontrado com esse e-mail.');
        setSaving(false);
        return;
      }
      targetUserId = user.id;
    }

    const { error: insertErr } = await supabase.from('announcements').insert({
      title: form.title.trim(),
      message: form.message.trim(),
      type: form.type,
      is_active: true,
      status: 'published',
      target_user_id: targetUserId,
    });

    if (insertErr) {
      setError('Erro ao criar aviso: ' + insertErr.message);
      setSaving(false);
      return;
    }

    resetForm();
    fetchAnnouncements();
    setSaving(false);
  };

  const toggleActive = async (id, currentStatus) => {
    await supabase
      .from('announcements')
      .update({ is_active: !currentStatus })
      .eq('id', id);
    fetchAnnouncements();
  };

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Excluir este aviso permanentemente?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    fetchAnnouncements();
  };

  const typeLabel = (type) => {
    const map = {
      info: 'Informativo',
      warning: 'Aviso',
      success: 'Sucesso',
      urgent: 'Urgente',
    };
    return map[type] || type;
  };

  return (
    <div className="fade-in">
      <div className="admin-header">
        <h1>Avisos</h1>
        <p>Crie avisos para todos os usuários ou para um usuário específico.</p>
      </div>

      <div className="admin-card announcement-form-card">
        <h2>Criar Novo Aviso</h2>
        <form onSubmit={handleCreate} className="announcement-form">
          <div className="form-row">
            <input
              type="text"
              placeholder="Título do Aviso"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="info">Informativo</option>
              <option value="warning">Aviso</option>
              <option value="success">Sucesso</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>

          <textarea
            placeholder="Mensagem do aviso..."
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            required
          />

          <div className="form-row target-row">
            <div className="target-toggle">
              <button
                type="button"
                className={`target-btn ${form.target === 'all' ? 'active' : ''}`}
                onClick={() => setForm({ ...form, target: 'all' })}
              >
                Todos os Usuários
              </button>
              <button
                type="button"
                className={`target-btn ${form.target === 'specific' ? 'active' : ''}`}
                onClick={() => setForm({ ...form, target: 'specific' })}
              >
                Usuário Específico
              </button>
            </div>

            {form.target === 'specific' && (
              <input
                type="email"
                placeholder="E-mail do usuário"
                value={form.targetEmail}
                onChange={(e) => setForm({ ...form, targetEmail: e.target.value })}
                className="email-input"
                required
              />
            )}
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Publicando...' : 'Publicar Aviso'}
          </button>
        </form>
      </div>

      <div className="admin-card table-responsive">
        <h2>Avisos Publicados</h2>
        {loading ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Carregando...
          </p>
        ) : announcements.length === 0 ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Nenhum aviso publicado ainda.
          </p>
        ) : (
          <table className="invoice-table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Título</th>
                <th>Tipo</th>
                <th>Alvo</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>{a.title}</td>
                  <td>
                    <span className={`status-badge ${a.type}`}>{typeLabel(a.type)}</span>
                  </td>
                  <td>
                    {a.target_user
                      ? `${a.target_user.name} (${a.target_user.email})`
                      : 'Todos'}
                  </td>
                  <td>
                    <span className={`status-badge ${a.is_active ? 'pago' : 'cancelado'}`}>
                      {a.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="btn btn-outline toggle-btn"
                      onClick={() => toggleActive(a.id, a.is_active)}
                    >
                      {a.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      className="btn btn-outline delete-btn"
                      onClick={() => deleteAnnouncement(a.id)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Announcements;
