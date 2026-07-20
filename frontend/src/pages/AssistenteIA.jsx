import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, ExternalLink } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { cancelarTabelaPrazos, gerarTabelaPrazos } from '../services/cotacao.service';
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
    texto: 'Aja como um especialista em apoio comercial para representantes. Escreva uma mensagem persuasiva, profissional e direta para o setor de análise de crédito da empresa, solicitando a liberação de um pedido e o aumento do limite de crédito de um cliente. A mensagem será enviada por e-mail para o analista.\n\nUse os seguintes dados para montar a mensagem:\n\nNome do Cliente / Razão Social: [DIGITE O NOME AQUI]\nCNPJ: [DIGITE O CNPJ AQUI]\nLimite Atual: [DIGITE O VALOR DO LIMITE ATUAL AQUI]\nLimite Desejado / Solicitado: [DIGITE O NOVO LIMITE AQUI]\nValor do Pedido Atual (que está travado): [DIGITE O VALOR DO PEDIDO AQUI]\nJustificativa principal: [ESCOLHA UMA OU MAIS: Excelente pagador / Cliente novo com grande potencial de compra / Aumentou muito o volume de vendas na loja / Concorrente está oferecendo mais limite / Mix de produtos está girando rápido]\n\nA mensagem deve ser amigável, focada em não perder a venda e em construir uma boa parceria com o setor de crédito. Gere apenas o texto da mensagem pronto para eu copiar e enviar.',
  },
  {
    label: 'Vitrine: lista organizada',
    sub: 'Transforma pedido, PDF ou Excel em CSV para colar na vitrine',
    texto: `Analise a lista, PDF ou Excel fornecido abaixo e transforme em uma lista organizada para eu colar na Vitrine Inteligente.

Formato obrigatório da resposta:
- Gere a resposta em CSV separado por ponto e vírgula (;).
- Coloque tudo dentro de um bloco de código para aparecer o botão de copiar.
- Use exatamente este cabeçalho:
Nome do Produto;Quantidade da Embalagem;Preço Unitário
- Cada produto deve ficar em uma linha separada.
- Não coloque nenhum texto antes ou depois do bloco de código.

Regras importantes:
- Ignore códigos, descrições duplicadas, observações ou qualquer informação irrelevante.
- Ignore totais, subtotal, impostos, frete, validade, CNPJ, vendedor, cliente, observações e linhas sem produto.
- Não invente produtos, preços ou quantidades.
- Não junte vários produtos na mesma linha.
- O nome do produto deve ficar limpo, sem código de barras, código interno, número de item ou quantidade pedida.
- Se a embalagem aparecer como CX 8UN, CX-24, CX 24, FD-20, FARDO 12UN ou similar, coloque essa informação em Quantidade da Embalagem.
- Prefira manter a embalagem no padrão curto encontrado na lista, por exemplo CX-6, CX-12, CX-24, FD-20 ou CX 8UN.
- Se não encontrar a quantidade da embalagem, deixe a coluna vazia.
- Se encontrar preço em formato brasileiro, mantenha com vírgula. Exemplo: 8,54.
- Sempre devolva o Preço Unitário com vírgula e duas casas decimais.
- Se o preço vier com 3 casas decimais no padrão da lista, arredonde sempre para cima e deixe duas casas. Exemplo: 2,153 vira 2,16; 2,154 vira 2,16; 2,150 vira 2,15.
- Se o preço vier como 2.153 e estiver claramente no padrão da lista como preço com 3 casas decimais, interprete como 2,153, arredonde para cima e devolva 2,16.
- Se 2.150 estiver claramente no padrão da lista como preço com 3 casas decimais, devolva 2,15.
- Se o ponto for separador de milhar e não decimal, não trate como preço unitário.

Exemplo do formato ideal para a Vitrine:
\`\`\`csv
Nome do Produto;Quantidade da Embalagem;Preço Unitário
ACHOC TODDY 1.8KG;CX-6;30,83
ACHOC TODDY 750G TRAD;CX-12;15,25
ACHOC TODDY 370G TRAD;CX-24;8,14
CHA LEAO MATTE GRANEL 250G NAT;CX-30;5,62
CHA LEAO MATTE GRANEL 100G ORIGINAL;CX-60;4,17
MILHO VERDE QUERO 170G LT;CX-24;2,63
MOLHO QUERO 240G SACHE MANJERICAO;CX-32;1,59
MOLHO QUERO 240G SACHE PIZZA;CX-32;1,59
\`\`\`

[COLE SUA LISTA AQUI OU ANEXE O PDF/EXCEL]`,
  },
  {
    label: 'Transformar PDF em Excel',
    sub: 'Gera Excel com preço unitário para Cotação Pronta',
    texto: 'Transforme o PDF de preços anexado em um arquivo Excel (.xlsx) pronto para usar na Cotação Pronta do Venpro.\n\nO PDF pode trazer preço por caixa, fardo, display, frasco, pacote ou embalagem. Preciso que o resultado final tenha o preço unitário.\n\nRegras obrigatórias:\n- Gere um arquivo .xlsx com apenas estas colunas: PRODUTO | EAN | 7 dias.\n- Em “7 dias”, coloque sempre o preço unitário.\n- Se o PDF já tiver preço unitário, use esse preço.\n- Se o PDF tiver apenas preço da caixa, fardo, display, frasco, pacote ou embalagem, divida o preço pela quantidade da embalagem.\n- Use quantidades como CX/12, FD/10, DPL/6, FRC/12, PAC/24.\n- Se aparecer CX/1, mas a descrição indicar quantidade, use a quantidade da descrição. Exemplos: CX C/100, C/100 UN, CX 24UN, FD 10UN, L12P11.\n- Não use PAL/960, PAL/1152 ou qualquer divisor de pallet.\n- Não crie colunas de 14, 21 ou 28 dias. O Venpro vai gerar esses prazos depois.\n- Arredonde sempre para cima no centavo, com 2 casas decimais. Exemplo: 178,44 ÷ CX/12 = 14,87.\n- Use vírgula como separador decimal.\n- Não invente EAN, produto, preço, embalagem ou quantidade.\n- Se o EAN não aparecer no PDF, deixe a célula EAN em branco.\n- Ignore totais, cabeçalhos, rodapés, dados do cliente, observações e linhas sem produto.\n- Mantenha o nome do produto fiel ao PDF, sem corrigir, resumir ou reescrever.\n\nSe não conseguir gerar .xlsx, entregue em bloco de código separado por TABULAÇÃO, com uma linha por produto, assim:\n```text\nPRODUTO\tEAN\t7 dias\nABACAXI MAESTRIA RODELA CALDA LT 400G\t7898935234149\t14,87\nPACOCA PACOQUITA ROLHA CX C/100 UN 15G\t\t0,28\n```\n\n[ANEXE O PDF AQUI]',
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

const IA_SHORTCUTS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
];

const PDF_HELPER = {
  name: 'iLovePDF',
  url: 'https://www.ilovepdf.com/pt',
  title: 'Organizar PDF antes da IA',
  description: 'Use para juntar varios PDFs em um arquivo so, separar paginas, comprimir e converter PDF para Excel antes de trabalhar a tabela na IA.',
};

export default function AssistenteIA() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [selectedPrompt, setSelectedPrompt] = useState(null);

  // Estado do modal "Gerar Tabela com Prazos"
  const [showTabelaModal, setShowTabelaModal] = useState(false);
  const [tabelaArquivo, setTabelaArquivo] = useState(null);
  const [pctPrazos, setPctPrazos] = useState({ 7: '', 14: '', 21: '', 28: '', 35: '', 42: '' });
  const [gerandoTabela, setGerandoTabela] = useState(false);
  const [tabelaSucesso, setTabelaSucesso] = useState(false);
  const [gerandoSeg, setGerandoSeg] = useState(0);
  const [tabelaProgress, setTabelaProgress] = useState(null);
  const [tabelaErro, setTabelaErro] = useState('');
  const [tabelaDownloadUrl, setTabelaDownloadUrl] = useState('');
  const tabelaInputRef = useRef(null);
  const timerRef = useRef(null);
  const abortTabelaRef = useRef(null);
  const tabelaJobIdRef = useRef(null);
  const canceladoPeloUsuarioRef = useRef(false);

  const ajustarPercentualPrazo = (prazo, delta) => {
    setPctPrazos(prev => {
      const atual = parseFloat(String(prev[prazo]).replace(',', '.'));
      const base = Number.isFinite(atual) ? atual : 0;
      const novo = Math.max(-99, Math.min(99, Math.round((base + delta) * 100) / 100));
      return { ...prev, [prazo]: String(novo) };
    });
  };

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setInput(prompt.texto);
  };

  const handleOpenIa = async (shortcut) => {
    if (input.trim()) {
      try {
        await navigator.clipboard.writeText(input);
        setCopiedId(`ia-${shortcut.name}`);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success(`Prompt copiado. Cole no ${shortcut.name}.`);
      } catch (err) {
        toast.info(`Abra o ${shortcut.name} e copie o prompt manualmente.`);
      }
    }
    window.open(shortcut.url, '_blank', 'noopener,noreferrer');
  };

  const renderPdfHelper = () => (
    <div className="ia-pdf-helper">
      <div>
        <div className="ia-pdf-helper-kicker">Ferramenta PDF</div>
        <div className="ia-pdf-helper-title">{PDF_HELPER.title}</div>
        <div className="ia-pdf-helper-desc">{PDF_HELPER.description}</div>
      </div>
      <button
        className="ia-pdf-helper-btn"
        onClick={() => window.open(PDF_HELPER.url, '_blank', 'noopener,noreferrer')}
      >
        <span>Abrir {PDF_HELPER.name}</span>
        <ExternalLink size={14} />
      </button>
    </div>
  );

  const handleGerarTabela = async () => {
    if (!tabelaArquivo) return;
    setGerandoTabela(true);
    setTabelaSucesso(false);
    setGerandoSeg(0);
    setTabelaProgress(null);
    setTabelaErro('');
    if (tabelaDownloadUrl) {
      window.URL.revokeObjectURL(tabelaDownloadUrl);
      setTabelaDownloadUrl('');
    }
    tabelaJobIdRef.current = null;
    canceladoPeloUsuarioRef.current = false;
    abortTabelaRef.current = new AbortController();
    timerRef.current = setInterval(() => setGerandoSeg(s => s + 1), 1000);
    try {
      const blob = await gerarTabelaPrazos(
        tabelaArquivo,
        pctPrazos,
        (s) => setGerandoSeg(s),
        {
          signal: abortTabelaRef.current.signal,
          onJobId: (jobId) => { tabelaJobIdRef.current = jobId; },
          onServerProgress: setTabelaProgress,
        }
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tabela_com_prazos.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTabelaDownloadUrl(url);
      setTabelaSucesso(true);
      setTabelaArquivo(null);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (!canceladoPeloUsuarioRef.current) {
          toast.info('Processamento cancelado.');
        }
      } else {
        const message = err.message || 'Erro desconhecido';
        setTabelaErro(message);
        toast.error('Erro ao gerar tabela. Veja os detalhes na janela.');
      }
    } finally {
      clearInterval(timerRef.current);
      setGerandoTabela(false);
      abortTabelaRef.current = null;
      tabelaJobIdRef.current = null;
    }
  };

  const handleCancelarTabela = async () => {
    const jobId = tabelaJobIdRef.current;
    canceladoPeloUsuarioRef.current = true;
    abortTabelaRef.current?.abort();
    clearInterval(timerRef.current);
    setGerandoTabela(false);
    setGerandoSeg(0);
    setTabelaProgress(null);
    try {
      await cancelarTabelaPrazos(jobId);
    } catch (err) {
      console.warn('Erro ao cancelar job de tabela:', err);
    }
    tabelaJobIdRef.current = null;
    abortTabelaRef.current = null;
    toast.info('Processamento cancelado. Você pode tentar novamente.');
  };

  const handleFecharTabelaModal = () => {
    if (gerandoTabela) {
      handleCancelarTabela();
      return;
    }
    setShowTabelaModal(false);
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
            onClick={() => { setShowTabelaModal(true); setTabelaSucesso(false); setTabelaErro(''); }}
          >
            📊 Gerar tabela de prazos
            <span>Aplica % por prazo na sua tabela base</span>
          </button>

          <div className="ia-sidebar-title" style={{ marginTop: 16 }}>Atalhos rápidos</div>
          <div className="ia-prompt-grid">
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
        </div>

        {/* Modal: Gerar Tabela de Prazos */}
        {showTabelaModal && (
          <div className="ia-modal-overlay" onClick={handleFecharTabelaModal}>
            <div className="ia-modal" onClick={e => e.stopPropagation()}>
              <div className="ia-modal-header">
                <span>📊 Gerar Tabela com Prazos</span>
                <button className="ia-modal-close" onClick={handleFecharTabelaModal}>✕</button>
              </div>

              <p className="ia-modal-desc">
                Suba a planilha base do atacadista em Excel (.xlsx) e informe o % por prazo (aumento ou desconto).
                O sistema gera um Excel pronto para subir no Robô de Cotação.
              </p>

              {/* Upload */}
              <div
                className="ia-modal-upload"
                onClick={() => tabelaInputRef.current?.click()}
              >
                {tabelaArquivo
                  ? <span style={{ color: '#1A7A4A', fontWeight: 600 }}>✓ {tabelaArquivo.name}</span>
                  : <span>Clique para selecionar a tabela base (.xlsx)</span>
                }
                <input
                  type="file" accept=".xlsx" ref={tabelaInputRef}
                  style={{ display: 'none' }}
                  onChange={e => {
                    setTabelaArquivo(e.target.files[0]);
                    setTabelaSucesso(false);
                    setTabelaErro('');
                    if (tabelaDownloadUrl) {
                      window.URL.revokeObjectURL(tabelaDownloadUrl);
                      setTabelaDownloadUrl('');
                    }
                  }}
                />
              </div>

              {/* % por prazo */}
              <div className="ia-modal-prazos">
                {[7, 14, 21, 28, 35, 42].map(p => (
                  <div key={p} className="ia-modal-prazo-item">
                    <label>{p} dias</label>
                    <div className="ia-modal-prazo-input">
                      <button
                        type="button"
                        onClick={() => ajustarPercentualPrazo(p, -0.01)}
                        style={{
                          background: '#1f2937',
                          color: '#e5e7eb',
                          border: '1px solid #374151',
                          borderRadius: 6,
                          width: 28,
                          height: 28,
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                        title="Diminuir 0,01%"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="-99"
                        max="99"
                        step="0.01"
                        value={pctPrazos[p]}
                        placeholder="0,00"
                        onChange={e => {
                          const val = e.target.value;
                          // Mantém texto bruto para permitir digitar negativos (ex.: "-", "-3", "-3.5")
                          setPctPrazos(prev => ({ ...prev, [p]: val }));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => ajustarPercentualPrazo(p, 0.01)}
                        style={{
                          background: '#1f2937',
                          color: '#e5e7eb',
                          border: '1px solid #374151',
                          borderRadius: 6,
                          width: 28,
                          height: 28,
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                        title="Aumentar 0,01%"
                      >
                        +
                      </button>
                      <span>%</span>
                    </div>
                    <div className="ia-modal-prazo-exemplo">
                      {pctPrazos[p] !== '' && Number.isFinite(parseFloat(pctPrazos[p]))
                        ? `R$ 10,00 → R$ ${(10 * (1 + parseFloat(pctPrazos[p]) / 100)).toFixed(2).replace('.', ',')}`
                        : 'sem ajuste'}
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
                  ? `Processando... ${gerandoSeg}s`
                  : 'Gerar e baixar tabela'}
              </button>

              {gerandoTabela && (
                <button
                  className="ia-modal-btn"
                  onClick={handleCancelarTabela}
                  style={{ marginTop: 8, background: '#45484e' }}
                >
                  Cancelar processamento
                </button>
              )}

              {(gerandoTabela || tabelaSucesso) && (() => {
                const pct = tabelaSucesso
                  ? 100
                  : tabelaProgress?.stage === 'extracting_pdf' && tabelaProgress.total_pages
                    ? Math.min(88, Math.max(8, Math.round((tabelaProgress.current_page / tabelaProgress.total_pages) * 88)))
                    : tabelaProgress?.stage === 'extracting_pdf_text' && tabelaProgress.total_pages && tabelaProgress.current_page
                      ? Math.min(88, Math.max(8, Math.round((tabelaProgress.current_page / tabelaProgress.total_pages) * 88)))
                    : Math.min(88, Math.round(gerandoSeg / (gerandoSeg + 15) * 100));
                const color = tabelaSucesso ? '#22c55e' : '#e8412a';
                let label;
                if (tabelaSucesso) {
                  label = 'Tabela gerada com sucesso!';
                } else if (tabelaProgress?.stage === 'extracting_pdf') {
                  label = `Lendo PDF: página ${tabelaProgress.current_page}/${tabelaProgress.total_pages} · ${tabelaProgress.rows} produtos encontrados`;
                } else if (tabelaProgress?.stage === 'extracting_pdf_text') {
                  label = tabelaProgress.current_page
                    ? `Lendo texto do PDF: página ${tabelaProgress.current_page}/${tabelaProgress.total_pages} · ${tabelaProgress.rows} produtos encontrados`
                    : `Lendo texto do PDF: ${tabelaProgress.total_pages || '?'} páginas`;
                } else if (tabelaProgress?.stage === 'writing_excel') {
                  label = `Montando Excel com ${tabelaProgress.rows} produtos...`;
                } else if (tabelaProgress?.stage === 'pdf_opened') {
                  label = `PDF aberto: ${tabelaProgress.total_pages} páginas`;
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
                  Aguarde — o servidor está lendo a planilha e montando as colunas de prazo.
                </p>
              )}

              {tabelaSucesso && (
                <div className="ia-modal-sucesso">
                  <p>✓ Tabela gerada! Se o download não abriu, clique no botão abaixo.</p>
                  {tabelaDownloadUrl && (
                    <a
                      className="ia-modal-btn"
                      href={tabelaDownloadUrl}
                      download="tabela_com_prazos.xlsx"
                      style={{ display: 'block', marginTop: 10, textAlign: 'center', textDecoration: 'none' }}
                    >
                      Baixar tabela gerada
                    </a>
                  )}
                </div>
              )}

              {tabelaErro && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 8,
                  background: '#2a1717',
                  border: '1px solid #7f1d1d',
                  color: '#fecaca',
                  fontSize: 12,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}>
                  <strong>Erro ao gerar tabela:</strong> {tabelaErro}
                </div>
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
                <div className="ia-empty-shortcuts">
                  <div className="ia-provider-title">Abrir IA</div>
                  <div className="ia-shortcuts">
                    {IA_SHORTCUTS.map((shortcut) => (
                      <button
                        key={shortcut.name}
                        className="ia-shortcut-btn"
                        onClick={() => handleOpenIa(shortcut)}
                      >
                        <span>{shortcut.name}</span>
                        <ExternalLink size={14} />
                      </button>
                    ))}
                  </div>
                  {renderPdfHelper()}
                </div>
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
                  Edite os campos entre colchetes, copie o prompt e cole no ChatGPT ou outra IA que preferir.
                </div>
                <div className="ia-provider-title">Copiar e abrir em</div>
                <div className="ia-shortcuts">
                  {IA_SHORTCUTS.map((shortcut) => (
                    <button
                      key={shortcut.name}
                      className="ia-shortcut-btn"
                      onClick={() => handleOpenIa(shortcut)}
                    >
                      <span>{copiedId === `ia-${shortcut.name}` ? 'Copiado' : shortcut.name}</span>
                      <ExternalLink size={14} />
                    </button>
                  ))}
                </div>
                {renderPdfHelper()}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
