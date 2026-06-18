import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import './Billing.css';

function Billing() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const { data, error: supabaseError } = await supabase
          .from('invoices')
          .select('*')
          .eq('user_id', user.id)
          .order('due_date', { ascending: false });

        if (supabaseError) throw supabaseError;
        setInvoices(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [user]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'paid':
      case 'pago':
        return 'pago';
      case 'pending':
      case 'pendente':
        return 'pendente';
      case 'overdue':
      case 'vencido':
        return 'vencido';
      default:
        return status;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'paid':
      case 'pago':
        return 'Pago';
      case 'pending':
      case 'pendente':
        return 'Pendente';
      case 'overdue':
      case 'vencido':
        return 'Vencido';
      default:
        return status;
    }
  };

  return (
    <div className="fade-in billing-page">
      <div className="page-header">
        <h1>Financeiro 💳</h1>
        <p>Acompanhe seus pagamentos e faturas.</p>
      </div>

      <div className="billing-content">
        <div className="payment-methods">
          <h2>Forma de Pagamento Atual</h2>
          <div className="card-box">
            <div className="card-info">
              <span className="card-brand">PIX</span>
              <p>Pagamento mensal via chave Pix.</p>
            </div>
            <button className="btn btn-outline">Alterar</button>
          </div>
        </div>

        <div className="invoice-history">
          <h2>Histórico de Faturas</h2>
          <div className="table-responsive">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="loading-cell">Carregando faturas...</td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="5" className="error-cell">Erro ao carregar faturas: {error}</td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-cell">Nenhuma fatura encontrada.</td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td><strong>#{inv.id.slice(0, 8).toUpperCase()}</strong></td>
                      <td>{formatDate(inv.due_date)}</td>
                      <td>{formatCurrency(inv.amount)}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(inv.status)}`}>
                          {getStatusLabel(inv.status)}
                        </span>
                      </td>
                      <td>
                        {inv.status === 'pending' || inv.status === 'pendente' ? (
                          <button className="btn btn-primary pay-btn">Pagar</button>
                        ) : (
                          <button className="btn btn-outline pay-btn">Recibo</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Billing;
