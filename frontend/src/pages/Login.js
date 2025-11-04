import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthContext();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Preencha todos os campos');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      console.error('Erro no login:', err);
      setError('Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          {/* ⭐️ ALTERAÇÃO AQUI: ANOTA & GANHE ⭐️ */}
          <h1 className="login-title">Anota & Ganhe<br/>Incentivos</h1>
          <p className="login-subtitle">Entre na sua conta</p>
        </div>

        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>E-mail</label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-footer">
          <Link to="/register" className="link-register">
            Não tem conta? Cadastre-se grátis
          </Link>
          <Link to="/forgot-password" className="link-forgot">
            Esqueceu a senha?
          </Link>
        </div>
      </div>

      {/* Botão WhatsApp Flutuante */}
      <a 
        href="https://wa.me/5513997501798?text=Olá,%20preciso%20de%20suporte%20no%20Anota%20%26%20Ganha"
        target="_blank"
        rel="noopener noreferrer"
        className="whatsapp-float"
        title="Suporte via WhatsApp"
      >
        <svg viewBox="0 0 32 32" fill="white" width="28" height="28">
          <path d="M16 0c-8.837 0-16 7.163-16 16 0 2.825 0.737 5.607 2.137 8.048l-2.137 7.952 7.933-2.127c2.42 1.37 5.173 2.127 8.067 2.127 8.837 0 16-7.163 16-16s-7.163-16-16-16zM16 29.467c-2.482 0-4.908-0.646-7.07-1.87l-0.507-0.292-4.713 1.262 1.262-4.669-0.292-0.508c-1.207-2.100-1.847-4.507-1.847-6.924 0-7.435 6.052-13.487 13.487-13.487s13.487 6.052 13.487 13.487c0 7.435-6.052 13.487-13.487 13.487zM21.12 18.384c-0.366-0.184-2.154-1.062-2.489-1.184s-0.577-0.184-0.82 0.184c-0.243 0.366-0.943 1.184-1.155 1.427s-0.426 0.275-0.791 0.092c-0.366-0.184-1.545-0.57-2.943-1.815-1.087-0.97-1.822-2.166-2.035-2.532s-0.022-0.564 0.161-0.746c0.165-0.165 0.366-0.426 0.548-0.64s0.243-0.366 0.366-0.609c0.122-0.243 0.061-0.458-0.031-0.64s-0.82-1.973-1.124-2.701c-0.296-0.708-0.598-0.611-0.82-0.622-0.212-0.010-0.458-0.012-0.701-0.012s-0.64 0.092-0.976 0.458c-0.335 0.366-1.276 1.247-1.276 3.040s1.307 3.527 1.489 3.771c0.184 0.243 2.579 3.936 6.251 5.519 0.873 0.378 1.555 0.603 2.085 0.771 0.878 0.279 1.677 0.24 2.308 0.145 0.704-0.105 2.154-0.881 2.458-1.733s0.305-1.581 0.214-1.733c-0.092-0.153-0.335-0.243-0.701-0.426z"/>
        </svg>
      </a>
    </div>
  );
};

export default Login;