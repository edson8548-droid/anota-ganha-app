// NOVO FICHEIRO: src/pages/PaymentSuccess.js

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './PaymentSuccess.css'; // Importa o CSS que acabámos de criar

const PaymentSuccess = () => {
  const navigate = useNavigate();

  // Redireciona para o dashboard após 5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/dashboard');
    }, 5000); // 5000ms = 5 segundos

    // Limpa o timer se o componente for desmontado (ex: o utilizador clicou no botão)
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="payment-status-page">
      <div className="payment-status-card">
        <div className="status-icon success">
          <span>✅</span>
        </div>
        <h1 className="status-title">Pagamento Aprovado!</h1>
        <p className="status-message">
          Obrigado! A sua assinatura está ativa. O seu acesso ilimitado
          foi liberado.
        </p>
        <p className="status-message" style={{ fontSize: '14px', fontStyle: 'italic' }}>
          Você será redirecionado para o painel em 5 segundos...
        </p>
        <button
          className="btn-back-dashboard"
          onClick={() => navigate('/dashboard')}
        >
          Ir para o Painel Agora
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccess;