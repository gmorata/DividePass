import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';
import './NotFound.css';

function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <AlertTriangle size={48} />
        <h1>404</h1>
        <p>Página não encontrada</p>
        <span>O endereço que você acessou não existe ou foi movido.</span>
        <Link to="/" className="btn btn-primary">
          <Home size={18} />
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
