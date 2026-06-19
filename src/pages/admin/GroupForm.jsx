import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
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
    login_email: '',
    login_password: '',
    profile_assignment: '',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
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
            ? supabase.from('group_credentials').select('*').eq('group_id', groupId).maybeSingle()
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
              login_email: credentialsRes.data?.login_email || '',
              login_password: credentialsRes.data?.login_password || '',
              profile_assignment: credentialsRes.data?.profile_assignment || '',
            });
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

      const credentialPayload = {
        group_id: groupIdResult,
        login_email: formData.login_email || '',
        login_password: formData.login_password || '',
        profile_assignment: formData.profile_assignment || null,
      };

      if (credentialPayload.login_email || credentialPayload.login_password) {
        const { error: credError } = await supabase
          .from('group_credentials')
          .upsert(credentialPayload, { onConflict: 'group_id' });

        if (credError) throw credError;
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
          <h2>Credenciais de Acesso</h2>
          <p className="section-desc">
            Defina o e-mail e senha que serão exibidos aos assinantes deste grupo.
            As credenciais aparecem para o usuário <strong>somente após o pagamento</strong>.
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label>E-mail de acesso</label>
              <input name="login_email" value={formData.login_email} onChange={handleChange} placeholder="netflix.grupo.a@dividepass.com" />
            </div>
            <div className="form-group">
              <label>Senha de acesso</label>
              <input name="login_password" value={formData.login_password} onChange={handleChange} placeholder="••••••••" type="text" />
            </div>
            <div className="form-group">
              <label>Perfil / Tela</label>
              <input name="profile_assignment" value={formData.profile_assignment} onChange={handleChange} placeholder="Ex: Tela 2, Perfil 1" />
            </div>
          </div>
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
