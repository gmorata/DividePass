import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Settings, Trash2, Crown, Globe } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import './MyGroups.css';

function MyGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('groups')
        .select(`
          *,
          service:service_id (id, name, full_name, icon, icon_url, color, slug),
          members:group_members (id, status)
        `)
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      setGroups(data || []);
      setLoading(false);
    })();
  }, [user]);

  const handleDelete = async (groupId) => {
    if (!window.confirm('Tem certeza que deseja excluir este grupo? Esta ação não pode ser desfeita.')) return;
    if (!window.confirm('Última chance: realmente excluir o grupo?')) return;

    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (!error) {
      setGroups(prev => prev.filter(g => g.id !== groupId));
    }
  };

  if (loading) {
    return <div className="fade-in my-groups-page"><p>Carregando seus grupos...</p></div>;
  }

  return (
    <div className="fade-in my-groups-page">
      <div className="page-header-row">
        <div>
          <h1>Meus Grupos</h1>
          <p>Grupos que você criou e gerencia.</p>
        </div>
        <Link to="/dashboard/my-groups/create" className="btn btn-primary">
          <Plus size={18} />
          Criar Grupo
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <Globe size={48} />
          <h2>Nenhum grupo criado</h2>
          <p>Crie seu primeiro grupo e comece a compartilhar assinaturas.</p>
          <Link to="/dashboard/my-groups/create" className="btn btn-primary">
            <Plus size={18} />
            Criar Primeiro Grupo
          </Link>
        </div>
      ) : (
        <div className="my-groups-grid">
          {groups.map(group => {
            const activeMembers = group.members?.filter(m => m.status === 'active').length || 0;
            return (
              <div key={group.id} className="my-group-card">
                <div className="my-group-header" style={{ backgroundColor: `${group.service?.color}15` }}>
                  <div className="my-group-service">
                    <div className="my-group-icon" style={{ backgroundColor: group.service?.color }}>
                      {group.service?.icon_url ? (
                        <img src={group.service.icon_url} alt="" />
                      ) : (
                        group.service?.icon
                      )}
                    </div>
                    <div>
                      <h3>{group.name}</h3>
                      <span className="my-group-platform">{group.service?.full_name || group.service?.name}</span>
                    </div>
                  </div>
                  <span className={`my-group-status ${group.status}`}>{group.status === 'open' ? 'Aberto' : group.status === 'forming' ? 'Formando' : 'Fechado'}</span>
                </div>
                <div className="my-group-body">
                  <div className="my-group-stats">
                    <div className="my-group-stat">
                      <Users size={16} />
                      <span>{activeMembers}/{group.max_size || '∞'} membros</span>
                    </div>
                    <div className="my-group-stat">
                      <Crown size={16} />
                      <span>R$ {parseFloat(group.price_per_slot || 0).toFixed(2)}/mês</span>
                    </div>
                  </div>
                  <div className="my-group-actions">
                    <Link to={`/dashboard/my-groups/${group.id}/manage`} className="btn btn-outline btn-sm">
                      <Settings size={15} />
                      Gerenciar
                    </Link>
                    <button className="btn btn-sm btn-danger-outline" onClick={() => handleDelete(group.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MyGroups;
