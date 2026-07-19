import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Megaphone, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { campaignsService } from '../services/campaigns.service';
import MasterCampaignModal from './MasterCampaignModal';
import ConfirmDialog from './ConfirmDialog';

// Seção do Painel Admin: gerencia as campanhas MESTRE (Spani e futuras).
export default function MasterCampaignsAdmin() {
  const [lista, setLista] = useState(null); // null = carregando
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null, nome: '' });
  const [uploadingId, setUploadingId] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const data = await campaignsService.listarMestreAdmin();
      setLista(data);
    } catch (err) {
      toast.error('Erro ao carregar campanhas mestre: ' + (err?.response?.data?.detail || err.message));
      setLista([]);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNova = () => { setEditing(null); setShowModal(true); };
  const abrirEdicao = (m) => {
    setEditing(m);
    setShowModal(true);
  };

  const excluir = async () => {
    const { id } = confirm;
    setConfirm({ open: false, id: null, nome: '' });
    try {
      await campaignsService.excluirMestre(id);
      toast.success('Campanha mestre excluída.');
      carregar();
    } catch (err) {
      toast.error('Erro ao excluir: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const contarProdutos = (m) =>
    Object.values(m.industries || {}).reduce((acc, ind) => acc + Object.keys(ind?.produtos || {}).length, 0);

  const importarApuracao = async (campaign, file) => {
    if (!file) return;
    try {
      setUploadingId(campaign.id);
      const result = await campaignsService.importarApuracaoAdmin(campaign.id, file);
      toast.success(`Planilha atualizada: ${result.rcas} RCAs e ${result.suppliers} indústrias premiadas.`);
      await carregar();
    } catch (err) {
      toast.error('Erro ao importar planilha: ' + (err?.response?.data?.detail || err.message));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <section className="admin-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="admin-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Megaphone size={18} /> Campanhas de Incentivo (Mestre)
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="admin-refresh" onClick={carregar}>
            <RefreshCw size={15} /> Atualizar
          </button>
          <button type="button" className="admin-refresh" onClick={abrirNova}>
            <Plus size={15} /> Nova campanha
          </button>
        </div>
      </div>

      <p className="admin-empty" style={{ marginTop: 4, textAlign: 'left' }}>
        Campanhas oficiais que os RCAs desbloqueiam por senha. Suas edições refletem na hora para todos.
      </p>

      {lista === null && <p className="admin-empty">Carregando...</p>}
      {lista !== null && lista.length === 0 && (
        <p className="admin-empty">Nenhuma campanha mestre criada ainda.</p>
      )}

      {lista && lista.length > 0 && (
        <div className="admin-trial-list" style={{ marginTop: 12 }}>
          {lista.map(m => (
            <div key={m.id} className="admin-trial-row">
              <div className="admin-trial-info">
                <strong>{m.nome}</strong>
                <span>
                  {m.distribuidora ? `${m.distribuidora} · ` : ''}
                  {Object.keys(m.industries || {}).length} indústria(s) · {contarProdutos(m)} produto(s)
                  {m.startDate ? ` · ${m.startDate}${m.endDate ? ` → ${m.endDate}` : ''}` : ''}
                </span>
                <span className={`admin-status-badge ${(m.desbloqueios ?? 0) > 0 ? 'ok' : 'warn'}`}>
                  {m.desbloqueios ?? 0} RCA{(m.desbloqueios ?? 0) === 1 ? '' : 's'} desbloquearam
                </span>
                <span className={`admin-status-badge ${m.active ? 'ok' : 'warn'}`}>
                  {m.active ? 'Ativa' : 'Inativa'}{m.temSenha ? ' · com senha' : ' · sem senha'}
                </span>
                {m.weeklySummary?.periodEnd && (
                  <span>Última apuração: {new Date(`${m.weeklySummary.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                )}
              </div>
              <div className="admin-trial-actions">
                <label className="admin-refresh" style={{ cursor: uploadingId ? 'wait' : 'pointer' }}>
                  <Upload size={14} /> {uploadingId === m.id ? 'Importando...' : 'Subir Excel semanal'}
                  <input
                    type="file"
                    accept=".xlsx"
                    hidden
                    disabled={!!uploadingId}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      importarApuracao(m, file);
                    }}
                  />
                </label>
                <button type="button" className="admin-refresh" onClick={() => abrirEdicao(m)}>
                  <Pencil size={14} /> Editar
                </button>
                <button type="button" className="admin-refresh" onClick={() => setConfirm({ open: true, id: m.id, nome: m.nome })}>
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <MasterCampaignModal
          mestre={editing}
          onClose={() => setShowModal(false)}
          onSaved={carregar}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Excluir campanha mestre"
        description={`Excluir "${confirm.nome}"? Os acessos dos RCAs a essa campanha também serão removidos.`}
        onConfirm={excluir}
        onCancel={() => setConfirm({ open: false, id: null, nome: '' })}
      />
    </section>
  );
}
