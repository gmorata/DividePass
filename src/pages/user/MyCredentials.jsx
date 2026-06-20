import { Link, useNavigate } from 'react-router-dom';
import { Lock, ChevronRight } from 'lucide-react';
import { useAppDataContext } from '../../contexts/AppDataContext';
import './MyCredentials.css';

function MyCredentials() {
  const navigate = useNavigate();
  const { getActiveServices } = useAppDataContext();

  const activeServices = getActiveServices();

  return (
    <div className="fade-in credentials-page">
      <div className="page-header">
        <h1>Minhas Credenciais 🔐</h1>
        <p>Acesse os dados de login das suas assinaturas ativas.</p>
      </div>

      {activeServices.length === 0 ? (
        <div className="empty-credentials">
          <Lock size={48} />
          <h2>Nenhuma credencial disponível</h2>
          <p>
            Você ainda não possui assinaturas ativas. Assine um serviço para visualizar as
            credenciais.
          </p>
          <Link to="/dashboard/catalog" className="btn btn-primary">
            Explorar Catálogo
          </Link>
        </div>
      ) : (
        <div className="credentials-list">
          {activeServices.map(({ service, group }) => (
            <button
              key={group.id}
              className="credential-list-card"
              onClick={() => navigate(`/dashboard/credentials/${service.slug || service.id}`)}
              style={{ '--service-color': service.color }}
            >
              <div className="credential-list-icon" style={{ backgroundColor: service.color }}>
                {service.icon}
              </div>
              <div className="credential-list-info">
                <h3>{service.full_name || service.fullName || service.name}</h3>
                <p>{group.name}{group.credentials?.[0]?.profile_assignment ? ` • ${group.credentials[0].profile_assignment}` : ''}</p>
              </div>
              <span className="credential-list-action">
                Acessar
                <ChevronRight size={18} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyCredentials;
