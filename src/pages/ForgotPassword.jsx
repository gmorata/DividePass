import { useState } from 'react';
import { Link } from 'react-router-dom';
import './ForgotPassword.css';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Password reset requested for', email);
    setSubmitted(true);
  };

  return (
    <div className="forgot-container">
      <div className="forgot-card">
        <div className="forgot-header">
          <h2>Recuperar Senha</h2>
          <p>Enviaremos instruções para o seu e-mail</p>
        </div>
        
        {!submitted ? (
          <form onSubmit={handleSubmit} className="forgot-form">
            <div className="form-group">
              <label htmlFor="email">E-mail cadastrado</label>
              <input 
                type="email" 
                id="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required 
              />
            </div>
            
            <button type="submit" className="btn btn-primary btn-full">
              Enviar Link
            </button>
          </form>
        ) : (
          <div className="success-message">
            <div className="icon-circle">✓</div>
            <h3>E-mail enviado!</h3>
            <p>Verifique sua caixa de entrada para redefinir sua senha.</p>
          </div>
        )}
        
        <div className="forgot-footer">
          <p>Lembrou a senha? <Link to="/login">Voltar para Login</Link></p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
