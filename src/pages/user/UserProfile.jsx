import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Save, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import './UserProfile.css';

export default function UserProfile() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    nickname: '',
    phone: '',
    birthdate: '',
  });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || '',
        nickname: profile.nickname || '',
        phone: profile.phone || '',
        birthdate: profile.birthdate || '',
      });
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Selecione uma imagem válida.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'A imagem deve ter no máximo 2MB.' });
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return avatarUrl;

    const ext = avatarFile.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;

    const { data, error } = await supabase.storage
      .from('profile-photos')
      .upload(path, avatarFile, { upsert: true });

    if (error) {
      console.error('Upload error:', error);
      setMessage({ type: 'error', text: 'Erro no upload: ' + error.message });
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(path);

    return urlData?.publicUrl || null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      let newAvatarUrl = avatarUrl;

      if (avatarFile) {
        newAvatarUrl = await uploadAvatar();
        if (!newAvatarUrl) {
          setSaving(false);
          return;
        }
      }

      const updateData = {
        name: form.name,
        avatar_url: newAvatarUrl,
      };

      if (form.phone !== undefined) updateData.phone = form.phone || null;
      if (form.nickname !== undefined) updateData.nickname = form.nickname || null;
      if (form.birthdate !== undefined) updateData.birthdate = form.birthdate || null;

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (error) {
        console.error('Update error:', error);
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          setMessage({ type: 'error', text: 'Execute a migração SQL no Supabase primeiro. Veja: database/add-user-profile-fields.sql' });
        } else {
          setMessage({ type: 'error', text: 'Erro ao salvar: ' + error.message });
        }
      } else {
        setAvatarUrl(newAvatarUrl);
        setAvatarFile(null);
        setAvatarPreview(null);
        setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
        await refreshProfile();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setMessage({ type: 'error', text: 'Erro inesperado: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const displayImage = avatarPreview || avatarUrl;
  const initials = (form.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="profile-page fade-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>Meu Perfil</h1>
          <p>Gerencie seus dados pessoais</p>
        </div>
      </div>

      <form className="profile-card" onSubmit={handleSubmit}>
        <div className="profile-avatar-section">
          <button
            type="button"
            className="profile-avatar-btn"
            onClick={handleAvatarClick}
            title="Trocar foto"
          >
            {displayImage ? (
              <img src={displayImage} alt="Avatar" className="profile-avatar-img" />
            ) : (
              <span className="profile-avatar-initials">{initials}</span>
            )}
            <div className="profile-avatar-overlay">
              <Camera size={20} />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <span className="profile-avatar-hint">Clique para trocar a foto</span>
        </div>

        {message && (
          <div className={`profile-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="profile-fields">
          <div className="form-group">
            <label htmlFor="name">Nome completo</label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Seu nome completo"
            />
          </div>

          <div className="form-group">
            <label htmlFor="nickname">Apelido</label>
            <input
              id="nickname"
              name="nickname"
              type="text"
              value={form.nickname}
              onChange={handleChange}
              placeholder="Como prefere ser chamado"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="phone">Celular</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="form-group">
              <label htmlFor="birthdate">Data de nascimento</label>
              <input
                id="birthdate"
                name="birthdate"
                type="date"
                value={form.birthdate}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label>E-mail</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="disabled-field"
            />
            <span className="field-hint">O e-mail não pode ser alterado</span>
          </div>
        </div>

        <div className="profile-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate(-1)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
