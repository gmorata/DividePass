import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppDataContext } from '../../contexts/AppDataContext';
import { useAuth } from '../../hooks/useAuth';
import ThemeToggle from '../../components/ThemeToggle';
import './UserLayout.css';

function UserLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { currentUser, getActiveServices } = useAppDataContext();
  const { signOut } = useAuth();

  const activeCount = getActiveServices().length;

  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === path ? 'active' : '';
    }
    return location.pathname.startsWith(path) ? 'active' : '';
  };

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="layout-container">
      {/* Botão Mobile */}
      <button className="mobile-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? '✕' : '☰'}
      </button>

      {/* Overlay para escurecer o fundo no mobile */}
      {menuOpen && <div className="mobile-overlay" onClick={closeMenu}></div>}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="logo">Divide<span>Pass</span></div>
        <nav className="nav-menu">
          <Link onClick={closeMenu} to="/dashboard" className={`nav-item ${isActive('/dashboard')}`}>Visão Geral</Link>
          <Link onClick={closeMenu} to="/dashboard/catalog" className={`nav-item ${isActive('/dashboard/catalog')}`}>Catálogo</Link>
          <Link onClick={closeMenu} to="/dashboard/credentials" className={`nav-item ${isActive('/dashboard/credentials')}`}>Minhas Credenciais</Link>
          <Link onClick={closeMenu} to="/dashboard/billing" className={`nav-item ${isActive('/dashboard/billing')}`}>Financeiro</Link>
          <Link onClick={closeMenu} to="/dashboard/support" className={`nav-item ${isActive('/dashboard/support')}`}>Suporte</Link>
          <Link onClick={closeMenu} to="/dashboard/share" className={`nav-item ${isActive('/dashboard/share')}`}>Convidar Amigos</Link>
        </nav>
          <div className="sidebar-footer">
          <div className="user-info">
            <div className="avatar">{currentUser?.name?.[0] || 'U'}</div>
            <div className="user-details">
              <strong>{currentUser?.name || 'Usuário'}</strong>
              <span>{activeCount} {activeCount === 1 ? 'assinatura ativa' : 'assinaturas ativas'}</span>
            </div>
          </div>
          <div className="sidebar-theme-row">
            <ThemeToggle className="sidebar-theme-toggle" />
          </div>
          <button onClick={handleLogout} className="nav-item logout" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none' }}>
            Sair
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default UserLayout;
