function Announcements() {
  return (
    <div className="fade-in">
      <div className="admin-header">
        <h1>Avisos Globais 📢</h1>
        <p>Publique avisos que aparecerão no dashboard de todos os clientes.</p>
      </div>

      <div className="admin-card" style={{ marginBottom: '2rem' }}>
        <h2>Criar Novo Aviso</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <input 
            type="text" 
            placeholder="Título do Aviso" 
            style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc' }} 
          />
          <textarea 
            placeholder="Mensagem do aviso..." 
            style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc', minHeight: '100px', resize: 'vertical' }} 
          />
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc' }}>
              <option>Tipo: Informativo (Azul)</option>
              <option>Tipo: Urgente (Vermelho)</option>
              <option>Tipo: Sucesso (Verde)</option>
            </select>
            <button className="btn btn-primary">Publicar Aviso</button>
          </div>
        </div>
      </div>

      <div className="admin-card table-responsive">
        <h2>Avisos Publicados</h2>
        <table className="invoice-table" style={{marginTop: '1rem'}}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Hoje, 10:30</td>
              <td>Manutenção programada na Netflix</td>
              <td><span className="status-badge pendente">Informativo</span></td>
              <td><button className="btn btn-outline" style={{padding: '0.25rem 0.5rem', color: '#EF4444', borderColor: '#EF4444'}}>Excluir</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Announcements;
