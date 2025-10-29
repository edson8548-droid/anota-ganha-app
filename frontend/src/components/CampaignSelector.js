import React from 'react';
import { Building, Plus, Edit, Trash2, BarChart2 } from 'lucide-react';

export default function CampaignSelector({
  campaigns,
  activeCampaign,
  onSelectCampaign,
  onCreateCampaign,
  onEditCampaign,
  onDeleteCampaign,
  onViewStats,
  showDropdown,
  setShowDropdown
}) {
  const currentCampaign = campaigns.find(c => c.id === activeCampaign);

  return (
    <div className="relative mb-4">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
      >
        <div className="flex items-center">
          <Building className="w-5 h-5 mr-2" />
          <span>
            {currentCampaign
              ? `Campanha: ${currentCampaign.name}`
              : 'Selecionar Campanha'}
          </span>
        </div>
        <svg
          className={`w-5 h-5 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {campaigns.map(campaign => (
            <div
              key={campaign.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0"
            >
              <button
                onClick={() => {
                  onSelectCampaign(campaign.id);
                  setShowDropdown(false);
                }}
                className={`flex-1 text-left ${activeCampaign === campaign.id ? 'text-blue-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <div className="flex items-center">
                  <Building className="w-4 h-4 mr-2" />
                  <span>{campaign.name}</span>
                  {campaign.status === 'active' && (
                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Ativa</span>
                  )}
                  {activeCampaign === campaign.id && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Selecionada</span>
                  )}
                </div>
              </button>
              <div className="flex items-center space-x-1 ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewStats(campaign.id);
                    setShowDropdown(false);
                  }}
                  className="p-2 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 rounded transition-colors"
                  title="Ver estatísticas"
                >
                  <BarChart2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditCampaign(campaign);
                    setShowDropdown(false);
                  }}
                  className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded transition-colors"
                  title="Editar campanha"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCampaign(campaign.id);
                    setShowDropdown(false);
                  }}
                  className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Excluir campanha"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => {
              onCreateCampaign();
              setShowDropdown(false);
            }}
            className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-600 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            <span>Nova Campanha</span>
          </button>
        </div>
      )}
    </div>
  );
}
