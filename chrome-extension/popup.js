const API_URL = 'https://api.venpro.com.br/api';

const statusEl     = document.getElementById('status');
const tabelasEl    = document.getElementById('tabelas');
const prazoEl      = document.getElementById('prazo');
const modoEl       = document.getElementById('modo');
const btnEl        = document.getElementById('btnPreencher');
const resultsEl    = document.getElementById('results');
const progressWrap = document.getElementById('progressWrap');
const progressBar  = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPct  = document.getElementById('progressPct');
const stuckWrap    = document.getElementById('stuckWrap');
const cancelWrap   = document.getElementById('cancelWrap');
const btnRetomar   = document.getElementById('btnRetomar');
const btnCancelar  = document.getElementById('btnCancelar');
const btnParar     = document.getElementById('btnParar');

// ── Stuck threshold: se ts > 3 min sem atualizar, considera travado ────────
const STUCK_MS = 3 * 60 * 1000;

function setStatus(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function setProgress(pct, label) {
  progressWrap.style.display = 'block';
  progressBar.style.width = pct + '%';
  progressPct.textContent = pct + '%';
  progressText.textContent = label;
}

function showStuck(state) {
  stuckWrap.style.display = 'block';
  cancelWrap.style.display = 'none';
  btnEl.disabled = true;
  btnEl.textContent = 'Pausado';
  setStatus(`Pausado em ${state.pct}% — PC dormiu ou erro`, 'err');
}

function showRunning() {
  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'block';
  btnEl.disabled = true;
  btnEl.textContent = 'Processando...';
}

function resetUI() {
  progressWrap.style.display = 'none';
  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'none';
  resultsEl.style.display = 'none';
  btnEl.disabled = false;
  btnEl.textContent = 'Preencher Cotação';
  setStatus('Pronto.', 'ok');
}

function applyState(state) {
  if (!state) return;

  if (state.status === 'processing') {
    const stuck = state.ts && (Date.now() - state.ts) > STUCK_MS;
    setProgress(state.pct, `${state.processados} / ${state.total} itens`);
    if (stuck) {
      showStuck(state);
    } else {
      showRunning();
      setStatus(`Processando... ${state.pct}%`, 'info');
    }
  }

  if (state.status === 'paused') {
    setProgress(state.pct || 0, `${state.processados} / ${state.total} itens`);
    showStuck(state);
  }

  if (state.status === 'done') {
    stuckWrap.style.display = 'none';
    cancelWrap.style.display = 'none';
    btnEl.disabled = false;
    btnEl.textContent = 'Preencher Cotação';
    setProgress(100, `${state.processados} / ${state.total} itens`);
    setStatus('Preenchimento concluído!', 'ok');
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = `
      <div class="ok">✓ Preenchidos: ${state.preenchidos} preços</div>
      ${state.naoEncontrados > 0 ? `<div class="warn">Não encontrados: ${state.naoEncontrados}</div>` : ''}
      <div style="margin-top:4px;color:#A0A3A8;">Total: ${state.processados} itens</div>
    `;
  }

  if (state.status === 'error') {
    btnEl.disabled = false;
    btnEl.textContent = 'Preencher Cotação';
    setStatus(`Erro: ${state.msg}`, 'err');
  }
}

// ── Listen for live updates from background ────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'progressUpdate') {
    chrome.runtime.sendMessage({ action: 'getProcessingState' }, (r) => {
      if (r?.state) applyState(r.state);
    });
  }
});

// ── Retomar (continua do lote onde parou) ──────────────────────────────────
btnRetomar.addEventListener('click', () => {
  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'block';
  btnEl.disabled = true;
  btnEl.textContent = 'Processando...';
  setStatus('Retomando processamento...', 'info');
  chrome.runtime.sendMessage({ action: 'resumeProcessing' });
});

// ── Cancelar durante processamento ────────────────────────────────────────
function cancelAndReset() {
  chrome.runtime.sendMessage({ action: 'clearProcessingState' }, () => {
    resetUI();
    loadTabelas();
  });
}
btnCancelar.addEventListener('click', cancelAndReset);
btnParar.addEventListener('click', cancelAndReset);

// ── Token ──────────────────────────────────────────────────────────────────
async function getToken() {
  try {
    const resp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getToken' }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
    return resp?.token;
  } catch { return null; }
}

// ── Load tabelas ───────────────────────────────────────────────────────────
async function loadTabelas() {
  try {
    const token = await getToken();
    if (!token) { setStatus('Faça login no venpro.com.br primeiro.', 'err'); return; }

    const resp = await fetch(`${API_URL}/cotacao/tabelas`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`Erro ${resp.status}`);
    const tabelas = await resp.json();

    tabelasEl.innerHTML = '';
    if (tabelas.length === 0) {
      tabelasEl.innerHTML = '<option value="">Nenhuma tabela cadastrada</option>';
      setStatus('Nenhuma tabela encontrada.', 'err');
      return;
    }

    tabelas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.nome} (${t.qtd_produtos} produtos)`;
      tabelasEl.appendChild(opt);
    });

    tabelasEl.disabled = false;
    if (btnEl.textContent === 'Preencher Cotação') btnEl.disabled = false;
    setStatus(`${tabelas.length} tabela(s) disponível(is).`, 'ok');
  } catch {
    setStatus('Erro ao carregar tabelas. Faça login no Venpro.', 'err');
  }
}

// ── On popup open ──────────────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  if (!url.includes('cotatudo.com.br')) {
    setStatus('Abra uma cotação no cotatudo.com.br primeiro.', 'err');
    tabelasEl.innerHTML = '<option value="">Necessário estar no Cotatudo</option>';
    return;
  }

  chrome.runtime.sendMessage({ action: 'getProcessingState' }, (r) => {
    const state = r?.state;
    if (state && (state.status === 'processing' || state.status === 'paused' || state.status === 'done')) {
      applyState(state);
    }
    // Always load tabelas so selector is ready
    setStatus('Carregando tabelas...', 'info');
    loadTabelas();
  });
});

// ── Fill button ────────────────────────────────────────────────────────────
btnEl.addEventListener('click', async () => {
  const tabelaId = tabelasEl.value;
  const prazo    = parseInt(prazoEl.value);
  const modo     = modoEl.value;

  if (!tabelaId) { setStatus('Selecione uma tabela.', 'err'); return; }

  btnEl.disabled = true;
  btnEl.textContent = 'Iniciando...';
  resultsEl.style.display = 'none';
  setStatus('Lendo itens da cotação...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let extractResult;
    try {
      extractResult = await chrome.tabs.sendMessage(tab.id, { action: 'extractItems' });
    } catch (e) {
      if (e.message && e.message.includes('Could not establish connection')) {
        setStatus('Injetando script na página...', 'info');
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
        await new Promise(r => setTimeout(r, 300));
        extractResult = await chrome.tabs.sendMessage(tab.id, { action: 'extractItems' });
      } else { throw e; }
    }

    if (!extractResult.items || extractResult.items.length === 0) {
      setStatus('Nenhum item encontrado na tabela. Abra a cotação.', 'err');
      btnEl.disabled = false;
      btnEl.textContent = 'Preencher Cotação';
      return;
    }

    await new Promise(r => chrome.runtime.sendMessage({ action: 'clearProcessingState' }, r));

    setProgress(0, `0 / ${extractResult.items.length} itens`);
    showRunning();
    setStatus(`Processando ${extractResult.items.length} itens...`, 'info');

    chrome.runtime.sendMessage({
      action: 'startBatchProcessing',
      data: { items: extractResult.items, tabelaId, prazo, modo, tabId: tab.id },
    });

  } catch (err) {
    setStatus(`Erro: ${err.message}`, 'err');
    btnEl.disabled = false;
    btnEl.textContent = 'Preencher Cotação';
  }
});
