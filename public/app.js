const STATE = {
  wallet: null,
  ws: null,
  isAdmin: false,
  networkLocked: false,
  blockHistory: [],
  chartData: Array(60).fill(0),
  reconnectTimer: null,
};

const API = window.location.origin;
const WS_URL = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws';

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res.json();
}

function openWalletModal() {
  document.getElementById('wallet-modal').style.display = 'flex';
}
function closeWalletModal() {
  document.getElementById('wallet-modal').style.display = 'none';
}

async function generateWallet() {
  const data = await apiFetch('/api/wallet/new');
  const content = document.getElementById('wallet-modal-content');
  content.innerHTML = `
    <div style="font-size:10px;color:#444;margin-bottom:8px;">YENİ CÜZDAN OLUŞTURULDU</div>
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;color:var(--gold);margin-bottom:2px;">ADRES</div>
      <div style="font-size:11px;word-break:break-all;color:var(--green);">${data.address}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;color:var(--gold);margin-bottom:2px;">PRIVATE KEY <span style="color:#f00;">(GİZLİ TUTUN!)</span></div>
      <div style="font-size:10px;word-break:break-all;color:#666;">${data.priv_key}</div>
    </div>
    <div style="background:#0a0a0a;border:1px solid #ff3366;padding:8px;font-size:10px;color:#ff3366;margin-bottom:12px;">
      ⚠️ Private key'inizi güvenli bir yerde saklayın. Kayıp durumunda cüzdanınıza erişim imkansızdır.
    </div>
    <button class="btn-gold" onclick="loginWithKey('${data.priv_key}','${data.address}','${data.pub_key}')" style="width:100%;padding:12px;">🚀 BU CÜZDANLA GİRİŞ YAP</button>
  `;
}

async function importWallet() {
  const privKey = document.getElementById('import-privkey').value.trim();
  if (!privKey) return;
  const imzaData = await apiFetch('/api/admin/imza-olustur', {
    method: 'POST',
    body: JSON.stringify({ priv_key: privKey, veri: 'login' }),
  });
  if (imzaData.hata) {
    showMsg('import-error', '❌ Geçersiz private key', 'red');
    return;
  }
  const pubKeyRes = await apiFetch('/api/wallet/new');
  alert('Private key doğrulama başarısız olabilir. Yeni cüzdan oluşturmanız önerilir.');
}

function loginWithKey(privKey, address, pubKey) {
  STATE.wallet = { privKey, address, pubKey };
  localStorage.setItem('demcoin_wallet', JSON.stringify(STATE.wallet));
  document.getElementById('wallet-address').textContent = address;
  closeWalletModal();
  connectWS();
  checkAdminStatus(address);
  refreshBalance();
}

async function checkAdminStatus(address) {
  const state = await apiFetch('/api/state');
  const founderAddr = state.founder_address;
  if (founderAddr && founderAddr === address) {
    STATE.isAdmin = true;
    const panel = document.getElementById('admin-panel');
    panel.style.display = 'flex';
    document.querySelector('.grid-layout').style.gridTemplateColumns = '1fr 1fr 320px';
  }
}

async function refreshBalance() {
  if (!STATE.wallet) return;
  const data = await apiFetch('/api/wallet/' + STATE.wallet.address + '/balance');
  document.getElementById('balance-num').textContent = parseFloat(data.balance).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  if (data.blacklisted) {
    showAlert('CÜZDANINIZ YASAKLANDI');
  }
}

function connectWS() {
  if (!STATE.wallet) return;
  if (STATE.ws && STATE.ws.readyState < 2) STATE.ws.close();

  const url = WS_URL + '?address=' + encodeURIComponent(STATE.wallet.address);
  STATE.ws = new WebSocket(url);

  STATE.ws.onopen = () => {
    setNetStatus(true);
    clearTimeout(STATE.reconnectTimer);
  };

  STATE.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleWSMessage(msg);
  };

  STATE.ws.onclose = () => {
    setNetStatus(false);
    STATE.reconnectTimer = setTimeout(connectWS, 3000);
  };

  STATE.ws.onerror = () => {
    setNetStatus(false);
  };
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'NEW_BLOCK':
      addBlock(msg.payload);
      updateChart(msg.payload.transactions ? msg.payload.transactions.length : 0);
      updateTickerHash(msg.payload.hash);
      refreshBalance();
      break;
    case 'CHAT':
      appendChat(msg.payload);
      break;
    case 'STATE':
      updateNetworkState(msg.payload);
      break;
    case 'ALERT':
      handleNetworkAlert(msg.payload);
      break;
    case 'ERROR':
      showFloatMsg(msg.payload, 'red');
      break;
    case 'PONG':
      break;
  }
}

function addBlock(block) {
  STATE.blockHistory.unshift(block);
  if (STATE.blockHistory.length > 100) STATE.blockHistory.pop();

  const list = document.getElementById('block-list');
  const div = document.createElement('div');
  div.className = 'block-card tx-flash';
  const short = block.hash ? block.hash.slice(0, 16) + '...' : '???';
  const txCount = block.transactions ? block.transactions.length : 0;
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="color:var(--gold);">#${block.index}</span>
      <span style="color:#333;font-size:10px;">${new Date(block.timestamp).toLocaleTimeString('tr-TR')}</span>
    </div>
    <div style="color:var(--green);font-size:10px;margin-top:2px;">${short}</div>
    <div style="color:#444;font-size:10px;">${txCount} işlem</div>
  `;
  list.insertBefore(div, list.firstChild);
  document.getElementById('block-count').textContent = STATE.blockHistory.length + ' blok';
  document.getElementById('hdr-block').textContent = block.index;
  document.getElementById('stat-blocks').textContent = block.index;
}

function appendChat(cm) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const t = new Date(cm.timestamp);
  const ts = t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isMe = STATE.wallet && cm.from === STATE.wallet.address;
  div.innerHTML = `
    <span style="color:var(--gold);">[${ts}]</span>
    <span style="color:${isMe ? '#00ff66' : '#888'};margin:0 6px;">${cm.username}</span>
    <span style="color:rgba(0,255,102,0.8);">${escapeHtml(cm.content)}</span>
    <span style="color:#222;font-size:9px;margin-left:6px;">${cm.tx_hash || ''}</span>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function updateNetworkState(payload) {
  if (payload.network) {
    STATE.networkLocked = payload.network.locked;
    document.getElementById('stat-locked').textContent = payload.network.locked ? '🔒 KİLİTLİ' : 'AKTİF';
    document.getElementById('stat-locked').style.color = payload.network.locked ? 'var(--red)' : 'var(--green)';
    const supply = parseFloat(payload.network.total_supply || 0).toLocaleString('tr-TR');
    document.getElementById('stat-supply').textContent = supply + ' DEM';
    document.getElementById('hdr-supply').textContent = supply;
    document.getElementById('stat-blocks').textContent = payload.network.block_height || 0;
    document.getElementById('hdr-block').textContent = payload.network.block_height || 0;
  }
  if (payload.balance !== undefined) {
    document.getElementById('balance-num').textContent = parseFloat(payload.balance).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  }
}

function handleNetworkAlert(payload) {
  const event = payload.event || '';
  if (event === 'AG_KILITLANDI') {
    showAlert('🔒 AĞ KİLİTLENDİ — Tüm işlemler durduruldu');
    document.getElementById('stat-locked').textContent = '🔒 KİLİTLİ';
    document.getElementById('stat-locked').style.color = 'var(--red)';
    setNetStatus(false, true);
  } else if (event === 'AG_ACILDI') {
    showAlert('🔓 AĞ AÇILDI — İşlemler devam ediyor', 'green');
    document.getElementById('stat-locked').textContent = 'AKTİF';
    document.getElementById('stat-locked').style.color = 'var(--green)';
  } else if (event.startsWith('CUZDAN_YASAKLANDI')) {
    showFloatMsg('⛔ Cüzdan yasaklandı: ' + event.split(':')[1], 'red');
  } else if (event === 'ARZ_SABITLENDI') {
    showFloatMsg('🔐 Token arzı 50.000.000 DEM\'de sabitlendi', 'gold');
  }
}

async function doTransfer() {
  if (!STATE.wallet) { openWalletModal(); return; }
  const to = document.getElementById('to-address').value.trim();
  const amount = parseFloat(document.getElementById('transfer-amount').value);
  if (!to || isNaN(amount) || amount <= 0) {
    showMsg('transfer-result', '❌ Geçersiz transfer bilgisi', 'red');
    return;
  }

  const sigData = STATE.wallet.address + to + amount.toFixed(8);
  const imzaRes = await apiFetch('/api/admin/imza-olustur', {
    method: 'POST',
    body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri: sigData }),
  });

  if (imzaRes.hata) {
    showMsg('transfer-result', '❌ İmza hatası: ' + imzaRes.hata, 'red');
    return;
  }

  const res = await apiFetch('/api/transfer', {
    method: 'POST',
    body: JSON.stringify({
      from: STATE.wallet.address,
      to: to,
      amount: amount,
      signature: imzaRes.imza,
      pub_key: STATE.wallet.pubKey,
    }),
  });

  if (res.hata) {
    showMsg('transfer-result', '❌ ' + res.hata, 'red');
  } else {
    showMsg('transfer-result', '✅ Transfer başarılı! TX: ' + res.tx_hash, 'green');
    document.getElementById('to-address').value = '';
    document.getElementById('transfer-amount').value = '';
    refreshBalance();
  }
}

function sendChat() {
  if (!STATE.wallet) { openWalletModal(); return; }
  if (!STATE.ws || STATE.ws.readyState !== 1) {
    showFloatMsg('❌ WebSocket bağlantısı yok', 'red');
    return;
  }
  const content = document.getElementById('chat-input').value.trim();
  if (!content) return;
  STATE.ws.send(JSON.stringify({ type: 'CHAT', payload: { content } }));
  document.getElementById('chat-input').value = '';
}

async function adminCmd(cmd) {
  if (!STATE.wallet) return;

  let veri, endpoint, body;

  if (cmd === 'kilitle') {
    veri = 'AgiKilitle';
    endpoint = '/api/admin/kilitle';
  } else if (cmd === 'ac') {
    veri = 'AgiAc';
    endpoint = '/api/admin/ac';
  } else if (cmd === 'arz') {
    if (!confirm('Arzı sabitlemek geri alınamaz. Emin misiniz?')) return;
    veri = 'ArzSabitle';
    endpoint = '/api/admin/arz-sabitle';
  } else if (cmd === 'yasakla') {
    const adres = document.getElementById('ban-address').value.trim();
    if (!adres) { showMsg('admin-result', '❌ Adres boş olamaz', 'red'); return; }
    veri = 'CuzdanYasakla:' + adres;
    endpoint = '/api/admin/yasakla';
    body = { adres };
  } else if (cmd === 'mint') {
    const adres = document.getElementById('mint-address').value.trim();
    const miktar = parseFloat(document.getElementById('mint-amount').value);
    if (!adres || isNaN(miktar)) { showMsg('admin-result', '❌ Geçersiz bilgi', 'red'); return; }
    veri = 'TokenBas:' + adres;
    endpoint = '/api/admin/token-bas';
    body = { adres, miktar };
  }

  const imzaRes = await apiFetch('/api/admin/imza-olustur', {
    method: 'POST',
    body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri }),
  });

  if (imzaRes.hata) { showMsg('admin-result', '❌ İmza hatası', 'red'); return; }

  const res = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ imza: imzaRes.imza, ...body }),
  });

  if (res.hata) {
    showMsg('admin-result', '❌ ' + res.hata, 'red');
  } else {
    showMsg('admin-result', res.mesaj || '✅ Komut başarılı', 'green');
    refreshBalance();
  }
}

function setNetStatus(online, locked = false) {
  const dot = document.getElementById('net-status-dot');
  const txt = document.getElementById('net-status-text');
  document.getElementById('stat-online');
  if (locked) {
    dot.className = 'status-dot status-dead';
    txt.textContent = 'KİLİTLİ';
    txt.style.color = 'var(--red)';
  } else if (online) {
    dot.className = 'status-dot status-live';
    txt.textContent = 'CANLI';
    txt.style.color = 'var(--green)';
  } else {
    dot.className = 'status-dot status-dead';
    txt.textContent = 'BAĞLANITISIZ';
    txt.style.color = '#666';
  }
}

function showAlert(msg, type = 'red') {
  const existing = document.querySelector('.alert-banner');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'alert-banner';
  div.style.background = type === 'green' ? 'var(--green)' : type === 'gold' ? 'var(--gold)' : 'var(--red)';
  div.textContent = msg;
  document.body.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

function showFloatMsg(msg, type = 'green') {
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;bottom:20px;right:20px;padding:10px 16px;background:#0d0d0d;border:1px solid ${type === 'red' ? 'var(--red)' : type === 'gold' ? 'var(--gold)' : 'var(--green)'};color:${type === 'red' ? 'var(--red)' : type === 'gold' ? 'var(--gold)' : 'var(--green)'};font-size:12px;z-index:9998;font-family:'Share Tech Mono',monospace;animation:fadeIn 0.3s ease;`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

function showMsg(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'red' ? 'var(--red)' : type === 'gold' ? 'var(--gold)' : 'var(--green)';
}

function updateTickerHash(hash) {
  const el = document.getElementById('hash-ticker-content');
  const hashes = Array(8).fill('').map((_, i) =>
    ' ⬡ 0x' + Math.random().toString(16).slice(2, 18).toUpperCase() + ' → 0x' + Math.random().toString(16).slice(2, 18).toUpperCase()
  ).join('');
  el.textContent = hashes + hashes;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const canvas = document.getElementById('canvas-chart');
const ctx = canvas.getContext('2d');

function updateChart(txCount) {
  STATE.chartData.push(txCount);
  if (STATE.chartData.length > 60) STATE.chartData.shift();
  drawChart();
}

function drawChart() {
  const W = canvas.offsetWidth;
  const H = 80;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const max = Math.max(...STATE.chartData, 1);
  const step = W / (STATE.chartData.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = '#00ff6633';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = (H / 5) * i;
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,255,102,0.4)');
  grad.addColorStop(1, 'rgba(0,255,102,0)');

  ctx.beginPath();
  STATE.chartData.forEach((v, i) => {
    const x = i * step;
    const y = H - (v / max) * (H - 10);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  STATE.chartData.forEach((v, i) => {
    const x = i * step;
    const y = H - (v / max) * (H - 10);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#00ff66';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00ff66';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const lastX = (STATE.chartData.length - 1) * step;
  const lastV = STATE.chartData[STATE.chartData.length - 1];
  const lastY = H - (lastV / max) * (H - 10);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#d4af37';
  ctx.shadowColor = '#d4af37';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

async function loadInitialData() {
  const blocks = await apiFetch('/api/blocks?limit=20');
  if (Array.isArray(blocks)) {
    blocks.reverse().forEach(addBlock);
    blocks.forEach(b => updateChart(b.transactions ? b.transactions.length : 0));
  }
  const state = await apiFetch('/api/state');
  if (state.network) updateNetworkState({ network: state.network });
  document.getElementById('hdr-online').textContent = state.online || 0;
  document.getElementById('stat-online').textContent = state.online || 0;

  const chatHistory = await apiFetch('/api/chat/history');
  if (Array.isArray(chatHistory)) {
    chatHistory.forEach(appendChat);
  }

  updateTickerHash('genesis');
  drawChart();
}

async function updateOnlineCount() {
  const state = await apiFetch('/api/state');
  document.getElementById('hdr-online').textContent = state.online || 0;
  document.getElementById('stat-online').textContent = state.online || 0;
}

const savedWallet = localStorage.getItem('demcoin_wallet');
if (savedWallet) {
  try {
    const w = JSON.parse(savedWallet);
    STATE.wallet = w;
    document.getElementById('wallet-address').textContent = w.address;
    connectWS();
    checkAdminStatus(w.address);
    refreshBalance();
  } catch (e) {
    localStorage.removeItem('demcoin_wallet');
  }
}

loadInitialData();
setInterval(updateOnlineCount, 10000);
setInterval(refreshBalance, 15000);
setInterval(drawChart, 2000);

window.addEventListener('resize', drawChart);
