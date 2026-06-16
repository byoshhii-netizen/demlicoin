const STATE = {
  wallet: null,
  ws: null,
  chartData: Array(60).fill(0),
  reconnectTimer: null,
};

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

function openWalletModal() { document.getElementById('wallet-modal').style.display = 'flex'; }
function closeWalletModal() { document.getElementById('wallet-modal').style.display = 'none'; }

async function generateWallet() {
  const data = await api('/api/wallet/new');
  const el = document.getElementById('wallet-modal-content');
  el.innerHTML = `
    <div class="wallet-new-result">
      <div>
        <div class="key-label">ADRES</div>
        <div class="key-value">${data.address}</div>
      </div>
      <div>
        <div class="key-label">PRIVATE KEY <span class="key-warn">(gizli tut!)</span></div>
        <div class="key-value">${data.priv_key}</div>
      </div>
    </div>
    <p style="font-size:11px;color:var(--red);text-align:center;">Private key'ini kaybet = cüzdanını kaybet.</p>
    <button class="btn-primary" style="width:100%;" onclick="loginWith('${data.priv_key}','${data.address}','${data.pub_key}')">
      <i class="fa-solid fa-right-to-bracket"></i> Bu Cüzdanla Giriş Yap
    </button>
  `;
}

async function importWallet() {
  const privKey = document.getElementById('import-privkey').value.trim();
  if (!privKey) return;
  const r = await api('/api/admin/imza-olustur', {
    method: 'POST',
    body: JSON.stringify({ priv_key: privKey, veri: 'ping' }),
  });
  if (r.hata) { showFloat('Geçersiz private key', 'err'); return; }
  const w = await api('/api/wallet/new');
  showFloat('Cüzdan import için yeni bir cüzdan oluştur ve private key\'ini gir.', 'info');
}

function loginWith(privKey, address, pubKey) {
  STATE.wallet = { privKey, address, pubKey };
  localStorage.setItem('dcw', JSON.stringify(STATE.wallet));
  document.getElementById('wallet-address').textContent = address;
  closeWalletModal();
  connectWS();
  refreshBalance();
  checkAdmin(address);
}

async function checkAdmin(address) {
  const s = await api('/api/state');
  if (s.founder_address && s.founder_address === address) {
    document.getElementById('admin-panel').style.display = 'block';
  }
}

async function refreshBalance() {
  if (!STATE.wallet) return;
  const d = await api('/api/wallet/' + STATE.wallet.address + '/balance');
  document.getElementById('balance-num').textContent =
    parseFloat(d.balance || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

function connectWS() {
  if (!STATE.wallet) return;
  if (STATE.ws && STATE.ws.readyState < 2) STATE.ws.close();
  STATE.ws = new WebSocket(WS_URL + '?address=' + encodeURIComponent(STATE.wallet.address));
  STATE.ws.onopen = () => { setNetStatus(true); clearTimeout(STATE.reconnectTimer); };
  STATE.ws.onmessage = e => handleMsg(JSON.parse(e.data));
  STATE.ws.onclose = () => { setNetStatus(false); STATE.reconnectTimer = setTimeout(connectWS, 3000); };
}

function handleMsg(msg) {
  if (msg.type === 'NEW_BLOCK') {
    addBlock(msg.payload);
    updateChart(msg.payload.transactions ? msg.payload.transactions.length : 1);
    addTicker(msg.payload.hash);
    refreshBalance();
  } else if (msg.type === 'CHAT') {
    appendChat(msg.payload);
  } else if (msg.type === 'STATE') {
    if (msg.payload.balance !== undefined)
      document.getElementById('balance-num').textContent =
        parseFloat(msg.payload.balance).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    if (msg.payload.network) updateStats(msg.payload.network);
  } else if (msg.type === 'ALERT') {
    handleAlert(msg.payload.event);
  } else if (msg.type === 'ERROR') {
    showFloat(msg.payload, 'err');
  }
}

function addBlock(b) {
  const list = document.getElementById('block-list');
  const d = document.createElement('div');
  d.className = 'block-item';
  const hash = b.hash ? b.hash.slice(0, 18) + '...' : '—';
  const t = new Date(b.timestamp).toLocaleTimeString('tr-TR');
  const txc = b.transactions ? b.transactions.length : 0;
  d.innerHTML = `
    <div class="block-item-top">
      <span class="block-num">#${b.index}</span>
      <span class="block-time">${t}</span>
    </div>
    <div class="block-hash">${hash}</div>
    <div class="block-txs">${txc} işlem</div>
  `;
  list.insertBefore(d, list.firstChild);
  document.getElementById('block-count').textContent = list.children.length + ' blok';
  document.getElementById('hdr-block').textContent = b.index;
  document.getElementById('stat-blocks').textContent = b.index;
}

function appendChat(cm) {
  const box = document.getElementById('chat-messages');
  const isMe = STATE.wallet && cm.from === STATE.wallet.address;
  const t = new Date(cm.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = document.createElement('div');
  d.className = 'chat-msg';
  d.innerHTML = `
    <div class="chat-msg-top">
      <span class="chat-ts">${t}</span>
      <span class="chat-user${isMe ? ' me' : ''}">${cm.username}</span>
    </div>
    <div class="chat-text">${esc(cm.content)}</div>
  `;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function updateStats(net) {
  const locked = net.locked;
  const el = document.getElementById('stat-locked');
  el.textContent = locked ? 'Kilitli' : 'Aktif';
  el.className = 'stat-val ' + (locked ? 'red' : 'green');
  const badge = document.getElementById('net-badge');
  badge.className = 'badge' + (locked ? ' locked' : '');
  badge.innerHTML = locked
    ? '<i class="fa-solid fa-circle"></i> KİLİTLİ'
    : '<i class="fa-solid fa-circle"></i> CANLI';
  const supply = parseFloat(net.total_supply || 0).toLocaleString('tr-TR');
  document.getElementById('stat-supply').textContent = supply + ' DEM';
  document.getElementById('hdr-supply').textContent = supply;
}

function handleAlert(ev) {
  if (ev === 'AG_KILITLANDI') {
    showFloat('Ag kilitlendi — islemler durduruldu', 'err');
    updateStats({ locked: true, total_supply: 0 });
  } else if (ev === 'AG_ACILDI') {
    showFloat('Ag kilidi acildi', 'ok');
    updateStats({ locked: false, total_supply: 0 });
  } else if (ev && ev.startsWith('CUZDAN_YASAKLANDI')) {
    showFloat('Cuzdan yasaklandi', 'err');
  } else if (ev === 'ARZ_SABITLENDI') {
    showFloat('Arz 50.000.000 DEM olarak sabitlendi', 'info');
  }
}

async function doTransfer() {
  if (!STATE.wallet) { openWalletModal(); return; }
  const to = document.getElementById('to-address').value.trim();
  const amount = parseFloat(document.getElementById('transfer-amount').value);
  if (!to || isNaN(amount) || amount <= 0) {
    setResult('transfer-result', 'Geçersiz bilgi', 'err'); return;
  }
  const sigData = STATE.wallet.address + to + amount.toFixed(8);
  const ir = await api('/api/admin/imza-olustur', {
    method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri: sigData }),
  });
  if (ir.hata) { setResult('transfer-result', 'İmza hatası', 'err'); return; }
  const r = await api('/api/transfer', {
    method: 'POST',
    body: JSON.stringify({ from: STATE.wallet.address, to, amount, signature: ir.imza, pub_key: STATE.wallet.pubKey }),
  });
  if (r.hata) {
    setResult('transfer-result', r.hata, 'err');
  } else {
    setResult('transfer-result', 'Transfer tamam — ' + r.tx_hash, 'ok');
    document.getElementById('to-address').value = '';
    document.getElementById('transfer-amount').value = '';
    refreshBalance();
  }
}

function sendChat() {
  if (!STATE.wallet) { openWalletModal(); return; }
  if (!STATE.ws || STATE.ws.readyState !== 1) { showFloat('Bağlantı yok', 'err'); return; }
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;
  STATE.ws.send(JSON.stringify({ type: 'CHAT', payload: { content } }));
  input.value = '';
}

async function adminCmd(cmd) {
  if (!STATE.wallet) return;
  let veri, endpoint, extra = {};

  if (cmd === 'kilitle') { veri = 'AgiKilitle'; endpoint = '/api/admin/kilitle'; }
  else if (cmd === 'ac') { veri = 'AgiAc'; endpoint = '/api/admin/ac'; }
  else if (cmd === 'arz') {
    if (!confirm('Arzı sabitlemek geri alınamaz. Devam edilsin mi?')) return;
    veri = 'ArzSabitle'; endpoint = '/api/admin/arz-sabitle';
  } else if (cmd === 'yasakla') {
    const adres = document.getElementById('ban-address').value.trim();
    if (!adres) { setResult('admin-result', 'Adres boş', 'err'); return; }
    veri = 'CuzdanYasakla:' + adres; endpoint = '/api/admin/yasakla'; extra = { adres };
  } else if (cmd === 'mint') {
    const adres = document.getElementById('mint-address').value.trim();
    const miktar = parseFloat(document.getElementById('mint-amount').value);
    if (!adres || isNaN(miktar)) { setResult('admin-result', 'Geçersiz bilgi', 'err'); return; }
    veri = 'TokenBas:' + adres; endpoint = '/api/admin/token-bas'; extra = { adres, miktar };
  }

  const ir = await api('/api/admin/imza-olustur', {
    method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri }),
  });
  if (ir.hata) { setResult('admin-result', 'İmza hatası', 'err'); return; }

  const r = await api(endpoint, {
    method: 'POST', body: JSON.stringify({ imza: ir.imza, ...extra }),
  });
  setResult('admin-result', r.hata ? r.hata : (r.mesaj || 'Tamam'), r.hata ? 'err' : 'ok');
  refreshBalance();
}

function setResult(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'result-msg ' + type;
}

function showFloat(msg, type = 'ok') {
  const el = document.getElementById('float-msg');
  el.textContent = msg;
  el.className = 'float-msg ' + type;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function setNetStatus(online) {
  document.getElementById('hdr-online');
  const badge = document.getElementById('net-badge');
  if (online) {
    badge.className = 'badge';
    badge.innerHTML = '<i class="fa-solid fa-circle"></i> CANLI';
  } else {
    badge.className = 'badge locked';
    badge.innerHTML = '<i class="fa-solid fa-circle"></i> BAĞLANTISIZ';
  }
}

function addTicker(hash) {
  const el = document.getElementById('ticker-text');
  const h = hash ? hash.slice(0, 20) : '???';
  const now = new Date().toLocaleTimeString('tr-TR');
  el.textContent = (el.textContent + '   |   ' + now + '  ' + h).slice(-300);
}

const canvas = document.getElementById('canvas-chart');
const ctx = canvas.getContext('2d');

function updateChart(v) {
  STATE.chartData.push(v);
  if (STATE.chartData.length > 60) STATE.chartData.shift();
  drawChart();
}

function drawChart() {
  const W = canvas.offsetWidth || 600;
  const H = 84;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(...STATE.chartData, 1);
  const step = W / (STATE.chartData.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(245,158,11,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();

  ctx.beginPath();
  STATE.chartData.forEach((v, i) => {
    const x = i * step;
    const y = H - 6 - (v / max) * (H - 16);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(59,130,246,0.2)');
  grad.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  STATE.chartData.forEach((v, i) => {
    const x = i * step;
    const y = H - 6 - (v / max) * (H - 16);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.stroke();

  const lx = (STATE.chartData.length - 1) * step;
  const lv = STATE.chartData[STATE.chartData.length - 1];
  const ly = H - 6 - (lv / max) * (H - 16);
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function init() {
  const blocks = await api('/api/blocks?limit=15');
  if (Array.isArray(blocks)) { [...blocks].reverse().forEach(addBlock); }

  const state = await api('/api/state');
  if (state.network) updateStats(state.network);
  document.getElementById('hdr-online').textContent = state.online || 0;
  document.getElementById('stat-online').textContent = state.online || 0;

  const chat = await api('/api/chat/history');
  if (Array.isArray(chat)) chat.forEach(appendChat);

  drawChart();

  const saved = localStorage.getItem('dcw');
  if (saved) {
    try {
      const w = JSON.parse(saved);
      STATE.wallet = w;
      document.getElementById('wallet-address').textContent = w.address;
      connectWS();
      refreshBalance();
      checkAdmin(w.address);
    } catch { localStorage.removeItem('dcw'); }
  }
}

setInterval(async () => {
  const s = await api('/api/state');
  document.getElementById('hdr-online').textContent = s.online || 0;
  document.getElementById('stat-online').textContent = s.online || 0;
}, 15000);
setInterval(refreshBalance, 20000);
setInterval(drawChart, 3000);
window.addEventListener('resize', drawChart);

init();
