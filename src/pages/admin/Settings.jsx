import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Settings as SettingsIcon, Save, Loader2, Info, AlertTriangle } from 'lucide-react';
import './Settings.css';

const DEFAULTS = {
  gateway_fee_percent: '4.98',
  platform_fee_percent: '3.95',
  default_entrance_fee: '15.00',
};

function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [gatewayFee, setGatewayFee] = useState('');
  const [platformFee, setPlatformFee] = useState('');
  const [entranceFee, setEntranceFee] = useState('');

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('app_settings')
        .select('key, value');

      if (err) {
        setError('Erro ao carregar configurações.');
        setLoading(false);
        return;
      }

      const map = {};
      (data || []).forEach((row) => {
        map[row.key] = row.value;
      });

      setGatewayFee(map.gateway_fee_percent ?? DEFAULTS.gateway_fee_percent);
      setPlatformFee(map.platform_fee_percent ?? DEFAULTS.platform_fee_percent);
      setEntranceFee(map.default_entrance_fee ?? DEFAULTS.default_entrance_fee);
      setLoading(false);
    }

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updates = [
        { key: 'gateway_fee_percent', value: gatewayFee },
        { key: 'platform_fee_percent', value: platformFee },
        { key: 'default_entrance_fee', value: entranceFee },
      ];

      const { error: err } = await supabase
        .from('app_settings')
        .upsert(updates, { onConflict: 'key' });

      if (err) throw err;

      setSuccess('Configurações salvas com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="admin-header">
          <h1>Configurações da Plataforma</h1>
        </div>
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Carregando configurações...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in settings-page">
      <div className="admin-header">
        <h1>
          <SettingsIcon size={22} />
          Configurações da Plataforma
        </h1>
        <p>Gerencie as taxas e configurações globais do sistema</p>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="settings-card">
        <section className="settings-section">
          <div className="settings-section-header">
            <h2>Taxas</h2>
          </div>

          <div className="settings-section-body">
            <div className="form-row-2">
              <div className="form-group">
                <label>Taxa do Gateway (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={gatewayFee}
                  onChange={(e) => setGatewayFee(e.target.value)}
                  placeholder="4.98"
                />
                <small className="field-hint">
                  Percentual cobrado pelo gateway de pagamento (ex: 4.98%)
                </small>
              </div>

              <div className="form-group">
                <label>Taxa da Plataforma (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={platformFee}
                  onChange={(e) => setPlatformFee(e.target.value)}
                  placeholder="3.95"
                />
                <small className="field-hint">
                  Percentual retido pela plataforma (ex: 3.95%)
                </small>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <h2>Taxa de Entrada Padrão</h2>
          </div>

          <div className="settings-section-body">
            <div className="form-group">
              <label>Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={entranceFee}
                onChange={(e) => setEntranceFee(e.target.value)}
                placeholder="15.00"
              />
            </div>

            <div className="settings-info-block">
              <Info size={16} />
              <p>
                A taxa de entrada é cobrada apenas <strong>UMA VEZ</strong> para garantir a vaga
                do membro no grupo. Ela cobre os encargos da taxa da plataforma, taxas de
                transferências e depósitos bancários. Nas renovações futuras, o membro pagará
                apenas o valor da assinatura.
              </p>
            </div>

            <div className="settings-info-block warning">
              <AlertTriangle size={16} />
              <p>
                Grupos criados por usuários sempre terão taxa de entrada. Apenas o admin pode
                remover no editor de grupos.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}

export default Settings;
