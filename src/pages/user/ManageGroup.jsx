import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Save, Trash2, Users, DollarSign, Settings, Key,
  CheckCircle, X, AlertTriangle, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import './ManageGroup.css';

function ManageGroup() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [service, setService] = useState(null);
  const [members, setMembers] = useState([]);
  const [credentials, setCredentials] = useState(null);
  const [stats, setStats] = useState({ totalRevenue: 0, activeMembers: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const fetchGroup = async () => {
      if (!groupId || !user) return;
      try {
        setLoading(true);

        const { data: groupData, error: groupError } = await supabase
          .from('groups')
          .select('*')
          .eq('id', groupId)
          .eq('owner_id', user.id)
          .single();

        if (groupError || !groupData) {
          setError('Grupo não encontrado ou você não é o proprietário.');
          setLoading(false);
          return;
        }

        setGroup(groupData);

        const [serviceRes, membersRes, credsRes, revenueRes] = await Promise.all([
          supabase.from('streaming_services').select('id, name, full_name, icon, icon_url, color, slug').eq('id', groupData.service_id).single(),
          supabase.from('group_members').select('user_id, created_at, status, user:user_id (id, name, email)').eq('group_id', groupId).order('created_at'),
          supabase.from('group_credentials').select('*').eq('group_id', groupId).maybeSingle(),
          supabase.from('wallet_transactions').select('amount, type').eq('group_id', groupId).eq('type', 'credit'),
        ]);

        if (serviceRes.data) setService(serviceRes.data);

        const activeMembers = (membersRes.data || []).filter(m => m.status === 'active');
        setMembers(activeMembers);
        setStats({
          activeMembers: activeMembers.length,
          totalRevenue: (revenueRes.data || []).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0),
        });

        if (credsRes.data) {
          setCredentials(credsRes.data);
          setLoginEmail(credsRes.data.login_email || '');
          setLoginPassword(credsRes.data.login_password || '');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [groupId, user]);

  const handleSaveCredentials = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        group_id: groupId,
        login_email: loginEmail,
        login_password: loginPassword,
      };

      if (credentials) {
        const { error } = await supabase.from('group_credentials').update(payload).eq('group_id', groupId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('group_credentials').insert({ ...payload, has_profiles: false });
        if (error) throw error;
      }

      setCredentials(payload);
      setToast('Credenciais salvas com sucesso!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm('Tem certeza que deseja deletar este grupo? Esta ação é irreversível.')) return;
    if (!window.confirm('Última chance: todos os membros perderão acesso. Confirmar exclusão?')) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from('groups').delete().eq('id', groupId);
      if (error) throw error;
      navigate('/dashboard/my-groups');
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={32} className="spin" />
        <p>Carregando grupo...</p>
      </div>
    );
  }

  if (error && !group) {
    return (
      <div className="fade-in manage-group-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ArrowLeft size={18} />
          Voltar
        </button>
        <div className="empty-state">
          <AlertTriangle size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in manage-group-page">
      {toast && (
        <div className="toast-success">
          <CheckCircle size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      <button onClick={() => navigate(-1)} className="back-btn">
        <ArrowLeft size={18} />
        Voltar
      </button>

      <div className="page-header">
        <h1>Gerenciar Grupo</h1>
        <p>{group?.name}</p>
      </div>

      <div className="manage-group-layout">
        <div className="manage-group-main">
          {/* Group Info Card */}
          <div className="manage-card" style={{ '--service-color': service?.color || '#4F46E5' }}>
            <div className="manage-card-header" style={{ backgroundColor: `${service?.color}15` }}>
              <div className="manage-service-info">
                <div className="manage-service-icon" style={{ backgroundColor: service?.color }}>
                  {service?.icon_url ? (
                    <img src={service.icon_url} alt={service.name} className="manage-service-icon-img" />
                  ) : (
                    service?.icon
                  )}
                </div>
                <div>
                  <h2 style={{ color: service?.color }}>{service?.full_name}</h2>
                  <span className="manage-group-label">{group?.name}</span>
                </div>
              </div>
              <span className={`manage-status ${group?.status}`}>
                {group?.status === 'open' ? 'Aberto' : group?.status === 'closed' ? 'Fechado' : 'Formando'}
              </span>
            </div>

            <div className="manage-stats-grid">
              <div className="manage-stat">
                <DollarSign size={20} />
                <div>
                  <span>Receita total</span>
                  <strong>R$ {stats.totalRevenue.toFixed(2)}</strong>
                </div>
              </div>
              <div className="manage-stat">
                <Users size={20} />
                <div>
                  <span>Membros ativos</span>
                  <strong>{stats.activeMembers}</strong>
                </div>
              </div>
              <div className="manage-stat">
                <Settings size={20} />
                <div>
                  <span>Preço por vaga</span>
                  <strong>R$ {parseFloat(group?.price_per_slot || 0).toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="manage-card">
            <div className="manage-card-title">
              <Users size={18} />
              <h3>Membros ({members.length})</h3>
            </div>

            {members.length === 0 ? (
              <p className="manage-empty-text">Nenhum membro no grupo ainda.</p>
            ) : (
              <div className="manage-members-list">
                {members.map((member, idx) => (
                  <div key={member.user_id} className="manage-member-row">
                    <div className="manage-member-number">#{idx + 1}</div>
                    <div className="manage-member-info">
                      <strong>{member.user?.name || 'Sem nome'}</strong>
                      <span>{member.user?.email || member.user_id}</span>
                    </div>
                    <CheckCircle size={16} className="manage-member-check" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="manage-group-sidebar">
          {/* Credentials */}
          <div className="manage-card">
            <div className="manage-card-title">
              <Key size={18} />
              <h3>Credenciais</h3>
            </div>

            <div className="manage-form-group">
              <label>E-mail</label>
              <input
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="conta@plataforma.com"
              />
            </div>

            <div className="manage-form-group">
              <label>Senha</label>
              <div className="manage-password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="manage-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={handleSaveCredentials}
              disabled={saving}
            >
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Salvar Credenciais
            </button>
          </div>

          {/* Danger Zone */}
          <div className="manage-card manage-danger-zone">
            <div className="manage-card-title">
              <AlertTriangle size={18} />
              <h3>Zona de Perigo</h3>
            </div>
            <p>Deletar o grupo remove todos os membros e cancela assinaturas ativas.</p>
            <button
              className="btn btn-danger btn-full"
              onClick={handleDeleteGroup}
              disabled={deleting}
            >
              {deleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
              Deletar Grupo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ManageGroup;
