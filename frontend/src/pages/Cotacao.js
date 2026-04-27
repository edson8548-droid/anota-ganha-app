import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { listarTabelas, uploadTabela, excluirTabela, processarCotacao, previewCotacao, confirmarCotacao } from '../services/cotacao.service';
import ReviewMatches from './ReviewMatches';

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
  const [arquivoCotacao, setArquivoCotacao] = useState(null);

  // Resultado
  const [resultado, setResultado] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [processingSeg, setProcessingSeg] = useState(0);
  const processingTimerRef = useRef(null);

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
      alert('Erro ao subir tabela: ' + (err.response?.data?.detail || err.message));
    }
    setUploading(false);
  };

  const handleExcluir = async (id, nome) => {
    if (!window.confirm(`Excluir tabela "${nome}"?`)) return;
    try {
      await excluirTabela(id);
      carregarTabelas();
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
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
      alert('Erro ao processar: ' + (err.response?.data?.detail || err.message));
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
      alert('Erro ao confirmar: ' + (err.response?.data?.detail || err.message));
    }
    setConfirmando(false);
  };

  const handleLogout = () => {
    if (window.confirm('Deseja realmente sair?')) {
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* Header */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px', borderBottom: '1px solid #1e293b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#e8412a', fontWeight: 700, fontSize: 20, cursor: 'pointer' }}
                onClick={() => navigate('/dashboard')}>
            Venpro
          </span>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>Cotação</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => navigate('/assistente')}
                  style={navBtnStyle}>IA</button>
          <button onClick={() => navigate('/minha-licenca')}
                  style={navBtnStyle}>Licença</button>
          <button onClick={handleLogout}
                  style={{ ...navBtnStyle, color: '#ef4444' }}>Sair</button>
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
    </div>
  );
}

function TabelasTab({
  tabelas, loading, showUploadModal, setShowUploadModal,
  novoNome, setNovoNome, novoArquivo, setNovoArquivo,
  uploading, handleUpload, handleExcluir, fileInputRef,
}) {
  return (
    <div style={{ background: '#1e293b', borderRadius: '0 0 12px 12px', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#f1f5f9', margin: 0, fontSize: 18 }}>Tabelas de Preço</h2>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            Até 5 planilhas de diferentes atacados
          </p>
        </div>
        <button onClick={() => setShowUploadModal(true)}
                style={primaryBtnStyle}>
          + Adicionar Tabela
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center' }}>Carregando...</p>
      ) : tabelas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
          <p style={{ fontSize: 16 }}>Nenhuma tabela cadastrada</p>
          <p style={{ fontSize: 13 }}>Clique em "+ Adicionar Tabela" para começar</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {tabelas.map((t, idx) => (
            <div key={t.id} style={{
              border: idx === 0 ? '2px solid #e8412a' : '1px solid #334155',
              borderRadius: 10, padding: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {idx === 0 && <span style={{
                    background: '#e8412a', color: '#fff', padding: '2px 8px',
                    borderRadius: 4, fontSize: 11, fontWeight: 700,
                  }}>ATIVA</span>}
                  <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{t.nome}</span>
                </div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
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
            <h3 style={{ color: '#f1f5f9', marginTop: 0 }}>Adicionar Tabela</h3>
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
  modoMatch, setModoMatch, arquivoCotacao, setArquivoCotacao,
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
    <div style={{ background: '#1e293b', borderRadius: '0 0 12px 12px', padding: 24 }}>
      <h2 style={{ color: '#f1f5f9', marginTop: 0, fontSize: 18 }}>Nova Cotação</h2>

      {tabelas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
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
                      background: prazoEfetivo === p ? '#e8412a' : '#334155',
                      color: prazoEfetivo === p ? '#fff' : '#94a3b8',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p} dias
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Modo */}
          <label style={labelStyle}>Modo de preenchimento</label>
          <div style={{ display: 'flex', gap: 16, margin: '8px 0 16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f1f5f9', cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" value="ean" checked={modoMatch === 'ean'}
                     onChange={e => setModoMatch(e.target.value)} />
              EAN apenas
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f1f5f9', cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" value="completo" checked={modoMatch === 'completo'}
                     onChange={e => setModoMatch(e.target.value)} />
              Completo (EAN + descrição + IA)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f1f5f9', cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" value="cotatudo" checked={modoMatch === 'cotatudo'}
                     onChange={e => setModoMatch(e.target.value)} />
              Cotatudo (site)
            </label>
          </div>

          {/* Cotatudo instructions */}
          {modoMatch === 'cotatudo' ? (
            <div style={{
              background: '#0f172a', borderRadius: 10, padding: 20,
              border: '1px solid #334155', marginBottom: 16,
            }}>
              <h3 style={{ color: '#3A85A8', marginTop: 0, fontSize: 16, marginBottom: 12 }}>
                Como preencher cotação no Cotatudo
              </h3>
              <ol style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
                <li>Instale a <strong style={{ color: '#f1f5f9' }}>Extensão Venpro</strong> (link no Dashboard)</li>
                <li>Mantenha esta aba do <strong style={{ color: '#f1f5f9' }}>Venpro</strong> aberta e logada</li>
                <li>Abra o <strong style={{ color: '#f1f5f9' }}>cotatudo.com.br</strong> em outra aba</li>
                <li>Faça login e <strong style={{ color: '#f1f5f9' }}>abra sua cotação</strong></li>
                <li>Clique no ícone <strong style={{ color: '#3A85A8' }}>Venpro</strong> na barra do Chrome</li>
                <li>Selecione a tabela e prazo, clique <strong style={{ color: '#f1f5f9' }}>"Preencher Cotação"</strong></li>
              </ol>
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#1e293b', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🧩</span>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>
                  Não tem a extensão? Baixe no Dashboard → <strong style={{ color: '#3A85A8' }}>Extensão Cotatudo</strong>
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* Upload cotação */}
              <label style={labelStyle}>Cotação (Excel)</label>
              <div onClick={() => cotacaoInputRef.current?.click()}
                   style={{
                     border: '2px dashed #334155', borderRadius: 10, padding: 24,
                     textAlign: 'center', cursor: 'pointer', marginBottom: 16,
                     color: arquivoCotacao ? '#22c55e' : '#64748b',
                   }}>
                {arquivoCotacao ? arquivoCotacao.name : 'Clique para selecionar ou arraste o arquivo'}
                <input type="file" accept=".xlsx,.xls" ref={cotacaoInputRef}
                       onChange={e => { setArquivoCotacao(e.target.files[0]); setReviewData(null); setResultado(null); }}
                       style={{ display: 'none' }} />
              </div>
            </>
          )}

          {/* Processar */}
          {modoMatch !== 'cotatudo' && prazoSelecionado === 0 && !prazoEfetivo && prazosDisponiveis.length > 1 && (
            <p style={{ color: '#f59e0b', fontSize: 13, margin: '0 0 8px' }}>
              ⚠ Selecione o prazo acima antes de processar
            </p>
          )}
          {modoMatch !== 'cotatudo' && (
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
          )}

          {/* Barra de progresso */}
          {(processing || reviewData || resultado) && (() => {
            let pct, label, color;
            if (processing) {
              pct = Math.min(88, Math.round(processingSeg / (processingSeg + 15) * 100));
              label = `Buscando preços... ${processingSeg}s`;
              color = '#e8412a';
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  <span>{label}</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ background: '#0f172a', borderRadius: 8, height: 10, overflow: 'hidden' }}>
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
              marginTop: 20, background: '#0f172a', borderRadius: 10, padding: 20,
            }}>
              <h3 style={{ color: '#f1f5f9', marginTop: 0 }}>Resultado</h3>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                <StatCard label="Cobertura" value={`${cobertura}%`}
                          color={parseFloat(cobertura) > 70 ? '#22c55e' : '#eab308'} />
                <StatCard label="EAN" value={resultado.stats.ean || 0} color="#3b82f6" />
                <StatCard label="Descrição" value={resultado.stats.descricao || 0} color="#8b5cf6" />
                <StatCard label="IA" value={resultado.stats.ia || 0} color="#f59e0b" />
                <StatCard label="Sem match" value={resultado.stats.sem_match || 0} color="#ef4444" />
              </div>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                Download iniciado automaticamente. Itens preenchidos por IA ficam em amarelo no Excel.
              </p>
              {resultado.semMatch?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Itens não encontrados:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {resultado.semMatch.map((item, i) => (
                      <span key={i} style={{
                        background: '#334155', color: '#94a3b8', padding: '2px 8px',
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
      background: '#1e293b', borderRadius: 8, padding: '12px 16px',
      textAlign: 'center', minWidth: 80,
    }}>
      <div style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// Styles
const navBtnStyle = {
  background: 'none', border: '1px solid #334155', color: '#94a3b8',
  padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
};

const tabActiveStyle = {
  background: '#1e293b', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: '8px 8px 0 0', fontWeight: 600,
  fontSize: 14, cursor: 'pointer',
};

const tabInactiveStyle = {
  background: '#0f172a', color: '#64748b', border: 'none',
  padding: '10px 20px', borderRadius: '8px 8px 0 0',
  fontSize: 14, cursor: 'pointer',
};

const primaryBtnStyle = {
  background: '#e8412a', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: 8, fontWeight: 600,
  fontSize: 14, cursor: 'pointer',
};

const secondaryBtnStyle = {
  background: '#334155', color: '#94a3b8', border: 'none',
  padding: '10px 20px', borderRadius: 8,
  fontSize: 14, cursor: 'pointer',
};

const deleteBtnStyle = {
  background: '#1c1525', color: '#ef4444', border: '1px solid #7f1d1d',
  padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};

const labelStyle = {
  display: 'block', color: '#94a3b8', fontSize: 13, fontWeight: 600,
  marginBottom: 4, marginTop: 12,
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9',
  fontSize: 14, boxSizing: 'border-box',
};

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.7)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 100,
};

const modalContentStyle = {
  background: '#1e293b', borderRadius: 12, padding: 24, width: 400,
  maxWidth: '90vw',
};
