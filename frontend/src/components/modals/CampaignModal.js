import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import IndustryManager from './IndustryManager';

export default function CampaignModal({ isOpen, onClose, onSave, campaign, sheetId }) {
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
        start_date: campaign.start_date 
          ? new Date(campaign.start_date).toISOString().split('T')[0] 
          : '',
        end_date: campaign.end_date 
          ? new Date(campaign.end_date).toISOString().split('T')[0] 
          : '',
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
    // Validar nome obrigatório
    if (!formData.name || formData.name.trim() === '') {
      alert('Por favor, preencha o nome da campanha');
      return;
    }

    const industriesWithNumericGoals = formData.industries.map(industry => ({
      ...industry,
      goal: typeof industry.goal === 'number' 
        ? industry.goal 
        : parseFloat(industry.goal) || 0
    }));

    const dataToSave = {
      name: formData.name.trim(),
      start_date: formData.start_date 
        ? new Date(formData.start_date).toISOString() 
        : null,
      end_date: formData.end_date 
        ? new Date(formData.end_date).toISOString() 
        : null,
      status: formData.status,
      industries: industriesWithNumericGoals
    };

    // ✅ CORREÇÃO: Adicionar sheet_id apenas se existir
    if (campaign?.sheet_id) {
      dataToSave.sheet_id = campaign.sheet_id;
    } else if (sheetId) {
      dataToSave.sheet_id = sheetId;
    }
    // Se não tiver sheet_id, o Dashboard vai criar automaticamente

    console.log('📤 Enviando dados:', dataToSave);
    onSave(dataToSave);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {campaign ? 'Editar Campanha' : 'Nova Campanha'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome *</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Digite o nome da campanha"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Data Início</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Data Fim</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="active">Ativa</option>
              <option value="inactive">Inativa</option>
              <option value="completed">Concluída</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Indústrias</label>
            <IndustryManager
              industries={formData.industries}
              onChange={(industries) => setFormData({ ...formData, industries })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <Save size={20} />
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
