// DemliCoin Cark JS
let kullanici = null;
let carklar = [];
let aktifCark = null;
let donuyor = false;
let mevcutAci = 0; // canvas üzerinde mevcut dönme açısı (radyan)

// Renk paleti — dilim renkler (emoji yok, sade)
const DILIM_RENKLERI = [
  '#1e1e3a','#2a1f3d','#1a2a3a','#1f2d1f','#2d1f1f',
  '#1a1a2e','#2e1a2e','#1a2e1a','#2e2e1a','#1a2a2a'
];
const DILIM_RENK_PARLAK = [
  '#3d3d7a','#5a3d7a','#3d5a7a','#3d7a3d','#7a3d3d',
  '#3d3d5a','#5a3d5a','#3d5a3d','#5a5a3d','#3d5a5a'
];

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

  try {
    const r = await fetch('/api/cark/ayarlar');
    const d = await r.json();
    if (d.basari) {
      carklar = d.carklar.filter(c => c.aktif);
      tipBarDoldur();
      if (carklar.length > 0) {
        aktifCark = carklar[0];
        carkSec(carklar[0].id);
      }
    }
  } catch(e) {}
}

// ─── TİP BAR ───
function tipBarDoldur() {
  const bar = document.getElementById('cark-tip-bar');
  bar.innerHTML = '';
  carklar.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'cark-tip-btn' + (i === 0 ? ' cark-tip-aktif' : '');
    btn.dataset.id = c.id;
    btn.innerHTML = `
      <span class="cark-tip-isim">${c.isim.toUpperCase()}</span>
      <span class="cark-tip-fiyat">${c.fiyat.toLocaleString('tr-TR')} JETON</span>
    `;
    btn.addEventListener('click', () => {
      if (donuyor) return;
      document.querySelectorAll('.cark-tip-btn').forEach(b => b.classList.remove('cark-tip-aktif'));
      btn.classList.add('cark-tip-aktif');
      carkSec(c.id);
    });
    bar.appendChild(btn);
  });
}

function carkSec(id) {
  aktifCark = carklar.find(c => c.id === id) || carklar[0];
  if (!aktifCark) return;

  document.getElementById('cark-aktif-tip').textContent = aktifCark.isim.toUpperCase();
  document.getElementById('cark-aktif-fiyat').textContent = aktifCark.fiyat.toLocaleString('tr-TR');
  const btnJeton = document.getElementById('cark-btn-jeton');
  if (btnJeton) btnJeton.textContent = `${aktifCark.fiyat.toLocaleString('tr-TR')} JETON`;

  mevcutAci = 0;
  carkCiz(mevcutAci);
  odulTablosunuDoldur();
}

// ─── ÇARK ÇİZ ───
function carkCiz(donmusAci) {
  const canvas = document.getElementById('cark-canvas');
  if (!canvas || !aktifCark) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = cx - 8;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const dilimler = aktifCark.dilimler;
  if (!dilimler || dilimler.length === 0) return;

  const toplamSans = dilimler.reduce((s, d) => s + (d.sans || 0), 0);
  let baslangicAci = donmusAci - Math.PI / 2;

  // ─── DİLİMLERİ ÇİZ ───
  dilimler.forEach((d, i) => {
    const dilimAci = (d.sans / toplamSans) * 2 * Math.PI;
    const bitisAci = baslangicAci + dilimAci;
    const renk = DILIM_RENKLERI[i % DILIM_RENKLERI.length];
    const renkParlak = DILIM_RENK_PARLAK[i % DILIM_RENK_PARLAK.length];

    // Alan
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, baslangicAci, bitisAci);
    ctx.closePath();
    const gradX = cx + Math.cos(baslangicAci + dilimAci / 2) * r * 0.5;
    const gradY = cy + Math.sin(baslangicAci + dilimAci / 2) * r * 0.5;
    const grad = ctx.createRadialGradient(gradX, gradY, 0, cx, cy, r);
    grad.addColorStop(0, renkParlak);
    grad.addColorStop(1, renk);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    baslangicAci = bitisAci;
  });

  // ─── METİNLERİ ÇİZ (dilim döndürme yerine mutlak koordinat) ───
  let metin_aci = donmusAci - Math.PI / 2;
  dilimler.forEach((d, i) => {
    const dilimAci = (d.sans / toplamSans) * 2 * Math.PI;
    const ortaAci = metin_aci + dilimAci / 2;
    const textR = r * 0.60;
    const tx = cx + Math.cos(ortaAci) * textR;
    const ty = cy + Math.sin(ortaAci) * textR;

    ctx.save();
    ctx.translate(tx, ty);
    // Metni okunabilir yönde tut — sağ yarıda normal, sol yarıda 180° çevir
    const normalMi = ortaAci > -Math.PI / 2 && ortaAci < Math.PI / 2;
    ctx.rotate(ortaAci + (normalMi ? 0 : Math.PI));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Başlık
    const fontSize = dilimAci > 0.6 ? 13 : dilimAci > 0.35 ? 11 : 9;
    ctx.font = `700 ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 3;
    ctx.fillText(d.isim, 0, -7);

    // Şans yüzdesi
    ctx.font = `600 ${Math.max(8, fontSize - 2)}px JetBrains Mono, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`%${d.sans}`, 0, 8);
    ctx.shadowBlur = 0;

    ctx.restore();
    metin_aci += dilimAci;
  });

  // Dış halka
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // İç daire
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, 2 * Math.PI);
  ctx.fillStyle = '#0d0d1a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ─── ÇARK ÇEVİR ───
async function carkCevir() {
  if (donuyor) return;
  if (!kullanici) { window.location.href = '/giris'; return; }
  if (!aktifCark) return;

  if (kullanici.jeton < aktifCark.fiyat) {
    toast(`Yetersiz jeton! Gerekli: ${aktifCark.fiyat.toLocaleString('tr-TR')}`, false);
    return;
  }

  donuyor = true;
  const btn = document.getElementById('cark-cevir-btn');
  btn.disabled = true;
  document.getElementById('cark-btn-icerik').textContent = 'DONUYOR...';

  // Optimistik düşme
  kullanici.jeton -= aktifCark.fiyat;
  document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');

  try {
    const r = await fetch('/api/cark/cevir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cark_id: aktifCark.id })
    });
    const d = await r.json();

    if (!d.basari) {
      toast(d.mesaj, false);
      kullanici.jeton += aktifCark.fiyat;
      document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');
      donuyor = false;
      btn.disabled = false;
      document.getElementById('cark-btn-icerik').textContent = 'CARKI CEVİR';
      return;
    }

    // Hedef dilim açısını hesapla
    const dilimler = aktifCark.dilimler;
    const toplamSans = dilimler.reduce((s, dd) => s + (dd.sans || 0), 0);
    let dilimBasAci = 0;
    for (let i = 0; i < d.dilimIdx; i++) {
      dilimBasAci += (dilimler[i].sans / toplamSans) * 2 * Math.PI;
    }
    const dilimOrtaAci = dilimBasAci + (dilimler[d.dilimIdx].sans / toplamSans) * Math.PI;

    // 5-8 tam tur + hedef dilim ortası
    const turSayisi = 5 + Math.floor(Math.random() * 3);
    const hedefAci = turSayisi * 2 * Math.PI - dilimOrtaAci;

    animasyonBaslat(hedefAci, () => {
      // Sonuç
      kullanici.jeton = d.yeniJeton;
      document.getElementById('jeton-miktar').textContent = d.yeniJeton.toLocaleString('tr-TR');

      const sonEl = document.getElementById('cark-son-kazanc');
      if (d.iflas) {
        sonEl.textContent = `IFLAS -${(d.cark_fiyat + d.iflasKayip).toLocaleString('tr-TR')}`;
        sonEl.style.color = '#f87171';
        iflasOverlay(d.iflasKayip, d.cark_fiyat);
      } else if (d.net > 0) {
        sonEl.textContent = `+${d.net.toLocaleString('tr-TR')}`;
        sonEl.style.color = 'var(--green)';
        kazanOverlay(d.dilim, d.net);
      } else {
        sonEl.textContent = `-${d.cark_fiyat.toLocaleString('tr-TR')}`;
        sonEl.style.color = 'var(--red)';
        kayipEfekti();
      }

      donuyor = false;
      btn.disabled = false;
      document.getElementById('cark-btn-icerik').textContent = 'CARKI CEVİR';
    });

  } catch(e) {
    toast('Baglanti hatasi!', false);
    kullanici.jeton += aktifCark.fiyat;
    document.getElementById('jeton-miktar').textContent = kullanici.jeton.toLocaleString('tr-TR');
    donuyor = false;
    btn.disabled = false;
    document.getElementById('cark-btn-icerik').textContent = 'CARKI CEVİR';
  }
}

// ─── ANİMASYON ───
let animId = null;

function animasyonBaslat(hedefAci, callback) {
  const sure = 4000;
  const baslangic = performance.now();
  const baslangicAci = mevcutAci;

  function adim(now) {
    const gecen = now - baslangic;
    const t = Math.min(gecen / sure, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    mevcutAci = baslangicAci + hedefAci * ease;
    carkCiz(mevcutAci);
    if (t < 1) {
      animId = requestAnimationFrame(adim);
    } else {
      mevcutAci = baslangicAci + hedefAci;
      carkCiz(mevcutAci);
      if (callback) setTimeout(callback, 200);
    }
  }
  animId = requestAnimationFrame(adim);
}

// ─── EFEKTLER ───
function kazanOverlay(dilim, net) {
  const el = document.getElementById('cark-overlay');
  document.getElementById('cark-ov-label').textContent = dilim.isim;
  document.getElementById('cark-ov-miktar').textContent = `+${net.toLocaleString('tr-TR')}`;
  document.getElementById('cark-ov-alt').textContent = 'JETON KAZANDIN';
  el.style.display = 'flex';
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

function iflasOverlay(iflasKayip, carkFiyat) {
  const el = document.getElementById('cark-overlay');
  document.getElementById('cark-ov-label').textContent = 'IFLAS';
  document.getElementById('cark-ov-miktar').textContent = `-${(carkFiyat + iflasKayip).toLocaleString('tr-TR')}`;
  document.getElementById('cark-ov-miktar').style.color = '#f87171';
  document.getElementById('cark-ov-alt').textContent = `CARK (${carkFiyat.toLocaleString('tr-TR')}) + CEZA (${iflasKayip.toLocaleString('tr-TR')}) JETON`;
  el.style.display = 'flex';
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  setTimeout(() => {
    document.getElementById('cark-ov-miktar').style.color = '';
    el.style.display = 'none';
  }, 3000);
  kayipEfekti();
}

function kayipEfekti() {
  const alan = document.querySelector('.cark-alan');
  if (!alan) return;
  alan.classList.add('cark-kayip');
  setTimeout(() => alan.classList.remove('cark-kayip'), 400);
}

// ─── ÖDÜL TABLOSU ───
function odulTablosunuDoldur() {
  const el = document.getElementById('cark-odul-tablo');
  if (!el || !aktifCark) return;
  el.innerHTML = aktifCark.dilimler.map((d, i) => `
    <div class="cark-odul-satir" style="--d-renk:${DILIM_RENK_PARLAK[i % DILIM_RENK_PARLAK.length]}">
      <span class="cark-odul-isim">${d.isim}</span>
      <span class="cark-odul-jeton mono">${d.jeton > 0 ? d.jeton.toLocaleString('tr-TR') + ' J' : '—'}</span>
      <span class="cark-odul-sans">%${d.sans}</span>
    </div>
  `).join('');
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
