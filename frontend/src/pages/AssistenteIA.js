import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { gerarTabelaPrazos } from '../services/cotacao.service';
import { auth } from '../firebase/config';
import './AssistenteIA.css';

const API_URL = 'https://api.venpro.com.br';

const PROMPTS_RAPIDOS = [
  {
    label: '📲 Oferta WhatsApp',
    sub: 'Gera texto de oferta pronto para disparar',
    texto: 'Escreve uma oferta de WhatsApp para os meus clientes com os seguintes produtos e preços (complete com seus produtos):\n\n• [Produto 1] — R$ [preço]\n• [Produto 2] — R$ [preço]\n\nPrazo: 28 dias',
  },
  {
    label: '🤝 Responder objeção',
    sub: 'Cliente disse que está caro',
    texto: 'Um cliente disse que o meu preço está caro demais comparado com a concorrência. Como respondo de forma profissional sem dar desconto?',
  },
  {
    label: '💤 Reativar cliente',
    sub: 'Cliente parou de comprar há 2 meses',
    texto: 'Escreve uma mensagem de WhatsApp para reativar um cliente que não compra há 2 meses. Produto principal que ele comprava: [nome do produto].',
  },
  {
    label: '📧 Email para indústria',
    sub: 'Relatório de sell-out mensal',
    texto: 'Me ajuda a escrever um e-mail profissional para a indústria [nome] reportando os resultados do mês. Produtos vendidos: [liste aqui]. Tom formal mas próximo.',
  },
  {
    label: '🛒 Mix por cliente',
    sub: 'Quais produtos oferecer',
    texto: 'Tenho um cliente que é [tipo: mercadinho/padaria/bar/supermercado] com faturamento médio de R$ [valor] por pedido. Quais categorias de produtos de [alimentos/higiene/limpeza] devo priorizar para ele?',
  },
  {
    label: '📋 Script de visita',
    sub: 'Roteiro para visita ao cliente',
    texto: 'Vou visitar amanhã um cliente que é [tipo de estabelecimento] e que compra comigo há [tempo]. Última compra foi de [produtos]. Me ajuda com um roteiro de abordagem para a visita.',
  },
];

function formatTime(date) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function AssistenteIA() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Estado do modal "Gerar Tabela com Prazos"
  const [showTabelaModal, setShowTabelaModal] = useState(false);
  const [tabelaArquivo, setTabelaArquivo] = useState(null);
  const [pctPrazos, setPctPrazos] = useState({ 7: 0, 14: 0, 21: 0, 28: 0 });
  const [gerandoTabela, setGerandoTabela] = useState(false);
  const [tabelaSucesso, setTabelaSucesso] = useState(false);
  const tabelaInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const history = messagesRef.current
      .filter(m => !m.isError)
      .map(m => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${API_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Erro ${res.status}`);
      }

      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'model',
        content: data.response,
        time: new Date(),
      }]);
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'Tempo esgotado (30s). Tente novamente.'
        : (err.message || 'Erro desconhecido');
      setMessages(prev => [...prev, {
        role: 'model',
        content: `⚠️ Erro: ${msg}`,
        time: new Date(),
        isError: true,
      }]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [input, loading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrompt = (texto) => {
    setInput(texto);
    textareaRef.current?.focus();
  };

  const autoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleGerarTabela = async () => {
    if (!tabelaArquivo) return;
    setGerandoTabela(true);
    setTabelaSucesso(false);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error('Usuário não autenticado');
      const blob = await gerarTabelaPrazos(tabelaArquivo, pctPrazos, token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tabela_com_prazos.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      setTabelaSucesso(true);
      setTabelaArquivo(null);
    } catch (err) {
      alert('Erro ao gerar tabela: ' + (err.response?.data?.detail || err.message));
    }
    setGerandoTabela(false);
  };

  return (
    <div className="ia-page">
      {/* Header */}
      <header className="ia-header">
        <div className="ia-header-left">
          <button className="ia-btn-back" onClick={() => navigate('/dashboard')}>← Voltar</button>
          <div className="ia-status-dot" />
          <div>
            <div className="ia-header-title">Assistente Venpro</div>
            <div className="ia-header-sub">Especializado em representação comercial</div>
          </div>
        </div>
        <button className="ia-clear-btn" onClick={() => setMessages([])}>Limpar conversa</button>
      </header>

      {/* Corpo */}
      <div className="ia-body">

        {/* Sidebar */}
        <div className="ia-sidebar">
          <div className="ia-sidebar-title">Ferramentas</div>
          <button
            className="ia-prompt-btn ia-prompt-btn--ferramenta"
            onClick={() => { setShowTabelaModal(true); setTabelaSucesso(false); }}
          >
            📊 Gerar tabela de prazos
            <span>Aplica % por prazo na sua tabela base</span>
          </button>

          <div className="ia-sidebar-title" style={{ marginTop: 16 }}>Atalhos rápidos</div>
          {PROMPTS_RAPIDOS.map((p, i) => (
            <button key={i} className="ia-prompt-btn" onClick={() => handlePrompt(p.texto)}>
              {p.label}
              <span>{p.sub}</span>
            </button>
          ))}
        </div>

        {/* Modal: Gerar Tabela de Prazos */}
        {showTabelaModal && (
          <div className="ia-modal-overlay" onClick={() => setShowTabelaModal(false)}>
            <div className="ia-modal" onClick={e => e.stopPropagation()}>
              <div className="ia-modal-header">
                <span>📊 Gerar Tabela com Prazos</span>
                <button className="ia-modal-close" onClick={() => setShowTabelaModal(false)}>✕</button>
              </div>

              <p className="ia-modal-desc">
                Suba a planilha base do atacadista e informe o % de aumento para cada prazo.
                O sistema gera um Excel pronto para subir no Robô de Cotação.
              </p>

              {/* Upload */}
              <div
                className="ia-modal-upload"
                onClick={() => tabelaInputRef.current?.click()}
              >
                {tabelaArquivo
                  ? <span style={{ color: '#1A7A4A', fontWeight: 600 }}>✓ {tabelaArquivo.name}</span>
                  : <span>Clique para selecionar a tabela base (.xlsx ou .pdf)</span>
                }
                <input
                  type="file" accept=".xlsx,.xls,.pdf" ref={tabelaInputRef}
                  style={{ display: 'none' }}
                  onChange={e => { setTabelaArquivo(e.target.files[0]); setTabelaSucesso(false); }}
                />
              </div>

              {/* % por prazo */}
              <div className="ia-modal-prazos">
                {[7, 14, 21, 28].map(p => (
                  <div key={p} className="ia-modal-prazo-item">
                    <label>{p} dias</label>
                    <div className="ia-modal-prazo-input">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        step="0.1"
                        value={pctPrazos[p]}
                        onChange={e => setPctPrazos(prev => ({ ...prev, [p]: parseFloat(e.target.value) || 0 }))}
                      />
                      <span>%</span>
                    </div>
                    <div className="ia-modal-prazo-exemplo">
                      {pctPrazos[p] > 0
                        ? `R$ 10,00 → R$ ${(10 * (1 + pctPrazos[p] / 100)).toFixed(2).replace('.', ',')}`
                        : 'sem aumento'}
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="ia-modal-btn"
                disabled={!tabelaArquivo || gerandoTabela}
                onClick={handleGerarTabela}
              >
                {gerandoTabela ? 'Gerando...' : 'Gerar e baixar tabela'}
              </button>

              {tabelaSucesso && (
                <p className="ia-modal-sucesso">
                  ✓ Tabela gerada! Agora suba o arquivo no Robô de Cotação.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Chat */}
        <div className="ia-chat-wrap">
          <div className="ia-messages">
            {messages.length === 0 ? (
              <div className="ia-empty">
                <div className="ia-empty-ico">🤖</div>
                <div className="ia-empty-title">Olá{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!</div>
                <div className="ia-empty-sub">Sou seu assistente especializado em representação comercial. Escolha um atalho ao lado ou me pergunte qualquer coisa.</div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`ia-msg ${msg.role === 'user' ? 'user' : 'bot'}`}>
                  <div className="ia-bubble">{msg.content}</div>
                  <div className="ia-msg-footer">
                    <span className="ia-msg-time">{formatTime(msg.time)}</span>
                    {msg.role === 'model' && !msg.isError && (
                      <button
                        className={`ia-copy-btn ${copiedId === idx ? 'copied' : ''}`}
                        onClick={() => handleCopy(msg.content, idx)}
                      >
                        {copiedId === idx ? '✓ Copiado' : 'Copiar'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="ia-msg bot ia-typing">
                <div className="ia-bubble">
                  <div className="ia-dot" />
                  <div className="ia-dot" />
                  <div className="ia-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="ia-input-area">
            <textarea
              ref={textareaRef}
              className="ia-textarea"
              placeholder="Pergunte qualquer coisa sobre vendas, ofertas, clientes..."
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e); }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
            />
            <button
              className="ia-send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              title="Enviar (Enter)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className="ia-input-hint">Enter para enviar · Shift+Enter para nova linha</div>
        </div>

      </div>
    </div>
  );
}
