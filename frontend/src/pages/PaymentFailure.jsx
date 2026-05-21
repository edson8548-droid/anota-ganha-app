// NOVO FICHEIRO: src/pages/PaymentFailure.js

import React from 'react';
import { useNavigate } from 'react-router-dom';
import './PaymentFailure.css'; // Importa o CSS que acabámos de criar

const PaymentFailure = () => {
  const navigate = useNavigate();

  return (
    <div className="payment-status-page">
      <div className="payment-status-card">
        <div className="status-icon failure">
          <span>❌</span>
        </div>
        <h1 className="status-title">Pagamento Falhou</h1>
        <p className="status-message">
          Houve um problema ao processar o seu pagamento. Nenhum valor foi
          cobrado. Por favor, tente novamente.
        </p>
        <button
          className="btn-back-plans"
          onClick={() => navigate('/plans')}
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
};

export default PaymentFailure;