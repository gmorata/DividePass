import { useState, useEffect } from 'react';
import { Search, Phone, Shield, User, MoreVertical, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Users.css';

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(search.toLowerCase()) ||
    user.email?.toLowerCase().includes(search.toLowerCase()) ||
    user.phone?.includes(search)
  );

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      try {
        if (!cancelled) setLoading(true);
        const { data, error: supabaseError } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });

        if (supabaseError) throw supabaseError;
        if (!cancelled) {
          setUsers(data || []);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fade-in users-page">
      <div className="admin-header">
        <div>
          <h1>Gestão de Usuários</h1>
          <p className="page-subtitle">{users.length} usuários cadastrados</p>
        </div>
        <button className="btn btn-primary">+ Novo Usuário</button>
      </div>

      <div className="users-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou celular..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="error-banner">
          Erro ao carregar usuários: {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Carregando usuários...</p>
        </div>
      ) : (
        <div className="users-table-card">
          <div className="table-responsive">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Contato</th>
                  <th>Permissão</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {user.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <strong>{user.name}</strong>
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="contact-cell">
                        <Phone size={14} />
                        {user.phone || 'Não informado'}
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${user.role}`}>
                        {user.role === 'admin' ? (
                          <><Shield size={12} /> Administrador</>
                        ) : (
                          <><User size={12} /> Usuário</>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${user.status}`}>
                        {user.status === 'active' ? 'Ativo' : user.status}
                      </span>
                    </td>
                    <td>
                      <span className="date-cell">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td>
                      <button className="action-btn">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && !loading && (
            <div className="empty-table">
              <p>Nenhum usuário encontrado.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Users;
