import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { sendWelcomeEmail } from '../services/api';
import { isValidCPF, onlyDigits } from '../utils/documentValidators';
import { CARLOS_PARTNER_CODE, PARTNER_COUPON_ENABLED, normalizePartnerCode } from '../utils/partnerProgram';
import './Register.css';

// ⭐️ INÍCIO: Funções de Máscara (para formatar os campos) ⭐️
const formatCPF = (value) => {
  return value
    .replace(/\D/g, '') // Remove tudo o que não é dígito
    .replace(/(\d{3})(\d)/, '$1.$2') // Coloca um ponto após o terceiro dígito
    .replace(/(\d{3})(\d)/, '$1.$2') // Coloca um ponto após o sexto dígito
    .replace(/(\d{3})(\d{1,2})/, '$1-$2') // Coloca um hífen após o nono dígito
    .slice(0, 14); // Limita o tamanho máximo (111.222.333-44)
};

const formatTelefone = (value) => {
  let v = value.replace(/\D/g, '');
  v = v.slice(0, 11); // Limita a 11 dígitos (DDD + 9 dígitos)
  
  if (v.length > 10) {
    // Celular com 9º dígito: (11) 98888-7777
    v = v.replace(/^(\d\d)(\d{5})(\d{4}).*/, '($1) $2-$3');
  } else if (v.length > 6) {
    // Celular/Fixo com 8 dígitos: (11) 8888-7777
    v = v.replace(/^(\d\d)(\d{4})(\d{4}).*/, '($1) $2-$3');
  } else if (v.length > 2) {
    // (11) 8888
    v = v.replace(/^(\d\d)(\d+)/, '($1) $2');
  } else {
    // (11
    v = v.replace(/^(\d*)/, '($1');
  }
  return v;
};
// ⭐️ FIM: Funções de Máscara ⭐️

function getPasswordStrength(pwd) {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { level: 'Fraca', color: '#ef4444', width: '33%' };
  if (score <= 2) return { level: 'Boa', color: '#f59e0b', width: '66%' };
  return { level: 'Forte', color: '#22c55e', width: '100%' };
}

const Register = () => {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  const touch = (field) => setTouched(t => ({ ...t, [field]: true }));

  const getFieldError = (field) => {
    if (!touched[field]) return null;
    switch (field) {
      case 'name': return !name.trim() ? 'Nome é obrigatório' : null;
      case 'cpf': return !isValidCPF(cpf) ? 'CPF inválido' : null;
      case 'telefone': return onlyDigits(telefone).length < 10 ? 'Telefone inválido' : null;
      case 'email': return !email.includes('@') || !email.includes('.') ? 'Email inválido' : null;
      case 'password': return password.length < 6 ? 'Mínimo 6 caracteres' : null;
      case 'confirmPassword': return confirmPassword !== password ? 'As senhas não coincidem' : null;
      default: return null;
    }
  };

  const isFieldValid = (field) => {
    if (!touched[field]) return false;
    return getFieldError(field) === null;
  };
  
  const { register } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromUrl = normalizePartnerCode(params.get('ref'));
    if (fromUrl) {
      setReferralCode(fromUrl);
      try {
        localStorage.setItem('venpro:referral-code', fromUrl);
        if (PARTNER_COUPON_ENABLED && fromUrl === CARLOS_PARTNER_CODE) {
          localStorage.setItem('venpro:checkout-coupon', fromUrl);
        }
      } catch {
        // Ignore storage restrictions.
      }
      return;
    }

    try {
      const stored = normalizePartnerCode(localStorage.getItem('venpro:referral-code'));
      if (stored) setReferralCode(stored);
    } catch {
      // Ignore storage restrictions.
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // ⭐️ Atualizada a validação de campos vazios
    if (!name || !email || !password || !confirmPassword || !cpf || !telefone) {
      setError('Preencha todos os campos');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    
    // ⭐️ Novas validações de CPF e Telefone
    const cpfDigits = onlyDigits(cpf);
    if (!isValidCPF(cpfDigits)) {
      setError('CPF inválido. Verifique o número digitado.');
      return;
    }
    
    const telDigits = onlyDigits(telefone);
    if (telDigits.length < 10 || telDigits.length > 11) {
      setError('Telefone inválido. Inclua o DDD (mínimo 10 dígitos).');
      return;
    }

    setLoading(true);

    try {
      // ⭐️ Prepara os dados adicionais para enviar (limpos, sem máscaras)
      const additionalData = {
        name: name,
        cpf: cpfDigits,
        telefone: telDigits,
        ...(referralCode ? { referralCode } : {})
      };
      
      // ⭐️ A chamada 'register' agora envia os dados adicionais
      await register(email, password, additionalData);
      sendWelcomeEmail().catch((welcomeErr) => {
        console.warn('[Register] Não foi possível enviar email de boas-vindas:', welcomeErr?.message || welcomeErr);
      });
      
      navigate('/dashboard');
    } catch (err) {
      console.error('Erro no registro:', err);
      const backendMessage = err?.response?.data?.detail || err?.message;
      
      switch (err.code) {
        case 'auth/invalid-cpf':
          setError('CPF inválido. Verifique o número digitado.');
          break;
        case 'auth/invalid-phone':
          setError('Telefone inválido. Inclua o DDD.');
          break;
        case 'auth/email-already-in-use':
          setError('Este email já está cadastrado');
          break;
        case 'auth/invalid-email':
          setError('Email inválido');
          break;
        case 'auth/weak-password':
          setError('Senha muito fraca. Use no mínimo 6 caracteres');
          break;
        case 'backend/register':
          setError(backendMessage || 'Erro ao criar conta. Tente novamente.');
          break;
        default:
          setError(backendMessage || 'Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <div className="register-header">
          <div className="register-logo">
            <img className="register-logo-icon" src="/assets/logo/venpro-logo-mark-exato-colorido.svg?v=20260523-2" alt="" />
            <span className="register-logo-word">Venpro</span>
          </div>
          <h1>Crie sua conta grátis</h1>
          <p>15 dias grátis, sem cartão de crédito</p>
          {referralCode && (
            <div className="register-referral-note">
              Cadastro com codigo de parceiro: <strong>{referralCode}</strong>
              {referralCode === CARLOS_PARTNER_CODE ? <span>Parceiro Carlos Vinicios</span> : null}
            </div>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="register-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="name">Nome</label>
            <input
              id="name"
              type="text"
              placeholder="Seu nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => touch('name')}
              className={getFieldError('name') ? 'input-error' : isFieldValid('name') ? 'input-valid' : ''}
              disabled={loading}
              required
            />
            {getFieldError('name') && <span className="field-error">{getFieldError('name')}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="cpf">CPF</label>
            <input
              id="cpf"
              type="text"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              onBlur={() => touch('cpf')}
              className={getFieldError('cpf') ? 'input-error' : isFieldValid('cpf') ? 'input-valid' : ''}
              disabled={loading}
              maxLength={14}
              required
            />
            {getFieldError('cpf') && <span className="field-error">{getFieldError('cpf')}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="telefone">Telefone / WhatsApp</label>
            <input
              id="telefone"
              type="tel"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(formatTelefone(e.target.value))}
              onBlur={() => touch('telefone')}
              className={getFieldError('telefone') ? 'input-error' : isFieldValid('telefone') ? 'input-valid' : ''}
              disabled={loading}
              maxLength={15}
              required
            />
            {getFieldError('telefone') && <span className="field-error">{getFieldError('telefone')}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => touch('email')}
              className={getFieldError('email') ? 'input-error' : isFieldValid('email') ? 'input-valid' : ''}
              disabled={loading}
              autoComplete="email"
              required
            />
            {getFieldError('email') && <span className="field-error">{getFieldError('email')}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <div className="password-input-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => touch('password')}
                className={getFieldError('password') ? 'input-error' : isFieldValid('password') ? 'input-valid' : ''}
                disabled={loading}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(prev => !prev)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {getFieldError('password') && <span className="field-error">{getFieldError('password')}</span>}
            {password && (() => {
              const s = getPasswordStrength(password);
              return (
                <div className="password-strength">
                  <div className="password-strength-bar">
                    <div style={{ width: s.width, background: s.color }} />
                  </div>
                  <span style={{ color: s.color }}>Senha {s.level}</span>
                </div>
              );
            })()}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar Senha</label>
            <div className="password-input-wrap">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Digite a senha novamente"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => touch('confirmPassword')}
                className={getFieldError('confirmPassword') ? 'input-error' : isFieldValid('confirmPassword') ? 'input-valid' : ''}
                disabled={loading}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(prev => !prev)}
                aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                title={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                disabled={loading}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {getFieldError('confirmPassword') && <span className="field-error">{getFieldError('confirmPassword')}</span>}
          </div>
          
          <button 
            type="submit" 
            className="btn-register"
            disabled={loading}
          >
            {loading ? 'Criando conta...' : 'Criar Conta'}
          </button>
        </form>

        <div className="register-footer">
          <p>
            Já tem uma conta? {' '}
            <Link to="/login" className="link-login">
              Faça login aqui
            </Link>
          </p>
          <p>
            <Link to="/" className="link-home">
              ← Voltar para home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
