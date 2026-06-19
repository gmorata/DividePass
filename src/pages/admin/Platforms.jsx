import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, Loader2, ImageIcon, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Platforms.css';

function Platforms() {
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    full_name: '',
    icon: '',
    color: '#FF6B00',
    description: '',
    official_price: '',
    max_group_size: 4,
    status: 'active'
  });

  const resetForm = () => {
    setFormData({
      name: '',
      full_name: '',
      icon: '',
      color: '#FF6B00',
      description: '',
      official_price: '',
      max_group_size: 4,
      status: 'active'
    });
    setEditingPlatform(null);
    setIconFile(null);
    setIconPreview('');
  };

  const handleOpenForm = (platform = null) => {
    if (platform) {
      setEditingPlatform(platform);
      setFormData({
        name: platform.name,
        full_name: platform.full_name,
        icon: platform.icon || '',
        color: platform.color,
        description: platform.description || '',
        official_price: platform.official_price || '',
        max_group_size: platform.max_group_size,
        status: platform.status
      });
      setIconPreview(platform.icon_url || '');
    } else {
      resetForm();
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleIconChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Selecione uma imagem.');
      return;
    }

    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      let iconUrl = editingPlatform?.icon_url || '';

      if (iconFile) {
        const fileExt = iconFile.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('platform-icons')
          .upload(fileName, iconFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('platform-icons')
          .getPublicUrl(fileName);

        iconUrl = publicUrlData.publicUrl;
      }

      const payload = {
        ...formData,
        icon_url: iconUrl,
        official_price: formData.official_price ? parseFloat(formData.official_price) : null,
        max_group_size: parseInt(formData.max_group_size, 10)
      };

      if (editingPlatform) {
        const { error: updateError } = await supabase
          .from('streaming_services')
          .update(payload)
          .eq('id', editingPlatform.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('streaming_services')
          .insert(payload);

        if (insertError) throw insertError;
      }

      await fetchPlatforms();
      handleCloseForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta plataforma?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('streaming_services')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await fetchPlatforms();
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchPlatforms = async () => {
    try {
      setLoading(true);
      const { data, error: supabaseError } = await supabase
        .from('streaming_services')
        .select('*')
        .order('name');

      if (supabaseError) throw supabaseError;
      setPlatforms(data || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadPlatforms = async () => {
      try {
        if (!cancelled) setLoading(true);
        const { data, error: supabaseError } = await supabase
          .from('streaming_services')
          .select('*')
          .order('name');

        if (supabaseError) throw supabaseError;
        if (!cancelled) {
          setPlatforms(data || []);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPlatforms();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fade-in platforms-page">
      <div className="admin-header">
        <div>
          <h1>Plataformas</h1>
          <p className="page-subtitle">Gerencie os serviços disponíveis para assinatura</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenForm()}>
          <Plus size={18} />
          Nova Plataforma
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
          <p>Carregando plataformas...</p>
        </div>
      ) : (
        <div className="platforms-grid">
          {platforms.map(platform => (
            <div key={platform.id} className={`platform-card ${platform.status !== 'active' ? 'platform-inactive' : ''}`}>
              <div className="platform-header">
                <div
                  className="platform-icon"
                  style={{ backgroundColor: platform.color }}
                >
                  {platform.icon_url ? (
                    <img src={platform.icon_url} alt={platform.name} />
                  ) : (
                    platform.icon || <ImageIcon size={20} />
                  )}
                </div>
                <div className="platform-status">
                  <span className={`status-pill ${platform.status}`}>
                    {platform.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>

              <div className="platform-body">
                <h3>{platform.name}</h3>
                <p className="platform-full-name">{platform.full_name}</p>
                {platform.description && (
                  <p className="platform-description">{platform.description}</p>
                )}

                <div className="platform-meta">
                  <div>
                    <span className="meta-label">Preço oficial</span>
                    <span className="meta-value">
                      {platform.official_price
                        ? `R$ ${Number(platform.official_price).toFixed(2).replace('.', ',')}`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Vagas por grupo</span>
                    <span className="meta-value">{platform.max_group_size}</span>
                  </div>
                </div>
              </div>

              <div className="platform-actions">
                <button
                  className="platform-btn edit"
                  onClick={() => handleOpenForm(platform)}
                >
                  <Pencil size={16} />
                  Editar
                </button>
                <button
                  className="platform-btn delete"
                  onClick={() => handleDelete(platform.id)}
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPlatform ? 'Editar Plataforma' : 'Nova Plataforma'}</h2>
              <button className="modal-close" onClick={handleCloseForm}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="platform-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label>Nome da plataforma *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Netflix"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nome completo *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Netflix Premium"
                    required
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group icon-upload-group">
                  <label>Ícone</label>
                  <div className="icon-upload">
                    <div className="icon-preview" style={{ backgroundColor: formData.color }}>
                      {iconPreview ? (
                        <img src={iconPreview} alt="Preview" />
                      ) : (
                        formData.icon || <ImageIcon size={20} />
                      )}
                    </div>
                    <label className="btn btn-outline btn-sm upload-btn">
                      <Upload size={14} />
                      Subir imagem
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleIconChange}
                        hidden
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="Letra de fallback (N)"
                    maxLength={3}
                    className="icon-fallback"
                  />
                </div>
                <div className="form-group">
                  <label>Cor</label>
                  <div className="color-input">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={e => setFormData({ ...formData, color: e.target.value })}
                    />
                    <span>{formData.color}</span>
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Preço oficial</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.official_price}
                    onChange={e => setFormData({ ...formData, official_price: e.target.value })}
                    placeholder="55.90"
                  />
                </div>
                <div className="form-group">
                  <label>Máximo de vagas por grupo *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_group_size}
                    onChange={e => setFormData({ ...formData, max_group_size: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Plano Premium Ultra HD"
                  rows={3}
                />
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

export default Platforms;
