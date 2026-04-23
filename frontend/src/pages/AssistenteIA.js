import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
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

    // histórico no formato que o backend espera (sem o campo time)
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }

      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'model',
        content: data.response,
        time: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'model',
        content: `⚠️ Erro ao conectar com o assistente: ${err.message}. Tente novamente.`,
        time: new Date(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [input, messages, loading]);

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
          <div className="ia-sidebar-title">Atalhos rápidos</div>
          {PROMPTS_RAPIDOS.map((p, i) => (
            <button key={i} className="ia-prompt-btn" onClick={() => handlePrompt(p.texto)}>
              {p.label}
              <span>{p.sub}</span>
            </button>
          ))}
        </div>

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
