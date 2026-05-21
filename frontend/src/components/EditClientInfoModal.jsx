import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import './EditClientInfoModal.css';

const onlyDigits = (value = '') => String(value).replace(/\D/g, '');

const formatCnpjDisplay = (value = '') => {
  const cleaned = onlyDigits(value).slice(0, 14);
  return cleaned
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const formatCnpjFinal = (value = '') => {
  const cleaned = onlyDigits(value);
  if (cleaned.length !== 14) return value;
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const buildAddressFromCnpj = (data) => {
  const streetParts = [
    data.descricao_tipo_logradouro,
    data.logradouro
  ].filter(Boolean);
  const street = streetParts.join(' ').trim();
  const number = String(data.numero || '').trim();
  const complement = String(data.complemento || '').trim();
  const addressParts = [];

  if (street) addressParts.push(street);
  if (number) addressParts.push(number);
  let address = addressParts.join(', ');
  if (complement) address = address ? `${address} - ${complement}` : complement;

  return address.trim();
};

const EditClientInfoModal = ({ isOpen, onClose, client, onSave }) => {
  const [formData, setFormData] = useState({
    CNPJ: '',
    CLIENTE: '',
    CONTATO: '',
    CIDADE: '',
    ESTADO: '',
    ENDERECO: '',
    BAIRRO: '',
    CEP: '',
    TELEFONE: '',
    EMAIL: '',
    notes: ''
  });
  const [searchingCnpj, setSearchingCnpj] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!client || !isOpen) return;
    setFormData({
      CNPJ: client.CNPJ || '',
      CLIENTE: client.CLIENTE || client.NOME || client.nome || client.RAZAO_SOCIAL || client.razao_social || '',
      CONTATO: client.CONTATO || client.contato || client.NOME_CONTATO || '',
      CIDADE: client.CIDADE || '',
      ESTADO: client.ESTADO || '',
      ENDERECO: client.ENDERECO || '',
      BAIRRO: client.BAIRRO || '',
      CEP: client.CEP || '',
      TELEFONE: client.TELEFONE || '',
      EMAIL: client.EMAIL || '',
      notes: client.notes || ''
    });
  }, [client, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSearchCnpj = async () => {
    const cnpj = onlyDigits(formData.CNPJ);
    if (cnpj.length !== 14) {
      toast.warning('Digite um CNPJ válido com 14 dígitos');
      return;
    }

    setSearchingCnpj(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!response.ok) throw new Error('CNPJ não encontrado');
      const data = await response.json();
      const address = buildAddressFromCnpj(data);
      setFormData(prev => ({
        ...prev,
        CNPJ: formatCnpjFinal(cnpj),
        CLIENTE: data.razao_social || data.nome_fantasia || prev.CLIENTE || '',
        CONTATO: prev.CONTATO || '',
        TELEFONE: data.ddd_telefone_1 || prev.TELEFONE || '',
        EMAIL: data.email || prev.EMAIL || '',
        ENDERECO: address || prev.ENDERECO || '',
        CIDADE: data.municipio || prev.CIDADE || '',
        ESTADO: data.uf || prev.ESTADO || '',
        BAIRRO: data.bairro || prev.BAIRRO || '',
        CEP: data.cep || prev.CEP || ''
      }));
      toast.success('Dados encontrados pelo CNPJ');
    } catch (error) {
      toast.warning(`Não consegui buscar o CNPJ. ${error.message}`);
    } finally {
      setSearchingCnpj(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(formData.CLIENTE || '').trim()) {
      toast.warning('Informe o nome do cliente');
      return;
    }
    if (!String(formData.CIDADE || '').trim()) {
      toast.warning('Informe a cidade do cliente');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...client,
        ...formData,
        CNPJ: formatCnpjFinal(formData.CNPJ),
        industries: client.industries || {},
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-client-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-edit">
          <div className="modal-header-content">
            <h2>Editar cliente</h2>
            <p>Corrija nome, CNPJ, cidade, bairro e contato do cliente.</p>
          </div>
          <button className="btn-close-edit" onClick={onClose} type="button">x</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body-edit-info">
          <div className="section-edit">
            <h3 className="section-title-edit">
              <span className="section-icon">Cliente</span>
            </h3>

            <div className="form-grid-edit-info">
              <div className="form-group-edit-info full-width">
                <label>CNPJ</label>
                <div className="cnpj-edit-row">
                  <input
                    type="text"
                    value={formatCnpjDisplay(formData.CNPJ)}
                    onChange={(e) => handleChange('CNPJ', e.target.value)}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    disabled={saving || searchingCnpj}
                  />
                  <button type="button" className="btn-search-client-cnpj" onClick={handleSearchCnpj} disabled={saving || searchingCnpj}>
                    {searchingCnpj ? 'Buscando...' : 'Buscar CNPJ'}
                  </button>
                </div>
              </div>

              <div className="form-group-edit-info full-width">
                <label>Nome do cliente *</label>
                <input
                  type="text"
                  value={formData.CLIENTE}
                  onChange={(e) => handleChange('CLIENTE', e.target.value)}
                  placeholder="Nome ou razão social"
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info full-width">
                <label>Nome do contato para WhatsApp</label>
                <input
                  type="text"
                  value={formData.CONTATO}
                  onChange={(e) => handleChange('CONTATO', e.target.value)}
                  placeholder="Ex: João, Maria, comprador..."
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info full-width">
                <label>Endereço</label>
                <input
                  type="text"
                  value={formData.ENDERECO}
                  onChange={(e) => handleChange('ENDERECO', e.target.value)}
                  placeholder="Rua, número e complemento"
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info">
                <label>Cidade *</label>
                <input
                  type="text"
                  value={formData.CIDADE}
                  onChange={(e) => handleChange('CIDADE', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info">
                <label>Bairro</label>
                <input
                  type="text"
                  value={formData.BAIRRO}
                  onChange={(e) => handleChange('BAIRRO', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info">
                <label>Estado</label>
                <input
                  type="text"
                  value={formData.ESTADO}
                  onChange={(e) => handleChange('ESTADO', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info">
                <label>CEP</label>
                <input
                  type="text"
                  value={formData.CEP}
                  onChange={(e) => handleChange('CEP', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info">
                <label>Telefone</label>
                <input
                  type="text"
                  value={formData.TELEFONE}
                  onChange={(e) => handleChange('TELEFONE', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.EMAIL}
                  onChange={(e) => handleChange('EMAIL', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group-edit-info full-width">
                <label>Observacoes</label>
                <textarea
                  rows="3"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer-edit">
            <button type="button" className="btn-cancel-edit" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn-save-edit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditClientInfoModal;
