import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Platforms.css';

function Platforms() {
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const filtered = platforms.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fade-in platforms-page">
      <div className="admin-header">
        <div>
          <h1>Plataformas</h1>
          <p className="page-subtitle">{platforms.length} plataformas cadastradas</p>
        </div>
        <Link to="/admin/platforms/new" className="btn btn-primary">
          <Plus size={18} />
          Nova Plataforma
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="platforms-search">
        <input
          type="text"
          placeholder="Buscar plataforma..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Carregando plataformas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>Nenhuma plataforma encontrada.</p>
        </div>
      ) : (
        <div className="platforms-grid">
          {filtered.map(platform => (
            <button
              key={platform.id}
              className={`platform-card ${platform.status !== 'active' ? 'platform-inactive' : ''}`}
              onClick={() => navigate(`/admin/platforms/${platform.id}/edit`)}
              style={{ '--platform-color': platform.color }}
            >
              <div className="platform-icon" style={{ backgroundColor: platform.color }}>
                {platform.icon_url ? (
                  <img src={platform.icon_url} alt={platform.name} />
                ) : (
                  platform.icon || platform.name?.[0] || '?'
                )}
              </div>
              <div className="platform-info">
                <h4>{platform.full_name || platform.name}</h4>
              </div>
              <span className={`platform-status ${platform.status === 'active' ? 'active' : 'inactive'}`}>
                {platform.status === 'active' ? 'ATIVO' : 'INATIVO'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Platforms;
