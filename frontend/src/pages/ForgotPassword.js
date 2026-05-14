import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import './Login.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { resetPassword } = useAuthContext();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Digite um e-mail válido');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setError('Nenhuma conta encontrada com este e-mail');
      } else {
        setError('Erro ao enviar o e-mail. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img className="login-logo-icon" src="/assets/logo/venpro-logo-icon.svg" alt="Venpro" />
            <span className="login-logo-word">Venpro</span>
          </div>
          <p className="login-subtitle">Recuperar senha</p>
        </div>

        {sent ? (
          <div style={{
            background: 'rgba(46, 204, 138, 0.1)',
            border: '1px solid rgba(46, 204, 138, 0.3)',
            color: '#2ecc8a',
            padding: '20px 16px',
            borderRadius: 10,
            textAlign: 'center',
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✉️</div>
            <strong>E-mail enviado!</strong><br />
            Verifique sua caixa de entrada em <strong>{email}</strong> e clique no link para criar uma nova senha.
            <br /><br />
            <span style={{ color: '#A0A3A8', fontSize: 12 }}>Não recebeu? Verifique a pasta de spam.</span>
          </div>
        ) : (
          <>
            {error && <div className="login-error">{error}</div>}

            <p style={{ color: '#A0A3A8', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              Digite seu e-mail cadastrado e enviaremos um link para você criar uma nova senha.
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label>E-mail</label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
            </form>
          </>
        )}

        <div className="login-footer">
          <Link to="/login" className="link-register">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
