import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import './UserDashboard.css';

const CATEGORIES = [
  { key: 'all', label: 'Todos', icon: '🔍' },
  { key: 'streaming', label: 'Streaming', icon: '📺' },
  { key: 'musica', label: 'Música', icon: '🎵' },
  { key: 'ia', label: 'IA', icon: '🤖' },
  { key: 'cursos', label: 'Cursos', icon: '🎓' },
  { key: 'produtividade', label: 'Produtividade', icon: '💼' },
  { key: 'ferramentas', label: 'Ferramentas', icon: '🛠' },
  { key: 'leitura', label: 'Leitura', icon: '📚' },
  { key: 'games', label: 'Games', icon: '🎮' },
  { key: 'saude', label: 'Saúde', icon: '🏋️' },
  { key: 'seguranca', label: 'Segurança', icon: '🔒' },
];

const CATEGORY_KEYWORDS = {
  streaming: ['filmes', 'series', 'video', 'streaming', 'tv', 'netflix', 'disney', 'max', 'prime', 'globoplay', 'paramount', 'apple tv', 'crunchyroll', 'mubi'],
  musica: ['musica', 'music', 'podcast', 'audio', 'spotify', 'deezer', 'tidal', 'audible'],
  ia: ['ia', 'ai', 'inteligencia', 'artificial', 'chatgpt', 'claude', 'gemini', 'midjourney', 'perplexity', 'cursor', 'elevenlabs', 'runway', 'gpt'],
  cursos: ['curso', 'cursos', 'educacao', 'aprender', 'estudar', 'alura', 'udemy', 'coursera', 'domestika', 'duolingo', 'rocketseat', 'aula'],
  produtividade: ['produtividade', 'trabalho', 'colaboracao', 'microsoft', 'google', 'notion', 'trello', 'clickup', 'slack', 'office'],
  ferramentas: ['design', 'edicao', 'marketing', 'canva', 'adobe', 'figma', 'semrush', 'envato', 'grammarly', 'criativo'],
  leitura: ['livro', 'leitura', 'kindle', 'scribd', 'readly', 'ebook', 'revista'],
  games: ['jogo', 'jogos', 'game', 'games', 'xbox', 'playstation', 'nintendo', 'geforce', 'gamer'],
  saude: ['saude', 'fitness', 'exercicio', 'bem estar', 'wellhub', 'strava', 'headspace', 'calm', 'academia'],
  seguranca: ['seguranca', 'vpn', 'senha', 'senhas', 'nordvpn', 'surfshark', 'bitwarden', '1password', 'protecao'],
};

function UserDashboard() {
  const navigate = useNavigate();
  const { currentUser, getActiveServices, getAvailableServices, isSubscribedToService, announcements, dismissAnnouncement } = useAppDataContext();
  const categoryBarRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('dismissed_announcements') || '[]'));
    } catch {
      return new Set();
    }
  });

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const activeServices = getActiveServices();
  const availableServices = getAvailableServices();

  const filteredServices = useMemo(() => {
    let services = availableServices;
    const q = search.toLowerCase().trim();
    if (q) {
      services = services.filter(s => {
        const name = (s.name || '').toLowerCase();
        const desc = (s.description || '').toLowerCase();
        const matchedCat = Object.entries(CATEGORY_KEYWORDS).find(([, keywords]) =>
          keywords.some(kw => q.includes(kw) || kw.includes(q))
        );
        if (matchedCat) {
          return s.category === matchedCat[0] || name.includes(q) || desc.includes(q);
        }
        return name.includes(q) || desc.includes(q);
      });
    }
    if (selectedCategory !== 'all') {
      services = services.filter(s => s.category === selectedCategory);
    }
    return services;
  }, [availableServices, search, selectedCategory]);

  const updateScrollArrows = () => {
    const el = categoryBarRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    const el = categoryBarRef.current;
    if (!el) return;
    updateScrollArrows();
    el.addEventListener('scroll', updateScrollArrows, { passive: true });
    window.addEventListener('resize', updateScrollArrows);
    return () => {
      el.removeEventListener('scroll', updateScrollArrows);
      window.removeEventListener('resize', updateScrollArrows);
    };
  }, []);

  const scrollCategories = (dir) => {
    const el = categoryBarRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter(a => !dismissedIds.has(a.id));
  }, [announcements, dismissedIds]);

  const handleDismiss = async (id) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      const arr = [...next];
      localStorage.setItem('dismissed_announcements', JSON.stringify(arr));
      return next;
    });
    await dismissAnnouncement(id);
  };

  const totalMonthly = activeServices.reduce(
    (sum, { group }) => sum + (Number(group?.price_per_slot) || 0),
    0
  );

  const announceTypeClass = (type) => {
    const map = { info: 'info', warning: 'warning', success: 'success', urgent: 'urgent' };
    return map[type] || 'info';
  };

  return (
    <div className="fade-in">
      {visibleAnnouncements.length > 0 && (
        <div className="announcements-banner-list">
          {visibleAnnouncements.map(a => (
            <div key={a.id} className={`announcement-banner ${announceTypeClass(a.type)}`}>
              <div className="announcement-banner-content">
                <strong>{a.title}</strong>
                <span>{a.message}</span>
              </div>
              <button
                className="announcement-dismiss-btn"
                onClick={() => handleDismiss(a.id)}
                title="Dispensar"
              >
                Vi
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="page-header">
        <h1>Olá, {currentUser?.name?.split(' ')[0] || 'Usuário'}! 👋</h1>
        <p>Aqui está o resumo das suas assinaturas ativas.</p>
      </div>

      <div className="dashboard-metrics">
        <div className="metric-card highlight">
          <h3>Próximo Vencimento</h3>
          <p className="metric-value">15 de Julho</p>
          <span className="metric-subtitle">Fatura de R$ {totalMonthly.toFixed(2).replace('.', ',')}</span>
        </div>
        <div className="metric-card">
          <h3>Economia Estimada</h3>
          <p className="metric-value positive">R$ {(totalMonthly * 2).toFixed(2).replace('.', ',')}</p>
          <span className="metric-subtitle">este mês rateando</span>
        </div>
      </div>

      {/* Serviços Ativos - SEMPRE NO TOPO */}
      <section className="active-services-section">
        <div className="section-title-row">
          <h2>Minhas Assinaturas</h2>
          <Link to="/dashboard/credentials" className="btn btn-primary btn-sm">
            Ver Todas as Credenciais
          </Link>
        </div>

        {activeServices.length === 0 ? (
          <div className="empty-state">
            <p>Você ainda não possui assinaturas ativas.</p>
            <Link to="/dashboard/catalog" className="btn btn-primary">
              Explorar Catálogo
            </Link>
          </div>
        ) : (
          <div className="services-grid">
            {activeServices.map(({ service, group }) => (
              <button
                key={group.id}
                className="service-card active-service-card"
                onClick={() => navigate(`/dashboard/credentials/${service.slug || service.id}`)}
                style={{ '--service-color': service.color }}
              >
                <div className="service-icon" style={{ backgroundColor: service.color }}>
                  {service.icon_url ? (
                    <img src={service.icon_url} alt={service.name} className="service-icon-img" />
                  ) : (
                    service.icon
                  )}
                </div>
                <div className="service-info">
                  <h4>{service.fullName || service.name}</h4>
                </div>
                <span className="status active">Ativo</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Streamings Disponíveis para Assinar */}
      <section className="available-services-section">
        <div className="section-title-row">
          <h2>Streamings Disponíveis</h2>
          <Link to="/dashboard/catalog" className="btn btn-primary btn-sm">
            Ver Catálogo Completo
          </Link>
        </div>

        {/* Search + Category Filter */}
        <div className="dashboard-catalog-filters">
          <div className="dashboard-search-wrap">
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar serviço ou categoria..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="dashboard-search-clear" onClick={() => setSearch('')}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="dashboard-category-wrapper">
            {canScrollLeft && (
              <button className="dashboard-category-arrow left" onClick={() => scrollCategories(-1)}>
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="dashboard-category-bar" ref={categoryBarRef}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  className={`dashboard-category-pill ${selectedCategory === cat.key ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.key)}
                >
                  <span className="category-pill-icon">{cat.icon}</span>
                  <span className="category-pill-label">{cat.label}</span>
                </button>
              ))}
            </div>
            {canScrollRight && (
              <button className="dashboard-category-arrow right" onClick={() => scrollCategories(1)}>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="available-services-grid">
          {filteredServices.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              <p>Nenhum serviço encontrado.</p>
            </div>
          ) : (
            filteredServices.map(service => {
              const subscribed = isSubscribedToService(service.id);
              return (
                <div key={service.id} className="available-service-card">
                  <div
                    className="available-service-header"
                    style={{ backgroundColor: service.color }}
                  >
                    {service.icon_url ? (
                      <img src={service.icon_url} alt={service.name} className="available-service-logo" />
                    ) : (
                      <div className="available-service-icon">{service.icon || service.name[0]}</div>
                    )}
                  </div>
                  <div className="available-service-body">
                    <h3>{service.name}</h3>
                    <Link
                      to={`/dashboard/catalog/${service.slug || service.id}`}
                      className={`available-service-btn ${subscribed ? 'btn-subscribed' : 'btn-primary'}`}
                    >
                      {subscribed ? 'Já Assinado' : 'Ver Grupos'}
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

export default UserDashboard;
