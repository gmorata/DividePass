import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import ThemeToggle from '../../components/ThemeToggle';
import logoImg from '../../assets/logo.png';
import './AdminLayout.css';

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async (e) => {
    e.preventDefault();
    await signOut();
    navigate('/');
  };

  return (
    <div className="admin-layout">
      {/* Botão Mobile Admin */}
      <button className="admin-mobile-btn" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? '✕' : '☰'}
      </button>

      {menuOpen && <div className="admin-mobile-overlay" onClick={closeMenu}></div>}

      <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
        <Link to="/admin" className="admin-logo">
          <img src={logoImg} alt="DP" className="admin-logo-img" />
          <span>Admin</span>
        </Link>
        <nav className="admin-nav">
          <Link onClick={closeMenu} to="/admin" className={`nav-item ${isActive('/admin')}`}>Dashboard</Link>
          <Link onClick={closeMenu} to="/admin/users" className={`nav-item ${isActive('/admin/users')}`}>Usuários</Link>
          <Link onClick={closeMenu} to="/admin/platforms" className={`nav-item ${isActive('/admin/platforms')}`}>Plataformas</Link>
          <Link onClick={closeMenu} to="/admin/subscriptions" className={`nav-item ${isActive('/admin/subscriptions')}`}>Assinaturas SaaS</Link>
          <Link onClick={closeMenu} to="/admin/groups" className={`nav-item ${isActive('/admin/groups')}`}>Grupos/Rateios</Link>
          <Link onClick={closeMenu} to="/admin/interest" className={`nav-item ${isActive('/admin/interest')}`}>Lista de Espera 📋</Link>
          <Link onClick={closeMenu} to="/admin/credentials" className={`nav-item ${isActive('/admin/credentials')}`}>Credenciais/Senhas</Link>
          <Link onClick={closeMenu} to="/admin/support" className={`nav-item ${isActive('/admin/support')}`}>Suporte 🛎️</Link>
          <Link onClick={closeMenu} to="/admin/announcements" className={`nav-item ${isActive('/admin/announcements')}`}>Avisos 📢</Link>
        </nav>
        <div className="admin-footer">
          <ThemeToggle className="sidebar-theme-toggle" />
          <button onClick={handleLogout} className="nav-item logout">Sair do Painel</button>
        </div>
      </aside>
      
      <main className="admin-content">
        <header className="admin-topbar">
          <div className="search-bar">
            <input type="text" placeholder="Buscar..." />
          </div>
          <div className="admin-profile">
            <span className="admin-name">Administrador</span>
            <div className="admin-avatar">A</div>
          </div>
        </header>
        <div className="admin-page-wrap">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AdminLayout;
