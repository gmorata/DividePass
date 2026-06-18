function AdminDashboard() {
  return (
    <div className="fade-in">
      <div className="admin-header">
        <h1>Dashboard Geral</h1>
      </div>

      <div className="dashboard-metrics">
        <div className="admin-card">
          <h3>Receita Mensal (Estimada)</h3>
          <p className="metric-value positive">R$ 5.430,00</p>
        </div>
        <div className="admin-card">
          <h3>Custo Assinaturas (Fonte)</h3>
          <p className="metric-value negative">R$ 1.850,00</p>
        </div>
        <div className="admin-card">
          <h3>Lucro Líquido</h3>
          <p className="metric-value success">R$ 3.580,00</p>
        </div>
        <div className="admin-card">
          <h3>Usuários Ativos</h3>
          <p className="metric-value">142</p>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: '2rem' }}>
        <h3>Atividades Recentes no SaaS</h3>
        <ul style={{ marginTop: '1rem', lineHeight: '2' }}>
          <li>👤 Novo usuário <strong>Maria Souza</strong> se cadastrou.</li>
          <li>✅ Pagamento de <strong>João da Silva</strong> confirmado (Pix).</li>
          <li>⚠️ Assinatura <strong>Netflix #04</strong> vence em 2 dias. Atualize o cartão!</li>
        </ul>
      </div>
    </div>
  );
}

export default AdminDashboard;
