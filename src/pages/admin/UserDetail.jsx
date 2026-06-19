import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Save, Lock, Mail, Phone, User, Shield,
  CreditCard, FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './UserDetail.css';

const ROLE_OPTIONS = [
  { value: 'user', label: 'Usuário' },
  { value: 'admin', label: 'Administrador' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'pending', label: 'Pendente' },
  { value: 'suspended', label: 'Suspenso' },
];

function UserDetail() {
  const { userId } = useParams();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('details');
  const [form, setForm] = useState({});
  const [newPassword, setNewPassword] = useState('');

  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const fetchUser = async () => {
      if (!cancelled) {
        setLoading(true);
        setError('');
      }
      try {
        const { data, error: supabaseError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (supabaseError) throw supabaseError;

        if (!cancelled) {
          setUser(data);
          setForm(data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const fetchHistory = async () => {
      try {
        const [subsRes, invoicesRes, paymentsRes] = await Promise.all([
          supabase.from('user_subscriptions')
            .select('*, service:service_id(name, full_name), group:group_id(name)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
          supabase.from('invoices')
            .select('*')
            .eq('user_id', userId)
            .order('due_date', { ascending: false }),
          supabase.from('payments')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
        ]);

        if (subsRes.error) throw subsRes.error;
        if (invoicesRes.error) throw invoicesRes.error;
        if (paymentsRes.error) throw paymentsRes.error;

        if (!cancelled) {
          setSubscriptions(subsRes.data || []);
          setInvoices(invoicesRes.data || []);
          setPayments(paymentsRes.data || []);
        }
      } catch (err) {
        console.error('Erro ao carregar histórico:', err);
      }
    };

    fetchUser();
    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error('Sessão expirada');
      }

      const payload = {
        user_id: userId,
        name: form.name,
        email: form.email,
        phone: form.phone,
        cpf: form.cpf,
        role: form.role,
        status: form.status,
      };

      if (newPassword.trim()) {
        payload.password = newPassword.trim();
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao atualizar usuário');
      }

      setNewPassword('');
      alert('Usuário atualizado com sucesso.');
      window.location.reload();
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status) => {
    const labels = {
      active: 'Ativa', inactive: 'Inativa', cancelled: 'Cancelada',
      expired: 'Expirada', pending: 'Pendente',
      paid: 'Pago', failed: 'Falhou', refunded: 'Reembolsado',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={32} className="spin" />
        <p>Carregando usuário...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="fade-in">
        <Link to="/admin/users" className="back-btn">
          <ArrowLeft size={18} />
          Voltar
        </Link>
        <div className="error-banner">Erro ao carregar usuário: {error}</div>
      </div>
    );
  }

  return (
    <div className="fade-in user-detail-page">
      <div className="user-detail-header">
        <Link to="/admin/users" className="back-btn">
          <ArrowLeft size={18} />
          Voltar
        </Link>
        <div className="admin-header">
          <div>
            <h1>{user.name}</h1>
            <p className="page-subtitle">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="user-tabs">
        {[
          { id: 'details', label: 'Detalhes e Edição', icon: User },
          { id: 'subscriptions', label: 'Assinaturas', icon: Shield },
          { id: 'invoices', label: 'Faturas', icon: FileText },
          { id: 'payments', label: 'Pagamentos', icon: CreditCard },
        ].map(tab => (
          <button
            key={tab.id}
            className={`user-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <form onSubmit={handleSave} className="admin-card user-form">
          <div className="form-grid">
            <div className="form-row">
              <label><User size={14} /> Nome</label>
              <input type="text" name="name" value={form.name || ''} onChange={handleChange} required />
            </div>
            <div className="form-row">
              <label><Mail size={14} /> E-mail</label>
              <input type="email" name="email" value={form.email || ''} onChange={handleChange} required />
            </div>
            <div className="form-row">
              <label><Phone size={14} /> Celular</label>
              <input type="text" name="phone" value={form.phone || ''} onChange={handleChange} />
            </div>
            <div className="form-row">
              <label>CPF</label>
              <input type="text" name="cpf" value={form.cpf || ''} onChange={handleChange} />
            </div>
            <div className="form-row">
              <label><Shield size={14} /> Permissão</label>
              <select name="role" value={form.role || 'user'} onChange={handleChange}>
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Status</label>
              <select name="status" value={form.status || 'pending'} onChange={handleChange}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label><Lock size={14} /> Nova senha</label>
              <input
                type="text"
                placeholder="Deixe em branco para não alterar"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>ID do usuário</label>
              <input type="text" value={user.id} disabled />
            </div>
          </div>

          <div className="form-row">
            <label>Cadastrado em</label>
            <input type="text" value={new Date(user.created_at).toLocaleString('pt-BR')} disabled />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Salvar Alterações
            </button>
          </div>
        </form>
      )}

      {activeTab === 'subscriptions' && (
        <div className="admin-card">
          {subscriptions.length === 0 ? (
            <div className="empty-table"><p>Nenhuma assinatura encontrada.</p></div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Grupo</th>
                  <th>Valor</th>
                  <th>Ciclo</th>
                  <th>Status</th>
                  <th>Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(sub => (
                  <tr key={sub.id}>
                    <td>{sub.service?.name || '—'}</td>
                    <td>{sub.group?.name || '—'}</td>
                    <td>R$ {Number(sub.amount || 0).toFixed(2)}</td>
                    <td>{sub.billing_cycle}</td>
                    <td><span className={`status-badge ${sub.status}`}>{statusBadge(sub.status)}</span></td>
                    <td>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="admin-card">
          {invoices.length === 0 ? (
            <div className="empty-table"><p>Nenhuma fatura encontrada.</p></div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pago em</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>{new Date(inv.due_date).toLocaleDateString('pt-BR')}</td>
                    <td>R$ {Number(inv.amount || 0).toFixed(2)}</td>
                    <td><span className={`status-badge ${inv.status}`}>{statusBadge(inv.status)}</span></td>
                    <td>{inv.paid_at ? new Date(inv.paid_at).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="admin-card">
          {payments.length === 0 ? (
            <div className="empty-table"><p>Nenhum pagamento encontrado.</p></div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Método</th>
                  <th>Status</th>
                  <th>Transação</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(pay => (
                  <tr key={pay.id}>
                    <td>{new Date(pay.created_at).toLocaleString('pt-BR')}</td>
                    <td>R$ {Number(pay.amount || 0).toFixed(2)}</td>
                    <td>{pay.method}</td>
                    <td><span className={`status-badge ${pay.status}`}>{statusBadge(pay.status)}</span></td>
                    <td>{pay.transaction_code || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default UserDetail;
