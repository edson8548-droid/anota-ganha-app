import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthContext } from '../contexts/AuthContext';
import { listarTabelas, uploadTabela, excluirTabela, processarCotacao, previewCotacao, confirmarCotacao } from '../services/cotacao.service';
import ReviewMatches from './ReviewMatches';
import ConfirmDialog from '../components/ConfirmDialog';

const API_URL = 'https://api.venpro.com.br';

export default function Cotacao() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const fileInputRef = useRef(null);
  const cotacaoInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('tabelas');
  const [tabelas, setTabelas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Form state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoArquivo, setNovoArquivo] = useState(null);
  const [prazoSelecionado, setPrazoSelecionado] = useState(0);

  // Cotação state
  const [tabelaSelecionada, setTabelaSelecionada] = useState('');
  const [modoMatch, setModoMatch] = useState('completo');
  const [canalPreenchimento, setCanalPreenchimento] = useState('excel');
  const [arquivoCotacao, setArquivoCotacao] = useState(null);

  // Resultado
  const [resultado, setResultado] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [processingSeg, setProcessingSeg] = useState(0);
  const processingTimerRef = useRef(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });

  const showConfirm = (title, description, onConfirm) =>
    setConfirmDialog({ open: true, title, description, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  const carregarTabelas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listarTabelas();
      setTabelas(res.data);
    } catch (err) {
      console.error('Erro ao carregar tabelas:', err);
    }
    setLoading(false);
  }, []);

  useState(() => { carregarTabelas(); }, [carregarTabelas]);

  const handleUpload = async () => {
    if (!novoNome || !novoArquivo) return;
    setUploading(true);
    try {
      await uploadTabela(novoArquivo, novoNome);
      setShowUploadModal(false);
      setNovoNome('');
      setNovoArquivo(null);
      carregarTabelas();
    } catch (err) {
      toast.error('Erro ao subir tabela: ' + (err.response?.data?.detail || err.message));
    }
    setUploading(false);
  };

  const handleExcluir = (id, nome) => {
    showConfirm('Excluir tabela', `Excluir a tabela "${nome}"? Esta ação não pode ser desfeita.`, async () => {
      try {
        await excluirTabela(id);
        carregarTabelas();
      } catch (err) {
        toast.error('Erro ao excluir: ' + err.message);
      }
    });
  };

  const handleProcessar = async () => {
    if (!tabelaSelecionada || !arquivoCotacao) return;
    setProcessing(true);
    setResultado(null);
    setReviewData(null);
    setProcessingSeg(0);
    processingTimerRef.current = setInterval(() => setProcessingSeg(s => s + 1), 1000);
    try {
      const data = await previewCotacao(arquivoCotacao, tabelaSelecionada, modoMatch, prazoSelecionado);
      clearInterval(processingTimerRef.current);
      setReviewData(data);
    } catch (err) {
      clearInterval(processingTimerRef.current);
      toast.error('Erro ao processar: ' + (err.response?.data?.detail || err.message));
    }
    setProcessing(false);
  };

  const handleConfirmar = async (aprovacoes) => {
    if (!reviewData) return;
    setConfirmando(true);
    try {
      const { blob, stats, semMatch } = await confirmarCotacao(reviewData.session_id, aprovacoes);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cotacao_preenchida.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      setResultado({ stats, semMatch });
      setReviewData(null);
    } catch (err) {
      toast.error('Erro ao confirmar: ' + (err.response?.data?.detail || err.message));
    }
    setConfirmando(false);
  };

  const handleLogout = () => {
    showConfirm('Sair', 'Deseja realmente sair?', () => {
      localStorage.removeItem('token');
      navigate('/login');
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#2B2D31' }}>
      {/* Header */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 24px', height: 60, borderBottom: '1px solid #4A4D52',
        background: 'rgba(43,45,49,0.97)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/dashboard')} style={{
            background: 'none', border: '1px solid #4A4D52', borderRadius: 8,
            padding: '6px 14px', fontSize: 13, fontWeight: 600,
            color: '#A0A3A8', cursor: 'pointer',
          }}>← Voltar</button>
          <div style={{ width: 1, height: 20, background: '#4A4D52' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 18 18" fill="none" width="24" height="24">
              <path d="M2 3.5L9 14.5L16 3.5" stroke="#3A85A8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 14.5L12.5 8.5" stroke="rgba(58,133,168,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontWeight: 800, fontSize: 17, color: '#fff' }}>
              Ven<span style={{ color: '#3A85A8' }}>pro</span>
            </span>
            <span style={{ color: '#A0A3A8', fontSize: 13, fontWeight: 500 }}>Cotação Pronta</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => navigate('/assistente')} style={navBtnStyle}>IA</button>
          <button onClick={() => navigate('/minha-licenca')} style={navBtnStyle}>Licença</button>
          <button onClick={handleLogout}
                  style={{ ...navBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,.3)' }}>Sair</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '24px 24px 0', maxWidth: 900, margin: '0 auto' }}>
        <button onClick={() => setActiveTab('tabelas')}
                style={activeTab === 'tabelas' ? tabActiveStyle : tabInactiveStyle}>
          Minhas Tabelas
        </button>
        <button onClick={() => setActiveTab('cotacao')}
                style={activeTab === 'cotacao' ? tabActiveStyle : tabInactiveStyle}>
          Nova Cotação
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 24px' }}>
        {activeTab === 'tabelas' ? (
          <TabelasTab
            tabelas={tabelas}
            loading={loading}
            showUploadModal={showUploadModal}
            setShowUploadModal={setShowUploadModal}
            novoNome={novoNome}
            setNovoNome={setNovoNome}
            novoArquivo={novoArquivo}
            setNovoArquivo={setNovoArquivo}
            uploading={uploading}
            handleUpload={handleUpload}
            handleExcluir={handleExcluir}
            fileInputRef={fileInputRef}
          />
        ) : (
          <CotacaoTab
            tabelas={tabelas}
            tabelaSelecionada={tabelaSelecionada}
            setTabelaSelecionada={(id) => { setTabelaSelecionada(id); setPrazoSelecionado(0); }}
            modoMatch={modoMatch}
            setModoMatch={setModoMatch}
            canalPreenchimento={canalPreenchimento}
            setCanalPreenchimento={setCanalPreenchimento}
            arquivoCotacao={arquivoCotacao}
            setArquivoCotacao={setArquivoCotacao}
            processing={processing}
            handleProcessar={handleProcessar}
            resultado={resultado}
            setResultado={setResultado}
            cotacaoInputRef={cotacaoInputRef}
            reviewData={reviewData}
            setReviewData={setReviewData}
            confirmando={confirmando}
            handleConfirmar={handleConfirmar}
            processingSeg={processingSeg}
            prazoSelecionado={prazoSelecionado}
            setPrazoSelecionado={setPrazoSelecionado}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={() => { confirmDialog.onConfirm?.(); closeConfirm(); }}
        onCancel={closeConfirm}
      />
    </div>
  );
}

function TabelasTab({
  tabelas, loading, showUploadModal, setShowUploadModal,
  novoNome, setNovoNome, novoArquivo, setNovoArquivo,
  uploading, handleUpload, handleExcluir, fileInputRef,
}) {
  return (
    <div style={{ background: '#363940', borderRadius: '0 0 12px 12px', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#E1E1E1', margin: 0, fontSize: 18 }}>Tabelas de Preço</h2>
          <p style={{ color: '#6B6E74', fontSize: 13, margin: '4px 0 0' }}>
            Até 5 planilhas de diferentes atacados
          </p>
        </div>
        <button onClick={() => setShowUploadModal(true)}
                style={primaryBtnStyle}>
          + Adicionar Tabela
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              border: '1px solid #4A4D52', borderRadius: 10, padding: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ flex: 1 }}>
                <span className="skeleton-dark" style={{ display: 'block', height: 16, width: '45%', marginBottom: 8 }} />
                <span className="skeleton-dark" style={{ display: 'block', height: 12, width: '60%' }} />
              </div>
              <span className="skeleton-dark" style={{ display: 'block', height: 28, width: 70, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : tabelas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6B6E74' }}>
          <p style={{ fontSize: 16 }}>Nenhuma tabela cadastrada</p>
          <p style={{ fontSize: 13 }}>Clique em "+ Adicionar Tabela" para começar</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {tabelas.map((t, idx) => (
            <div key={t.id} style={{
              border: idx === 0 ? '2px solid #3A85A8' : '1px solid #4A4D52',
              borderRadius: 10, padding: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {idx === 0 && <span style={{
                    background: '#3A85A8', color: '#fff', padding: '2px 8px',
                    borderRadius: 4, fontSize: 11, fontWeight: 700,
                  }}>ATIVA</span>}
                  <span style={{ fontWeight: 600, color: '#E1E1E1' }}>{t.nome}</span>
                </div>
                <div style={{ color: '#6B6E74', fontSize: 12, marginTop: 4 }}>
                  {t.qtd_produtos} produtos · {
                    t.prazos_disponiveis?.length > 1
                      ? `Prazos: ${t.prazos_disponiveis.join(', ')} dias`
                      : `Prazo ${t.prazo} dias`
                  } · {new Date(t.data_upload).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <button onClick={() => handleExcluir(t.id, t.nome)}
                      style={deleteBtnStyle}>
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ color: '#E1E1E1', marginTop: 0 }}>Adicionar Tabela</h3>
            <label style={labelStyle}>Nome da tabela</label>
            <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                   placeholder="Ex: Atacado Bom Jesus"
                   style={inputStyle} />
            <label style={labelStyle}>Arquivo Excel</label>
            <input type="file" accept=".xlsx,.xls" ref={fileInputRef}
                   onChange={e => setNovoArquivo(e.target.files[0])}
                   style={{ ...inputStyle, padding: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleUpload} disabled={!novoNome || !novoArquivo || uploading}
                      style={primaryBtnStyle}>
                {uploading ? 'Enviando...' : 'Salvar'}
              </button>
              <button onClick={() => setShowUploadModal(false)}
                      style={secondaryBtnStyle}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CotacaoTab({
  tabelas, tabelaSelecionada, setTabelaSelecionada,
  modoMatch, setModoMatch, canalPreenchimento, setCanalPreenchimento,
  arquivoCotacao, setArquivoCotacao,
  processing, handleProcessar, resultado, setResultado, cotacaoInputRef,
  reviewData, setReviewData, confirmando, handleConfirmar, processingSeg,
  prazoSelecionado, setPrazoSelecionado,
}) {
  const tabelaAtual = tabelas.find(t => t.id === tabelaSelecionada);
  const prazosDisponiveis = tabelaAtual?.prazos_disponiveis || [];
  const prazoEfetivo = prazoSelecionado || (prazosDisponiveis.length === 1 ? prazosDisponiveis[0] : 0);

  const cobertura = resultado?.stats
    ? ((resultado.stats.ean + resultado.stats.descricao + resultado.stats.ia) / resultado.stats.total * 100).toFixed(1)
    : null;

  return (
    <div style={{ background: '#363940', borderRadius: '0 0 12px 12px', padding: 24 }}>
      <h2 style={{ color: '#E1E1E1', marginTop: 0, fontSize: 18 }}>Nova Cotação</h2>

      {tabelas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6B6E74' }}>
          <p>Cadastre uma tabela de preço primeiro (aba "Minhas Tabelas")</p>
        </div>
      ) : (
        <>
          {/* Selecionar tabela */}
          <label style={labelStyle}>Tabela de preço</label>
          <select value={tabelaSelecionada} onChange={e => setTabelaSelecionada(e.target.value)}
                  style={inputStyle}>
            <option value="">Selecione...</option>
            {tabelas.map(t => (
              <option key={t.id} value={t.id}>{t.nome} ({t.qtd_produtos} produtos, prazo {t.prazo}d)</option>
            ))}
          </select>

          {/* Prazo */}
          {prazosDisponiveis.length > 1 && (
            <>
              <label style={labelStyle}>Prazo da tabela</label>
              <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px', flexWrap: 'wrap' }}>
                {prazosDisponiveis.map(p => (
                  <button
                    key={p}
                    onClick={() => setPrazoSelecionado(p)}
                    style={{
                      padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                      cursor: 'pointer', border: 'none',
                      background: prazoEfetivo === p ? '#3A85A8' : '#45484e',
                      color: prazoEfetivo === p ? '#fff' : '#A0A3A8',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p} dias
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Onde preencher */}
          <label style={labelStyle}>Onde preencher</label>
          <div style={{ display: 'flex', gap: 16, margin: '8px 0 16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#E1E1E1', cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" name="canal" value="excel" checked={canalPreenchimento === 'excel'}
                     onChange={() => setCanalPreenchimento('excel')} />
              Excel (arquivo)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#E1E1E1', cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" name="canal" value="cotatudo" checked={canalPreenchimento === 'cotatudo'}
                     onChange={() => setCanalPreenchimento('cotatudo')} />
              Cotatudo (site)
            </label>
          </div>

          {/* Como buscar preços */}
          <label style={labelStyle}>Modo de busca</label>
          <div style={{ display: 'flex', gap: 16, margin: '8px 0 16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#E1E1E1', cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" name="modo" value="ean" checked={modoMatch === 'ean'}
                     onChange={e => setModoMatch(e.target.value)} />
              EAN apenas (100% certeza)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#E1E1E1', cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" name="modo" value="completo" checked={modoMatch === 'completo'}
                     onChange={e => setModoMatch(e.target.value)} />
              Completo (EAN + descrição + IA)
            </label>
          </div>

          {/* Conteúdo baseado no canal */}
          {canalPreenchimento === 'cotatudo' ? (
            <div style={{
              background: '#2B2D31', borderRadius: 10, padding: 20,
              border: '1px solid #4A4D52', marginBottom: 16,
            }}>
              <h3 style={{ color: '#3A85A8', marginTop: 0, fontSize: 16, marginBottom: 12 }}>
                Como preencher no Cotatudo
              </h3>
              <ol style={{ color: '#A0A3A8', fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
                <li>Instale a <strong style={{ color: '#E1E1E1' }}>Extensão Venpro</strong> (card no Dashboard)</li>
                <li>Mantenha esta aba do <strong style={{ color: '#E1E1E1' }}>Venpro</strong> aberta e logada</li>
                <li>Abra o <strong style={{ color: '#E1E1E1' }}>cotatudo.com.br</strong> em outra aba</li>
                <li>Faça login e <strong style={{ color: '#E1E1E1' }}>abra sua cotação</strong></li>
                <li>Clique no ícone <strong style={{ color: '#3A85A8' }}>Venpro</strong> na barra do Chrome</li>
                <li>Na extensão, escolha <strong style={{ color: '#E1E1E1' }}>tabela</strong>, <strong style={{ color: '#E1E1E1' }}>prazo</strong> e <strong style={{ color: '#E1E1E1' }}>modo ({modoMatch === 'ean' ? 'EAN' : 'Completo'})</strong></li>
                <li>Clique <strong style={{ color: '#E1E1E1' }}>"Preencher Cotação"</strong></li>
              </ol>
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#363940', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🧩</span>
                <a
                  href="/venpro-cotatudo-extension.zip"
                  download
                  style={{ color: '#3A85A8', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
                >
                  ⬇ Baixar Extensão Cotatudo
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Upload cotação Excel */}
              <label style={labelStyle}>Cotação (Excel)</label>
              <div onClick={() => cotacaoInputRef.current?.click()}
                   style={{
                     border: '2px dashed #4A4D52', borderRadius: 10, padding: 24,
                     textAlign: 'center', cursor: 'pointer', marginBottom: 16,
                     color: arquivoCotacao ? '#22c55e' : '#6B6E74',
                   }}>
                {arquivoCotacao ? arquivoCotacao.name : 'Clique para selecionar ou arraste o arquivo'}
                <input type="file" accept=".xlsx,.xls" ref={cotacaoInputRef}
                       onChange={e => { setArquivoCotacao(e.target.files[0]); setReviewData(null); setResultado(null); }}
                       style={{ display: 'none' }} />
              </div>
            </>
          )}

          {/* Processar — só no modo Excel */}
          {canalPreenchimento === 'excel' && (
            <>
              {prazosDisponiveis.length > 1 && !prazoEfetivo && (
                <p style={{ color: '#f59e0b', fontSize: 13, margin: '0 0 8px' }}>
                  Selecione o prazo acima antes de processar
                </p>
              )}
              <button onClick={handleProcessar}
                      disabled={!tabelaSelecionada || !arquivoCotacao || processing || (prazosDisponiveis.length > 1 && !prazoEfetivo)}
                      style={{
                        ...primaryBtnStyle,
                        opacity: (!tabelaSelecionada || !arquivoCotacao || (prazosDisponiveis.length > 1 && !prazoEfetivo)) ? 0.5 : 1,
                        width: '100%', padding: 14, fontSize: 16,
                      }}>
                {processing
                  ? 'Processando...'
                  : prazoEfetivo
                    ? `Processar Cotação — ${prazoEfetivo} dias`
                    : 'Processar Cotação'}
              </button>
            </>
          )}

          {/* Barra de progresso */}
          {(processing || reviewData || resultado) && (() => {
            let pct, label, color;
            if (processing) {
              pct = Math.min(88, Math.round(processingSeg / (processingSeg + 15) * 100));
              label = `Buscando preços... ${processingSeg}s`;
              color = '#3A85A8';
            } else if (reviewData) {
              const com = reviewData.itens.filter(i => i.preco != null).length;
              pct = Math.round(com / reviewData.itens.length * 100);
              label = `${com} de ${reviewData.itens.length} itens com preço encontrado`;
              color = '#22c55e';
            } else {
              const { ean = 0, descricao = 0, ia = 0, total = 1 } = resultado.stats;
              pct = Math.round((ean + descricao + ia) / total * 100);
              label = `${pct}% de cobertura final`;
              color = '#22c55e';
            }
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#A0A3A8', marginBottom: 4 }}>
                  <span>{label}</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ background: '#2B2D31', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                    borderRadius: 8, transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            );
          })()}

          {reviewData && (
            <ReviewMatches
              itens={reviewData.itens}
              onConfirmar={handleConfirmar}
              confirmando={confirmando}
            />
          )}

          {/* Resultado */}
          {resultado && (
            <div style={{
              marginTop: 20, background: '#2B2D31', borderRadius: 10, padding: 20,
            }}>
              <h3 style={{ color: '#E1E1E1', marginTop: 0 }}>Resultado</h3>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                <StatCard label="Cobertura" value={`${cobertura}%`}
                          color={parseFloat(cobertura) > 70 ? '#22c55e' : '#eab308'} />
                <StatCard label="EAN" value={resultado.stats.ean || 0} color="#3b82f6" />
                <StatCard label="Descrição" value={resultado.stats.descricao || 0} color="#8b5cf6" />
                <StatCard label="IA" value={resultado.stats.ia || 0} color="#f59e0b" />
                <StatCard label="Sem match" value={resultado.stats.sem_match || 0} color="#ef4444" />
              </div>
              <p style={{ color: '#6B6E74', fontSize: 13 }}>
                Download iniciado automaticamente. Itens preenchidos por IA ficam em amarelo no Excel.
              </p>
              {resultado.semMatch?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ color: '#A0A3A8', fontSize: 13, marginBottom: 8 }}>Itens não encontrados:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {resultado.semMatch.map((item, i) => (
                      <span key={i} style={{
                        background: '#45484e', color: '#A0A3A8', padding: '2px 8px',
                        borderRadius: 4, fontSize: 11,
                      }}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: '#363940', borderRadius: 8, padding: '12px 16px',
      textAlign: 'center', minWidth: 80,
    }}>
      <div style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#6B6E74', fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// Styles
const navBtnStyle = {
  background: 'none', border: '1px solid #4A4D52', color: '#A0A3A8',
  padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
};

const tabActiveStyle = {
  background: '#363940', color: '#E1E1E1', border: 'none',
  padding: '10px 20px', borderRadius: '8px 8px 0 0', fontWeight: 600,
  fontSize: 14, cursor: 'pointer',
};

const tabInactiveStyle = {
  background: 'transparent', color: '#6B6E74', border: 'none',
  padding: '10px 20px', borderRadius: '8px 8px 0 0',
  fontSize: 14, cursor: 'pointer',
};

const primaryBtnStyle = {
  background: '#3A85A8', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: 8, fontWeight: 600,
  fontSize: 14, cursor: 'pointer',
};

const secondaryBtnStyle = {
  background: '#45484e', color: '#A0A3A8', border: 'none',
  padding: '10px 20px', borderRadius: 8,
  fontSize: 14, cursor: 'pointer',
};

const deleteBtnStyle = {
  background: 'rgba(239,68,68,.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,.3)',
  padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};

const labelStyle = {
  display: 'block', color: '#A0A3A8', fontSize: 13, fontWeight: 600,
  marginBottom: 4, marginTop: 12,
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #4A4D52', background: '#2B2D31', color: '#E1E1E1',
  fontSize: 14, boxSizing: 'border-box',
};

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 100,
};

const modalContentStyle = {
  background: '#363940', border: '1px solid #4A4D52', borderRadius: 12, padding: 24, width: 400,
  maxWidth: '90vw',
};
