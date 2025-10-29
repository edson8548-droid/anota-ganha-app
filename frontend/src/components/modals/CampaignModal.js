import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import IndustryManager from './IndustryManager';

export default function CampaignModal({ isOpen, onClose, onSave, campaign }) {
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    status: 'active',
    industries: []
  });

  useEffect(() => {
    if (campaign) {
      setFormData({
        name: campaign.name || '',
        start_date: campaign.start_date ? new Date(campaign.start_date).toISOString().split('T')[0] : '',
        end_date: campaign.end_date ? new Date(campaign.end_date).toISOString().split('T')[0] : '',
        status: campaign.status || 'active',
        industries: campaign.industries || []
      });
    } else {
      setFormData({
        name: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        status: 'active',
        industries: []
      });
    }
  }, [campaign, isOpen]);

  const handleSubmit = () => {
    const industriesWithNumericGoals = formData.industries.map(industry => ({
      ...industry,
      goal: typeof industry.goal === 'number' ? industry.goal : parseFloat(industry.goal) || 0
    }));
    
    onSave({
      name: formData.name,
      start_date: new Date(formData.start_date).toISOString(),
      end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
      status: formData.status,
      industries: industriesWithNumericGoals
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" data-testid="campaign-modal">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {campaign ? 'Editar Campanha' : 'Nova Campanha'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome da Campanha *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Ex: SPANI 4º Trimestre"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data de Início *
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data de Término
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="active">Ativa</option>
              <option value="paused">Pausada</option>
              <option value="completed">Concluída</option>
            </select>
          </div>

          <div className="border-t pt-4">
            <IndustryManager
              industries={formData.industries}
              onChange={(industries) => setFormData({ ...formData, industries })}
            />
          </div>
        </div>

        <div className="flex justify-end mt-6 space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.start_date}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
            data-testid="save-campaign-btn"
          >
            <Save className="w-5 h-5 mr-2" />
            {campaign ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}
