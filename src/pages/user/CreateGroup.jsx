import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Info, Info as InfoIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import './CreateGroup.css';

function CreateGroup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [defaultEntranceFee, setDefaultEntranceFee] = useState(15);

  const [formData, setFormData] = useState({
    service_id: '',
    name: '',
    price_per_slot: '',
    available_cycles: ['monthly'],
    has_slot_limit: false,
    max_size: 4,
    rules: '',
  });

  const [customCycleEnabled, setCustomCycleEnabled] = useState(false);
  const [customCycleMonths, setCustomCycleMonths] = useState(2);
  const [customCycleLabel, setCustomCycleLabel] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const priceSimulation = useMemo(() => {
    const price = parseFloat(formData.price_per_slot) || 0;
    const gatewayFee = price * 0.0498;
    const platformFee = price * 0.0395;
    const net = price - gatewayFee - platformFee;
    return { price, gatewayFee, platformFee, net };
  }, [formData.price_per_slot]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [servicesRes, settingsRes] = await Promise.all([
          supabase.from('streaming_services').select('id, name, full_name, icon, icon_url, color, slug').eq('status', 'active').order('name'),
          supabase.from('app_settings').select('key, value').in('key', ['default_entrance_fee']),
        ]);

        if (servicesRes.error) throw servicesRes.error;
        setServices(servicesRes.data || []);

        if (settingsRes.data) {
          const feeSetting = settingsRes.data.find(s => s.key === 'default_entrance_fee');
          if (feeSetting) setDefaultEntranceFee(parseFloat(feeSetting.value) || 15);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const selectedCycles = [...formData.available_cycles];
      if (customCycleEnabled) {
        selectedCycles.push('custom');
      }

      const groupPayload = {
        service_id: formData.service_id,
        name: formData.name,
        slug: formData.name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        price_per_slot: parseFloat(formData.price_per_slot),
        billing_cycle: selectedCycles[0] || 'monthly',
        available_cycles: selectedCycles,
        max_size: formData.has_slot_limit ? parseInt(formData.max_size, 10) : null,
        has_slot_limit: formData.has_slot_limit,
        has_entrance_fee: true,
        entrance_fee: defaultEntranceFee,
        rules: formData.rules || null,
        tags: [],
        verified: false,
        status: 'open',
        owner_id: user.id,
        is_official: false,
        custom_cycle_months: customCycleEnabled ? parseInt(customCycleMonths, 10) : null,
        custom_cycle_label: customCycleEnabled ? customCycleLabel : null,
      };

      const { data: newGroup, error: insertError } = await supabase
        .from('groups')
        .insert(groupPayload)
        .select('id')
        .single();

      if (insertError) throw insertError;

      if (loginEmail || loginPassword) {
        const { error: credError } = await supabase
          .from('group_credentials')
          .insert({
            group_id: newGroup.id,
            login_email: loginEmail,
            login_password: loginPassword,
            has_profiles: false,
          });
        if (credError) throw credError;
      }

      navigate('/dashboard/my-groups');
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
    <div className="fade-in create-group-page">
      <button onClick={() => navigate(-1)} className="back-btn">
        <ArrowLeft size={18} />
        Voltar
      </button>

      <div className="page-header">
        <h1>Criar Grupo</h1>
        <p>Monte seu grupo e comece a compartilhar assinaturas.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="create-group-form">
        <section className="form-section">
          <h2>Dados do Grupo</h2>

          <div className="form-group">
            <label>Plataforma *</label>
            <select name="service_id" value={formData.service_id} onChange={handleChange} required>
              <option value="">Selecione a plataforma</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.full_name || s.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Nome do grupo *</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ex: Netflix - Grupo Premium"
              required
            />
          </div>

          <div className="form-group">
            <label>Preço por vaga (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="price_per_slot"
              value={formData.price_per_slot}
              onChange={handleChange}
              placeholder="0.00"
              required
            />
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
        </section>

        <section className="form-section">
          <h2>Ciclos de Cobrança</h2>
          <p className="section-desc">Selecione quais ciclos os membros poderão escolher.</p>

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

            <label className={`cycle-check ${customCycleEnabled ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={customCycleEnabled}
                onChange={e => setCustomCycleEnabled(e.target.checked)}
              />
              <span>Personalizado</span>
            </label>
          </div>

          {customCycleEnabled && (
            <div className="custom-cycle-fields">
              <div className="form-group">
                <label>Meses do ciclo *</label>
                <input
                  type="number"
                  min="1"
                  max="36"
                  value={customCycleMonths}
                  onChange={e => setCustomCycleMonths(e.target.value)}
                  required={customCycleEnabled}
                />
              </div>
              <div className="form-group">
                <label>Label do ciclo *</label>
                <input
                  value={customCycleLabel}
                  onChange={e => setCustomCycleLabel(e.target.value)}
                  placeholder="Ex: Bimestral, Ciclo 5 meses"
                  required={customCycleEnabled}
                />
              </div>
            </div>
          )}
        </section>

        <section className="form-section">
          <h2>Configurações</h2>

          <div className="toggle-section">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={formData.has_slot_limit}
                onChange={e => setFormData(prev => ({ ...prev, has_slot_limit: e.target.checked }))}
              />
              <span className="toggle-switch" />
              <span className="toggle-text">
                <strong>Limitar vagas</strong>
                <small>Defina um limite de membros no grupo</small>
              </span>
            </label>
          </div>

          {formData.has_slot_limit && (
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Limite de vagas *</label>
              <input
                type="number"
                min="1"
                name="max_size"
                value={formData.max_size}
                onChange={handleChange}
                required={formData.has_slot_limit}
              />
            </div>
          )}

          <div className="entrance-fee-display">
            <div className="entrance-fee-header">
              <InfoIcon size={16} />
              <span>Taxa de entrada</span>
            </div>
            <div className="entrance-fee-value">
              R$ {defaultEntranceFee.toFixed(2).replace('.', ',')}
            </div>
            <p className="entrance-fee-hint">
              Valor obrigatório cobrado uma única vez na entrada de cada membro. Definido pela plataforma.
            </p>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>Regras do grupo</label>
            <textarea
              rows={4}
              name="rules"
              value={formData.rules}
              onChange={handleChange}
              placeholder="Ex: Não compartilhar a senha; usar apenas 1 tela; etc."
            />
          </div>
        </section>

        <section className="form-section">
          <h2>Credenciais de Acesso</h2>
          <p className="section-desc">
            E-mail e senha da conta da plataforma que os membros usarão.
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
        </section>

        <div className="form-footer">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Criar Grupo
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateGroup;
