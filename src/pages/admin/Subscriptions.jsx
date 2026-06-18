function Subscriptions() {
  return (
    <div className="fade-in">
      <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Assinaturas Matrizes</h1>
        <button className="btn btn-primary">+ Nova Conta SaaS</button>
      </div>
      <p style={{marginBottom: '1rem'}}>Aqui você cadastra as contas principais que você (SaaS) paga para as plataformas.</p>
      
      <div className="admin-card table-responsive">
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Plataforma</th>
              <th>E-mail Base</th>
              <th>Vencimento</th>
              <th>Custo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Netflix (Conta 1)</td>
              <td>net1@meusaas.com</td>
              <td>Dia 10</td>
              <td>R$ 55,90</td>
            </tr>
            <tr>
              <td>Spotify (Familia A)</td>
              <td>spot1@meusaas.com</td>
              <td>Dia 05</td>
              <td>R$ 34,90</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Subscriptions;
