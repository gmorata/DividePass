import { useState, useEffect } from 'react';
import {
  Search, Wallet, DollarSign, Clock, Eye, ArrowLeft,
  CheckCircle, Loader2, TrendingUp, Ban
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Wallets.css';

function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [processing, setProcessing] = useState(null);

  const summary = {
    totalBalance: wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0),
    totalPaid: transactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0),
    pendingWithdrawals: withdrawals.filter(w => w.status === 'pending').length,
  };

  const filteredWallets = wallets.filter(w => {
    const user = users[w.user_id];
    if (!user) return false;
    return (
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (!cancelled) setLoading(true);
      setError('');

      try {
        const [walletsRes, transactionsRes, withdrawalsRes, usersRes] = await Promise.all([
          supabase.from('user_wallets').select('*').order('updated_at', { ascending: false }),
          supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }),
          supabase.from('wallet_withdrawals').select('*').order('requested_at', { ascending: false }),
          supabase.from('users').select('id, name, email'),
        ]);

        if (walletsRes.error) throw walletsRes.error;
        if (transactionsRes.error) throw transactionsRes.error;
        if (withdrawalsRes.error) throw withdrawalsRes.error;
        if (usersRes.error) throw usersRes.error;

        if (!cancelled) {
          setWallets(walletsRes.data || []);
          setTransactions(transactionsRes.data || []);
          setWithdrawals(withdrawalsRes.data || []);

          const usersMap = {};
          (usersRes.data || []).forEach(u => { usersMap[u.id] = u; });
          setUsers(usersMap);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => { cancelled = true; };
  }, []);

  const getUserTransactions = (userId) =>
    transactions.filter(t => t.user_id === userId);

  const getUserWithdrawals = (userId) =>
    withdrawals.filter(w => w.user_id === userId);

  const handleMarkPaid = async (withdrawal) => {
    if (!window.confirm(`Confirmar pagamento de R$ ${Number(withdrawal.amount).toFixed(2)}?`)) return;

    setProcessing(withdrawal.id);
    try {
      const { error: updateError } = await supabase
        .from('wallet_withdrawals')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);

      if (updateError) throw updateError;

      setWithdrawals(prev =>
        prev.map(w => w.id === withdrawal.id
          ? { ...w, status: 'completed', processed_at: new Date().toISOString() }
          : w
        )
      );
    } catch (err) {
      setError('Erro ao processar pagamento: ' + err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (withdrawal) => {
    if (!window.confirm(`Rejeitar saque de R$ ${Number(withdrawal.amount).toFixed(2)}?`)) return;

    setProcessing(withdrawal.id);
    try {
      const { error: updateError } = await supabase
        .from('wallet_withdrawals')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);

      if (updateError) throw updateError;

      setWithdrawals(prev =>
        prev.map(w => w.id === withdrawal.id
          ? { ...w, status: 'rejected', processed_at: new Date().toISOString() }
          : w
        )
      );
    } catch (err) {
      setError('Erro ao rejeitar saque: ' + err.message);
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (value) =>
    `R$ ${Number(value || 0).toFixed(2)}`;

  const formatDateTime = (date) =>
    date ? new Date(date).toLocaleString('pt-BR') : '—';

  const typeLabel = (type) => ({
    credit: 'Crédito',
    debit: 'Débito',
    withdrawal: 'Saque',
    refund: 'Reembolso',
    adjustment: 'Ajuste',
  }[type] || type);

  const statusLabel = (status) => ({
    pending: 'Pendente',
    completed: 'Pago',
    rejected: 'Rejeitado',
  }[status] || status);

  if (selectedUser) {
    const user = users[selectedUser.user_id] || {};
    const userTx = getUserTransactions(selectedUser.user_id);
    const userWd = getUserWithdrawals(selectedUser.user_id);

    return (
      <div className="fade-in wallets-page">
        <button className="back-btn" onClick={() => setSelectedUser(null)}>
          <ArrowLeft size={18} />
          Voltar
        </button>

        <div className="admin-header">
          <div>
            <h1>Carteira de {user.name}</h1>
            <p className="page-subtitle">{user.email}</p>
          </div>
        </div>

        <div className="wallet-detail-stats">
          <div className="stat-card">
            <Wallet size={22} />
            <div>
              <span>{formatCurrency(selectedUser.balance)}</span>
              <small>Saldo Atual</small>
            </div>
          </div>
          <div className="stat-card">
            <TrendingUp size={22} />
            <div>
              <span>{formatCurrency(selectedUser.total_earned)}</span>
              <small>Total Recebido</small>
            </div>
          </div>
        </div>

        <h2 className="section-title">Transações</h2>
        <div className="admin-card table-responsive">
          {userTx.length === 0 ? (
            <div className="empty-table"><p>Nenhuma transação encontrada.</p></div>
          ) : (
            <table className="wallets-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Descrição</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {userTx.map(tx => (
                  <tr key={tx.id}>
                    <td><span className={`type-badge ${tx.type}`}>{typeLabel(tx.type)}</span></td>
                    <td><strong className={tx.type === 'credit' ? 'text-success' : 'text-danger'}>
                      {tx.type === 'credit' ? '+' : '-'} {formatCurrency(tx.amount)}
                    </strong></td>
                    <td>{tx.description || '—'}</td>
                    <td><span className={`status-badge ${tx.status}`}>{statusLabel(tx.status)}</span></td>
                    <td><span className="date-cell">{formatDateTime(tx.created_at)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <h2 className="section-title">Saques</h2>
        <div className="admin-card table-responsive">
          {userWd.length === 0 ? (
            <div className="empty-table"><p>Nenhum saque encontrado.</p></div>
          ) : (
            <table className="wallets-table">
              <thead>
                <tr>
                  <th>Valor</th>
                  <th>Método</th>
                  <th>Status</th>
                  <th>Solicitado em</th>
                  <th>Pago em</th>
                </tr>
              </thead>
              <tbody>
                {userWd.map(wd => (
                  <tr key={wd.id}>
                    <td><strong>{formatCurrency(wd.amount)}</strong></td>
                    <td>{wd.payment_method || '—'}</td>
                    <td><span className={`status-badge ${wd.status}`}>{statusLabel(wd.status)}</span></td>
                    <td><span className="date-cell">{formatDateTime(wd.requested_at)}</span></td>
                    <td><span className="date-cell">{formatDateTime(wd.processed_at)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in wallets-page">
      <div className="admin-header">
        <div>
          <h1>Gestão de Carteiras</h1>
          <p className="page-subtitle">{wallets.length} carteiras cadastradas</p>
        </div>
      </div>

      <div className="wallets-stats">
        <div className="stat-card">
          <Wallet size={22} />
          <div>
            <span>{formatCurrency(summary.totalBalance)}</span>
            <small>Saldo Total</small>
          </div>
        </div>
        <div className="stat-card">
          <DollarSign size={22} />
          <div>
            <span>{formatCurrency(summary.totalPaid)}</span>
            <small>Total Pago</small>
          </div>
        </div>
        <div className="stat-card">
          <Clock size={22} />
          <div>
            <span>{summary.pendingWithdrawals}</span>
            <small>Saques Pendentes</small>
          </div>
        </div>
      </div>

      <div className="wallets-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error-banner">Erro: {error}</div>}

      {loading ? (
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>Carregando carteiras...</p>
        </div>
      ) : (
        <>
          {pendingWithdrawals.length > 0 && (
            <>
              <h2 className="section-title">
                <Clock size={20} />
                Saques Pendentes ({pendingWithdrawals.length})
              </h2>
              <div className="admin-card table-responsive">
                <table className="wallets-table">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Valor</th>
                      <th>Data</th>
                      <th>Pagamento</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingWithdrawals.map(wd => (
                      <tr key={wd.id}>
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar">
                              {(users[wd.user_id]?.name || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <strong>{users[wd.user_id]?.name || '—'}</strong>
                              <span>{users[wd.user_id]?.email || '—'}</span>
                            </div>
                          </div>
                        </td>
                        <td><strong>{formatCurrency(wd.amount)}</strong></td>
                        <td><span className="date-cell">{formatDateTime(wd.requested_at)}</span></td>
                        <td>{wd.payment_method || '—'}</td>
                        <td>
                          <div className="actions-cell">
                            <button
                              className="action-btn success"
                              onClick={() => handleMarkPaid(wd)}
                              disabled={processing === wd.id}
                              title="Marcar como Pago"
                            >
                              {processing === wd.id ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />}
                            </button>
                            <button
                              className="action-btn danger"
                              onClick={() => handleReject(wd)}
                              disabled={processing === wd.id}
                              title="Rejeitar"
                            >
                              <Ban size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className="section-title">Todas as Carteiras</h2>
          <div className="admin-card table-responsive">
            <table className="wallets-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Saldo</th>
                  <th>Total Recebido</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredWallets.map(wallet => {
                  const user = users[wallet.user_id] || {};
                  return (
                    <tr key={wallet.user_id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar">
                            {(user.name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <strong>{user.name || '—'}</strong>
                            <span>{user.email || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td><strong>{formatCurrency(wallet.balance)}</strong></td>
                      <td>{formatCurrency(wallet.total_earned)}</td>
                      <td>
                        <button
                          className="action-btn"
                          onClick={() => setSelectedUser(wallet)}
                          title="Ver detalhes"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredWallets.length === 0 && !loading && (
              <div className="empty-table">
                <p>Nenhuma carteira encontrada.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Wallets;
