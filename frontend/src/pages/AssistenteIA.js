import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { gerarTabelaPrazos } from '../services/cotacao.service';
import './AssistenteIA.css';

function processInline(str, keyPrefix) {
  const parts = str.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/);
  return parts.map((part, i) => {
    const k = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**'))
      return <em key={k}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={k} className="ia-md-code">{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderMarkdown(text) {
  const lines = text.split('\n');
  const result = [];
  let listBuffer = [];
  let listType = null;

  const flushList = (key) => {
    if (!listBuffer.length) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    result.push(
      <Tag key={`list-${key}`} className="ia-md-list">
        {listBuffer.map((item, i) => (
          <li key={i}>{processInline(item, `li-${key}-${i}`)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    const bulletMatch = trimmed.match(/^[-•*] (.+)/);
    const numberedMatch = trimmed.match(/^\d+\. (.+)/);

    if (bulletMatch) {
      if (listType !== 'ul') { flushList(i); listType = 'ul'; }
      listBuffer.push(bulletMatch[1]);
    } else if (numberedMatch) {
      if (listType !== 'ol') { flushList(i); listType = 'ol'; }
      listBuffer.push(numberedMatch[1]);
    } else {
      flushList(i);
      if (trimmed === '') {
        if (result.length > 0) result.push(<br key={`br-${i}`} />);
      } else if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
        const txt = trimmed.replace(/^#{2,3} /, '');
        result.push(<p key={i} className="ia-md-heading">{processInline(txt, `h-${i}`)}</p>);
      } else {
        result.push(<p key={i} className="ia-md-p">{processInline(trimmed, `p-${i}`)}</p>);
      }
    }
  });

  flushList('final');
  return result;
}

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
    label: 'Crédito e limite',
    sub: 'Pedido travado ou aumento de limite',
    texto: 'Aja como um assistente de um representante comercial. Escreva uma mensagem persuasiva, profissional e direta para o setor de análise de crédito da empresa, solicitando a liberação de um pedido e o aumento do limite de crédito de um cliente. A mensagem será enviada por e-mail para o analista.\n\nUse os seguintes dados para montar a mensagem:\n\nNome do Cliente / Razão Social: [DIGITE O NOME AQUI]\nCNPJ: [DIGITE O CNPJ AQUI]\nLimite Atual: [DIGITE O VALOR DO LIMITE ATUAL AQUI]\nLimite Desejado / Solicitado: [DIGITE O NOVO LIMITE AQUI]\nValor do Pedido Atual (que está travado): [DIGITE O VALOR DO PEDIDO AQUI]\nJustificativa principal: [ESCOLHA UMA OU MAIS: Excelente pagador / Cliente novo com grande potencial de compra / Aumentou muito o volume de vendas na loja / Concorrente está oferecendo mais limite / Mix de produtos está girando rápido]\n\nA mensagem deve ser amigável, focada em não perder a venda e em construir uma boa parceria com o setor de crédito. Gere apenas o texto da mensagem pronto para eu copiar e enviar.',
  },
  {
    label: 'Vitrine: lista organizada',
    sub: 'Transforma pedido, PDF ou Excel em CSV para colar na vitrine',
    texto: 'Analise a lista, PDF ou Excel fornecido abaixo e transforme em uma lista organizada para eu colar na Vitrine Inteligente.\n\nFormato obrigatório da resposta:\n- Gere a resposta em CSV separado por ponto e vírgula (;).\n- Coloque tudo dentro de um bloco de código para aparecer o botão de copiar.\n- Use exatamente este cabeçalho:\nNome do Produto;Quantidade da Embalagem;Preço Unitário\n- Cada produto deve ficar em uma linha separada.\n- Não coloque nenhum texto antes ou depois do bloco de código.\n\nRegras importantes:\n- Ignore códigos, descrições duplicadas, observações ou qualquer informação irrelevante.\n- Se encontrar preço em formato brasileiro, mantenha com vírgula. Exemplo: 8,54.\n- Se o preço vier como 2.150, interprete como 2,150 apenas se isso estiver claramente no padrão da lista; se for preço com 3 casas, mantenha 2,150.\n- Se a embalagem aparecer como CX 8UN, CX-24, CX 24, FD-20, FARDO 12UN ou similar, coloque essa informação em Quantidade da Embalagem.\n- Se não encontrar a quantidade da embalagem, deixe a coluna vazia.\n- Não invente produtos, preços ou quantidades.\n- Não junte vários produtos na mesma linha.\n\nExemplo do formato final:\n```csv\nNome do Produto;Quantidade da Embalagem;Preço Unitário\nAGUA SANITARIA YPE 2L;CX 8UN;8,54\nLAVA ROUPA PO ASSIM 800G;CX 20UN;119,00\nCOCO RAL MENINA 100G TRAD;CX 24UN;2,05\n```\n\n[COLE SUA LISTA AQUI OU ANEXE O PDF/EXCEL]',
  },
  {
    label: 'Cotação: PDF em Excel',
    sub: 'Organiza PDF de preço para subir na Cotação Pronta',
    texto: 'Analise o PDF, pedido ou tabela de preços anexado e transforme em uma tabela compatível com a ferramenta Cotação Pronta.\n\nFormato obrigatório da resposta:\n- Gere a resposta em CSV separado por ponto e vírgula (;).\n- Coloque tudo dentro de um bloco de código para aparecer o botão de copiar.\n- Use exatamente este cabeçalho:\nPRODUTO;EAN;7 dias;14 dias;21 dias;28 dias\n- Cada produto deve ficar em uma linha separada.\n- Não coloque nenhum texto antes ou depois do bloco de código.\n\nRegras para extrair os dados:\n- Use a coluna de descrição/nome do produto como PRODUTO.\n- Use EAN, GTIN ou código de barras na coluna EAN. Se não existir, deixe em branco.\n- Use o preço unitário como base. Não use preço total do pedido nem preço da embalagem, a menos que o arquivo só tenha esse preço e isso esteja claro.\n- Se o preço aparecer como 3.222, trate como 3,222 quando o fornecedor usar três casas decimais.\n- Converta os preços para duas casas decimais.\n- Não invente produtos, EAN ou preços.\n- Ignore cabeçalhos, totais, observações, dados da empresa, dados do cliente e linhas sem produto.\n\nPercentuais por prazo:\n- 7 dias: [DIGITE O PERCENTUAL. Ex: 0]\n- 14 dias: [DIGITE O PERCENTUAL. Ex: 0,69]\n- 21 dias: [DIGITE O PERCENTUAL. Ex: 1,38]\n- 28 dias: [DIGITE O PERCENTUAL. Ex: 2,07]\n\nRegra de arredondamento:\n- Depois de aplicar o percentual, arredonde sempre para cima no centavo.\n- Exemplo: se o resultado for 3,222, escreva 3,23.\n- Exemplo: se o resultado for 10,001, escreva 10,01.\n\nExemplo do formato final:\n```csv\nPRODUTO;EAN;7 dias;14 dias;21 dias;28 dias\nABS ALWAYS BASICO C/8 C/ABA PQ SC;7500435127226;3,13;3,15;3,17;3,19\nAGUA SANITARIA YPE 2L;7896098900123;8,54;8,60;8,66;8,72\n```\n\n[ANEXE O PDF/EXCEL OU COLE A LISTA AQUI]',
  },
  {
    label: 'Mensagem para link da vitrine',
    sub: 'Cria WhatsApp persuasivo para enviar junto com o link',
    texto: 'Aja como um especialista em vendas e copywriting voltado para o mercado B2B: lojistas, supermercados, padarias e mercadinhos.\n\nVou fornecer um tema de campanha, um gatilho principal, uma lista de produtos em oferta e o link da minha Vitrine Inteligente. Sua tarefa é criar mensagens de WhatsApp altamente persuasivas para eu enviar aos meus clientes junto com o link.\n\nRegras para a criação da mensagem:\n\n1. Gatilhos mentais\nUse psicologia de vendas focada em urgência, escassez ou oportunidade de ganho. Exemplos: só até amanhã, últimas caixas no preço antigo, produtos de alto giro para turbinar seu lucro.\n\n2. Tom\nEmpolgante, vendedor, parceiro de negócios e direto ao ponto. Textos longos não funcionam no WhatsApp.\n\n3. Foco no lojista\nDestaque que os produtos têm saída rápida, ajudam na reposição e podem melhorar margem, giro e lucro da loja.\n\n4. Formatação visual\nUse emojis estratégicos, negrito nos preços e separação clara da lista de produtos para facilitar a leitura no celular.\n\n5. Link da Vitrine\nInclua o link da vitrine de forma natural, como chamada para o cliente abrir, escolher as quantidades e enviar o pedido.\n\n6. CTA\nTermine com uma chamada forte para ação. Exemplo: Me responda com EU QUERO para eu segurar seu pedido antes que zere.\n\nInformações da campanha de hoje:\n\nTema / Apelo de Venda: [ESCREVA AQUI O TEMA. Ex: Quinta-feira de Ofertas Espetaculares / Fecha Mês Imbatível / Alerta de Reposição de Estoque]\n\nGatilho Principal: [ESCREVA AQUI O MOTIVO. Ex: Estoque limitado / Mudança de tabela semana que vem / Produtos mais vendidos da semana]\n\nLink da Vitrine Inteligente: [COLE AQUI O LINK DA VITRINE]\n\nLista de Produtos com nome, quantidade e preço:\n[COLE AQUI A SUA LISTA DE PRODUTOS]\n\nCom base nisso, crie 3 opções diferentes de mensagem:\n\n1. Uma mais agressiva, focada em urgência.\n2. Uma mais consultiva, focada em lucro, giro e reposição.\n3. Uma mais curta e direta para WhatsApp.\n\nGere apenas as 3 mensagens prontas para copiar e enviar.',
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

export default function AssistenteIA() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [selectedPrompt, setSelectedPrompt] = useState(null);

  // Estado do modal "Gerar Tabela com Prazos"
  const [showTabelaModal, setShowTabelaModal] = useState(false);
  const [tabelaArquivo, setTabelaArquivo] = useState(null);
  const [pctPrazos, setPctPrazos] = useState({ 7: '', 14: '', 21: '', 28: '' });
  const [gerandoTabela, setGerandoTabela] = useState(false);
  const [tabelaSucesso, setTabelaSucesso] = useState(false);
  const [gerandoSeg, setGerandoSeg] = useState(0);
  const tabelaInputRef = useRef(null);
  const timerRef = useRef(null);

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setInput(prompt.texto);
  };

  const handleGerarTabela = async () => {
    if (!tabelaArquivo) return;
    setGerandoTabela(true);
    setTabelaSucesso(false);
    setGerandoSeg(0);
    timerRef.current = setInterval(() => setGerandoSeg(s => s + 1), 1000);
    try {
      const blob = await gerarTabelaPrazos(tabelaArquivo, pctPrazos, (s) => setGerandoSeg(s));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tabela_com_prazos.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      setTabelaSucesso(true);
      setTabelaArquivo(null);
    } catch (err) {
      toast.error('Erro ao gerar tabela: ' + (err.message || 'Erro desconhecido'));
    } finally {
      clearInterval(timerRef.current);
      setGerandoTabela(false);
    }
  };

  return (
    <div className="ia-page">
      {/* Header */}
      <header className="ia-header">
        <div className="ia-header-left">
          <button className="venpro-back-button" onClick={() => navigate('/dashboard')} title="Voltar" aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
          <div className="ia-status-dot" />
          <div>
            <div className="ia-header-title">Prompts Prontos para RCA</div>
            <div className="ia-header-sub">Comandos para organizar tabelas, ofertas e mensagens usando a IA da sua preferência</div>
          </div>
        </div>
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
            <button
              key={i}
              className={`ia-prompt-btn ${selectedPrompt?.label === p.label ? 'active' : ''}`}
              onClick={() => handlePrompt(p)}
            >
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
                        step="0.01"
                        value={pctPrazos[p]}
                        placeholder="0,00"
                        onChange={e => {
                          const val = e.target.value;
                          setPctPrazos(prev => ({ ...prev, [p]: val === '' ? '' : parseFloat(val) || 0 }));
                        }}
                      />
                      <span>%</span>
                    </div>
                    <div className="ia-modal-prazo-exemplo">
                      {pctPrazos[p] && parseFloat(pctPrazos[p]) > 0
                        ? `R$ 10,00 → R$ ${(10 * (1 + parseFloat(pctPrazos[p]) / 100)).toFixed(2).replace('.', ',')}`
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
                {gerandoTabela
                  ? `Processando... ${gerandoSeg}s${tabelaArquivo?.name?.toLowerCase().endsWith('.pdf') ? ' (PDF pode levar 1-2 min)' : ''}`
                  : 'Gerar e baixar tabela'}
              </button>

              {(gerandoTabela || tabelaSucesso) && (() => {
                const pct = tabelaSucesso ? 100 : Math.min(88, Math.round(gerandoSeg / (gerandoSeg + 15) * 100));
                const color = tabelaSucesso ? '#22c55e' : '#e8412a';
                let label;
                if (tabelaSucesso) {
                  label = 'Tabela gerada com sucesso!';
                } else if (gerandoSeg >= 120) {
                  label = `Aguardando servidor... ${gerandoSeg}s (pode levar até 10 min para PDFs)`;
                } else if (gerandoSeg >= 30) {
                  label = `Processando planilha... ${gerandoSeg}s`;
                } else {
                  label = 'Enviando arquivo...';
                }
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                      <span>{label}</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ background: '#0f172a', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                        borderRadius: 8, transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                );
              })()}

              {gerandoTabela && gerandoSeg > 10 && (
                <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                  Aguarde — o servidor está lendo {tabelaArquivo?.name?.toLowerCase().endsWith('.pdf') ? 'o PDF com IA' : 'a planilha'} e montando as colunas de prazo.
                </p>
              )}

              {tabelaSucesso && (
                <p className="ia-modal-sucesso">
                  ✓ Tabela gerada! Agora suba o arquivo no Robô de Cotação.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Prompt selecionado */}
        <div className="ia-chat-wrap">
          <div className="ia-prompt-view">
            {!selectedPrompt ? (
              <div className="ia-empty">
                <div className="ia-empty-ico"><ClipboardList size={42} color="var(--ia-acento)" /></div>
                <div className="ia-empty-title">Olá{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!</div>
                <div className="ia-empty-sub">Escolha um prompt ao lado para copiar e usar na IA da sua preferência.</div>
              </div>
            ) : (
              <div className="ia-prompt-card">
                <div className="ia-prompt-card-header">
                  <div>
                    <div className="ia-prompt-card-title">{selectedPrompt.label}</div>
                    <div className="ia-prompt-card-sub">{selectedPrompt.sub}</div>
                  </div>
                  <button
                    className={`ia-copy-main ${copiedId === 'prompt' ? 'copied' : ''}`}
                    onClick={() => handleCopy(input, 'prompt')}
                  >
                    {copiedId === 'prompt' ? 'Copiado' : 'Copiar prompt'}
                  </button>
                </div>
                <textarea
                  className="ia-prompt-textarea"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  spellCheck={false}
                />
                <div className="ia-prompt-help">
                  Edite os campos entre colchetes, copie o prompt e cole no ChatGPT, Gemini ou outra IA que preferir.
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
