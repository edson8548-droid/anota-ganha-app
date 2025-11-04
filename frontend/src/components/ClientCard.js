import React from 'react';
import './ClientCard.css';

const ClientCard = ({ client, campaign, onEdit, onDelete }) => {
  // Calcular progresso de cada indústria
  const getIndustryProgress = (industryName) => {
    if (!client.industries || !client.industries[industryName]) {
      return { total: 0, completed: 0 };
    }

    const products = client.industries[industryName];
    const productKeys = Object.keys(products);
    const total = productKeys.length;
    const completed = productKeys.filter(key => products[key].positivado).length;

    return { total, completed };
  };

  // Verificar se indústria está 100% completa
  const isIndustryComplete = (industryName) => {
    const { total, completed } = getIndustryProgress(industryName);
    return total > 0 && completed === total;
  };

  // Verificar se TODAS as indústrias estão 100% completas
  const isCampaignComplete = () => {
    if (!campaign || !campaign.industries || !client.industries) {
      return false;
    }

    const industryNames = Object.keys(campaign.industries);
    if (industryNames.length === 0) return false;

    return industryNames.every(industryName => isIndustryComplete(industryName));
  };

  // Calcular total de progresso
  const getTotalProgress = () => {
    if (!campaign || !campaign.industries) {
      return { total: 0, completed: 0 };
    }

    let totalProducts = 0;
    let completedProducts = 0;

    Object.keys(campaign.industries).forEach(industryName => {
      const progress = getIndustryProgress(industryName);
      totalProducts += progress.total;
      completedProducts += progress.completed;
    });

    return { total: totalProducts, completed: completedProducts };
  };

  const totalProgress = getTotalProgress();
  const isComplete = isCampaignComplete();
  const progressPercentage = totalProgress.total > 0 
    ? Math.round((totalProgress.completed / totalProgress.total) * 100) 
    : 0;

  return (
    <div className={`client-card ${isComplete ? 'completed' : ''}`}>
      {/* Header */}
      <div className="client-header">
        <div className="client-info">
          <h3 className="client-name">{client.CLIENTE}</h3>
          <p className="client-location">
            📍 {client.CIDADE}{client.BAIRRO ? ` - ${client.BAIRRO}` : ''}
          </p>
          {client.TELEFONE && (
            <p className="client-contact">📞 {client.TELEFONE}</p>
          )}
        </div>

        <div className="client-actions">
          {isComplete && (
            <div className="completion-badge complete">
              🏆 100% COMPLETO
            </div>
          )}
          {!isComplete && (
            <div className="completion-badge incomplete">
              ⏳ {progressPercentage}% Completo
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar Global */}
      <div className="global-progress">
        <div className="progress-bar-container">
          <div 
            className={`progress-bar-fill ${isComplete ? 'complete' : ''}`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <span className="progress-text">
          {totalProgress.completed} de {totalProgress.total} produtos positivados
        </span>
      </div>

      {/* Industries Summary */}
      {campaign && campaign.industries && (
        <div className="industries-summary">
          {Object.keys(campaign.industries).map(industryName => {
            const progress = getIndustryProgress(industryName);
            const industryComplete = isIndustryComplete(industryName);

            return (
              <div 
                key={industryName} 
                className={`industry-summary-item ${industryComplete ? 'complete' : ''}`}
              >
                <div className="industry-summary-name">
                  {industryComplete && <span className="check-icon-small">✓</span>}
                  🏭 {industryName}
                </div>
                <div className={`industry-summary-progress ${industryComplete ? 'complete' : 'incomplete'}`}>
                  {progress.completed}/{progress.total}
                  {industryComplete && ' ✅'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="card-footer">
        <button className="btn-edit" onClick={() => onEdit(client)}>
          ✏️ Editar
        </button>
        <button className="btn-delete" onClick={() => onDelete(client.id)}>
          🗑️ Excluir
        </button>
      </div>

      {/* Destaque Especial para 100% */}
      {isComplete && (
        <div className="confetti-animation">
          <div className="confetti">🎉</div>
          <div className="confetti">⭐</div>
          <div className="confetti">🏆</div>
          <div className="confetti">✨</div>
        </div>
      )}
    </div>
  );
};

export default ClientCard;
