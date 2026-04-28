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

function applyState(state) {
  if (!state) return;

  if (state.status === 'processing') {
    btnEl.disabled = true;
    btnEl.textContent = 'Processando...';
    setProgress(state.pct, `${state.processados} / ${state.total} itens`);
    setStatus(`Processando... ${state.pct}%`, 'info');
    resultsEl.style.display = 'none';
  }

  if (state.status === 'done') {
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

// Listen for progress updates from background while popup is open
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'progressUpdate') {
    chrome.runtime.sendMessage({ action: 'getProcessingState' }, (r) => {
      if (r?.state) applyState(r.state);
    });
  }
});

// Get Firebase token
async function getToken() {
  try {
    const resp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getToken' }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
    return resp?.token;
  } catch {
    return null;
  }
}

// Fetch tabelas from Venpro API
async function fetchTabelas(token) {
  const resp = await fetch(`${API_URL}/cotacao/tabelas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
  return resp.json();
}

// Load tabelas
async function loadTabelas() {
  try {
    const token = await getToken();
    if (!token) {
      setStatus('Faça login no venpro.com.br primeiro.', 'err');
      return;
    }

    const tabelas = await fetchTabelas(token);
    tabelasEl.innerHTML = '';

    if (tabelas.length === 0) {
      tabelasEl.innerHTML = '<option value="">Nenhuma tabela cadastrada</option>';
      setStatus('Nenhuma tabela encontrada. Cadastre no Venpro.', 'err');
      return;
    }

    tabelas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.nome} (${t.qtd_produtos} produtos)`;
      tabelasEl.appendChild(opt);
    });

    tabelasEl.disabled = false;
    btnEl.disabled = false;
    setStatus(`${tabelas.length} tabela(s) disponível(is).`, 'ok');
  } catch (err) {
    setStatus('Erro ao carregar tabelas. Faça login no Venpro.', 'err');
  }
}

// On popup open: restore state if processing is in progress
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  if (!url.includes('cotatudo.com.br')) {
    setStatus('Abra uma cotação no cotatudo.com.br primeiro.', 'err');
    tabelasEl.innerHTML = '<option value="">Necessário estar no Cotatudo</option>';
    return;
  }

  // Check if there's an ongoing or completed processing
  chrome.runtime.sendMessage({ action: 'getProcessingState' }, (r) => {
    if (r?.state && (r.state.status === 'processing' || r.state.status === 'done')) {
      applyState(r.state);
      if (r.state.status !== 'processing') {
        setStatus('Página Cotatudo detectada. Carregando tabelas...', 'info');
        loadTabelas();
      }
    } else {
      setStatus('Página Cotatudo detectada. Carregando tabelas...', 'info');
      loadTabelas();
    }
  });
});

// Fill button click — delegates all processing to background
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

    // Ensure content script is loaded
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
      } else {
        throw e;
      }
    }

    if (!extractResult.items || extractResult.items.length === 0) {
      setStatus('Nenhum item encontrado na tabela. Abra a cotação.', 'err');
      btnEl.disabled = false;
      btnEl.textContent = 'Preencher Cotação';
      return;
    }

    // Clear previous state and hand off to background
    await new Promise(r => chrome.runtime.sendMessage({ action: 'clearProcessingState' }, r));

    setProgress(0, `0 / ${extractResult.items.length} itens`);
    setStatus(`Enviando ${extractResult.items.length} itens para o background...`, 'info');
    btnEl.textContent = 'Processando...';

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
