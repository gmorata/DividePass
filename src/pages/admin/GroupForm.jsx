import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './GroupForm.css';

function GroupForm() {
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = !!groupId;

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    status: 'open',
  });

  const [credentials, setCredentials] = useState([
    { profile_assignment: '', login_email: '', login_password: '' },
  ]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleCredChange = (index, field, value) => {
    setCredentials(prev => prev.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    ));
  };

  const addCredential = () => {
    setCredentials(prev => [...prev, { profile_assignment: '', login_email: '', login_password: '' }]);
  };

  const removeCredential = (index) => {
    setCredentials(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (!cancelled) setLoading(true);

        const [servicesRes, groupRes, credentialsRes] = await Promise.all([
          supabase.from('streaming_services').select('id, name, full_name').order('name'),
          isEditing
            ? supabase.from('groups').select('*').eq('id', groupId).single()
            : Promise.resolve({ data: null }),
          isEditing
            ? supabase.from('group_credentials').select('*, assigned_user:assigned_to (id, name, email)').eq('group_id', groupId).order('id')
            : Promise.resolve({ data: null }),
        ]);

        if (servicesRes.error) throw servicesRes.error;
        if (!cancelled) setServices(servicesRes.data || []);

        if (isEditing) {
          if (groupRes.error) throw groupRes.error;
          const group = groupRes.data;
          if (group) {
            setFormData({
              service_id: group.service_id || '',
              name: group.name || '',
              price_per_slot: group.price_per_slot || '',
              billing_cycle: group.billing_cycle || 'monthly',
              cycle_discount: group.cycle_discount || 0,
              max_size: group.max_size || 4,
              rules: group.rules || '',
              tags: Array.isArray(group.tags) ? group.tags.join(', ') : '',
              verified: group.verified || false,
              status: group.status || 'open',
            });

            const creds = credentialsRes.data;
            if (creds && creds.length > 0) {
              setCredentials(creds.map(c => ({
                id: c.id,
                profile_assignment: c.profile_assignment || '',
                login_email: c.login_email || '',
                login_password: c.login_password || '',
                assigned_to: c.assigned_to || null,
                assigned_user: c.assigned_user || null,
              })));
            }
          }
        } else if (servicesRes.data?.length > 0) {
          const preselectedService = searchParams.get('service');
          const initialService = preselectedService && servicesRes.data.some(s => s.id === preselectedService)
            ? preselectedService
            : servicesRes.data[0].id;
          setFormData(prev => ({ ...prev, service_id: initialService }));
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [groupId, isEditing, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const groupPayload = {
        service_id: formData.service_id,
        name: formData.name,
        price_per_slot: parseFloat(formData.price_per_slot),
        billing_cycle: formData.billing_cycle,
        cycle_discount: parseFloat(formData.cycle_discount || 0),
        max_size: parseInt(formData.max_size, 10),
        rules: formData.rules || null,
        tags: formData.tags
          ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
          : [],
        verified: !!formData.verified,
        status: formData.status,
      };

      let groupIdResult = groupId;

      if (isEditing) {
        const { error: updateError } = await supabase
          .from('groups')
          .update(groupPayload)
          .eq('id', groupId);

        if (updateError) throw updateError;
      } else {
        const { data: newGroup, error: insertError } = await supabase
          .from('groups')
          .insert(groupPayload)
          .select('id')
          .single();

        if (insertError) throw insertError;
        groupIdResult = newGroup.id;
      }

      const validCreds = credentials.filter(c => c.login_email || c.login_password);

      if (isEditing) {
        const existingIds = validCreds.filter(c => c.id).map(c => c.id);

        if (existingIds.length > 0) {
          for (const c of validCreds.filter(c => c.id)) {
            const { error } = await supabase
              .from('group_credentials')
              .update({
                login_email: c.login_email,
                login_password: c.login_password,
                profile_assignment: c.profile_assignment || null,
              })
              .eq('id', c.id);
            if (error) throw error;
          }
        }

        const { error: deleteError } = await supabase
          .from('group_credentials')
          .delete()
          .eq('group_id', groupIdResult)
          .not('id', 'in', `(${existingIds.length > 0 ? existingIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);

        if (deleteError) throw deleteError;

        const newCreds = validCreds.filter(c => !c.id);
        if (newCreds.length > 0) {
          const { error: insertError } = await supabase
            .from('group_credentials')
            .insert(newCreds.map(c => ({
              group_id: groupIdResult,
              login_email: c.login_email,
              login_password: c.login_password,
              profile_assignment: c.profile_assignment || null,
            })));
          if (insertError) throw insertError;
        }
      } else {
        if (validCreds.length > 0) {
          const { error: insertError } = await supabase
            .from('group_credentials')
            .insert(validCreds.map(c => ({
              group_id: groupIdResult,
              login_email: c.login_email,
              login_password: c.login_password,
              profile_assignment: c.profile_assignment || null,
            })));
          if (insertError) throw insertError;
        }
      }

      navigate('/admin/groups');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={32} className="spin" />
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="fade-in group-form-page">
      <button onClick={() => navigate('/admin/groups')} className="back-btn">
        <ArrowLeft size={18} />
        Voltar para Grupos
      </button>

      <div className="admin-header">
        <h1>{isEditing ? 'Editar Grupo' : 'Novo Grupo'}</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="group-form-card">
        <section className="form-section">
          <h2>Dados do Grupo</h2>

          <div className="form-grid">
            <div className="form-group">
              <label>Plataforma *</label>
              <select name="service_id" value={formData.service_id} onChange={handleChange} required>
                <option value="">Selecione</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Nome do grupo *</label>
              <input name="name" value={formData.name} onChange={handleChange} placeholder="Netflix - Grupo A" required />
            </div>

            <div className="form-group">
              <label>Preço por vaga (R$) *</label>
              <input type="number" step="0.01" min="0" name="price_per_slot" value={formData.price_per_slot} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label>Vagas *</label>
              <input type="number" min="1" name="max_size" value={formData.max_size} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label>Ciclo de faturamento</label>
              <select name="billing_cycle" value={formData.billing_cycle} onChange={handleChange}>
                <option value="monthly">Mensal</option>
                <option value="quarterly">Trimestral</option>
                <option value="semiannual">Semestral</option>
                <option value="annual">Anual</option>
              </select>
            </div>

            <div className="form-group">
              <label>Desconto do ciclo (%)</label>
              <input type="number" step="0.01" min="0" max="100" name="cycle_discount" value={formData.cycle_discount} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group">
            <label>Regras do grupo</label>
            <textarea rows={4} name="rules" value={formData.rules} onChange={handleChange} placeholder="Ex: Não compartilhar a senha; usar apenas 1 tela..." />
          </div>

          <div className="form-group">
            <label>Tags (separadas por vírgula)</label>
            <input name="tags" value={formData.tags} onChange={handleChange} placeholder="Ex: 4k, ultrahd, sem anúncios" />
          </div>

          <div className="form-inline">
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={formData.status} onChange={handleChange}>
                <option value="open">Aberto</option>
                <option value="closed">Fechado</option>
              </select>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input type="checkbox" name="verified" checked={formData.verified} onChange={handleChange} />
                Grupo verificado (DividePass)
              </label>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="section-header-row">
            <div>
              <h2>Credenciais de Acesso</h2>
              <p className="section-desc">
                Defina os perfis/telas com e-mail e senha. 
                As credenciais aparecem para o usuário <strong>somente após o pagamento</strong>.
                Adicione um perfil para cada tela com senha diferente.
              </p>
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={addCredential}>
              <Plus size={16} />
              Adicionar Perfil
            </button>
          </div>

          {credentials.map((cred, index) => (
            <div key={index} className="credential-entry">
              <div className="credential-entry-header">
                <h3>Perfil / Tela {index + 1}</h3>
                <div className="credential-entry-badges">
                  {cred.assigned_user && (
                    <span className="assigned-badge">
                      Atribuído a: {cred.assigned_user.name || cred.assigned_user.email}
                    </span>
                  )}
                  {credentials.length > 1 && (
                    <button type="button" className="btn-icon danger" onClick={() => removeCredential(index)} title="Remover">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="form-grid cred-fields">
                <div className="form-group">
                  <label>Nome do Perfil</label>
                  <input
                    value={cred.profile_assignment}
                    onChange={e => handleCredChange(index, 'profile_assignment', e.target.value)}
                    placeholder="Ex: Tela 1, Perfil Principal"
                  />
                </div>
                <div className="form-group">
                  <label>E-mail de acesso</label>
                  <input
                    value={cred.login_email}
                    onChange={e => handleCredChange(index, 'login_email', e.target.value)}
                    placeholder="netflix.grupo.a@dividepass.com"
                  />
                </div>
                <div className="form-group">
                  <label>Senha de acesso</label>
                  <input
                    value={cred.login_password}
                    onChange={e => handleCredChange(index, 'login_password', e.target.value)}
                    placeholder="••••••••"
                    type="text"
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        <div className="form-footer">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/admin/groups')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {isEditing ? 'Salvar Alterações' : 'Criar Grupo'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default GroupForm;
