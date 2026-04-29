import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import {
  getCampanha, uploadContatos, uploadFotos, deletarFotos,
  salvarMensagem, sugerirMensagemIA,
} from '../services/whatsapp.service';
import './Disparador.css';

export default function Disparador() {
  const navigate = useNavigate();
  const csvRef = useRef(null);
  const fotosRef = useRef(null);

  const [contactsCount, setContactsCount] = useState(0);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [message, setMessage] = useState('');
  const [iaDescricao, setIaDescricao] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [uploadingFotos, setUploadingFotos] = useState(false);
  const [savingMsg, setSavingMsg] = useState(false);
  const [loadingIA, setLoadingIA] = useState(false);

  useEffect(() => {
    getCampanha()
      .then(r => {
        setContactsCount(r.data.contacts_count || 0);
        setPhotoUrls(r.data.photoUrls || []);
        setMessage(r.data.message || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCsv(true);
    try {
      const r = await uploadContatos(file);
      setContactsCount(r.data.total);
      const skip = r.data.invalidos > 0 ? ` (${r.data.invalidos} inválidos ignorados)` : '';
      toast.success(`${r.data.total} contatos carregados${skip}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao subir CSV');
    } finally {
      setUploadingCsv(false);
      e.target.value = '';
    }
  };

  const handleFotosUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingFotos(true);
    try {
      const r = await uploadFotos(files);
      setPhotoUrls(r.data.photoUrls);
      toast.success(`${files.length} foto(s) adicionada(s)`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao subir fotos');
    } finally {
      setUploadingFotos(false);
      e.target.value = '';
    }
  };

  const handleDeletarFotos = async () => {
    if (!window.confirm('Remover todas as fotos?')) return;
    try {
      await deletarFotos();
      setPhotoUrls([]);
      toast.success('Fotos removidas');
    } catch {
      toast.error('Erro ao remover fotos');
    }
  };

  const handleSalvarMensagem = async () => {
    if (!message.trim()) { toast.warning('Escreva a mensagem primeiro'); return; }
    setSavingMsg(true);
    try {
      await salvarMensagem(message);
      toast.success('Mensagem salva');
    } catch {
      toast.error('Erro ao salvar mensagem');
    } finally {
      setSavingMsg(false);
    }
  };

  const handleSugerirIA = async () => {
    if (!iaDescricao.trim()) { toast.warning('Descreva a oferta primeiro'); return; }
    setLoadingIA(true);
    try {
      const r = await sugerirMensagemIA(iaDescricao);
      setMessage(r.data.sugestao);
      toast.success('Sugestão gerada — edite se quiser');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Erro ao gerar sugestão');
    } finally {
      setLoadingIA(false);
    }
  };

  if (loading) return (
    <div className="disparador-page">
      <div className="disp-inner"><p style={{ color: '#A0A3A8' }}>Carregando...</p></div>
    </div>
  );

  return (
    <div className="disparador-page">

      {/* Header padrão */}
      <header style={{
        background: 'rgba(43,45,49,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #4A4D52', padding: '0 24px', height: 64,
        display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 700, margin: '0 auto' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: '1px solid #4A4D52', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#A0A3A8' }}>
            ← Dashboard
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={16} /> Carteira no WhatsApp
          </span>
        </div>
      </header>

      <div className="disp-inner">

      {/* BLOCO 1 — Contatos */}
      <div className="disp-block">
        <h2>📋 Contatos</h2>
        <p className={`disp-status ${contactsCount > 0 ? 'ok' : ''}`}>
          {contactsCount > 0 ? `✓ ${contactsCount} contatos carregados` : 'Nenhum contato carregado'}
        </p>
        <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvUpload} />
        <button
          className="disp-btn disp-btn-primary"
          onClick={() => csvRef.current.click()}
          disabled={uploadingCsv}
        >
          {uploadingCsv ? 'Carregando...' : contactsCount > 0 ? '↺ Substituir lista CSV' : '⬆ Subir lista CSV'}
        </button>
      </div>

      {/* BLOCO 2 — Fotos */}
      <div className="disp-block">
        <h2>🖼 Fotos da oferta</h2>
        {photoUrls.length > 0 && (
          <div className="disp-photos-grid">
            {photoUrls.map((url, i) => (
              <div key={i} className="disp-photo-thumb">
                {url.includes('.pdf') || url.includes('application%2Fpdf')
                  ? <div className="pdf-label">PDF</div>
                  : <img src={url} alt={`oferta ${i + 1}`} />
                }
              </div>
            ))}
          </div>
        )}
        <p className={`disp-status ${photoUrls.length > 0 ? 'ok' : ''}`}>
          {photoUrls.length > 0 ? `✓ ${photoUrls.length} arquivo(s)` : 'Nenhuma foto adicionada'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fotosRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={handleFotosUpload} />
          <button className="disp-btn disp-btn-primary" onClick={() => fotosRef.current.click()} disabled={uploadingFotos}>
            {uploadingFotos ? 'Enviando...' : '⬆ Adicionar fotos'}
          </button>
          {photoUrls.length > 0 && (
            <button className="disp-btn disp-btn-danger" onClick={handleDeletarFotos}>
              🗑 Limpar todas
            </button>
          )}
        </div>
      </div>

      {/* BLOCO 3 — Mensagem */}
      <div className="disp-block">
        <h2>💬 Mensagem</h2>
        <div className="disp-greeting-hint">
          A saudação <strong>"Bom dia/tarde/noite, [NOME]!"</strong> é adicionada automaticamente antes desta mensagem.
        </div>
        <textarea
          className="disp-textarea"
          placeholder="Ex: 🔥 Promoção especial! Heineken 600ml caixa com 12 por R$ 98,00 (28 dias). Quantidade limitada!"
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <div className="disp-ia-row" style={{ marginBottom: 10 }}>
          <input
            className="disp-ia-input"
            placeholder="Descreva a oferta para a IA gerar a mensagem..."
            value={iaDescricao}
            onChange={e => setIaDescricao(e.target.value)}
          />
          <button className="disp-btn disp-btn-secondary" onClick={handleSugerirIA} disabled={loadingIA}>
            {loadingIA ? '✨ Gerando...' : '✨ Sugerir com IA'}
          </button>
        </div>
        <button className="disp-btn disp-btn-primary" onClick={handleSalvarMensagem} disabled={savingMsg}>
          {savingMsg ? 'Salvando...' : '💾 Salvar mensagem'}
        </button>
      </div>

      {/* Abrir WhatsApp Web */}
      <div className="disp-open-wa">
        <a href="https://web.whatsapp.com" target="_blank" rel="noopener noreferrer">
          Abrir WhatsApp Web →
        </a>
        <p style={{ fontSize: 11, color: '#a0a3a8', marginTop: 6 }}>
          Depois clique no ícone da extensão "Venpro Campanhas" para iniciar o envio.
        </p>
      </div>

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <a
          href="/venpro-whatsapp-extension.zip"
          download
          style={{ fontSize: 12, color: '#3a85a8' }}
        >
          ⬇ Baixar extensão Venpro Campanhas
        </a>
      </div>

      </div>{/* /disp-inner */}
    </div>
  );
}
