// DemliCoin Oyun JS
const socket = io();
let kullanici = null;
let grafikGecmis = [];
let aktifBahis = null;
let canvas, ctx;
let geriSayimTimer = null;
let geriSayimSaniye = 5;

// ─── INIT ───
async function init() {
  const r = await fetch('/api/benim-bilgilerim');
  if (!r.ok) { /* misafir modu - devam et */ }
  else {
    const d = await r.json();
    if (d.basari) {
      kullanici = d.kullanici;
      guncelleBilgi();
      itemBarGuncelle(d.itemler);
      document.getElementById('giris-uyari').style.display = 'none';
      document.getElementById('bahis-panel').style.display = 'block';
    }
  }

  canvas = document.getElementById('grafik-canvas');
  ctx = canvas.getContext('2d');
  boyutlandirCanvas();
  window.addEventListener('resize', boyutlandirCanvas);

  // Grafik durumu
  const gr = await fetch('/api/grafik-durumu');
  const gd = await gr.json();
  grafikGecmis = gd.gecmis || [];
  mevcutDegerGuncelle(gd.mevcutDeger);
  grafikCiz();

  // Chat gecmisi (giris gerektiriyor)
  if (kullanici) {
    const cr = await fetch('/api/chat/gecmis');
    const cd = await cr.json();
    if (cd.basari) {
      cd.mesajlar.forEach(m => chatEkle(m.nick, m.mesaj, m.tarih, m.jeton, m.renk, m.sira));
      chatKaydirAsagi();
    }
  }

  document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') mesajGonder(); });
}

function guncelleBilgi() {
  if (!kullanici) return;
  document.getElementById('hosgeldin-nick').textContent = kullanici.nick;
  document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');
}

function boyutlandirCanvas() {
  if (!canvas) return;
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth;
  canvas.height = 260;
  grafikCiz();
}

// ─── SOCKET ───
socket.on('grafik_guncelle', (data) => {
  grafikGecmis = data.gecmis || [];
  mevcutDegerGuncelle(data.deger);
  grafikCiz();
});

socket.on('oyuncu_listesi', (oyuncular) => oyuncuListesiGoster(oyuncular));

socket.on('chat_mesaj', (data) => {
  chatEkle(data.nick, data.mesaj, data.tarih, data.jeton, data.renk, data.sira);
  chatKaydirAsagi();
});

socket.on('jeton_guncelle', (data) => {
  if (kullanici && data.kullanici_id === kullanici.id) {
    kullanici.jeton = data.jeton;
    document.getElementById('jeton-miktar').textContent = data.jeton.toLocaleString('tr-TR');
  }
});

socket.on('yasaklandi', () => { alert('Hesabiniz yasaklanmistir.'); window.location.href = '/giris'; });

function hizliMiktar(m) {
  const el = document.getElementById('bahis-miktar');
  if (el) el.value = m;
}

// ─── GRAFİK ───
function grafikCiz() {
  if (!canvas || !ctx || grafikGecmis.length < 2) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const degerler = grafikGecmis.map(g => g.deger);
  const minD = Math.min(...degerler) * 0.93;
  const maxD = Math.max(...degerler) * 1.07;
  const aralik = maxD - minD || 1;
  const padL = 52, padR = 12, padT = 16, padB = 28;
  const gW = w - padL - padR;
  const gH = h - padT - padB;

  // Grid çizgileri
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (gH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gW, y); ctx.stroke();
    const val = maxD - (aralik / 4) * i;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), padL - 6, y + 4);
  }

  // Renk: son deger ilke gore
  const ilk = degerler[0], son = degerler[degerler.length - 1];
  const yukariMi = son >= ilk;
  const renkR = yukariMi ? '16,185,129' : '239,68,68';

  // Dolgu alanı
  const grad = ctx.createLinearGradient(0, padT, 0, padT + gH);
  grad.addColorStop(0, `rgba(${renkR},0.25)`);
  grad.addColorStop(0.6, `rgba(${renkR},0.05)`);
  grad.addColorStop(1, `rgba(${renkR},0)`);

  ctx.beginPath();
  grafikGecmis.forEach((p, i) => {
    const x = padL + (i / (grafikGecmis.length - 1)) * gW;
    const y = padT + gH - ((p.deger - minD) / aralik) * gH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + gW, padT + gH);
  ctx.lineTo(padL, padT + gH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Ana çizgi
  ctx.beginPath();
  ctx.strokeStyle = `rgb(${renkR})`;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  grafikGecmis.forEach((p, i) => {
    const x = padL + (i / (grafikGecmis.length - 1)) * gW;
    const y = padT + gH - ((p.deger - minD) / aralik) * gH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Son nokta (canlı ışıltı)
  const lastX = padL + gW;
  const lastY = padT + gH - ((son - minD) / aralik) * gH;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${renkR})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Zaman etiketi
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  const zaman = new Date();
  ctx.fillText(zaman.toLocaleTimeString('tr-TR'), padL, h - 8);
}

function mevcutDegerGuncelle(deger) {
  const el = document.getElementById('grafik-deger');
  const eski = parseFloat(el.dataset.deger || deger);
  el.dataset.deger = deger;
  el.textContent = deger.toFixed(2);
  el.className = 'canli-deger mono ' + (deger >= eski ? 'deger-yesil' : 'deger-kirmizi');
}

// ─── BAHIS (TEK BUTON - BAS) ───
async function basBahistePara() {
  if (!kullanici) { window.location.href = '/kayit'; return; }
  if (aktifBahis) { bildirimGoster('Zaten aktif bir pozisyonunuz var!', false); return; }

  const miktar = parseInt(document.getElementById('bahis-miktar').value);
  if (!miktar || miktar < 1) { bildirimGoster('Gecerli bir miktar girin!', false); return; }
  if (miktar > kullanici.jeton) { bildirimGoster('Yetersiz jeton!', false); return; }

  const r = await fetch('/api/bahis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jeton_miktari: miktar, yon: 'yukari' })
  });
  const d = await r.json();
  if (!d.basari) { bildirimGoster(d.mesaj, false); return; }

  aktifBahis = { id: d.bahisId, miktar, girdigiDeger: d.girdigiDeger };
  kullanici.jeton -= miktar;
  guncelleBilgi();

  // UI kilit
  document.getElementById('bas-btn').disabled = true;
  document.getElementById('bas-btn').textContent = 'BEKLENIYOR...';
  document.getElementById('bahis-panel').classList.add('aktif-pozisyon');

  // Aktif item efekti
  const aktifItem = document.querySelector('.aktif-item-efekt');
  if (aktifItem) aktifItem.classList.add('item-parlak');

  // 5 saniyelik geri sayım
  geriSayimSaniye = 5;
  geriSayimGoster();

  geriSayimTimer = setInterval(() => {
    geriSayimSaniye--;
    geriSayimGoster();
    if (geriSayimSaniye <= 0) {
      clearInterval(geriSayimTimer);
      geriSayimTimer = null;
      otomatikSat();
    }
  }, 1000);
}

function geriSayimGoster() {
  const el = document.getElementById('geri-sayim');
  if (!el) return;
  el.textContent = geriSayimSaniye;
  el.style.display = 'block';
  el.className = 'geri-sayim-rakam' + (geriSayimSaniye <= 2 ? ' kritik' : '');
}

async function otomatikSat() {
  if (!aktifBahis) return;

  const r = await fetch('/api/sat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bahis_id: aktifBahis.id })
  });
  const d = await r.json();
  if (!d.basari) { bildirimGoster(d.mesaj, false); resetBahis(); return; }

  kullanici.jeton = d.yeniJeton;
  guncelleBilgi();

  // Kocaman sonuc goster
  sonucGoster(d.kazanc);
  resetBahis();

  // Item efekt kaldır
  const aktifItem = document.querySelector('.aktif-item-efekt');
  if (aktifItem) aktifItem.classList.remove('item-parlak');

  const info = await fetch('/api/benim-bilgilerim');
  const iData = await info.json();
  if (iData.basari) itemBarGuncelle(iData.itemler);
}

function resetBahis() {
  aktifBahis = null;
  const btn = document.getElementById('bas-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'BAS'; }
  document.getElementById('bahis-panel').classList.remove('aktif-pozisyon');
  const el = document.getElementById('geri-sayim');
  if (el) el.style.display = 'none';
}

function sonucGoster(kazanc) {
  const overlay = document.getElementById('sonuc-overlay');
  const rakam = document.getElementById('sonuc-rakam');
  if (!overlay || !rakam) return;

  const pozitif = kazanc > 0;
  const sifir = kazanc === 0;
  rakam.textContent = pozitif ? `+${kazanc.toLocaleString('tr-TR')}` : kazanc.toLocaleString('tr-TR');
  rakam.className = 'sonuc-rakam ' + (pozitif ? 'pozitif' : sifir ? 'sifir' : 'negatif');
  overlay.style.display = 'flex';

  setTimeout(() => {
    overlay.style.display = 'none';
  }, 3000);
}

// ─── İTEM BAR ───
function itemBarGuncelle(itemler) {
  const bar = document.getElementById('item-bar');
  if (!bar) return;
  bar.innerHTML = '';
  if (!itemler || itemler.length === 0) return;

  const isimler = { 'iki_kat_kar': '2X KAR', 'zarar_kalkan': 'ZARAR KALKANI', 'para_kopar': 'PARA KOPAR' };
  itemler.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-chip aktif-item-efekt';
    div.dataset.kod = item.item_kod;
    div.innerHTML = `<span class="item-chip-isim">${isimler[item.item_kod] || item.item_kod}</span><span class="item-chip-sayi">${item.kalan_kullanim}x</span>`;
    if (item.item_kod === 'para_kopar') div.onclick = () => paraKopar();
    bar.appendChild(div);
  });
}

async function paraKopar() {
  if (!kullanici) { window.location.href = '/kayit'; return; }
  const r = await fetch('/api/para-kopar', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const d = await r.json();
  if (d.basari) {
    bildirimGoster(`${d.hedefNick} oyuncusundan ${d.calinanMiktar} jeton calindi`, true);
    kullanici.jeton = d.yeniJeton;
    guncelleBilgi();
    const info = await fetch('/api/benim-bilgilerim');
    const iData = await info.json();
    if (iData.basari) itemBarGuncelle(iData.itemler);
  } else {
    bildirimGoster(d.mesaj, false);
  }
}

// ─── OYUNCU LİSTESİ ───
function oyuncuListesiGoster(oyuncular) {
  const liste = document.getElementById('oyuncu-listesi');
  const sayac = document.getElementById('oyuncu-sayisi');
  if (!liste || !sayac) return;
  sayac.textContent = oyuncular.length;
  liste.innerHTML = '';
  oyuncular.sort((a, b) => b.jeton - a.jeton);
  oyuncular.forEach(o => {
    const benim = kullanici && o.id === kullanici.id;
    const renk = o.renk || nickRenkAl(o.nick);
    const div = document.createElement('div');
    div.className = 'oyuncu-satir' + (benim ? ' benim-oyuncu' : '');
    div.innerHTML = `<span class="oyuncu-nick" style="color:${renk}">${benim ? '► ' : ''}${escapeHtml(o.nick)}</span><span class="oyuncu-jeton">${o.jeton.toLocaleString('tr-TR')}</span>`;
    liste.appendChild(div);
  });
}

function nickRenkAl(nick) {
  const renkler = ['#e879f9','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#fb923c','#38bdf8','#4ade80','#c084fc','#f472b6','#818cf8','#2dd4bf','#facc15','#fb7185'];
  let hash = 0;
  for (let i = 0; i < nick.length; i++) hash = nick.charCodeAt(i) + ((hash << 5) - hash);
  return renkler[Math.abs(hash) % renkler.length];
}

// ─── CHAT ───
function chatEkle(nick, mesaj, tarih, jeton, renk, sira) {
  const div = document.getElementById('chat-mesajlar');
  if (!div) return;
  const tarihObj = new Date(tarih);
  const saatStr = tarihObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const benim = kullanici && nick === kullanici.nick;
  const nickRenk = renk || nickRenkAl(nick);

  const el = document.createElement('div');
  el.className = 'chat-satir' + (benim ? ' benim-chat' : '');
  el.innerHTML = `
    <span class="chat-zaman">${saatStr}</span>
    <span class="chat-nick" style="color:${nickRenk}">${escapeHtml(nick)}</span>
    <span class="chat-meta">#${sira || '?'} · ${(jeton || 0).toLocaleString('tr-TR')} jeton</span>
    <span class="chat-metin">${escapeHtml(mesaj)}</span>
  `;
  div.appendChild(el);
  if (div.children.length > 120) div.firstChild.remove();
}

function chatKaydirAsagi() {
  const div = document.getElementById('chat-mesajlar');
  if (div) div.scrollTop = div.scrollHeight;
}

function mesajGonder() {
  if (!kullanici) { window.location.href = '/giris'; return; }
  const input = document.getElementById('chat-input');
  const mesaj = input.value.trim();
  if (!mesaj) return;
  socket.emit('chat_mesaj', { mesaj });
  input.value = '';
}

function bildirimGoster(mesaj, basari) {
  const el = document.getElementById('bildirim-bar');
  if (!el) return;
  el.textContent = mesaj;
  el.className = 'bildirim-bar ' + (basari ? 'bildirim-ok' : 'bildirim-hata');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function cikisYap() {
  await fetch('/api/cikis', { method: 'POST' });
  window.location.href = '/giris';
}

init().then(() => {
  if (kullanici) socket.emit('auth', { kullanici_id: kullanici.id });
  // Misafir: bilgi alanlarını gizle/göster
  if (!kullanici) {
    const kb = document.getElementById('kullanici-bilgi-alan');
    const ma = document.getElementById('misafir-alan');
    if (kb) kb.style.display = 'none';
    if (ma) ma.style.display = 'flex';
  }
});
