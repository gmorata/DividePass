import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Shield, Users, ChevronDown, ChevronUp, Star, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import './GroupDetail.css';

const CYCLE_LABELS = {
  monthly: 'mês',
  quarterly: 'trimestre',
  semiannual: 'semestre',
  annual: 'ano',
};

const FAQ_ITEMS = [
  { q: 'Quando terei acesso ao serviço?', a: 'Após a confirmação do pagamento, você receberá as credenciais de acesso por e-mail ou diretamente no painel de credenciais da plataforma.' },
  { q: 'Quais as formas de pagamento aceitas?', a: 'Aceitamos PIX, cartão de crédito e boleto bancário via Mercado Pago.' },
  { q: 'O que é caução?', a: 'Caução é uma garantia financeira cobrada em alguns grupos para assegurar o comprometimento dos membros. O valor é devolvido ao final do período.' },
  { q: 'Com quem posso dividir uma assinatura?', a: 'Você pode dividir com familiares, amigos ou conhecidos. O importante é que todos os membros respeitem as regras do grupo.' },
];

function GroupDetail() {
  const { groupSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [service, setService] = useState(null);
  const [members, setMembers] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openSections, setOpenSections] = useState({
    about: true,
    loyalty: false,
    members: true,
    faq: false,
  });

  useEffect(() => {
    const load = async () => {
      const QUERY = `
        *,
        service:service_id (*),
        members:group_members (*, user:user_id (id, name, avatar_url, created_at)),
        owner:owner_id (id, name, avatar_url, created_at, email, role)
      `;

      let data;

      const { data: bySlug } = await supabase
        .from('groups')
        .select(QUERY)
        .eq('slug', groupSlug)
        .maybeSingle();

      if (bySlug) {
        data = bySlug;
      } else {
        const { data: byId } = await supabase
          .from('groups')
          .select(QUERY)
          .eq('id', groupSlug)
          .maybeSingle();
        data = byId;
      }

      if (!data) {
        setError('Grupo não encontrado.');
        setLoading(false);
        return;
      }

      setGroup(data);
      setService(data.service);
      setMembers(data.members?.filter(m => m.status === 'active') || []);
      setOwner(data.owner);
      setLoading(false);
    };

    load();
  }, [groupSlug]);

  useEffect(() => {
    if (owner || !group) return;
    const fetchAdmin = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, name, avatar_url, role')
        .limit(1)
        .maybeSingle();
      if (data) setOwner(data);
    };
    fetchAdmin();
  }, [group, owner]);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const activeMembers = members.length;
  const maxMembers = group?.max_size || service?.max_group_size || 4;
  const spots = Math.max(0, maxMembers - activeMembers);
  const isFull = spots === 0;
  const isMember = user && members.some(m => m.user?.id === user.id);

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={32} className="spin" />
        <p>Carregando detalhes do grupo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fade-in group-detail-page">
        <button onClick={() => navigate(-1)} className="back-btn">
          <ArrowLeft size={18} /> Voltar
        </button>
        <div className="empty-state">
          <AlertCircle size={48} style={{ color: 'var(--text-soft)', margin: '0 auto 1rem' }} />
          <p>{error}</p>
          <Link to="/dashboard/catalog" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Ver Catálogo
          </Link>
        </div>
      </div>
    );
  }

  const price = Number(group?.price_per_slot) || 0;
  const cycle = group?.billing_cycle || 'monthly';

  return (
    <div className="fade-in group-detail-page">
      <button onClick={() => navigate(-1)} className="back-btn">
        <ArrowLeft size={18} /> Voltar
      </button>

      {/* Header */}
      <div className="gd-header">
        <div className="gd-header-service" style={{ backgroundColor: service?.color }}>
          {service?.icon_url ? (
            <img src={service.icon_url} alt={service.name} className="gd-service-logo" />
          ) : (
            <span className="gd-service-icon-text">{service?.icon || service?.name?.[0]}</span>
          )}
        </div>
        <div className="gd-header-info">
          <h1>{group?.name || service?.name}</h1>
          <p className="gd-header-sub">{service?.full_name || service?.name}</p>
          <div className="gd-header-tags">
            {group?.verified && (
              <span className="gd-badge verified">
                <Shield size={12} /> Verificado
              </span>
            )}
            <span className={`gd-badge status ${group?.status}`}>
              {group?.status === 'open' ? 'Aberto' : group?.status === 'forming' ? 'Formando' : 'Fechado'}
            </span>
            <span className="gd-badge spots">
              <Users size={12} /> {spots > 0 ? `${spots} vaga${spots > 1 ? 's' : ''}` : 'Lotado'}
            </span>
          </div>
        </div>
        <div className="gd-header-price">
          <span className="gd-price-value">R$ {price.toFixed(2).replace('.', ',')}</span>
          <span className="gd-price-cycle">/ {CYCLE_LABELS[cycle] || cycle}</span>
        </div>
      </div>

      {/* CTA Button */}
      <div className="gd-cta">
        {isMember ? (
          <Link to={`/dashboard/credentials/${service?.slug || service?.id}`} className="btn btn-primary gd-cta-btn">
            <CheckCircle2 size={18} /> Acessar Credenciais
          </Link>
        ) : isFull ? (
          <button className="btn btn-outline gd-cta-btn" disabled>
            Grupo Lotado
          </button>
        ) : (
          <Link to={`/dashboard/checkout/${group?.slug || group?.id}`} className="btn btn-primary gd-cta-btn">
            Entrar no Grupo
          </Link>
        )}
      </div>

      {/* About the Group */}
      <div className="gd-section">
        <button className="gd-section-header" onClick={() => toggleSection('about')}>
          <h2>Sobre o grupo</h2>
          {openSections.about ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {openSections.about && (
          <div className="gd-section-body">
            {group?.verified && (
              <div className="gd-badge-row">
                <div className="gd-seal">
                  <Star size={16} />
                </div>
                <span>Grupo verificado pelo DividePass</span>
              </div>
            )}

            {group?.description || service?.description ? (
              <>
                <h3>Descrição</h3>
                <p>{group?.description || service?.description}</p>
              </>
            ) : null}

            {group?.rules && (
              <>
                <h3>Regrinhas</h3>
                <div className="gd-rules">
                  {group.rules.split('\n').map((rule, i) => (
                    <p key={i}>{rule}</p>
                  ))}
                </div>
              </>
            )}

            <h3>Outras informações</h3>
            <p className="gd-meta">
              {service?.full_name || service?.name}
              {group?.has_slot_limit === false && <span className="gd-unlimited">Vagas ilimitadas</span>}
            </p>

            <h3>Situação</h3>
            <p>
              {group?.status === 'open' && 'O grupo está ativo e existem vagas disponíveis.'}
              {group?.status === 'forming' && 'O grupo está em formação. Aguarde a confirmação dos membros.'}
              {group?.status === 'closed' && 'O grupo está fechado para novos membros.'}
            </p>
          </div>
        )}
      </div>

      {/* Loyalty Section */}
      <div className="gd-section">
        <button className="gd-section-header" onClick={() => toggleSection('loyalty')}>
          <h2>Sobre fidelidade de grupo</h2>
          {openSections.loyalty ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {openSections.loyalty && (
          <div className="gd-section-body">
            <p className="gd-loyalty-intro">
              Grupos com <strong>Fidelidade</strong> oferecem uma experiência exclusiva e vantajosa
              para os participantes. Nessa modalidade, os administradores assumem o compromisso
              de manter o grupo ativo, enquanto os membros concordam em permanecer no grupo por
              um período determinado.
            </p>
            <ul className="gd-loyalty-list">
              <li>Tanto o administrador quanto os membros do grupo assumem um <strong>compromisso mútuo</strong> de manter o grupo por um período fixo;</li>
              <li>Durante o período de fidelidade, nem os membros e nem o administrador podem <strong>cancelar</strong> a inscrição ou o grupo, exceto em casos excepcionais;</li>
              <li>A <strong>renovação de fidelidade</strong> acontece <strong>automaticamente</strong> no final do período estabelecido pelo administrador.</li>
            </ul>
            {group?.status === 'open' && (
              <div className="gd-loyalty-notice">
                <AlertCircle size={16} />
                <div>
                  <strong>Atenção!</strong>
                  <p>Este grupo já está ativo. A fidelidade dele será renovada automaticamente.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Members Section */}
      <div className="gd-section">
        <button className="gd-section-header" onClick={() => toggleSection('members')}>
          <h2>Quem faz parte</h2>
          {openSections.members ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {openSections.members && (
          <div className="gd-section-body">
            <div className="gd-members-grid">
              {members.map(member => (
                <Link
                  key={member.id}
                  to={`/dashboard/user/${member.user?.id}`}
                  className="gd-member"
                >
                  {member.user?.avatar_url ? (
                    <img src={member.user.avatar_url} alt={member.user.name} className="gd-member-avatar" />
                  ) : (
                    <div className="gd-member-avatar-placeholder">
                      {(member.user?.name || member.profile_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="gd-member-name">
                    {member.profile_name || member.user?.name || 'Membro'}
                  </span>
                </Link>
              ))}
              {members.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nenhum membro ainda.</p>
              )}
            </div>

            {/* Criado por */}
            {owner && (
              <Link to={`/dashboard/user/${owner.id}`} className={`gd-created-by ${owner.role === 'admin' ? 'official' : ''}`}>
                <span className="gd-created-by-label">Criado por:</span>
                <div className="gd-created-by-profile">
                  {owner.avatar_url ? (
                    <img src={owner.avatar_url} alt={owner.name} className="gd-created-by-avatar" />
                  ) : (
                    <div className="gd-created-by-avatar-placeholder">
                      {owner.role === 'admin' ? 'DP' : (owner.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="gd-created-by-name">{owner.role === 'admin' ? 'DividePass' : (owner.name || 'Administrador')}</span>
                  {owner.role === 'admin' && <span className="gd-official-seal">✓ Oficial</span>}
                </div>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div className="gd-section">
        <button className="gd-section-header" onClick={() => toggleSection('faq')}>
          <h2>Dúvidas frequentes</h2>
          {openSections.faq ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {openSections.faq && (
          <div className="gd-section-body">
            <div className="gd-faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <FaqItem key={i} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="gd-bottom-cta">
        {isMember ? (
          <Link to={`/dashboard/credentials/${service?.slug || service?.id}`} className="btn btn-primary gd-cta-btn">
            Acessar Credenciais
          </Link>
        ) : isFull ? (
          <button className="btn btn-outline gd-cta-btn" disabled>Grupo Lotado</button>
        ) : (
          <Link to={`/dashboard/checkout/${group?.slug || group?.id}`} className="btn btn-primary gd-cta-btn">
            Entrar no Grupo — R$ {price.toFixed(2).replace('.', ',')} / {CYCLE_LABELS[cycle] || cycle}
          </Link>
        )}
      </div>
    </div>
  );
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`gd-faq-item ${open ? 'open' : ''}`}>
      <button className="gd-faq-question" onClick={() => setOpen(!open)}>
        <span>{question}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="gd-faq-answer"><p>{answer}</p></div>}
    </div>
  );
}

export default GroupDetail;
