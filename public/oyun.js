// DemliCoin Oyun JS
let socket;
try { socket = io(); } catch(e) { socket = { on: ()=>{}, emit: ()=>{} }; }

let kullanici = null;
let grafikGecmis = [];
let hedefGecmis = [];
let aktifPozisyon = null;
let canvas, ctx;
let coinIsmi = 'DemliCoin';
let coinKisaltma = 'DC';
let minPozisyon = 150;
let animFrame = null;
let animBaslangic = null;
const ANIM_SURE = 500;
let eskiGecmis = [];
let turBitis = null;
let turInterval = null;

// ─── SAĞ ALT BİLDİRİM ───
function sagAltBildirim(mesaj, tip, sure) {
  sure = sure || 3500;
  const kap = document.getElementById('sag-alt-bildirimler');
  if (!kap) return;
  const el = document.createElement('div');
  el.className = `sab-item sab-${tip || 'bilgi'}`;
  el.innerHTML = `<span class="sab-metin">${escapeHtml(mesaj)}</span><button class="sab-kapat" onclick="this.parentElement.remove()">×</button>`;
  kap.appendChild(el);
  setTimeout(() => { el.classList.add('sab-cikis'); setTimeout(() => el.remove(), 400); }, sure);
}

// ─── INIT ───
async function init() {
  try {
    const sa = await fetch('/api/site-ayarlari');
    const sad = await sa.json();
    if (sad.basari) {
      coinIsmi = sad.ayar.coin_ismi || 'DemliCoin';
      coinKisaltma = sad.ayar.coin_kisaltma || 'DC';
      minPozisyon = sad.ayar.min_bahis || 150;
      document.title = coinIsmi;
      const lt = document.getElementById('logo-text'); if (lt) lt.textContent = coinIsmi;
      const gs = document.getElementById('grafik-sembol'); if (gs) gs.textContent = `${coinKisaltma} / JETON`;
      const mn = document.getElementById('min-bahis-goster'); if (mn) mn.textContent = `Min: ${minPozisyon}`;
      const bi = document.getElementById('bahis-miktar'); if (bi) { bi.min = minPozisyon; bi.value = minPozisyon; }
    }
  } catch(e) {}

  try {
    const r = await fetch('/api/benim-bilgilerim');
    if (r.ok) {
      const d = await r.json();
      if (d.basari) {
        kullanici = d.kullanici;
        guncelleBilgi();
        itemBarGuncelle(d.itemler);
        document.getElementById('giris-uyari').style.display = 'none';
        document.getElementById('bahis-panel').style.display = 'block';
        pozisyonYukle();
      }
    }
  } catch(e) {}

  if (!kullanici) {
    const kb = document.getElementById('kullanici-bilgi-alan');
    const ma = document.getElementById('misafir-alan');
    if (kb) kb.style.display = 'none';
    if (ma) ma.style.display = 'flex';
  }

  canvas = document.getElementById('grafik-canvas');
  ctx = canvas.getContext('2d');
  boyutlandirCanvas();
  window.addEventListener('resize', boyutlandirCanvas);

  try {
    const gr = await fetch('/api/grafik-durumu');
    const gd = await gr.json();
    grafikGecmis = gd.gecmis || [];
    hedefGecmis = grafikGecmis.slice();
    mevcutDegerGuncelle(gd.mevcutDeger);
    if (gd.turBitis) { turBitis = gd.turBitis; turSayacBaslat(); }
    grafikCiz();
  } catch(e) {}

  if (kullanici) {
    socket.emit('auth', { kullanici_id: kullanici.id });
    try {
      const cr = await fetch('/api/chat/gecmis');
      const cd = await cr.json();
      if (cd.basari) {
        cd.mesajlar.forEach(m => chatEkle(m.id, m.nick, m.mesaj, m.tarih, m.jeton, m.renk, m.sira, m.celik_kart));
        chatKaydirAsagi();
      }
    } catch(e) {}
  }

  try {
    const dr = await fetch('/api/duyurular');
    const dd = await dr.json();
    if (dd.basari) dd.duyurular.forEach(d => duyuruGoster(d));
  } catch(e) {}
}

// ─── POZİSYON PERSIST ───
function pozisyonKaydet() {
  if (!kullanici || !aktifPozisyon) return;
  localStorage.setItem(`pozisyon_${kullanici.id}`, JSON.stringify(aktifPozisyon));
}

function pozisyonYukle() {
  if (!kullanici) return;
  const kayitli = localStorage.getItem(`pozisyon_${kullanici.id}`);
  if (!kayitli) return;
  try {
    const p = JSON.parse(kayitli);
    if (!p || !p.id || !p.girdigiDeger) return;
    if (turBitis && Date.now() >= turBitis) {
      localStorage.removeItem(`pozisyon_${kullanici.id}`);
      return;
    }
    aktifPozisyon = p;
    const bassBtn = document.getElementById('bass-btn');
    const satBtn = document.getElementById('sat-btn');
    if (bassBtn) bassBtn.style.display = 'none';
    if (satBtn) satBtn.style.display = 'block';
    const panel = document.getElementById('bahis-panel');
    if (panel) panel.classList.add('aktif-pozisyon');
    const gd = document.getElementById('giris-degeri');
    if (gd) gd.textContent = p.girdigiDeger.toFixed(2);
    const aw = document.getElementById('aktif-bilgi-wrap');
    if (aw) aw.style.display = 'flex';
    document.querySelectorAll('.item-chip').forEach(c => c.classList.add('item-parlak'));
  } catch(e) {
    localStorage.removeItem(`pozisyon_${kullanici.id}`);
  }
}

function pozisyonTemizle() {
  if (kullanici) localStorage.removeItem(`pozisyon_${kullanici.id}`);
}

function guncelleBilgi() {
  if (!kullanici) return;
  const nick = document.getElementById('hosgeldin-nick');
  const jeton = document.getElementById('jeton-miktar');
  if (nick) nick.textContent = kullanici.nick;
  if (jeton) jeton.textContent = kullanici.jeton.toLocaleString('tr-TR');
}

function boyutlandirCanvas() {
  if (!canvas) return;
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = window.innerWidth < 640 ? 180 : 260;
  grafikCiz();
}

// ─── TUR SAYACI ───
function turSayacBaslat() {
  if (turInterval) clearInterval(turInterval);
  turInterval = setInterval(() => {
    if (!turBitis) return;
    const kalan = Math.max(0, Math.ceil((turBitis - Date.now()) / 1000));
    const el = document.getElementById('tur-sayac');
    const ring = document.getElementById('tur-ring');
    if (!el) return;
    el.textContent = kalan > 0 ? `${kalan}s` : '—';
    if (kalan <= 10) { el.style.color = '#ef4444'; if (ring) ring.style.borderColor = '#ef4444'; }
    else if (kalan <= 20) { el.style.color = '#f0b429'; if (ring) ring.style.borderColor = '#f0b429'; }
    else { el.style.color = '#10b981'; if (ring) ring.style.borderColor = '#10b981'; }
    if (kalan === 0) clearInterval(turInterval);
  }, 250);
}

// ─── SOCKET ───
socket.on('grafik_guncelle', (data) => {
  eskiGecmis = grafikGecmis.slice();
  hedefGecmis = data.gecmis || [];
  mevcutDegerGuncelle(data.deger);
  if (data.turBitis && data.turBitis !== turBitis) { turBitis = data.turBitis; turSayacBaslat(); }
  animBaslangic = null;
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(animAdim);
});

socket.on('tur_basladi', (data) => {
  turBitis = data.turBitis;
  turSayacBaslat();
  turBildirim('YENİ TUR BAŞLADI', true);
  sagAltBildirim('Yeni tur başladı — pozisyon aç!', 'basari', 4000);
});

socket.on('tur_bitti', () => {
  turBitis = null;
  turBildirim('TUR BİTTİ', false);
  sagAltBildirim('Tur sona erdi.', 'uyari', 4000);
  if (aktifPozisyon) zorunluSat();
});

socket.on('oyuncu_listesi', oyuncuListesiGoster);

socket.on('chat_mesaj', (data) => {
  chatEkle(data.id, data.nick, data.mesaj, data.tarih, data.jeton, data.renk, data.sira, data.celik_kart);
  chatKaydirAsagi();
});

socket.on('chat_mesaj_silindi', (data) => {
  const el = document.getElementById(`cm-${data.id}`);
  if (el) el.remove();
});

socket.on('chat_temizlendi', () => {
  const div = document.getElementById('chat-mesajlar');
  if (div) div.innerHTML = '';
});

socket.on('jeton_guncelle', (data) => {
  if (kullanici && data.kullanici_id === kullanici.id) {
    kullanici.jeton = data.jeton;
    const el = document.getElementById('jeton-miktar');
    if (el) el.textContent = data.jeton.toLocaleString('tr-TR');
  }
});

socket.on('yasaklandi', () => { alert('Hesabiniz yasaklanmistir.'); window.location.href = '/giris'; });
socket.on('yeni_duyuru', (d) => duyuruGoster(d));
socket.on('mevcut_duyurular', (duyurular) => duyurular.forEach(d => duyuruGoster(d)));
socket.on('duyuru_silindi', (data) => {
  const el = document.getElementById(`duyuru-${data.id}`);
  if (el) el.remove();
});

socket.on('celik_kart_alindi', (data) => {
  sagAltBildirim(`💎 ${data.nick} Çelik Kart aldı!`, 'celik', 6000);
  const chatDiv = document.getElementById('chat-mesajlar');
  if (chatDiv) {
    const el = document.createElement('div');
    el.className = 'chat-satir celik-duyuru';
    el.innerHTML = `<span class="celik-mesaj">💎 <strong>${escapeHtml(data.nick)}</strong> Çelik Kartını kullandı!</span>`;
    chatDiv.appendChild(el);
    chatKaydirAsagi();
  }
});

socket.on('celik_kart_kazandi', (data) => {
  sagAltBildirim(`💎 ${data.nick} — Çelik Kart ile +${data.miktar ? data.miktar.toLocaleString('tr-TR') : '?'} jeton kazandı!`, 'celik', 5000);
  const chatDiv = document.getElementById('chat-mesajlar');
  if (chatDiv) {
    const el = document.createElement('div');
    el.className = 'chat-satir celik-duyuru';
    el.innerHTML = `<span class="celik-mesaj">💎 <strong>${escapeHtml(data.nick)}</strong> Çelik Kartıyla <strong>+${data.miktar ? data.miktar.toLocaleString('tr-TR') : '?'} jeton</strong> kazandı!</span>`;
    chatDiv.appendChild(el);
    chatKaydirAsagi();
  }
});

// ─── TUR BİLDİRİM ───
function turBildirim(mesaj, basladi) {
  const el = document.getElementById('tur-bildirim');
  if (!el) return;
  el.textContent = mesaj;
  el.className = `tur-bildirim ${basladi ? 'tur-yeni' : 'tur-bitti-cls'}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

// ─── GRAFİK ANİMASYON ───
function animAdim(timestamp) {
  if (!animBaslangic) animBaslangic = timestamp;
  const t = Math.min((timestamp - animBaslangic) / ANIM_SURE, 1);
  const ease = 1 - Math.pow(1 - t, 3);
  if (eskiGecmis.length === 0 || hedefGecmis.length === 0) { grafikGecmis = hedefGecmis; grafikCiz(); return; }
  const gecmis = hedefGecmis.slice(0, -1);
  const sonH = hedefGecmis[hedefGecmis.length - 1];
  const sonE = eskiGecmis[eskiGecmis.length - 1] || sonH;
  grafikGecmis = [...gecmis, { deger: sonE.deger + (sonH.deger - sonE.deger) * ease, zaman: sonH.zaman }];
  grafikCiz();
  if (t < 1) animFrame = requestAnimationFrame(animAdim);
  else { grafikGecmis = hedefGecmis; grafikCiz(); }
}

const CAY_KIRMIZISI = '180,40,40';

function grafikCiz() {
  if (!canvas || !ctx || grafikGecmis.length < 2) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const degerler = grafikGecmis.map(g => g.deger);
  const minD = Math.min(...degerler) * 0.93;
  const maxD = Math.max(...degerler) * 1.07;
  const aralik = maxD - minD || 1;
  const padL = 52, padR = 10, padT = 14, padB = 28;
  const gW = w - padL - padR, gH = h - padT - padB;

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (gH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '600 11px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText((maxD - (aralik / 4) * i).toFixed(0), padL - 6, y + 4);
  }

  const rgb = CAY_KIRMIZISI;
  const grad = ctx.createLinearGradient(0, padT, 0, padT + gH);
  grad.addColorStop(0, `rgba(${rgb},0.22)`);
  grad.addColorStop(1, `rgba(${rgb},0.01)`);
  ctx.beginPath();
  grafikGecmis.forEach((p, i) => {
    const x = padL + (i / (grafikGecmis.length - 1)) * gW;
    const y = padT + gH - ((p.deger - minD) / aralik) * gH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  const sonD = degerler[degerler.length - 1];
  ctx.lineTo(padL + gW, padT + gH); ctx.lineTo(padL, padT + gH); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = `rgb(${rgb})`; ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  grafikGecmis.forEach((p, i) => {
    const x = padL + (i / (grafikGecmis.length - 1)) * gW;
    const y = padT + gH - ((p.deger - minD) / aralik) * gH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  const lastX = padL + gW;
  const lastY = padT + gH - ((sonD - minD) / aralik) * gH;
  ctx.beginPath(); ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${rgb})`; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();

  ctx.fillStyle = `rgba(${rgb},0.9)`;
  ctx.fillRect(lastX + 6, lastY - 10, 52, 20);
  ctx.fillStyle = '#fff';
  ctx.font = '700 11px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(sonD.toFixed(1), lastX + 10, lastY + 4);

  if (aktifPozisyon && aktifPozisyon.girdigiDeger) {
    const girisY = padT + gH - ((aktifPozisyon.girdigiDeger - minD) / aralik) * gH;
    if (girisY >= padT && girisY <= padT + gH) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(240,180,41,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(padL, girisY); ctx.lineTo(padL + gW, girisY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(240,180,41,0.85)';
      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Giris: ${aktifPozisyon.girdigiDeger.toFixed(1)}`, padL + 4, girisY - 4);
    }
  }
}

function mevcutDegerGuncelle(deger) {
  const el = document.getElementById('grafik-deger');
  if (!el) return;
  el.dataset.deger = deger;
  el.textContent = deger.toFixed(2);
  el.className = 'canli-deger mono deger-cay';
  if (aktifPozisyon) anlikPLGuncelle(deger);
}

function anlikPLGuncelle(mevcutDeger) {
  if (!aktifPozisyon) return;
  const el = document.getElementById('anlik-pl');
  if (!el) return;
  const oran = (mevcutDeger - aktifPozisyon.girdigiDeger) / aktifPozisyon.girdigiDeger;
  const CARPAN = 5;
  let kazanc = Math.round(aktifPozisyon.miktar * oran * CARPAN);
  if (aktifPozisyon.celikKart && kazanc > 0) kazanc = kazanc * 4;
  el.textContent = kazanc >= 0 ? `+${kazanc.toLocaleString('tr-TR')}` : kazanc.toLocaleString('tr-TR');
  el.className = 'anlik-pl ' + (kazanc >= 0 ? 'pl-pozitif' : 'pl-negatif');
}

// ─── BAHİS: GİR ───
async function bassBasildi() {
  if (!kullanici) { window.location.href = '/kayit'; return; }
  if (aktifPozisyon) { bildirimGoster('Zaten aktif pozisyon var!', false); return; }

  const inputEl = document.getElementById('bahis-miktar');
  const miktar = parseInt(inputEl ? inputEl.value : 0);
  if (!miktar || isNaN(miktar) || miktar < 1) {
    if (inputEl) inputEl.value = minPozisyon;
    bildirimGoster('Geçerli miktar girin!', false);
    return;
  }
  if (miktar < minPozisyon) { bildirimGoster('Minimum ' + minPozisyon.toLocaleString('tr-TR') + ' jetondur!', false); return; }
  if (miktar > kullanici.jeton) { bildirimGoster('Yetersiz jeton!', false); return; }

  const btn = document.getElementById('bass-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const r = await fetch('/api/bahis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton_miktari: miktar, yon: 'yukari' })
    });
    const d = await r.json();

    if (!d.basari) {
      bildirimGoster(d.mesaj, false);
      if (btn) { btn.disabled = false; btn.textContent = 'BAS'; }
      return;
    }

    aktifPozisyon = { id: d.bahisId, miktar, girdigiDeger: d.girdigiDeger, celikKart: kullanici.celik_kart ? true : false };
    pozisyonKaydet();
    kullanici.jeton -= miktar;
    guncelleBilgi();

    if (btn) btn.style.display = 'none';
    const satBtn = document.getElementById('sat-btn');
    if (satBtn) satBtn.style.display = 'block';
    const panel = document.getElementById('bahis-panel');
    if (panel) panel.classList.add('aktif-pozisyon');
    const gd = document.getElementById('giris-degeri');
    if (gd) gd.textContent = d.girdigiDeger.toFixed(2);
    const aw = document.getElementById('aktif-bilgi-wrap');
    if (aw) aw.style.display = 'flex';
    bildirimGoster('Pozisyon açıldı — ' + miktar.toLocaleString('tr-TR') + ' jeton @ ' + d.girdigiDeger.toFixed(2), true);
  } catch(e) {
    bildirimGoster('Bağlantı hatası!', false);
    if (btn) { btn.disabled = false; btn.textContent = 'BAS'; }
  }
}

// ─── BAHİS: SAT ───
async function satisYap() {
  if (!aktifPozisyon) return;
  const satBtn = document.getElementById('sat-btn');
  if (satBtn) { satBtn.disabled = true; satBtn.textContent = '...'; }

  try {
    const r = await fetch('/api/sat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bahis_id: aktifPozisyon.id })
    });
    const d = await r.json();
    if (!d.basari) {
      bildirimGoster(d.mesaj, false);
      if (satBtn) { satBtn.disabled = false; satBtn.textContent = 'SAT'; }
      return;
    }
    kullanici.jeton = d.yeniJeton;
    guncelleBilgi();
    sonucGoster(d.kazanc, false);
    if (d.kazanc > 0) sagAltBildirim(`+${d.kazanc.toLocaleString('tr-TR')} jeton kazandın!`, 'basari');
    else if (d.kazanc < 0) sagAltBildirim(`${d.kazanc.toLocaleString('tr-TR')} jeton kaybettin.`, 'hata');
    resetPozisyon();
    const info = await fetch('/api/benim-bilgilerim');
    const iData = await info.json();
    if (iData.basari) { itemBarGuncelle(iData.itemler); kullanici = iData.kullanici; }
  } catch(e) {
    bildirimGoster('Bağlantı hatası!', false);
    if (satBtn) { satBtn.disabled = false; satBtn.textContent = 'SAT'; }
  }
}

// ─── BAHİS: ZORUNLU SAT ───
async function zorunluSat() {
  if (!aktifPozisyon) return;
  try {
    const r = await fetch('/api/sat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bahis_id: aktifPozisyon.id, zorunlu: true })
    });
    const d = await r.json();
    if (d.basari) {
      kullanici.jeton = d.yeniJeton;
      guncelleBilgi();
      sonucGoster(d.kazanc, true);
      sagAltBildirim(`Tur bitti — ${d.kazanc >= 0 ? '+' : ''}${d.kazanc.toLocaleString('tr-TR')} jeton`, d.kazanc >= 0 ? 'basari' : 'hata');
      resetPozisyon();
    }
  } catch(e) {}
}

// ─── POZİSYON SIFIRLA ───
function resetPozisyon() {
  aktifPozisyon = null;
  pozisyonTemizle();
  const bassBtn = document.getElementById('bass-btn');
  if (bassBtn) { bassBtn.style.display = 'block'; bassBtn.disabled = false; bassBtn.textContent = 'BAS'; }
  const satBtn = document.getElementById('sat-btn');
  if (satBtn) satBtn.style.display = 'none';
  const panel = document.getElementById('bahis-panel');
  if (panel) panel.classList.remove('aktif-pozisyon');
  const aw = document.getElementById('aktif-bilgi-wrap');
  if (aw) aw.style.display = 'none';
  document.querySelectorAll('.item-chip').forEach(c => c.classList.remove('item-parlak'));
  const pl = document.getElementById('anlik-pl');
  if (pl) pl.textContent = '';
}

function sonucGoster(kazanc, zorunlu) {
  const overlay = document.getElementById('sonuc-overlay');
  const rakam = document.getElementById('sonuc-rakam');
  const alt = document.getElementById('sonuc-alt');
  if (!overlay || !rakam) return;
  rakam.textContent = kazanc >= 0 ? `+${kazanc.toLocaleString('tr-TR')}` : kazanc.toLocaleString('tr-TR');
  rakam.className = 'sonuc-rakam ' + (kazanc > 0 ? 'pozitif' : kazanc < 0 ? 'negatif' : 'sifir');
  if (alt) alt.textContent = zorunlu ? 'TUR BİTTİ — JETON' : 'JETON';
  overlay.style.display = 'flex';
  setTimeout(() => { overlay.style.display = 'none'; }, 1500);
}

function bildirimGoster(mesaj, basari) {
  const el = document.getElementById('bildirim-bar');
  if (!el) return;
  el.textContent = mesaj;
  el.className = 'bildirim-bar ' + (basari ? 'bildirim-ok' : 'bildirim-hata');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3500);
}

// ─── DUYURU ───
const aktifDuyurular = new Map();

function duyuruGoster(d) {
  if (aktifDuyurular.has(d.id)) return;
  const kapsayici = document.getElementById('duyuru-kapsayici');
  if (!kapsayici) return;
  const el = document.createElement('div');
  el.id = `duyuru-${d.id}`;
  el.className = `duyuru-karti duyuru-${d.renk || 'gold'}`;
  el.innerHTML = `
    <div class="duyuru-ic">
      <span class="duyuru-baslik">${escapeHtml(d.baslik)}</span>
      <span class="duyuru-icerik">${escapeHtml(d.icerik)}</span>
    </div>
    <button class="duyuru-kapat" onclick="duyuruKapat(${d.id})">×</button>
  `;
  kapsayici.appendChild(el);
  aktifDuyurular.set(d.id, el);
  if (d.sure_dk > 0) setTimeout(() => duyuruKapat(d.id), d.sure_dk * 60 * 1000);
}

function duyuruKapat(id) {
  const el = document.getElementById(`duyuru-${id}`);
  if (el) { el.classList.add('duyuru-cikis'); setTimeout(() => el.remove(), 400); }
  aktifDuyurular.delete(id);
}

// ─── ENVANTER (İTEM BAR) ───
const ITEM_META = {
  'iki_kat_kar':  { isim: '2X KAR',      kisalt: '2X',   aciklama: 'Kazancini 2 katlar',      renk: '#f0b429' },
  'zarar_kalkan': { isim: 'ZARAR KALKANI',kisalt: 'KLK',  aciklama: 'Zararin yariya iner',      renk: '#60a5fa' },
  'para_kopar':   { isim: 'PARA KOPAR',   kisalt: 'ROB',  aciklama: 'Hedeften jeton al',        renk: '#f87171' },
  'celik_kart':   { isim: 'CELIK KART',   kisalt: 'CELIK',aciklama: 'x4 kazanc, her zaman aktif',renk: '#b8e0ff' },
};

function itemBarGuncelle(itemler) {
  const bar = document.getElementById('item-bar');
  if (!bar) return;
  bar.innerHTML = '';
  if (!itemler || itemler.length === 0) return;

  itemler.forEach(item => {
    const meta = ITEM_META[item.item_kod] || { isim: item.item_kod, kisalt: 'ITM', aciklama: '', renk: '#a78bfa' };
    const isCelik = item.item_kod === 'celik_kart';
    const isAktif = isCelik || item.aktif;
    const sayi = isCelik ? '' : `${item.kalan_kullanim}x`;

    const div = document.createElement('div');
    div.className = 'envanter-chip' + (isAktif ? ' envanter-aktif' : ' envanter-pasif');
    div.dataset.itemId = item.id;
    div.dataset.itemKod = item.item_kod;
    div.style.setProperty('--item-renk', meta.renk);

    div.innerHTML = `
      <div class="envanter-ust">
        <span class="envanter-kisalt">${meta.kisalt}</span>
        ${sayi ? `<span class="envanter-sayi">${sayi}</span>` : ''}
      </div>
      <span class="envanter-isim">${meta.isim}</span>
      ${!isCelik ? `<span class="envanter-durum">${isAktif ? 'AKTİF' : 'PASİF'}</span>` : '<span class="envanter-durum celik-durum">OTOMATIK</span>'}
    `;

    if (!isCelik) {
      div.addEventListener('click', () => {
        if (item.item_kod === 'para_kopar' && (isCelik || item.aktif)) {
          paraKopar();
        } else {
          itemToggle(item.id, div);
        }
      });
    }

    bar.appendChild(div);
  });
}

async function itemToggle(itemId, el) {
  if (!kullanici) return;
  try {
    const r = await fetch('/api/item/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId })
    });
    const d = await r.json();
    if (!d.basari) { bildirimGoster(d.mesaj, false); return; }
    // UI güncelle
    itemBarGuncelle(d.itemler);
    bildirimGoster(d.aktif ? 'Item aktif edildi.' : 'Item pasife alindi.', true);
  } catch(e) {}
}

async function paraKopar() {
  if (!kullanici) return;
  const r = await fetch('/api/para-kopar', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const d = await r.json();
  bildirimGoster(d.basari ? `${d.hedefNick} hedefinden ${d.calinanMiktar.toLocaleString('tr-TR')} jeton alindi` : d.mesaj, d.basari);
  if (d.basari) {
    kullanici.jeton = d.yeniJeton; guncelleBilgi();
    const info = await fetch('/api/benim-bilgilerim');
    const iData = await info.json();
    if (iData.basari) itemBarGuncelle(iData.itemler);
  }
}

// ─── OYUNCU LİSTESİ ───
function oyuncuListesiGoster(oyuncular) {
  const liste = document.getElementById('oyuncu-listesi');
  const sayac = document.getElementById('oyuncu-sayisi');
  if (!liste || !sayac) return;
  sayac.textContent = oyuncular.length;
  liste.innerHTML = '';
  [...oyuncular].sort((a, b) => b.jeton - a.jeton).forEach(o => {
    const benim = kullanici && o.id === kullanici.id;
    const renk = o.celik_kart ? '#b8e0ff' : (o.renk || nickRenkAl(o.nick));
    const div = document.createElement('div');
    div.className = 'oyuncu-satir' + (benim ? ' benim-oyuncu' : '') + (o.celik_kart ? ' celik-oyuncu' : '');
    div.innerHTML = `
      <span class="oyuncu-nick" style="color:${renk}">${o.celik_kart ? '💎 ' : ''}${benim ? '▶ ' : ''}${escapeHtml(o.nick)}</span>
      <span class="oyuncu-jeton mono"><img src="/coin.svg" class="coin-img" style="width:11px;height:11px;vertical-align:middle;margin-right:2px;" />${o.jeton.toLocaleString('tr-TR')}</span>
    `;
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
function chatEkle(id, nick, mesaj, tarih, jeton, renk, sira, celikKart) {
  const div = document.getElementById('chat-mesajlar');
  if (!div) return;
  const saatStr = new Date(tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const benim = kullanici && nick === kullanici.nick;
  const nickRenk = celikKart ? '#b8e0ff' : (renk || nickRenkAl(nick));
  const el = document.createElement('div');
  el.className = 'chat-satir' + (benim ? ' benim-chat' : '') + (celikKart ? ' celik-chat' : '');
  el.id = `cm-${id}`;
  el.innerHTML = `
    <span class="chat-zaman">${saatStr}</span>
    ${celikKart ? '<span class="celik-rozet">💎</span><span class="x4-rozet">x4</span>' : ''}
    <span class="chat-nick" style="color:${nickRenk}">${escapeHtml(nick)}</span>
    <span class="chat-meta">#${sira||'?'} · ${(jeton||0).toLocaleString('tr-TR')}</span>
    <span class="chat-metin">${escapeHtml(mesaj)}</span>
  `;
  div.appendChild(el);
  if (div.children.length > 120) div.firstChild.remove();
}

function chatKaydirAsagi() { const d = document.getElementById('chat-mesajlar'); if (d) d.scrollTop = d.scrollHeight; }

function mesajGonder() {
  if (!kullanici) { window.location.href = '/giris'; return; }
  const input = document.getElementById('chat-input');
  const mesaj = input.value.trim();
  if (!mesaj) return;
  socket.emit('chat_mesaj', { mesaj });
  input.value = '';
}

function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
async function cikisYap() { await fetch('/api/cikis', { method: 'POST' }); window.location.href = '/giris'; }

// ─── EVENT LISTENER'LAR ───
document.addEventListener('DOMContentLoaded', () => {
  const bassBtn = document.getElementById('bass-btn');
  const satBtn = document.getElementById('sat-btn');
  const chatBtn = document.getElementById('chat-gonder-btn');
  const chatInput = document.getElementById('chat-input');
  const bahisMiktar = document.getElementById('bahis-miktar');

  if (bassBtn) bassBtn.addEventListener('click', bassBasildi);
  if (satBtn) satBtn.addEventListener('click', satisYap);
  if (chatBtn) chatBtn.addEventListener('click', mesajGonder);
  if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') mesajGonder(); });
  if (bahisMiktar) bahisMiktar.addEventListener('keydown', e => { if (e.key === 'Enter') bassBasildi(); });

  document.querySelectorAll('.hizli-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('bahis-miktar');
      if (el) el.value = parseInt(btn.dataset.miktar);
    });
  });
});

// Space: pozisyon yoksa gir, varsa sat
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    aktifPozisyon ? satisYap() : bassBasildi();
  }
});

init();
