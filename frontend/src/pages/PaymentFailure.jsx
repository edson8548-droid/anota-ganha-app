import React from 'react';
import { useNavigate } from 'react-router-dom';
import './PaymentFailure.css';

const PaymentFailure = () => {
  const navigate = useNavigate();

  return (
    <div className="payment-status-page">
      <div className="payment-status-card">
        <div className="status-icon failure">
          <span>❌</span>
        </div>
        <h1 className="status-title">Pagamento não concluído</h1>
        <p className="status-message">
          Não conseguimos confirmar o pagamento. Se você ainda não finalizou no Asaas,
          tente novamente. Se já pagou, aguarde a confirmação ou fale com o suporte.
        </p>
        <button
          className="btn-back-plans"
          onClick={() => navigate('/plans')}
        >
          Voltar para os planos
        </button>
      </div>
    </div>
  );
};

export default PaymentFailure;
