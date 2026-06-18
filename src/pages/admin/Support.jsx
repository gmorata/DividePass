function Support() {
  return (
    <div className="fade-in">
      <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>Suporte e Tickets 🛎️</h1>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <select className="form-group" style={{padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc'}}>
            <option>Todos os Tickets</option>
            <option>Abertos</option>
            <option>Resolvidos</option>
          </select>
        </div>
      </div>

      <div className="admin-card table-responsive">
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Ticket #</th>
              <th>Usuário</th>
              <th>Assunto</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1042</strong></td>
              <td>João da Silva</td>
              <td>Senha da Netflix não funciona</td>
              <td><span className="status-badge pendente">Aberto</span></td>
              <td><button className="btn btn-outline" style={{padding: '0.25rem 0.5rem'}}>Responder</button></td>
            </tr>
            <tr>
              <td><strong>1041</strong></td>
              <td>Maria Souza</td>
              <td>Dúvida sobre renovação do plano</td>
              <td><span className="status-badge pago">Resolvido</span></td>
              <td><button className="btn btn-outline" style={{padding: '0.25rem 0.5rem'}}>Ver Histórico</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Support;
