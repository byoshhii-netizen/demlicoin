// DemliCoin Slot JS
let kullanici = null;
let slotAyar = null;
let aktifTip = 'normal';
let ceviriyor = false;

// Metin tabanlı semboller — emoji yok
const SEMBOLLER = {
  normal: [
    { k: '7',   cls: 'sym-7',   agir: 1 },
    { k: 'BAR', cls: 'sym-bar', agir: 2 },
    { k: 'DC',  cls: 'sym-dc',  agir: 3 },
    { k: '★',   cls: 'sym-star',agir: 2 },
    { k: 'BAR', cls: 'sym-bar', agir: 2 },
    { k: 'DC',  cls: 'sym-dc',  agir: 3 },
  ],
  vip: [
    { k: '7',   cls: 'sym-7',   agir: 1 },
    { k: 'VIP', cls: 'sym-bar', agir: 2 },
    { k: 'DC',  cls: 'sym-dc',  agir: 2 },
    { k: '★★',  cls: 'sym-star',agir: 2 },
    { k: 'BAR', cls: 'sym-bar', agir: 3 },
    { k: 'VIP', cls: 'sym-bar', agir: 2 },
  ],
  plus: [
    { k: '7',   cls: 'sym-7',   agir: 1 },
    { k: '★★★', cls: 'sym-star',agir: 2 },
    { k: 'DC',  cls: 'sym-dc',  agir: 2 },
    { k: 'MAX', cls: 'sym-bar', agir: 2 },
    { k: 'BAR', cls: 'sym-def', agir: 3 },
    { k: '★★★', cls: 'sym-star',agir: 2 },
  ],
};

// ─── INIT ───
async function init() {
  try {
    const r = await fetch('/api/benim-bilgilerim');
    if (r.ok) {
      const d = await r.json();
      if (d.basari) {
        kullanici = d.kullanici;
        document.getElementById('hosgeldin-nick').textContent = kullanici.nick;
        document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');
      }
    }
  } catch(e) {}

  if (!kullanici) {
    document.getElementById('kullanici-bilgi-alan').style.display = 'none';
    document.getElementById('misafir-alan').style.display = 'flex';
  }

  // Slot ayarları
  try {
    const r = await fetch('/api/slot/ayarlar');
    const d = await r.json();
    if (d.basari) {
      slotAyar = d.ayar;
      fiyatlariGuncelle();
      odemeTablosunuDoldur();
    }
  } catch(e) {}

  // Makaraları başlangıç sembolleriyle doldur
  for (let i = 0; i < 3; i++) trackDoldur(i, aktifTip);
}

// ─── MAKARA TRACK DOLDUR ───
function trackDoldur(makaraIdx, tip) {
  const track = document.getElementById(`track-${makaraIdx}`);
  if (!track) return;
  const pool = SEMBOLLER[tip] || SEMBOLLER.normal;
  let html = '';
  for (let i = 0; i < 12; i++) {
    const s = pool[Math.floor(Math.random() * pool.length)];
    html += `<div class="slot-sembol ${s.cls}">${s.k}</div>`;
  }
  track.innerHTML = html;
}

// ─── TİP SEÇ ───
function slotTipSec(tip, btn) {
  if (ceviriyor) return;

  // VIP/Plus kilitli mi?
  if (tip === 'vip' && slotAyar && !slotAyar.vip_aktif) {
    toast('VIP Slot şu an kapalı.', false); return;
  }
  if (tip === 'plus' && slotAyar && !slotAyar.plus_aktif) {
    toast('Plus+ Slot şu an kapalı.', false); return;
  }

  aktifTip = tip;

  // Buton stilleri
  document.querySelectorAll('.slot-tip-btn').forEach(b => b.classList.remove('slot-tip-aktif'));
  btn.classList.add('slot-tip-aktif');

  // Makine teması güncelle
  const makine = document.getElementById('slot-makine');
  makine.className = `slot-makine slot-makine-${tip}`;

  // Makaraları yeni sembollerle doldur
  for (let i = 0; i < 3; i++) trackDoldur(i, tip);

  // Fiyatı da bilgi satırında göster
  document.getElementById('aktif-tip-goster').textContent = tip === 'plus' ? 'PLUS+' : tip.toUpperCase();
  document.getElementById('aktif-bahis-goster').textContent = (slotAyar ? slotAyar[`${tip}_fiyat`] : (tip==='normal'?50:tip==='vip'?200:500)).toLocaleString('tr-TR');
}

// ─── FİYATLARI GÜNCELLE ───
function fiyatlariGuncelle() {
  if (!slotAyar) return;
  document.getElementById('fiyat-normal').textContent = `${slotAyar.normal_fiyat} Jeton`;
  document.getElementById('fiyat-vip').textContent = `${slotAyar.vip_fiyat} Jeton`;
  document.getElementById('fiyat-plus').textContent = `${slotAyar.plus_fiyat} Jeton`;

  // Kilitli rozetler
  if (!slotAyar.vip_aktif) document.getElementById('vip-kilitli').style.display = 'inline';
  if (!slotAyar.plus_aktif) document.getElementById('plus-kilitli').style.display = 'inline';

  // Aktif bahis güncelle
  const fiyat = slotAyar[`${aktifTip}_fiyat`];
  document.getElementById('aktif-bahis-goster').textContent = fiyat.toLocaleString('tr-TR');
}

// ─── ÖDEME TABLOSU ───
function odemeTablosunuDoldur() {
  const grid = document.getElementById('odeme-grid');
  if (!grid || !slotAyar) return;

  const tipler = [
    { tip: 'normal', isim: '🎮 Normal', renk: '#f0b429' },
    { tip: 'vip',    isim: '👑 VIP',    renk: '#a78bfa' },
    { tip: 'plus',   isim: '🚀 Plus+',  renk: '#38bdf8' }
  ];

  grid.innerHTML = tipler.map(t => `
    <div class="odeme-kart" style="--tip-renk:${t.renk}">
      <div class="odeme-kart-baslik">${t.isim}</div>
      <div class="odeme-satir">
        <span>Bahis</span>
        <strong>${slotAyar[`${t.tip}_fiyat`]} Jeton</strong>
      </div>
      <div class="odeme-satir">
        <span>Kazanma Şansı</span>
        <strong>%${slotAyar[`${t.tip}_kazanma_orani`]}</strong>
      </div>
      <div class="odeme-satir">
        <span>Max Çarpan</span>
        <strong>${slotAyar[`${t.tip}_carpan_max`]}x</strong>
      </div>
      <div class="odeme-satir odeme-jackpot">
        <span>Jackpot</span>
        <strong>${Math.round(slotAyar[`${t.tip}_fiyat`] * slotAyar[`${t.tip}_carpan_max`])} Jeton</strong>
      </div>
    </div>
  `).join('');
}

// ─── SLOT ÇEVİR ───
async function slotCevir() {
  if (ceviriyor) return;
  if (!kullanici) { window.location.href = '/giris'; return; }

  const fiyat = slotAyar ? slotAyar[`${aktifTip}_fiyat`] : 50;
  if (kullanici.jeton < fiyat) {
    toast(`Yetersiz jeton! Gerekli: ${fiyat}`, false);
    return;
  }

  ceviriyor = true;
  const btn = document.getElementById('slot-cevir-btn');
  btn.disabled = true;
  document.getElementById('slot-btn-icerik').textContent = '⏳ ÇEVİRİYOR...';

  // Optimistik jeton düşme
  kullanici.jeton -= fiyat;
  document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');

  // Animasyonu başlat
  animasyonBaslat();

  try {
    const r = await fetch('/api/slot/cevir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tip: aktifTip })
    });
    const d = await r.json();

    if (!d.basari) {
      animasyonDurdur(['❌','❌','❌']);
      toast(d.mesaj, false);
      kullanici.jeton += fiyat; // geri al
      document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');
      ceviriyor = false;
      btn.disabled = false;
      document.getElementById('slot-btn-icerik').textContent = '🎰 ÇEVİR';
      return;
    }

    // Animasyonu sonuç sembollerle durdur
    setTimeout(() => {
      animasyonDurdur(d.semboller, () => {
        // Sonuç göster
        kullanici.jeton = d.yeniJeton;
        document.getElementById('jeton-miktar').textContent = d.yeniJeton.toLocaleString('tr-TR');

        const net = d.net;
        const sonEl = document.getElementById('son-kazanc-goster');
        if (net > 0) {
          sonEl.textContent = `+${net.toLocaleString('tr-TR')}`;
          sonEl.style.color = 'var(--green)';
          kazanOverlay(d.semboller, net, d.carpan);
          kazanEfekti();
        } else if (net < 0) {
          sonEl.textContent = net.toLocaleString('tr-TR');
          sonEl.style.color = 'var(--red)';
          kayipEfekti();
        } else {
          sonEl.textContent = '±0';
          sonEl.style.color = 'var(--t2)';
        }

        ceviriyor = false;
        btn.disabled = false;
        document.getElementById('slot-btn-icerik').textContent = '🎰 ÇEVİR';
      });
    }, 1800); // sunucu cevabını bekle, sonra durdur

  } catch(e) {
    animasyonDurdur(['⚠️','⚠️','⚠️']);
    toast('Bağlantı hatası!', false);
    kullanici.jeton += fiyat;
    document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');
    ceviriyor = false;
    btn.disabled = false;
    document.getElementById('slot-btn-icerik').textContent = '🎰 ÇEVİR';
  }
}

// ─── ANİMASYON ───
let animTimers = [];

function animasyonBaslat() {
  const pool = SEMBOLLER[aktifTip] || SEMBOLLER.normal;

  for (let i = 0; i < 3; i++) {
    const track = document.getElementById(`track-${i}`);
    if (track) track.classList.add('slot-donuyor');
  }

  for (let i = 0; i < 3; i++) {
    const t = setInterval(() => {
      const track = document.getElementById(`track-${i}`);
      if (!track) return;
      let html = '';
      for (let j = 0; j < 12; j++) {
        const s = pool[Math.floor(Math.random() * pool.length)];
        html += `<div class="slot-sembol ${s.cls}">${s.k}</div>`;
      }
      track.innerHTML = html;
    }, 70 + i * 25);
    animTimers.push(t);
  }
}

function animasyonDurdur(sonucSemboller, callback) {
  animTimers.forEach(t => clearInterval(t));
  animTimers = [];

  // Sembol nesnesini bul (server string dönüyor)
  const pool = SEMBOLLER[aktifTip] || SEMBOLLER.normal;
  function sembolBul(k) {
    return pool.find(s => s.k === k) || { k, cls: 'sym-def' };
  }

  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const track = document.getElementById(`track-${i}`);
      if (!track) return;
      track.classList.remove('slot-donuyor');
      track.classList.add('slot-durdu');

      const s = sembolBul(sonucSemboller[i]);
      track.innerHTML = `
        <div class="slot-sembol slot-sembol-hayalet ${s.cls}">${s.k}</div>
        <div class="slot-sembol slot-sembol-aktif ${s.cls}" id="sonuc-${i}">${s.k}</div>
        <div class="slot-sembol slot-sembol-hayalet ${s.cls}">${s.k}</div>
      `;

      setTimeout(() => track.classList.remove('slot-durdu'), 420);

      if (i === 2 && callback) setTimeout(callback, 300);
    }, i * 340);
  }
}

// ─── EFEKTLER ───
function kazanEfekti() {
  const makine = document.getElementById('slot-makine');
  makine.classList.add('slot-kazan-efekt');
  setTimeout(() => makine.classList.remove('slot-kazan-efekt'), 1000);

  // Kazanan çizgiyi göster
  const cizgi = document.getElementById('slot-kazan-cizgi');
  if (cizgi) {
    cizgi.classList.add('slot-cizgi-aktif');
    setTimeout(() => cizgi.classList.remove('slot-cizgi-aktif'), 1500);
  }
}

function kayipEfekti() {
  const makine = document.getElementById('slot-makine');
  makine.classList.add('slot-kayip-efekt');
  setTimeout(() => makine.classList.remove('slot-kayip-efekt'), 500);
}

function kazanOverlay(semboller, net, carpan) {
  const overlay = document.getElementById('slot-overlay');
  document.getElementById('slot-overlay-emoji').textContent = semboller.join('');
  document.getElementById('slot-overlay-baslik').textContent = carpan >= 5 ? '🎉 BÜYÜK KAZANÇ!' : '✨ KAZANDIN!';
  document.getElementById('slot-overlay-miktar').textContent = `+${net.toLocaleString('tr-TR')}`;
  document.getElementById('slot-overlay-alt').textContent = `${carpan}x ÇARPAN — JETON`;

  overlay.style.display = 'flex';
  overlay.classList.add('overlay-gir');
  setTimeout(() => {
    overlay.classList.remove('overlay-gir');
    overlay.style.display = 'none';
  }, 2200);
}

// ─── UTILS ───
function toast(msg, ok) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + (ok ? 'toast-ok' : 'toast-err');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

async function cikisYap() {
  await fetch('/api/cikis', { method: 'POST' });
  window.location.href = '/giris';
}

init();
