import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { useAuthContext } from '../contexts/AuthContext';
import { sendVerificationEmail } from '../utils/emailVerification';
import './Login.css';

const EmailVerificationRequired = () => {
  const { user, logout, refreshCurrentUser } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const email = user?.email || location.state?.email || '';
  const from = location.state?.from?.pathname || '/dashboard';

  const handleCheck = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const currentUser = await refreshCurrentUser();
      if (currentUser?.emailVerified) {
        navigate(from, { replace: true });
        return;
      }
      setError('Ainda não encontramos a confirmação. Abra o email recebido e clique no link de confirmação.');
    } catch (err) {
      console.error('[EmailVerification] Erro ao atualizar usuario:', err);
      setError('Não foi possível verificar agora. Tente novamente em alguns segundos.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    setMessage('');
    try {
      await sendVerificationEmail(auth.currentUser);
      setMessage('Email de confirmação reenviado. Verifique também Spam, Lixo eletrônico e Promoções.');
    } catch (err) {
      console.error('[EmailVerification] Erro ao reenviar email:', err);
      if (err?.code === 'auth/too-many-requests') {
        setError('Muitas tentativas de reenvio. Aguarde alguns minutos e tente novamente.');
      } else {
        setError('Não foi possível reenviar agora. Confira o email digitado ou tente novamente.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img className="login-logo-icon" src="/assets/logo/venpro-logo-mark-exato-colorido.svg?v=20260523-2" alt="" />
            <span className="login-logo-word">Venpro</span>
          </div>
          <p className="login-subtitle">Confirme seu email</p>
        </div>

        {!user ? (
          <>
            <div className="login-error">
              Faça login para reenviar ou confirmar seu email.
            </div>
            <div className="login-footer">
              <Link to="/login" className="link-register">Voltar para o login</Link>
            </div>
          </>
        ) : (
          <>
            {error && <div className="login-error">{error}</div>}
            {message && (
              <div style={{
                background: 'rgba(46, 204, 138, 0.1)',
                border: '1px solid rgba(46, 204, 138, 0.3)',
                color: '#2ecc8a',
                padding: '12px 14px',
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.5,
                marginBottom: 16,
              }}>
                {message}
              </div>
            )}

            <div style={{
              color: '#A0A3A8',
              fontSize: 14,
              lineHeight: 1.65,
              marginBottom: 18,
            }}>
              Enviamos um link de confirmação para <strong style={{ color: '#E1E1E1' }}>{email}</strong>.
              Abra esse email e clique no link para liberar o acesso ao Venpro.
              <br /><br />
              Se não aparecer na caixa de entrada, procure em <strong style={{ color: '#E1E1E1' }}>Spam</strong>,
              {' '}<strong style={{ color: '#E1E1E1' }}>Lixo eletrônico</strong> e <strong style={{ color: '#E1E1E1' }}>Promoções</strong>.
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="btn-login" onClick={handleCheck} disabled={loading || resending}>
                {loading ? 'Verificando...' : 'Já confirmei, verificar agora'}
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resending}
                style={{
                  background: 'transparent',
                  color: '#A0A3A8',
                  border: '1px solid #4A4D52',
                  borderRadius: 10,
                  padding: 12,
                  fontWeight: 700,
                  cursor: loading || resending ? 'not-allowed' : 'pointer',
                }}
              >
                {resending ? 'Reenviando...' : 'Reenviar email de confirmação'}
              </button>
            </div>

            <div className="login-footer">
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3A85A8',
                  cursor: 'pointer',
                  fontWeight: 700,
                  padding: 0,
                }}
              >
                Sair e usar outro email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmailVerificationRequired;
