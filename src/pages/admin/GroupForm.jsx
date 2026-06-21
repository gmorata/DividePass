import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Plus, Trash2, CheckCircle, X, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './GroupForm.css';

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="toast-success">
      <CheckCircle size={18} />
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  );
}

function GroupForm() {
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = !!groupId;

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const [formData, setFormData] = useState({
    service_id: '',
    name: '',
    price_per_slot: '',
    available_cycles: ['monthly'],
    cycle_discount: 0,
    max_size: 4,
    has_slot_limit: true,
    has_entrance_fee: false,
    entrance_fee: '',
    rules: '',
    tags: '',
    verified: false,
    status: 'open',
  });

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [hasProfiles, setHasProfiles] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [members, setMembers] = useState([]);

  const priceSimulation = useMemo(() => {
    const price = parseFloat(formData.price_per_slot) || 0;
    const gatewayFee = price * 0.0498;
    const platformFee = price * 0.0395;
    const net = price - gatewayFee - platformFee;
    return { price, gatewayFee, platformFee, net };
  }, [formData.price_per_slot]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleCycleToggle = (cycle) => {
    setFormData(prev => {
      const current = prev.available_cycles || [];
      const updated = current.includes(cycle)
        ? current.filter(c => c !== cycle)
        : [...current, cycle];
      return { ...prev, available_cycles: updated.length > 0 ? updated : current };
    });
  };

  const handleProfileChange = (index, field, value) => {
    setProfiles(prev => prev.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    ));
  };

  const addProfile = () => {
    setProfiles(prev => [...prev, { profile_name: '', profile_password: '' }]);
  };

  const removeProfile = (index) => {
    setProfiles(prev => prev.filter((_, i) => i !== index));
  };

  const getMemberOrder = (userId) => {
    const idx = members.findIndex(m => m.user_id === userId);
    return idx >= 0 ? idx + 1 : null;
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (!cancelled) setLoading(true);

        const [servicesRes, groupRes, credsRes, profilesRes, membersRes] = await Promise.all([
          supabase.from('streaming_services').select('id, name, full_name').order('name'),
          isEditing
            ? supabase.from('groups').select('*').eq('id', groupId).single()
            : Promise.resolve({ data: null }),
          isEditing
            ? supabase.from('group_credentials').select('*').eq('group_id', groupId).maybeSingle()
            : Promise.resolve({ data: null }),
          isEditing
            ? supabase.from('group_profiles').select('*, assigned_user:assigned_to (id, name, email)').eq('group_id', groupId).order('created_at')
            : Promise.resolve({ data: null }),
          isEditing
            ? supabase.from('group_members').select('user_id, created_at, user:user_id (id, name, email)').eq('group_id', groupId).order('created_at')
            : Promise.resolve({ data: null }),
        ]);

        if (servicesRes.error) throw servicesRes.error;
        if (!cancelled) setServices(servicesRes.data || []);

        if (isEditing && !cancelled) {
          setMembers(membersRes.data || []);
        }

        if (isEditing) {
          if (groupRes.error) throw groupRes.error;
          const group = groupRes.data;
          if (group) {
            setFormData({
              service_id: group.service_id || '',
              name: group.name || '',
              price_per_slot: group.price_per_slot || '',
              available_cycles: group.available_cycles || [group.billing_cycle || 'monthly'],
              cycle_discount: group.cycle_discount || 0,
              max_size: group.max_size || 4,
              has_slot_limit: group.has_slot_limit !== false,
              has_entrance_fee: group.has_entrance_fee || false,
              entrance_fee: group.entrance_fee || '',
              rules: group.rules || '',
              tags: Array.isArray(group.tags) ? group.tags.join(', ') : '',
              verified: group.verified || false,
              status: group.status || 'open',
            });
          }

          if (credsRes.data) {
            setLoginEmail(credsRes.data.login_email || '');
            setLoginPassword(credsRes.data.login_password || '');
            setHasProfiles(credsRes.data.has_profiles || false);
          }

          if (profilesRes.data && profilesRes.data.length > 0) {
            setProfiles(profilesRes.data.map(p => ({
              id: p.id,
              profile_name: p.profile_name || '',
              profile_password: p.profile_password || '',
              assigned_to: p.assigned_to || null,
              assigned_user: p.assigned_user || null,
            })));
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
        slug: formData.name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        price_per_slot: parseFloat(formData.price_per_slot),
        billing_cycle: formData.available_cycles[0] || 'monthly',
        available_cycles: formData.available_cycles,
        cycle_discount: parseFloat(formData.cycle_discount || 0),
        max_size: formData.has_slot_limit ? parseInt(formData.max_size, 10) : null,
        has_slot_limit: formData.has_slot_limit,
        has_entrance_fee: formData.has_entrance_fee,
        entrance_fee: formData.has_entrance_fee ? parseFloat(formData.entrance_fee || 0) : 0,
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
          .select('id, slug')
          .single();
        if (insertError) throw insertError;
        groupIdResult = newGroup.id;
      }

      if (loginEmail || loginPassword) {
        const credPayload = {
          group_id: groupIdResult,
          login_email: loginEmail,
          login_password: loginPassword,
          has_profiles: hasProfiles,
        };

        const { data: existingCred } = await supabase
          .from('group_credentials')
          .select('id')
          .eq('group_id', groupIdResult)
          .maybeSingle();

        if (existingCred) {
          const { error: credError } = await supabase
            .from('group_credentials')
            .update(credPayload)
            .eq('id', existingCred.id);
          if (credError) throw credError;
        } else {
          const { error: credError } = await supabase
            .from('group_credentials')
            .insert(credPayload);
          if (credError) throw credError;
        }
      }

      if (hasProfiles) {
        const validProfiles = profiles.filter(p => p.profile_name || p.profile_password);
        const existingIds = validProfiles.filter(p => p.id).map(p => p.id);

        if (isEditing && existingIds.length > 0) {
          for (const p of validProfiles.filter(p => p.id)) {
            const { error } = await supabase
              .from('group_profiles')
              .update({ profile_name: p.profile_name, profile_password: p.profile_password, assigned_to: p.assigned_to || null })
              .eq('id', p.id);
            if (error) throw error;
          }

          const { error: delError } = await supabase
            .from('group_profiles')
            .delete()
            .eq('group_id', groupIdResult)
            .not('id', 'in', `(${existingIds.length > 0 ? existingIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);
          if (delError) throw delError;
        } else if (isEditing) {
          const { error: delError } = await supabase
            .from('group_profiles')
            .delete()
            .eq('group_id', groupIdResult);
          if (delError) throw delError;
        }

        const newProfiles = validProfiles.filter(p => !p.id);
        if (newProfiles.length > 0) {
          const { error: profError } = await supabase
            .from('group_profiles')
            .insert(newProfiles.map(p => ({
              group_id: groupIdResult,
              profile_name: p.profile_name,
              profile_password: p.profile_password,
              assigned_to: p.assigned_to || null,
            })));
          if (profError) throw profError;
        }
      } else if (isEditing) {
        await supabase.from('group_profiles').delete().eq('group_id', groupIdResult);
      }

      setToast(isEditing ? 'Grupo atualizado com sucesso!' : 'Grupo criado com sucesso!');
      setTimeout(() => navigate('/admin/groups'), 1200);
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
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

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
          </div>

          <div className="form-group">
            <label>Preço por vaga (R$) *</label>
            <input type="number" step="0.01" min="0.01" name="price_per_slot" value={formData.price_per_slot} onChange={handleChange} required />
          </div>

          {formData.price_per_slot > 0 && (
            <div className="price-simulation">
              <div className="sim-header">
                <Info size={16} />
                <span>Simulação de recebimento</span>
              </div>
              <div className="sim-grid">
                <div className="sim-row">
                  <span>Valor cobrado</span>
                  <strong>R$ {priceSimulation.price.toFixed(2)}</strong>
                </div>
                <div className="sim-row fee">
                  <span>Taxa gateway (4,98%)</span>
                  <span>- R$ {priceSimulation.gatewayFee.toFixed(2)}</span>
                </div>
                <div className="sim-row fee">
                  <span>Taxa plataforma (3,95%)</span>
                  <span>- R$ {priceSimulation.platformFee.toFixed(2)}</span>
                </div>
                <div className="sim-row total">
                  <span>Você recebe</span>
                  <strong>R$ {priceSimulation.net.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Ciclos de cobrança disponíveis *</label>
            <p className="section-desc" style={{ marginBottom: '0.75rem' }}>
              Selecione quais formas de pagamento o usuário poderá escolher.
            </p>
            <div className="cycles-grid">
              {[
                { value: 'monthly', label: 'Mensal' },
                { value: 'quarterly', label: 'Trimestral' },
                { value: 'semiannual', label: 'Semestral' },
                { value: 'annual', label: 'Anual' },
              ].map(opt => (
                <label key={opt.value} className={`cycle-check ${formData.available_cycles.includes(opt.value) ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={formData.available_cycles.includes(opt.value)}
                    onChange={() => handleCycleToggle(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Desconto do ciclo (%)</label>
            <input type="number" step="0.01" min="0" max="100" name="cycle_discount" value={formData.cycle_discount} onChange={handleChange} />
          </div>

          <div className="toggle-section">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={formData.has_entrance_fee}
                onChange={e => setFormData(prev => ({ ...prev, has_entrance_fee: e.target.checked }))}
              />
              <span className="toggle-switch" />
              <span className="toggle-text">
                <strong>Cobrar valor de entrada?</strong>
                <small>Valor único pago na primeira vez + assinatura. Próximos ciclos somente assinatura.</small>
              </span>
            </label>
          </div>

          {formData.has_entrance_fee && (
            <div className="form-group">
              <label>Valor de entrada (R$) *</label>
              <input type="number" step="0.01" min="0" name="entrance_fee" value={formData.entrance_fee} onChange={handleChange} required={formData.has_entrance_fee} />
              <small className="field-hint">Cobrado apenas na primeira vez que o membro entra no grupo</small>
            </div>
          )}

          <div className="toggle-section">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={formData.has_slot_limit}
                onChange={e => setFormData(prev => ({ ...prev, has_slot_limit: e.target.checked }))}
              />
              <span className="toggle-switch" />
              <span className="toggle-text">
                <strong>Tem limite de vagas?</strong>
                <small>Quando ativado, define um limite de membros no grupo</small>
              </span>
            </label>
          </div>

          {formData.has_slot_limit && (
            <div className="form-group">
              <label>Limite de vagas *</label>
              <input type="number" min="1" name="max_size" value={formData.max_size} onChange={handleChange} required={formData.has_slot_limit} />
            </div>
          )}

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
                <option value="forming">Formando</option>
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
            E-mail e senha da conta principal. Compartilhados entre todos os membros do grupo.
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label>E-mail de acesso</label>
              <input
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="conta@plataforma.com"
              />
            </div>
            <div className="form-group">
              <label>Senha de acesso</label>
              <input
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                type="text"
              />
            </div>
          </div>

          <div className="toggle-section">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={hasProfiles}
                onChange={e => {
                  setHasProfiles(e.target.checked);
                  if (e.target.checked && profiles.length === 0) {
                    setProfiles([{ profile_name: '', profile_password: '' }]);
                  }
                }}
              />
              <span className="toggle-switch" />
              <span className="toggle-text">
                <strong>Esta plataforma usa perfis individuais para membros</strong>
                <small>Ex: Netflix, Disney+ — cada membro recebe um perfil/tela com senha própria</small>
              </span>
            </label>
          </div>

          {hasProfiles && (
            <div className="profiles-section">
              <div className="section-header-row">
                <div>
                  <h3>Perfis / Telas</h3>
                  <p className="section-desc">
                    Cada membro que entrar no grupo receberá automaticamente um perfil.
                  </p>
                </div>
                <button type="button" className="btn btn-sm btn-primary" onClick={addProfile}>
                  <Plus size={16} />
                  Adicionar Perfil
                </button>
              </div>

              {profiles.map((profile, index) => {
                const memberOrder = profile.assigned_to ? getMemberOrder(profile.assigned_to) : null;
                const assignedMember = members.find(m => m.user_id === profile.assigned_to);
                const usedMemberIds = profiles.filter(p => p.assigned_to && p !== profile).map(p => p.assigned_to);
                return (
                  <div key={index} className="profile-entry">
                    <div className="profile-entry-header">
                      <h4>Perfil / Tela {index + 1}</h4>
                      <div className="profile-entry-badges">
                        {memberOrder ? (
                          <span className="assigned-badge">
                            Membro #{memberOrder} — {profile.assigned_user?.name || profile.assigned_user?.email || assignedMember?.user?.name || assignedMember?.user?.email}
                          </span>
                        ) : (
                          <span className="available-badge">Disponível</span>
                        )}
                        {profiles.length > 1 && (
                          <button type="button" className="btn-icon danger" onClick={() => removeProfile(index)} title="Remover">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="form-grid cred-fields">
                      <div className="form-group">
                        <label>Nome do Perfil</label>
                        <input
                          value={profile.profile_name}
                          onChange={e => handleProfileChange(index, 'profile_name', e.target.value)}
                          placeholder="Ex: Perfil 1, Tela João"
                        />
                      </div>
                      <div className="form-group">
                        <label>Senha do Perfil</label>
                        <input
                          value={profile.profile_password}
                          onChange={e => handleProfileChange(index, 'profile_password', e.target.value)}
                          placeholder="Senha específica do perfil"
                          type="text"
                        />
                      </div>
                      <div className="form-group">
                        <label>Vincular ao Membro</label>
                        <select
                          value={profile.assigned_to || ''}
                          onChange={e => handleProfileChange(index, 'assigned_to', e.target.value || null)}
                        >
                          <option value="">Não vinculado</option>
                          {members.map((m, mIdx) => (
                            <option
                              key={m.user_id}
                              value={m.user_id}
                              disabled={usedMemberIds.includes(m.user_id)}
                            >
                              Membro #{mIdx + 1} — {m.user?.name || m.user?.email || m.user_id}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button type="button" className="add-profile-inline-btn" onClick={addProfile}>
                <Plus size={18} />
                Adicionar novo perfil / tela
              </button>
            </div>
          )}
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
