import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Play,
  Shield,
  Zap,
  Users,
  CreditCard,
  Clock,
  Lock,
  Star,
  Menu,
  X,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import './Home.css';

const services = [
  { name: 'Netflix', domain: 'netflix.com', category: 'Streaming' },
  { name: 'Spotify', domain: 'spotify.com', category: 'Música' },
  { name: 'Disney+', domain: 'disneyplus.com', category: 'Streaming' },
  { name: 'HBO Max', domain: 'max.com', category: 'Streaming' },
  { name: 'Prime Video', domain: 'primevideo.com', category: 'Streaming' },
  { name: 'YouTube Premium', domain: 'youtube.com', category: 'Streaming' },
  { name: 'Globoplay', domain: 'globoplay.globo.com', category: 'Streaming' },
  { name: 'Canva Pro', domain: 'canva.com', category: 'Produtividade' },
  { name: 'ChatGPT Plus', domain: 'chatgpt.com', category: 'IA' },
  { name: 'Microsoft 365', domain: 'office.com', category: 'Produtividade' },
  { name: 'Adobe Creative', domain: 'adobe.com', category: 'Criativo' },
  { name: 'Deezer', domain: 'deezer.com', category: 'Música' }
];

const steps = [
  {
    icon: Users,
    title: 'Crie sua conta',
    description: 'Cadastre-se gratuitamente em menos de 1 minuto e comece a economizar hoje mesmo.'
  },
  {
    icon: CreditCard,
    title: 'Escolha um plano',
    description: 'Selecione o serviço desejado e faça o pagamento de forma segura via PIX ou cartão.'
  },
  {
    icon: Lock,
    title: 'Receba as credenciais',
    description: 'Acesse suas credenciais de forma segura e criptografada diretamente na plataforma.'
  },
  {
    icon: Zap,
    title: 'Aproveite!',
    description: 'Use o serviço normalmente e economize todos os meses sem preocupações.'
  }
];

const testimonials = [
  {
    name: 'Ana Beatriz',
    role: 'Estudante',
    text: 'Consegui assinar Netflix, Spotify e Canva Pro pagando menos do que custaria uma única assinatura. Incrível!',
    rating: 5
  },
  {
    name: 'Carlos Eduardo',
    role: 'Designer',
    text: 'Uso o Adobe Creative e o ChatGPT Plus pelo DividePass. Seguro, rápido e muito mais barato.',
    rating: 5
  },
  {
    name: 'Mariana Silva',
    role: 'Analista',
    text: 'A entrega das credenciais é super rápida e o suporte sempre responde quando preciso. Recomendo demais.',
    rating: 5
  }
];

const faqs = [
  {
    question: 'É seguro compartilhar assinaturas pela DividePass?',
    answer: 'Sim! Utilizamos criptografia de ponta a ponta e processos validados para garantir que suas credenciais sejam entregues de forma segura.'
  },
  {
    question: 'Quanto tempo leva para receber as credenciais?',
    answer: 'Após a confirmação do pagamento, as credenciais são liberadas em poucos minutos diretamente no seu painel.'
  },
  {
    question: 'Posso cancelar quando quiser?',
    answer: 'Sim, você pode cancelar sua assinatura a qualquer momento. Oferecemos garantia de 7 dias para novos usuários.'
  },
  {
    question: 'Quais formas de pagamento são aceitas?',
    answer: 'Aceitamos PIX e cartão de crédito. Ambos processados por gateways de pagamento seguros e certificados.'
  }
];

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMenuOpen(false);
    }
  };

  return (
    <div className="home-container">
      <div className="ambient-light" />
      <div className="grid-pattern" />

      <header className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
        <div className="navbar-content">
          <Link to="/" className="logo">
            <span className="logo-icon">D</span>
            <span>DividePass</span>
          </Link>

          <nav className={`navbar-nav ${isMenuOpen ? 'navbar-nav-open' : ''}`}>
            <button onClick={() => scrollToSection('como-funciona')} className="nav-link">Como Funciona</button>
            <button onClick={() => scrollToSection('servicos')} className="nav-link">Serviços</button>
            <button onClick={() => scrollToSection('depoimentos')} className="nav-link">Depoimentos</button>
            <button onClick={() => scrollToSection('faq')} className="nav-link">FAQ</button>
            <div className="nav-mobile-actions">
              <Link onClick={() => setIsMenuOpen(false)} to="/login" className="btn btn-outline btn-full">
                Entrar
              </Link>
              <Link onClick={() => setIsMenuOpen(false)} to="/register" className="btn btn-primary btn-full">
                Criar Conta
              </Link>
            </div>
          </nav>

          <div className="navbar-actions">
            <ThemeToggle />
            <Link to="/login" className="btn btn-outline navbar-login-btn">
              Entrar
            </Link>
            <Link to="/register" className="btn btn-primary navbar-register-btn">
              Criar Conta
            </Link>
            <button
              className="menu-toggle"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div className="hero-badge">
            <Star size={14} fill="currentColor" />
            <span>Plataforma #1 em compartilhamento de assinaturas</span>
          </div>

          <h1 className="hero-title">
            Economize até <span className="text-gradient">75%</span> nas suas
            <br />
            assinaturas digitais
          </h1>

          <p className="hero-subtitle">
            Acesse Netflix, Spotify, Disney+, ChatGPT Plus e dezenas de outros serviços
            pagando uma fração do valor. Seguro, rápido e garantido.
          </p>

          <div className="hero-buttons">
            <Link to="/register" className="btn btn-primary btn-lg">
              Começar a Economizar
              <ArrowRight size={20} />
            </Link>
            <button onClick={() => scrollToSection('como-funciona')} className="btn btn-outline btn-lg">
              <Play size={18} fill="currentColor" />
              Ver Como Funciona
            </button>
          </div>

        </section>

        <section className="categories-section">
          <div className="section-header">
            <span className="section-tag">Categorias</span>
            <h2 className="section-title">Encontre o que procura</h2>
            <p className="section-description">
              Navegue por categorias e encontre exatamente o serviço que você precisa.
            </p>
          </div>
          <div className="categories-grid">
            {[
              { icon: '📺', label: 'Streaming', key: 'streaming' },
              { icon: '🎵', label: 'Música', key: 'musica' },
              { icon: '🤖', label: 'IA', key: 'ia' },
              { icon: '🎓', label: 'Cursos', key: 'cursos' },
              { icon: '💼', label: 'Produtividade', key: 'produtividade' },
              { icon: '🛠', label: 'Ferramentas', key: 'ferramentas' },
              { icon: '📚', label: 'Leitura', key: 'leitura' },
              { icon: '🎮', label: 'Games', key: 'games' },
              { icon: '🏋️', label: 'Saúde', key: 'saude' },
              { icon: '🔒', label: 'Segurança', key: 'seguranca' },
            ].map((cat) => (
              <Link
                key={cat.key}
                to={`/dashboard/catalog?categoria=${cat.key}`}
                className="category-card"
              >
                <span className="category-card-icon">{cat.icon}</span>
                <span className="category-card-label">{cat.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section id="servicos" className="services-section">
          <div className="section-header">
            <span className="section-tag">Serviços</span>
            <h2 className="section-title">As melhores plataformas pelo menor preço</h2>
            <p className="section-description">
              Escolha entre dezenas de serviços populares e comece a economizar hoje mesmo.
            </p>
          </div>

          <div className="lp-services-grid">
            {services.map((service) => (
              <div key={service.name} className="lp-service-card">
                <div className="lp-service-logo-wrapper">
                  <img
                    src={`https://logo.clearbit.com/${service.domain}`}
                    alt={`${service.name} logo`}
                    loading="lazy"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <span className="lp-service-fallback">{service.name[0]}</span>
                </div>
                <div className="lp-service-info">
                  <h3>{service.name}</h3>
                  <span className="lp-service-category">{service.category}</span>
                </div>
                <ChevronRight size={18} className="lp-service-arrow" />
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="how-it-works-section">
          <div className="section-header">
            <span className="section-tag">Como Funciona</span>
            <h2 className="section-title">Em 4 passos você já está economizando</h2>
            <p className="section-description">
              Processo simples, seguro e totalmente digital. Sem burocracia e sem espera.
            </p>
          </div>

          <div className="steps-grid">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={index} className="step-card">
                  <div className="step-icon">
                    <Icon size={24} />
                  </div>
                  <div className="step-number">0{index + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="features-section">
          <div className="features-grid">
            <div className="feature-block feature-block-large">
              <div className="feature-icon feature-icon-orange">
                <Shield size={28} />
              </div>
              <h3>Segurança em primeiro lugar</h3>
              <p>
                Credenciais criptografadas e processos validados para você usar seus serviços
                com total tranquilidade.
              </p>
            </div>
            <div className="feature-block">
              <div className="feature-icon feature-icon-blue">
                <Clock size={24} />
              </div>
              <h3>Entrega rápida</h3>
              <p>Receba o acesso em poucos minutos após a confirmação do pagamento.</p>
            </div>
            <div className="feature-block">
              <div className="feature-icon feature-icon-green">
                <CreditCard size={24} />
              </div>
              <h3>Pagamento facilitado</h3>
              <p>PIX ou cartão de crédito. Você escolhe a forma mais conveniente.</p>
            </div>
          </div>
        </section>

        <section id="depoimentos" className="testimonials-section">
          <div className="section-header">
            <span className="section-tag">Depoimentos</span>
            <h2 className="section-title">O que nossos usuários dizem</h2>
            <p className="section-description">
              Junte-se a milhares de pessoas que já descobriram uma nova forma de economizar.
            </p>
          </div>

          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="testimonial-card">
                <div className="testimonial-stars">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} size={16} fill="currentColor" />
                  ))}
                </div>
                <p className="testimonial-text">"{testimonial.text}"</p>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{testimonial.name[0]}</div>
                  <div>
                    <strong>{testimonial.name}</strong>
                    <span>{testimonial.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="faq-section">
          <div className="section-header">
            <span className="section-tag">FAQ</span>
            <h2 className="section-title">Dúvidas frequentes</h2>
            <p className="section-description">
              Ainda tem perguntas? Confira as respostas abaixo ou entre em contato.
            </p>
          </div>

          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className={`faq-item ${openFaq === index ? 'faq-item-open' : ''}`}
              >
                <button
                  className="faq-question"
                  onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                >
                  <HelpCircle size={20} />
                  <span>{faq.question}</span>
                  <ChevronRight
                    size={20}
                    className="faq-chevron"
                  />
                </button>
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-card">
            <div className="cta-content">
              <h2>Pronto para começar a economizar?</h2>
              <p>
                Crie sua conta gratuitamente em menos de 1 minuto e descubra quanto você pode
                economizar todos os meses.
              </p>
              <div className="cta-buttons">
                <Link to="/register" className="btn btn-primary btn-lg">
                  Criar Conta Grátis
                  <ArrowRight size={20} />
                </Link>
                <Link to="/login" className="btn btn-outline btn-lg">
                  Já tenho conta
                </Link>
              </div>
            </div>
            <div className="cta-decoration">
              <div className="cta-circle" />
              <div className="cta-circle" />
              <div className="cta-circle" />
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/" className="logo">
              <span className="logo-icon">D</span>
              <span>DividePass</span>
            </Link>
            <p>
              A maneira mais inteligente de acessar seus serviços digitais favoritos
              pagando menos.
            </p>
            <div className="footer-social">
              <a href="#" aria-label="Instagram"><span>IG</span></a>
              <a href="#" aria-label="Twitter"><span>TW</span></a>
              <a href="#" aria-label="LinkedIn"><span>LI</span></a>
            </div>
          </div>

          <div className="footer-links">
            <h4>Produto</h4>
            <button onClick={() => scrollToSection('servicos')}>Serviços</button>
            <Link to="/register">Criar Conta</Link>
          </div>

          <div className="footer-links">
            <h4>Empresa</h4>
            <button onClick={() => scrollToSection('como-funciona')}>Como Funciona</button>
            <button onClick={() => scrollToSection('depoimentos')}>Depoimentos</button>
            <button onClick={() => scrollToSection('faq')}>FAQ</button>
          </div>

          <div className="footer-links">
            <h4>Legal</h4>
            <Link to="#">Termos de Uso</Link>
            <Link to="#">Privacidade</Link>
            <Link to="#">Cookies</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} DividePass. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
