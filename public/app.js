const STATE = {
  wallet: null,
  ws: null,
  isAdmin: false,
  priceHistory: [],
  lastPrice: 0,
  prevPrice: 0,
  reconnectTimer: null,
};

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

function openWalletModal() {
  const info = document.getElementById('current-wallet-info');
  const addrEl = document.getElementById('modal-current-addr');
  if (STATE.wallet) {
    info.style.display = 'block';
    addrEl.textContent = STATE.wallet.address;
  } else {
    info.style.display = 'none';
  }
  document.getElementById('wallet-modal').style.display = 'flex';
}
function closeWalletModal() { document.getElementById('wallet-modal').style.display = 'none'; }

function logoutWallet() {
  STATE.wallet = null;
  STATE.isAdmin = false;
  STATE.ws && STATE.ws.close();
  STATE.ws = null;
  localStorage.removeItem('dcw');
  document.getElementById('wallet-address').textContent = 'Bağlı cüzdan yok';
  document.getElementById('balance-num').textContent = '0';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('chat-hint').style.display = 'none';
  document.getElementById('chat-username-display').textContent = '1 DEM / mesaj';
  closeWalletModal();
  showFloat('Cüzdandan çıkıldı', 'info');
}

async function generateWallet() {
  const data = await api('/api/wallet/new');
  const el = document.getElementById('wallet-modal-content');
  el.innerHTML = `
    <div class="wallet-new-result">
      <div><div class="key-label">ADRES</div><div class="key-value">${data.address}</div></div>
      <div><div class="key-label">PRIVATE KEY <span class="key-warn">(gizli tut!)</span></div><div class="key-value">${data.priv_key}</div></div>
    </div>
    <p style="font-size:11px;color:var(--red);text-align:center;">Bu bilgileri güvenli bir yere kaydet.</p>
    <button class="btn-primary" style="width:100%;" onclick="loginWith('${data.priv_key}','${data.address}','${data.pub_key}')">
      <i class="fa-solid fa-right-to-bracket"></i> Bu Cüzdanla Giriş Yap
    </button>
  `;
}

async function importWallet() {
  const privKey = document.getElementById('import-privkey').value.trim();
  if (!privKey) { showFloat('Private key boş olamaz', 'err'); return; }
  const r = await api('/api/wallet/import', { method: 'POST', body: JSON.stringify({ priv_key: privKey }) });
  if (r.hata) { showFloat('Geçersiz private key: ' + r.hata, 'err'); return; }
  loginWith(privKey, r.address, r.pub_key);
}

function loginWith(privKey, address, pubKey) {
  STATE.wallet = { privKey, address, pubKey };
  localStorage.setItem('dcw', JSON.stringify(STATE.wallet));
  document.getElementById('wallet-address').textContent = address;
  const anonName = '@Dem_' + address.slice(3, 9);
  document.getElementById('chat-hint').style.display = 'block';
  document.getElementById('anon-name-hint').textContent = anonName;
  document.getElementById('chat-username-display').textContent = 'Sen: ' + anonName;
  closeWalletModal();
  connectWS();
  refreshBalance();
  checkAdmin(address);
}

async function checkAdmin(address) {
  const s = await api('/api/state');
  if (s.founder_address && s.founder_address === address) {
    STATE.isAdmin = true;
    document.getElementById('admin-panel').style.display = 'block';
    loadRestrictions();
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
  switch (msg.type) {
    case 'NEW_BLOCK':
      addBlock(msg.payload);
      addTicker(msg.payload.hash);
      refreshBalance();
      break;
    case 'CHAT':
      appendChat(msg.payload);
      break;
    case 'PRICE':
      onPriceUpdate(msg.payload.price, msg.payload.history);
      break;
    case 'DELETE_MSG':
      deleteChatMsg(msg.payload);
      break;
    case 'STATE':
      if (msg.payload.balance !== undefined)
        document.getElementById('balance-num').textContent =
          parseFloat(msg.payload.balance).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
      if (msg.payload.network) updateStats(msg.payload.network);
      break;
    case 'ALERT':
      handleAlert(msg.payload.event);
      break;
    case 'ERROR':
      showFloat(msg.payload, 'err');
      break;
  }
}

function onPriceUpdate(price, history) {
  STATE.prevPrice = STATE.lastPrice || price;
  STATE.lastPrice = price;
  if (history && history.length) STATE.priceHistory = history;

  const fmt = price.toFixed(4);
  document.getElementById('hdr-price').textContent = fmt;
  document.getElementById('chart-price').textContent = fmt;

  const change = STATE.prevPrice > 0 ? ((price - STATE.prevPrice) / STATE.prevPrice * 100) : 0;
  const changeEl = document.getElementById('price-change');
  changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
  changeEl.className = 'price-change ' + (change >= 0 ? 'up' : 'down');

  drawPriceChart();
}

function addBlock(b) {
  const list = document.getElementById('block-list');
  const d = document.createElement('div');
  d.className = 'block-item';
  const hash = b.hash ? b.hash.slice(0, 16) + '...' : '—';
  const t = new Date(b.timestamp).toLocaleTimeString('tr-TR');
  const txc = b.transactions ? b.transactions.length : 0;
  d.innerHTML = `
    <div class="block-item-top"><span class="block-num">#${b.index}</span><span class="block-time">${t}</span></div>
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
  d.dataset.id = cm.id;
  const delBtn = STATE.isAdmin
    ? `<button class="chat-del-btn" onclick="deleteChat(${cm.id})" title="Sil"><i class="fa-solid fa-trash"></i></button>`
    : '';
  d.innerHTML = `
    <div class="chat-msg-top">
      <span class="chat-ts">${t}</span>
      <span class="chat-user${isMe ? ' me' : ''}">${cm.username}</span>
      ${delBtn}
    </div>
    <div class="chat-text">${esc(cm.content)}</div>
  `;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function deleteChatMsg(id) {
  const el = document.querySelector(`.chat-msg[data-id="${id}"]`);
  if (el) el.classList.add('deleted');
}

async function deleteChat(id) {
  if (!STATE.wallet || !STATE.isAdmin) return;
  const veri = `DeleteChat:${id}`;
  const ir = await api('/api/admin/imza-olustur', {
    method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri }),
  });
  if (ir.hata) return;
  await api('/api/chat/delete', {
    method: 'POST', body: JSON.stringify({ imza: ir.imza, id }),
  });
}

async function loadRestrictions() {
  const list = await api('/api/users/restrictions');
  const el = document.getElementById('user-restriction-list');
  if (!Array.isArray(list) || list.length === 0) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:12px;">Henüz yatırımcı yok</div>';
    return;
  }
  el.innerHTML = list.map(r => `
    <div class="restriction-item">
      <div class="restriction-item-top">
        <span class="restriction-name">${r.username || '@Dem_' + r.address.slice(3,9)}</span>
      </div>
      <div class="restriction-addr">${r.address}</div>
      <div class="restriction-actions">
        <button class="restriction-btn mute${r.muted ? ' active' : ''}" onclick="toggleRestrict('${r.address}','${r.username}',${!r.muted},${r.trade_ban})">
          ${r.muted ? '<i class="fa-solid fa-volume-xmark"></i> Muted' : '<i class="fa-solid fa-volume-high"></i> Mute'}
        </button>
        <button class="restriction-btn ban${r.trade_ban ? ' active' : ''}" onclick="toggleRestrict('${r.address}','${r.username}',${r.muted},${!r.trade_ban})">
          ${r.trade_ban ? '<i class="fa-solid fa-ban"></i> Yasaklı' : '<i class="fa-solid fa-ban"></i> Yasakla'}
        </button>
      </div>
    </div>
  `).join('');
}

async function toggleRestrict(address, username, muted, tradeBan) {
  if (!STATE.wallet) return;
  const veri = 'Restrict:' + address;
  const ir = await api('/api/admin/imza-olustur', {
    method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri }),
  });
  if (ir.hata) return;
  await api('/api/users/restrict', {
    method: 'POST',
    body: JSON.stringify({ imza: ir.imza, adres: address, username, muted, trade_ban: tradeBan }),
  });
  loadRestrictions();
  showFloat('Kısıtlama güncellendi', 'info');
}

function updateStats(net) {
  const locked = net.locked;
  const el = document.getElementById('stat-locked');
  el.textContent = locked ? 'Kilitli' : 'Aktif';
  el.className = 'stat-val ' + (locked ? 'red' : 'green');
  const badge = document.getElementById('net-badge');
  badge.className = 'badge' + (locked ? ' locked' : '');
  badge.innerHTML = locked
    ? '<i class="fa-solid fa-circle-dot"></i> KİLİTLİ'
    : '<i class="fa-solid fa-circle-dot"></i> CANLI';
  const supply = parseFloat(net.total_supply || 0).toLocaleString('tr-TR');
  document.getElementById('stat-supply').textContent = supply + ' DEM';
  document.getElementById('hdr-supply').textContent = supply;
}

function handleAlert(ev) {
  if (!ev) return;
  if (ev === 'AG_KILITLANDI') showFloat('Ag kilitlendi', 'err');
  else if (ev === 'AG_ACILDI') showFloat('Ag kilidi acildi', 'ok');
  else if (ev === 'ARZ_SABITLENDI') showFloat('Arz sabitlendi 50M DEM', 'info');
}

async function doTransfer() {
  if (!STATE.wallet) { openWalletModal(); return; }
  const to = document.getElementById('to-address').value.trim();
  const amount = parseFloat(document.getElementById('transfer-amount').value);
  if (!to || isNaN(amount) || amount <= 0) { setResult('transfer-result', 'Geçersiz bilgi', 'err'); return; }
  const sigData = STATE.wallet.address + to + amount.toFixed(8);
  const ir = await api('/api/admin/imza-olustur', { method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri: sigData }) });
  if (ir.hata) { setResult('transfer-result', 'İmza hatası', 'err'); return; }
  const r = await api('/api/transfer', {
    method: 'POST',
    body: JSON.stringify({ from: STATE.wallet.address, to, amount, signature: ir.imza, pub_key: STATE.wallet.pubKey }),
  });
  if (r.hata) {
    setResult('transfer-result', r.hata, 'err');
  } else {
    setResult('transfer-result', 'Transfer tamam', 'ok');
    document.getElementById('to-address').value = '';
    document.getElementById('transfer-amount').value = '';
    refreshBalance();
    showTxNotify('Transfer Basarili', amount + ' DEM gonderildi');
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
    if (!confirm('Arzı sabitlemek geri alınamaz.')) return;
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
  const ir = await api('/api/admin/imza-olustur', { method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri }) });
  if (ir.hata) { setResult('admin-result', 'İmza hatası', 'err'); return; }
  const r = await api(endpoint, { method: 'POST', body: JSON.stringify({ imza: ir.imza, ...extra }) });
  setResult('admin-result', r.hata ? r.hata : (r.mesaj || 'Tamam'), r.hata ? 'err' : 'ok');
  if (!r.hata && cmd === 'mint') showTxNotify('Token Basıldı', extra.miktar + ' DEM');
  refreshBalance();
}

function switchAdminTab(name, btn) {
  ['network','price','users','token'].forEach(t => {
    const el = document.getElementById('admin-tab-' + t);
    if (el) el.style.display = t === name ? 'flex' : 'none';
  });
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (name === 'users') loadRestrictions();
  if (name === 'price') loadPriceSettings();
}

async function loadPriceSettings() {
  const s = await api('/api/price/settings');
  if (s.hata) return;
  document.getElementById('ps-artma').value = s.artma_orani || 52;
  document.getElementById('ps-degisim').value = s.max_degisim || 4;
  document.getElementById('ps-sure').value = s.guncelleme_suresi || 3000;
  document.getElementById('ps-min').value = s.min_deger || 0.001;
  document.getElementById('ps-max').value = s.max_deger || 100;
}

async function savePriceSettings() {
  if (!STATE.wallet) return;
  const veri = 'PriceSettings';
  const ir = await api('/api/admin/imza-olustur', { method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri }) });
  if (ir.hata) { setResult('price-settings-result', 'İmza hatası', 'err'); return; }

  const body = {
    imza: ir.imza,
    artma_orani: parseFloat(document.getElementById('ps-artma').value) || 52,
    max_degisim: parseFloat(document.getElementById('ps-degisim').value) || 4,
    guncelleme_suresi: parseInt(document.getElementById('ps-sure').value) || 3000,
    min_deger: parseFloat(document.getElementById('ps-min').value) || 0.001,
    max_deger: parseFloat(document.getElementById('ps-max').value) || 100,
  };

  const r = await api('/api/price/settings', { method: 'POST', body: JSON.stringify(body) });
  if (r.hata) {
    setResult('price-settings-result', r.hata, 'err');
  } else {
    setResult('price-settings-result', 'Ayarlar kaydedildi', 'ok');
    showFloat('Fiyat motoru güncellendi', 'ok');
  }
}

async function setDirectPrice() {
  if (!STATE.wallet) return;
  const fiyat = parseFloat(document.getElementById('ps-fiyat').value);
  if (isNaN(fiyat) || fiyat <= 0) { setResult('price-settings-result', 'Geçersiz fiyat', 'err'); return; }

  const veri = 'SetPrice';
  const ir = await api('/api/admin/imza-olustur', { method: 'POST', body: JSON.stringify({ priv_key: STATE.wallet.privKey, veri }) });
  if (ir.hata) { setResult('price-settings-result', 'İmza hatası', 'err'); return; }

  const r = await api('/api/price/set', { method: 'POST', body: JSON.stringify({ imza: ir.imza, fiyat }) });
  if (r.hata) {
    setResult('price-settings-result', r.hata, 'err');
  } else {
    setResult('price-settings-result', 'Fiyat ' + fiyat + ' olarak ayarlandı', 'ok');
    showFloat('Fiyat zorla ayarlandı: ' + fiyat, 'info');
  }
}
  const badge = document.getElementById('net-badge');
  if (online) {
    badge.className = 'badge';
    badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> CANLI';
  } else {
    badge.className = 'badge locked';
    badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> BAĞLANTISIZ';
  }
}

function addTicker(hash) {
  const el = document.getElementById('ticker-text');
  const h = hash ? hash.slice(0, 18) : '???';
  const now = new Date().toLocaleTimeString('tr-TR');
  const current = el.textContent === '— ağ bekleniyor —' ? '' : el.textContent;
  el.textContent = (current + '   |   ' + now + '  ' + h + '   |   ' + now + '  ' + h).slice(-600);
}

function showTxNotify(title, sub) {
  const el = document.getElementById('tx-notify');
  document.getElementById('tx-notify-title').textContent = title;
  document.getElementById('tx-notify-sub').textContent = sub;
  el.style.display = 'flex';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
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

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const canvas = document.getElementById('canvas-chart');
const ctx = canvas.getContext('2d');

function drawPriceChart() {
  const pts = STATE.priceHistory;
  if (!pts || pts.length < 2) return;
  const W = canvas.offsetWidth || 800;
  const H = 140;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const vals = pts.map(p => p.value);
  const min = Math.min(...vals) * 0.998;
  const max = Math.max(...vals) * 1.002;
  const range = max - min || 1;
  const step = W / (pts.length - 1);

  const toY = v => H - 10 - ((v - min) / range) * (H - 20);

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = (H / 5) * i;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();

  const isUp = pts[pts.length-1].value >= pts[0].value;
  const lineColor = isUp ? '#22c55e' : '#ef4444';
  const gradColor0 = isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';

  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = i * step;
    const y = toY(p.value);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, gradColor0);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = i * step;
    const y = toY(p.value);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const lx = (pts.length - 1) * step;
  const ly = toY(pts[pts.length-1].value);
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = '10px JetBrains Mono';
  ctx.fillStyle = 'rgba(100,116,139,0.8)';
  ctx.fillText(max.toFixed(4), 4, 14);
  ctx.fillText(min.toFixed(4), 4, H - 4);
}

async function init() {
  const blocks = await api('/api/blocks?limit=15');
  if (Array.isArray(blocks)) [...blocks].reverse().forEach(addBlock);

  const state = await api('/api/state');
  if (state.network) updateStats(state.network);
  document.getElementById('hdr-online').textContent = state.online || 0;
  document.getElementById('stat-online').textContent = state.online || 0;

  const chat = await api('/api/chat/history');
  if (Array.isArray(chat)) chat.forEach(appendChat);

  const priceHist = await api('/api/price/history');
  if (Array.isArray(priceHist) && priceHist.length) {
    STATE.priceHistory = priceHist;
    const last = priceHist[priceHist.length-1].value;
    STATE.lastPrice = last;
    document.getElementById('hdr-price').textContent = last.toFixed(4);
    document.getElementById('chart-price').textContent = last.toFixed(4);
    drawPriceChart();
  }

  const saved = localStorage.getItem('dcw');
  if (saved) {
    try {
      const w = JSON.parse(saved);
      STATE.wallet = w;
      document.getElementById('wallet-address').textContent = w.address;
      const anonName = '@Dem_' + w.address.slice(3, 9);
      document.getElementById('chat-hint').style.display = 'block';
      document.getElementById('anon-name-hint').textContent = anonName;
      document.getElementById('chat-username-display').textContent = 'Sen: ' + anonName;
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
window.addEventListener('resize', drawPriceChart);

init();
