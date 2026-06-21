import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { X, Calendar, CreditCard, CheckCircle, Clock, AlertCircle, Receipt } from 'lucide-react';
import './Billing.css';

function Billing() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const [invoicesRes, subscriptionsRes] = await Promise.all([
          supabase
            .from('invoices')
            .select('*')
            .eq('user_id', user.id)
            .order('due_date', { ascending: false }),
          supabase
            .from('user_subscriptions')
            .select(`
              *,
              group:group_id (name),
              service:service_id (name, full_name, icon, color)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        ]);

        if (invoicesRes.error) throw invoicesRes.error;
        if (subscriptionsRes.error) throw subscriptionsRes.error;

        setInvoices(invoicesRes.data || []);
        setSubscriptions(subscriptionsRes.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');

  return (
    <div className="fade-in billing-page">
      <div className="page-header">
        <h1>Financeiro 💳</h1>
        <p>Acompanhe suas assinaturas e faturas.</p>
      </div>

      <div className="billing-content">
        <div className="billing-subscriptions">
          <h2>Assinaturas Ativas</h2>
          {activeSubscriptions.length === 0 ? (
            <div className="billing-empty">
              <p>Você não tem assinaturas ativas.</p>
            </div>
          ) : (
            <div className="billing-subscriptions-grid">
              {activeSubscriptions.map((sub) => (
                <div key={sub.id} className="billing-sub-card">
                  <div
                    className="billing-sub-icon"
                    style={{ backgroundColor: sub.service?.color || '#FF6B00' }}
                  >
                    {sub.service?.icon || 'S'}
                  </div>
                  <div className="billing-sub-info">
                    <h4>{sub.service?.name || sub.service?.full_name || 'Serviço'}</h4>
                    <p>{sub.group?.name || 'Grupo'}</p>
                    <span className="billing-sub-price">{formatCurrency(sub.amount)}/mês</span>
                  </div>
                  <span className="status-badge pago">Ativa</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="invoice-history">
          <h2>Histórico de Faturas</h2>
          <div className="table-responsive">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Vencimento</th>
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
                        <button
                          className="btn btn-primary btn-sm pay-btn"
                          onClick={() => setSelectedInvoice(inv)}
                        >
                          <Receipt size={16} />
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedInvoice && (
        <div className="invoice-modal-overlay" onClick={() => setSelectedInvoice(null)}>
          <div className="invoice-modal" onClick={(e) => e.stopPropagation()}>
            <button className="invoice-modal-close" onClick={() => setSelectedInvoice(null)}>
              <X size={20} />
            </button>
            <div className="invoice-modal-header">
              <Receipt size={28} />
              <div>
                <h3>Fatura #{selectedInvoice.id.slice(0, 8).toUpperCase()}</h3>
                <p>{getStatusLabel(selectedInvoice.status)}</p>
              </div>
            </div>
            <div className="invoice-modal-body">
              <div className="invoice-modal-row">
                <Calendar size={18} />
                <span>Vencimento</span>
                <strong>{formatDate(selectedInvoice.due_date)}</strong>
              </div>
              <div className="invoice-modal-row">
                <CreditCard size={18} />
                <span>Valor</span>
                <strong>{formatCurrency(selectedInvoice.amount)}</strong>
              </div>
              {selectedInvoice.paid_at && (
                <div className="invoice-modal-row">
                  <CheckCircle size={18} />
                  <span>Pago em</span>
                  <strong>{formatDate(selectedInvoice.paid_at)}</strong>
                </div>
              )}
              {selectedInvoice.status === 'pending' && (
                <div className="invoice-modal-row pending">
                  <Clock size={18} />
                  <span>Aguardando pagamento</span>
                </div>
              )}
              {selectedInvoice.status === 'overdue' && (
                <div className="invoice-modal-row overdue">
                  <AlertCircle size={18} />
                  <span>Fatura vencida. Regularize para manter o acesso.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Billing;
