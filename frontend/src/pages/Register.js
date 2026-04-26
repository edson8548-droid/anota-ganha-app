import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
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

const Register = () => {
  const [name, setName] = useState('');
  // ⭐️ Adicionados novos estados para os novos campos
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { register } = useAuthContext();
  const navigate = useNavigate();

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
    const cpfDigits = cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      setError('CPF inválido. Deve conter 11 dígitos.');
      return;
    }
    
    const telDigits = telefone.replace(/\D/g, '');
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
        telefone: telDigits
      };
      
      // ⭐️ A chamada 'register' agora envia os dados adicionais
      await register(email, password, additionalData);
      
      navigate('/dashboard');
    } catch (err) {
      console.error('Erro no registro:', err);
      
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('Este email já está cadastrado');
          break;
        case 'auth/invalid-email':
          setError('Email inválido');
          break;
        case 'auth/weak-password':
          setError('Senha muito fraca. Use no mínimo 6 caracteres');
          break;
        default:
          setError('Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <div className="register-header">
          <h1>🎯 Venpro</h1>
          <p>Crie sua conta grátis</p>
        </div>
        
        <form onSubmit={handleSubmit} className="register-form">
          {error && (
            <div className="error-message">
              ⚠️ {error}
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
              disabled={loading}
              required
            />
          </div>
          
          {/* ⭐️ INÍCIO: Novos Campos (CPF e Telefone) ⭐️ */}
          <div className="form-group">
            <label htmlFor="cpf">CPF</label>
            <input
              id="cpf"
              type="text" // Usamos "text" para a máscara funcionar
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              disabled={loading}
              maxLength={14}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="telefone">Telefone / WhatsApp</label>
            <input
              id="telefone"
              type="tel" // "tel" é bom para telemóveis
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(formatTelefone(e.target.value))}
              disabled={loading}
              maxLength={15}
              required
            />
          </div>
          {/* ⭐️ FIM: Novos Campos ⭐️ */}
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar Senha</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Digite a senha novamente"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="btn-register"
            disabled={loading}
          >
            {loading ? '⏳ Criando conta...' : '🚀 Criar Conta'}
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