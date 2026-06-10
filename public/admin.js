// DemliCoin Admin JS
let aktifSifreKullanici = null;

function goster(id, btn) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('aktif-panel'));
  document.querySelectorAll('.anav-btn').forEach(b => b.classList.remove('aktif'));
  document.getElementById('panel-' + id).classList.add('aktif-panel');
  btn.classList.add('aktif');
  const m = {
    grafik: yukleGrafikAyar,
    oyuncular: yukleOyuncular, botlar: yukleBotlar,
    itemlar: yukleItemlar, paketler: yuklePaketler,
    parakopar: yukleParaKopar, promosyon: yuklePromosyonlar,
    siteayar: yukleSiteAyar, loglar: yukleLoglari,
    ipler: yukleIpler, chatcanli: yukleCanliChat,
    chat: () => {}, duyuru: yukleDuyurular,
    slotayar: yukleSlotAyar
  };
  if (m[id]) m[id]();
}

// ─── GRAFİK ───
// Admin canlı grafik
let admCanvas = null, admCtx = null;
let admGecmis = [];
let admYonInterval = null;
let admYonAktif = false;

function admGrafikBaslat() {
  admCanvas = document.getElementById('adm-grafik-canvas');
  if (!admCanvas) return;
  admCanvas.width = admCanvas.parentElement.clientWidth;
  admCanvas.height = 200;
  admCtx = admCanvas.getContext('2d');

  const socket = io();
  socket.on('grafik_guncelle', (data) => {
    admGecmis = data.gecmis || [];
    const deger = data.deger;
    const el = document.getElementById('adm-canli-deger');
    if (el) el.textContent = deger.toFixed(2);
    admGrafikCiz();
  });

  window.addEventListener('resize', () => {
    if (!admCanvas) return;
    admCanvas.width = admCanvas.parentElement.clientWidth;
    admGrafikCiz();
  });
}

function admGrafikCiz() {
  if (!admCanvas || !admCtx || admGecmis.length < 2) return;
  const w = admCanvas.width, h = admCanvas.height;
  admCtx.clearRect(0, 0, w, h);

  const degerler = admGecmis.map(g => g.deger);
  const minD = Math.min(...degerler) * 0.93;
  const maxD = Math.max(...degerler) * 1.07;
  const aralik = maxD - minD || 1;
  const padL = 52, padR = 10, padT = 14, padB = 28;
  const gW = w - padL - padR, gH = h - padT - padB;
  const rgb = '180,40,40';

  // Grid
  admCtx.strokeStyle = 'rgba(255,255,255,0.05)';
  admCtx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (gH / 4) * i;
    admCtx.beginPath(); admCtx.moveTo(padL, y); admCtx.lineTo(padL + gW, y); admCtx.stroke();
    admCtx.fillStyle = 'rgba(255,255,255,0.35)';
    admCtx.font = '600 11px JetBrains Mono, monospace';
    admCtx.textAlign = 'right';
    admCtx.fillText((maxD - (aralik / 4) * i).toFixed(0), padL - 6, y + 4);
  }

  // Alan
  const grad = admCtx.createLinearGradient(0, padT, 0, padT + gH);
  grad.addColorStop(0, `rgba(${rgb},0.22)`);
  grad.addColorStop(1, `rgba(${rgb},0.01)`);
  admCtx.beginPath();
  admGecmis.forEach((p, i) => {
    const x = padL + (i / (admGecmis.length - 1)) * gW;
    const y = padT + gH - ((p.deger - minD) / aralik) * gH;
    i === 0 ? admCtx.moveTo(x, y) : admCtx.lineTo(x, y);
  });
  const sonD = degerler[degerler.length - 1];
  admCtx.lineTo(padL + gW, padT + gH); admCtx.lineTo(padL, padT + gH); admCtx.closePath();
  admCtx.fillStyle = grad; admCtx.fill();

  // Çizgi
  admCtx.beginPath();
  admCtx.strokeStyle = `rgb(${rgb})`; admCtx.lineWidth = 2.5;
  admCtx.lineJoin = 'round'; admCtx.lineCap = 'round';
  admGecmis.forEach((p, i) => {
    const x = padL + (i / (admGecmis.length - 1)) * gW;
    const y = padT + gH - ((p.deger - minD) / aralik) * gH;
    i === 0 ? admCtx.moveTo(x, y) : admCtx.lineTo(x, y);
  });
  admCtx.stroke();

  // Son nokta
  const lastX = padL + gW;
  const lastY = padT + gH - ((sonD - minD) / aralik) * gH;
  admCtx.beginPath(); admCtx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  admCtx.fillStyle = `rgb(${rgb})`; admCtx.fill();
  admCtx.strokeStyle = 'rgba(255,255,255,0.6)'; admCtx.lineWidth = 2; admCtx.stroke();

  // Fiyat etiketi
  admCtx.fillStyle = `rgba(${rgb},0.9)`;
  admCtx.fillRect(lastX + 6, lastY - 10, 52, 20);
  admCtx.fillStyle = '#fff';
  admCtx.font = '700 11px JetBrains Mono, monospace';
  admCtx.textAlign = 'left';
  admCtx.fillText(sonD.toFixed(1), lastX + 10, lastY + 4);
}

// ─── BASILI TUT: YÖN KONTROLÜ ───
function grafikYonBasla(yon) {
  if (admYonAktif) return;
  admYonAktif = true;

  const msgEl = document.getElementById('grafik-yon-msg');
  const yBtn = document.getElementById('adm-yukari-btn');
  const aBtn = document.getElementById('adm-asagi-btn');

  if (yon === 'yukari') {
    if (msgEl) msgEl.textContent = '▲ Grafik yukarı itiliyor...';
    if (yBtn) yBtn.classList.add('btn-aktif-yukari');
  } else {
    if (msgEl) msgEl.textContent = '▼ Grafik aşağı itiliyor...';
    if (aBtn) aBtn.classList.add('btn-aktif-asagi');
  }

  // Her 800ms'de bir server'a yön komutu gönder
  async function gonder() {
    if (!admYonAktif) return;
    try {
      const ayarlar = {
        guncelleme_suresi: parseInt(document.getElementById('g-sure').value) || 3000,
        min_deger: parseFloat(document.getElementById('g-min').value) || 50,
        max_deger: parseFloat(document.getElementById('g-max').value) || 500,
        artma_orani: parseFloat(document.getElementById('g-artma').value) || 0.55,
        max_degisim: parseInt(document.getElementById('g-degisim').value) || 40,
        tur_suresi: parseInt(document.getElementById('g-tur-suresi').value) || 60,
      };
      // Yöne göre mevcut değerden hedef hesapla
      const mevcutDeger = parseFloat(document.getElementById('adm-canli-deger').textContent) || 200;
      const adim = ayarlar.max_degisim * 1.5;
      const hedef = yon === 'yukari'
        ? Math.min(mevcutDeger + adim, ayarlar.max_deger)
        : Math.max(mevcutDeger - adim, ayarlar.min_deger);
      await fetch('/api/admin/grafik-ayar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ayarlar, siradaki_deger: hedef })
      });
    } catch(e) {}
  }

  gonder();
  admYonInterval = setInterval(gonder, 800);
}

function grafikYonBirak() {
  if (!admYonAktif) return;
  admYonAktif = false;
  if (admYonInterval) { clearInterval(admYonInterval); admYonInterval = null; }

  const msgEl = document.getElementById('grafik-yon-msg');
  if (msgEl) msgEl.textContent = '';

  const yBtn = document.getElementById('adm-yukari-btn');
  const aBtn = document.getElementById('adm-asagi-btn');
  if (yBtn) yBtn.classList.remove('btn-aktif-yukari');
  if (aBtn) aBtn.classList.remove('btn-aktif-asagi');
}

// Süre ile yön zorla
async function grafikSureMod(yon) {
  const sureSn = parseInt(document.getElementById('g-sure-mod-sure').value) || 0;
  const adim = parseFloat(document.getElementById('g-sure-mod-adim').value) || 50;
  const msgEl = document.getElementById('grafik-sure-mod-msg');

  const mevcutDeger = parseFloat(document.getElementById('adm-canli-deger').textContent) || 200;
  const ayarlar = {
    guncelleme_suresi: parseInt(document.getElementById('g-sure').value) || 3000,
    min_deger: parseFloat(document.getElementById('g-min').value) || 50,
    max_deger: parseFloat(document.getElementById('g-max').value) || 500,
    artma_orani: parseFloat(document.getElementById('g-artma').value) || 0.55,
    max_degisim: parseInt(document.getElementById('g-degisim').value) || 40,
    tur_suresi: parseInt(document.getElementById('g-tur-suresi').value) || 60,
  };

  const hedef = yon === 'yukari'
    ? Math.min(mevcutDeger + adim, ayarlar.max_deger)
    : Math.max(mevcutDeger - adim, ayarlar.min_deger);

  if (sureSn === 0) {
    // Anlık: bir kez uygula
    await fetch('/api/admin/grafik-ayar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ayarlar, siradaki_deger: hedef })
    });
    if (msgEl) msgEl.textContent = `✓ ${yon === 'yukari' ? '▲' : '▼'} Anlık uygulandı → ${hedef.toFixed(0)}`;
    setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
  } else {
    // Süre boyunca tekrarla
    if (msgEl) msgEl.textContent = `⏱ ${sureSn}sn boyunca ${yon === 'yukari' ? '▲ yükseliyor' : '▼ düşüyor'}...`;
    const bitis = Date.now() + sureSn * 1000;

    const tekrarla = async () => {
      if (Date.now() >= bitis) {
        if (msgEl) msgEl.textContent = `✓ ${sureSn}sn tamamlandı.`;
        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
        return;
      }
      const mevcutStr = document.getElementById('adm-canli-deger').textContent;
      const mevcut = parseFloat(mevcutStr) || 200;
      const h = yon === 'yukari'
        ? Math.min(mevcut + adim, ayarlar.max_deger)
        : Math.max(mevcut - adim, ayarlar.min_deger);
      try {
        await fetch('/api/admin/grafik-ayar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...ayarlar, siradaki_deger: h })
        });
      } catch(e) {}
      const kalanSn = Math.max(0, Math.ceil((bitis - Date.now()) / 1000));
      if (msgEl) msgEl.textContent = `⏱ ${kalanSn}sn kaldı (${yon === 'yukari' ? '▲' : '▼'} ${h.toFixed(0)})`;
      setTimeout(tekrarla, (ayarlar.guncelleme_suresi || 3000) + 200);
    };
    tekrarla();
  }
}

async function yukleGrafikAyar() {
  const r = await fetch('/api/admin/grafik-ayar-yukle');
  if (!r.ok) return;
  const d = await r.json();
  if (!d.basari) return;
  const a = d.ayar;
  const sure = document.getElementById('g-sure');
  const artma = document.getElementById('g-artma');
  const degisim = document.getElementById('g-degisim');
  const turSuresi = document.getElementById('g-tur-suresi');
  if (sure) sure.value = a.guncelleme_suresi || 3000;
  if (artma) artma.value = a.artma_orani !== undefined ? a.artma_orani : 0.55;
  if (degisim) degisim.value = a.max_degisim || 40;
  document.getElementById('g-min').value = a.min_deger || 50;
  document.getElementById('g-max').value = a.max_deger || 500;
  if (turSuresi) turSuresi.value = a.tur_suresi || 60;
}

async function grafigKaydet() {
  const body = {
    guncelleme_suresi: parseInt(document.getElementById('g-sure').value),
    min_deger: parseFloat(document.getElementById('g-min').value) || 50,
    max_deger: parseFloat(document.getElementById('g-max').value) || 500,
    artma_orani: parseFloat(document.getElementById('g-artma').value),
    max_degisim: parseInt(document.getElementById('g-degisim').value),
    tur_suresi: parseInt(document.getElementById('g-tur-suresi').value) || 60
  };
  const r = await fetch('/api/admin/grafik-ayar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('grafik-msg', d.mesaj || (d.basari ? 'Kaydedildi' : 'Hata'), d.basari);
}

async function manuelGrafik() {
  const sd = parseFloat(document.getElementById('g-siradaki').value);
  if (!sd || isNaN(sd)) { msg('grafik-msg', 'Gecerli deger girin', false); return; }
  const body = {
    guncelleme_suresi: parseInt(document.getElementById('g-sure').value) || 3000,
    min_deger: parseFloat(document.getElementById('g-min').value) || 50,
    max_deger: parseFloat(document.getElementById('g-max').value) || 500,
    artma_orani: parseFloat(document.getElementById('g-artma').value) || 0.55,
    max_degisim: parseInt(document.getElementById('g-degisim').value) || 40,
    tur_suresi: parseInt(document.getElementById('g-tur-suresi').value) || 60,
    siradaki_deger: sd,
    siradaki_sure: parseInt(document.getElementById('g-siradaki-sure').value) || null
  };
  const r = await fetch('/api/admin/grafik-ayar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('grafik-msg', `Manuel: ${sd} ayarlandi`, d.basari);
  document.getElementById('g-siradaki').value = '';
  document.getElementById('g-siradaki-sure').value = '';
}

// ─── DUYURULAR ───
async function yukleDuyurular() {
  const r = await fetch('/api/admin/duyurular');
  const d = await r.json();
  const liste = document.getElementById('duyuru-liste');
  liste.innerHTML = '';
  if (!d.duyurular.length) { liste.innerHTML = '<p class="soluk" style="padding:16px;">Duyuru yok.</p>'; return; }
  d.duyurular.forEach(du => {
    liste.innerHTML += `
      <div class="admin-kart">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;border:none;padding:0;">${esc(du.baslik)}</h3>
          <span class="rozet ${du.aktif ? 'rozet-green' : 'rozet-red'}">${du.aktif ? 'Aktif' : 'Pasif'}</span>
        </div>
        <p style="font-size:13px;color:var(--t2);margin-bottom:12px;">${esc(du.icerik)}</p>
        <div style="font-size:11px;color:var(--t3);margin-bottom:12px;">Renk: ${du.renk} · Sure: ${du.sure_dk > 0 ? du.sure_dk + ' dk' : 'Sinirsiz'}</div>
        <div class="btn-grup">
          ${du.aktif
            ? `<button class="tbtn tbtn-yellow" onclick="duyuruDurumDegistir(${du.id},false)">Durdur</button>`
            : `<button class="tbtn tbtn-green" onclick="duyuruDurumDegistir(${du.id},true)">Aktif Et</button>`}
          <button class="tbtn tbtn-red" onclick="duyuruSil(${du.id})">Sil</button>
        </div>
      </div>`;
  });
}

async function duyuruEkle() {
  const body = {
    baslik: document.getElementById('du-baslik').value,
    icerik: document.getElementById('du-icerik').value,
    renk: document.getElementById('du-renk').value,
    sure_dk: parseInt(document.getElementById('du-sure').value) || 0
  };
  if (!body.baslik || !body.icerik) { msg('du-msg', 'Baslik ve icerik gerekli', false); return; }
  const r = await fetch('/api/admin/duyuru-ekle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('du-msg', d.basari ? 'Duyuru yayinlandi' : 'Hata', d.basari);
  if (d.basari) { document.getElementById('du-baslik').value = ''; document.getElementById('du-icerik').value = ''; yukleDuyurular(); }
}

async function duyuruDurumDegistir(id, aktif) {
  const d = await fetch('/api/admin/duyurular');
  const dd = await d.json();
  const duyuru = dd.duyurular.find(x => x.id === id);
  if (!duyuru) return;
  await fetch('/api/admin/duyuru-guncelle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...duyuru, aktif }) });
  yukleDuyurular();
}

async function duyuruSil(id) {
  if (!confirm('Silinsin mi?')) return;
  await fetch('/api/admin/duyuru-sil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  yukleDuyurular();
}

// ─── OYUNCULAR ───
async function yukleOyuncular() {
  const r = await fetch('/api/admin/oyuncular');
  const d = await r.json();
  const tbody = document.getElementById('oyuncu-tbody');
  tbody.innerHTML = '';
  d.oyuncular.forEach(k => {
    const tarih = new Date(k.olusturma_tarihi).toLocaleDateString('tr-TR');
    tbody.innerHTML += `
      <tr>
        <td><strong>${esc(k.nick)}</strong></td>
        <td class="mono">${k.jeton.toLocaleString('tr-TR')}</td>
        <td class="mono soluk" style="font-size:12px;">${(k.toplam_yatirilan||0).toFixed(2)} TL</td>
        <td class="soluk" style="font-size:11px;">${tarih}</td>
        <td style="font-family:monospace;font-size:11px;color:var(--t2);">
          ${esc(k.son_ip || '—')}
          <br><button class="tbtn tbtn-blue" style="font-size:10px;height:20px;margin-top:2px;" onclick="tumIpleriGoster(${k.id},'${esc(k.nick)}')">Tum IP</button>
        </td>
        <td>
          ${k.yasak ? '<span class="rozet rozet-red">Yasak</span>' : '<span class="rozet rozet-green">Aktif</span>'}
          ${k.chat_yasak ? '<span class="rozet rozet-yellow">Chat Yasak</span>' : ''}
        </td>
        <td class="btn-grup">
          ${k.yasak
            ? `<button class="tbtn tbtn-green" onclick="yasakDegis(${k.id},false)">Yasagi Kaldir</button>`
            : `<button class="tbtn tbtn-red" onclick="yasakDegis(${k.id},true)">Yasakla</button>`}
          ${k.chat_yasak
            ? `<button class="tbtn tbtn-yellow" onclick="chatYasakDegis(${k.id},false)">Chat AC</button>`
            : `<button class="tbtn tbtn-yellow" onclick="chatYasakDegis(${k.id},true)">Chat Yasak</button>`}
          <button class="tbtn tbtn-blue" onclick="sifreModalAc(${k.id},'${esc(k.nick)}')">Sifre</button>
        </td>
      </tr>`;
  });
}

async function tumIpleriGoster(id, nick) {
  const r = await fetch(`/api/admin/kullanici-ipler?kullanici_id=${id}`);
  const d = await r.json();
  const benzersiz = [...new Set(d.ipler.map(i => i.ip))];
  alert(`${nick} — IP Adresleri:\n\n${benzersiz.join('\n') || 'Kayit yok'}`);
}

async function yasakDegis(id, durum) {
  await fetch('/api/admin/oyuncu-yasak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kullanici_id: id, durum }) });
  yukleOyuncular();
}

async function chatYasakDegis(id, durum) {
  await fetch('/api/admin/chat-yasak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kullanici_id: id, durum }) });
  yukleOyuncular();
}

async function sifreModalAc(id, nick) {
  aktifSifreKullanici = id;
  document.getElementById('sifre-modal-baslik').textContent = `Sifre — ${nick}`;
  document.getElementById('sifre-yeni').value = '';
  document.getElementById('sifre-hash-goster').value = 'Yukleniyor...';
  document.getElementById('sifre-modal').style.display = 'flex';
  const r = await fetch(`/api/admin/kullanici-sifre?kullanici_id=${id}`);
  const d = await r.json();
  if (d.basari) document.getElementById('sifre-hash-goster').value = d.sifre_hash;
}

function sifreModalKapat() { document.getElementById('sifre-modal').style.display = 'none'; aktifSifreKullanici = null; }

document.addEventListener('click', e => { const m = document.getElementById('sifre-modal'); if (m && e.target === m) sifreModalKapat(); });

async function sifreDegistir() {
  if (!aktifSifreKullanici) return;
  const r = await fetch('/api/admin/kullanici-sifre-degistir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kullanici_id: aktifSifreKullanici, yeni_sifre: document.getElementById('sifre-yeni').value }) });
  const d = await r.json();
  msg('sifre-msg', d.mesaj, d.basari);
  if (d.basari) setTimeout(sifreModalKapat, 1500);
}

// ─── BOTLAR ───
async function yukleBotlar() {
  const r = await fetch('/api/admin/botlar');
  const d = await r.json();
  const tbody = document.getElementById('bot-tbody');
  tbody.innerHTML = '';
  d.botlar.forEach(b => {
    tbody.innerHTML += `
      <tr data-bot-id="${b.id}">
        <td><input class="tablo-input bot-nick" data-id="${b.id}" value="${esc(b.nick)}" style="width:130px" /></td>
        <td class="mono">${b.jeton.toLocaleString('tr-TR')}</td>
        <td>
          <input class="tablo-input bot-beceri" data-id="${b.id}" type="number" value="${b.beceri}" min="0" max="100" style="width:65px" />
          <span class="soluk" style="font-size:11px;"> /100</span>
        </td>
        <td>
          <select class="tablo-select bot-aktif" data-id="${b.id}">
            <option value="1" ${b.aktif ? 'selected' : ''}>Aktif</option>
            <option value="0" ${!b.aktif ? 'selected' : ''}>Pasif</option>
          </select>
        </td>
      </tr>`;
  });
}

async function botlarTopluKaydet() {
  const botlar = [];
  document.querySelectorAll('#bot-tbody tr').forEach(tr => {
    const id = tr.dataset.botId;
    if (!id) return;
    botlar.push({
      id: parseInt(id),
      nick: tr.querySelector('.bot-nick').value,
      beceri: parseInt(tr.querySelector('.bot-beceri').value),
      aktif: tr.querySelector('.bot-aktif').value === '1'
    });
  });
  const r = await fetch('/api/admin/botlar-toplu-kaydet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botlar }) });
  const d = await r.json();
  alert(d.basari ? `${botlar.length} bot kaydedildi.` : 'Hata olustu.');
  if (d.basari) yukleBotlar();
}

// ─── CANLI CHAT ───
async function yukleCanliChat() {
  const r = await fetch('/api/admin/chat-canli');
  const d = await r.json();
  const tbody = document.getElementById('canli-chat-tbody');
  if (!d.mesajlar.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--t3);padding:16px;">Mesaj yok</td></tr>'; return; }
  tbody.innerHTML = d.mesajlar.map(m => {
    const t = new Date(m.tarih).toLocaleString('tr-TR');
    return `<tr id="adm-cm-${m.id}">
      <td style="font-size:11px;color:var(--t3);">${t}</td>
      <td><strong>${esc(m.nick||'?')}</strong></td>
      <td>${esc(m.mesaj)}</td>
      <td><button class="tbtn tbtn-red" onclick="chatMesajSil(${m.id})">Sil</button></td>
    </tr>`;
  }).join('');
}

async function chatMesajSil(id) {
  await fetch('/api/admin/chat-sil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesaj_id: id }) });
  const el = document.getElementById(`adm-cm-${id}`);
  if (el) el.remove();
}

async function tumChatSil() {
  if (!confirm('Tum chat silinsin mi?')) return;
  await fetch('/api/admin/chat-tumunu-sil', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  yukleCanliChat();
}

// ─── CHAT GEÇMİŞİ ───
async function yukleChat() {
  const gun = document.getElementById('chat-gun').value;
  const saat = document.getElementById('chat-saat').value;
  let url = '/api/admin/chat-gecmis?';
  if (gun) url += `gun=${gun}&`;
  if (saat !== '') url += `saat=${saat}`;
  const r = await fetch(url);
  const d = await r.json();
  const liste = document.getElementById('chat-liste');
  if (!d.mesajlar.length) { liste.innerHTML = '<p class="soluk" style="padding:16px;">Mesaj yok.</p>'; return; }
  liste.innerHTML = d.mesajlar.map(m => `
    <div class="cg-satir">
      <span class="cg-zaman">${new Date(m.tarih).toLocaleString('tr-TR')}</span>
      <span class="cg-nick">${esc(m.nick||'?')}</span>
      <span class="cg-metin">${esc(m.mesaj)}</span>
      <button class="tbtn tbtn-red" style="margin-left:auto;flex-shrink:0;" onclick="chatMesajSilGecmis(${m.id}, this)">Sil</button>
    </div>`).join('');
}

async function chatMesajSilGecmis(id, btn) {
  await fetch('/api/admin/chat-sil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesaj_id: id }) });
  btn.closest('.cg-satir').remove();
}

// ─── LOGLAR ───
async function yukleLoglari() {
  const nick = document.getElementById('log-nick').value.trim();
  const limit = document.getElementById('log-limit').value;
  let url = `/api/admin/bahis-loglari?limit=${limit}`;
  if (nick) url += `&nick=${encodeURIComponent(nick)}`;
  const r = await fetch(url);
  const d = await r.json();
  const tbody = document.getElementById('log-tbody');
  if (!d.loglar.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--t3);padding:16px;">Log yok</td></tr>'; return; }
  tbody.innerHTML = d.loglar.map(l => {
    const sc = l.sonuc > 0 ? 'var(--green)' : l.sonuc < 0 ? 'var(--red)' : 'var(--t2)';
    const ss = l.sonuc > 0 ? `+${l.sonuc.toLocaleString('tr-TR')}` : (l.sonuc||0).toLocaleString('tr-TR');
    return `<tr>
      <td style="font-size:11px;color:var(--t3);">${new Date(l.tarih).toLocaleString('tr-TR')}</td>
      <td><strong>${esc(l.nick||'?')}</strong></td>
      <td class="mono">${(l.miktar||0).toLocaleString('tr-TR')}</td>
      <td class="mono soluk">${(l.giris_degeri||0).toFixed(2)}</td>
      <td class="mono soluk">${(l.cikis_degeri||0).toFixed(2)}</td>
      <td class="mono" style="color:${sc};font-weight:700;">${ss}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--t3);">${esc(l.ip||'?')}</td>
    </tr>`;
  }).join('');
}

// ─── IP ───
async function yukleIpler() {
  const r = await fetch('/api/admin/kullanici-ipler');
  const d = await r.json();
  const tbody = document.getElementById('ip-tbody');
  if (!d.ipler.length) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--t3);padding:16px;">IP yok</td></tr>'; return; }
  tbody.innerHTML = d.ipler.map(i => `<tr>
    <td style="font-size:11px;color:var(--t3);">${new Date(i.tarih).toLocaleString('tr-TR')}</td>
    <td><strong>${esc(i.nick||'?')}</strong></td>
    <td style="font-family:monospace;font-size:12px;">${esc(i.ip||'?')}</td>
  </tr>`).join('');
}

// ─── ITEMLAR ───
async function yukleItemlar() {
  const r = await fetch('/api/admin/itemlar');
  const d = await r.json();
  const liste = document.getElementById('item-liste');
  liste.innerHTML = '';
  d.itemlar.forEach(item => {
    liste.innerHTML += `
      <div class="admin-kart">
        <h3>${esc(item.isim)}</h3>
        <div class="fg"><label>Isim</label><input id="ii-${item.id}" value="${esc(item.isim)}" /></div>
        <div class="fg"><label>Aciklama</label><textarea id="ia-${item.id}" rows="2">${esc(item.aciklama)}</textarea></div>
        <div class="fg"><label>Fiyat</label><input id="if-${item.id}" type="number" value="${item.fiyat}" min="0" /></div>
        <div class="fg"><label>Para Birimi</label>
          <select id="ip-${item.id}">
            <option value="jeton" ${item.para_birimi==='jeton'?'selected':''}>Jeton</option>
            <option value="tl" ${item.para_birimi==='tl'?'selected':''}>TL</option>
            <option value="dolar" ${item.para_birimi==='dolar'?'selected':''}>Dolar</option>
          </select>
        </div>
        <div class="fg"><label>Kullanim Hakki</label><input id="ik-${item.id}" type="number" value="${item.kullanim_hakki}" min="1" /></div>
        <div class="fg"><label>Durum</label>
          <select id="idu-${item.id}">
            <option value="1" ${item.aktif?'selected':''}>Aktif</option>
            <option value="0" ${!item.aktif?'selected':''}>Pasif</option>
          </select>
        </div>
        <button class="admin-btn-ana" onclick="itemKaydet(${item.id})">Kaydet</button>
        <div id="imsg-${item.id}" class="admin-msg" style="display:none;"></div>
      </div>`;
  });
}

async function itemKaydet(id) {
  const body = { id, isim: document.getElementById(`ii-${id}`).value, aciklama: document.getElementById(`ia-${id}`).value, fiyat: parseFloat(document.getElementById(`if-${id}`).value), para_birimi: document.getElementById(`ip-${id}`).value, kullanim_hakki: parseInt(document.getElementById(`ik-${id}`).value), aktif: document.getElementById(`idu-${id}`).value === '1' };
  const r = await fetch('/api/admin/item-guncelle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg(`imsg-${id}`, d.basari ? 'Kaydedildi' : 'Hata', d.basari);
}

// ─── PAKETLER ───
async function yuklePaketler() {
  const r = await fetch('/api/admin/jeton-paketleri');
  const d = await r.json();
  const liste = document.getElementById('paket-liste');
  liste.innerHTML = '';
  d.paketler.forEach(p => {
    liste.innerHTML += `
      <div class="admin-kart">
        <h3>${esc(p.isim)} — ${p.jeton_miktari.toLocaleString('tr-TR')} Jeton</h3>
        <div class="fg"><label>Fiyat</label><input id="pf-${p.id}" type="number" value="${p.fiyat}" step="0.01" /></div>
        <div class="fg"><label>Para Birimi</label>
          <select id="pp-${p.id}">
            <option value="tl" ${p.para_birimi==='tl'?'selected':''}>TL</option>
            <option value="dolar" ${p.para_birimi==='dolar'?'selected':''}>Dolar</option>
          </select>
        </div>
        <div class="fg"><label>Durum</label>
          <select id="pa-${p.id}">
            <option value="1" ${p.aktif?'selected':''}>Aktif</option>
            <option value="0" ${!p.aktif?'selected':''}>Pasif</option>
          </select>
        </div>
        <button class="admin-btn-ana" onclick="paketKaydet(${p.id})">Kaydet</button>
        <div id="pmsg-${p.id}" class="admin-msg" style="display:none;"></div>
      </div>`;
  });
}

async function paketKaydet(id) {
  const body = { id, fiyat: parseFloat(document.getElementById(`pf-${id}`).value), para_birimi: document.getElementById(`pp-${id}`).value, aktif: document.getElementById(`pa-${id}`).value === '1' };
  const r = await fetch('/api/admin/paket-guncelle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg(`pmsg-${id}`, d.basari ? 'Kaydedildi' : 'Hata', d.basari);
}

// ─── PARA KOPAR ───
async function yukleParaKopar() {
  const r = await fetch('/api/admin/para-kopar-ayar');
  const d = await r.json();
  if (d.basari) { document.getElementById('pk-min').value = d.ayar.min_miktar; document.getElementById('pk-max').value = d.ayar.max_miktar; }
}

async function koparKaydet() {
  const r = await fetch('/api/admin/para-kopar-ayar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ min_miktar: parseInt(document.getElementById('pk-min').value), max_miktar: parseInt(document.getElementById('pk-max').value) }) });
  const d = await r.json();
  msg('kopar-msg', d.basari ? 'Kaydedildi' : 'Hata', d.basari);
}

// ─── PROMOSYON ───
async function yuklePromosyonlar() {
  const r = await fetch('/api/admin/promosyonlar');
  const d = await r.json();
  const tbody = document.getElementById('promo-tbody');
  if (!d.promolar.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--t3);padding:16px;">Kod yok</td></tr>'; return; }
  const ii = { 'iki_kat_kar': '2X Kar', 'zarar_kalkan': 'Zarar Kalkani', 'para_kopar': 'Para Kopar' };
  tbody.innerHTML = d.promolar.map(p => `<tr>
    <td><strong class="mono">${esc(p.kod)}</strong></td>
    <td class="mono">${p.jeton > 0 ? '+' + p.jeton.toLocaleString('tr-TR') : '—'}</td>
    <td>${p.item_kod ? `${ii[p.item_kod]||p.item_kod} x${p.item_adet}` : '—'}</td>
    <td>${p.sinirli ? `Sinirli (${p.kullanim_hakki})` : 'Sinirsiz'}</td>
    <td class="mono">${p.kullanim_sayisi} / ${p.sinirli ? p.kullanim_hakki : '∞'}</td>
    <td>${p.aktif ? '<span class="rozet rozet-green">Aktif</span>' : '<span class="rozet rozet-red">Pasif</span>'}</td>
    <td class="btn-grup">
      ${p.aktif ? `<button class="tbtn tbtn-yellow" onclick="promoToggle(${p.id},false)">Durdur</button>` : `<button class="tbtn tbtn-green" onclick="promoToggle(${p.id},true)">Aktif</button>`}
      <button class="tbtn tbtn-red" onclick="promoSil(${p.id})">Sil</button>
    </td>
  </tr>`).join('');
}

async function promosyonOlustur() {
  const body = { kod: document.getElementById('prom-kod').value, jeton: parseInt(document.getElementById('prom-jeton').value)||0, item_kod: document.getElementById('prom-item').value||null, item_adet: parseInt(document.getElementById('prom-item-adet').value)||0, sinirli: document.getElementById('prom-sinirli').value==='1', kullanim_hakki: parseInt(document.getElementById('prom-hakki').value)||1 };
  if (!body.kod) { msg('prom-msg', 'Kod gerekli', false); return; }
  const r = await fetch('/api/admin/promosyon-olustur', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('prom-msg', d.mesaj, d.basari);
  if (d.basari) { document.getElementById('prom-kod').value = ''; yuklePromosyonlar(); }
}

async function promoToggle(id, aktif) {
  await fetch('/api/admin/promosyon-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, aktif }) });
  yuklePromosyonlar();
}

async function promoSil(id) {
  if (!confirm('Silinsin mi?')) return;
  await fetch('/api/admin/promosyon-sil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  yuklePromosyonlar();
}

// ─── SLOT AYARLARI ───
async function yukleSlotAyar() {
  const r = await fetch('/api/admin/slot-ayarlari');
  const d = await r.json();
  if (!d.basari) return;
  const a = d.ayar;
  document.getElementById('sl-normal-aktif').value = a.normal_aktif ? '1' : '0';
  document.getElementById('sl-normal-fiyat').value = a.normal_fiyat || 50;
  document.getElementById('sl-normal-kazanma').value = a.normal_kazanma_orani || 35;
  document.getElementById('sl-normal-carpan-min').value = a.normal_carpan_min || 0;
  document.getElementById('sl-normal-carpan-max').value = a.normal_carpan_max || 5;
  document.getElementById('sl-vip-aktif').value = a.vip_aktif ? '1' : '0';
  document.getElementById('sl-vip-fiyat').value = a.vip_fiyat || 200;
  document.getElementById('sl-vip-kazanma').value = a.vip_kazanma_orani || 40;
  document.getElementById('sl-vip-carpan-min').value = a.vip_carpan_min || 0;
  document.getElementById('sl-vip-carpan-max').value = a.vip_carpan_max || 12;
  document.getElementById('sl-plus-aktif').value = a.plus_aktif ? '1' : '0';
  document.getElementById('sl-plus-fiyat').value = a.plus_fiyat || 500;
  document.getElementById('sl-plus-kazanma').value = a.plus_kazanma_orani || 45;
  document.getElementById('sl-plus-carpan-min').value = a.plus_carpan_min || 0;
  document.getElementById('sl-plus-carpan-max').value = a.plus_carpan_max || 30;
}

async function slotAyarKaydet() {
  const body = {
    normal_aktif:       document.getElementById('sl-normal-aktif').value === '1',
    normal_fiyat:       document.getElementById('sl-normal-fiyat').value,
    normal_kazanma_orani: document.getElementById('sl-normal-kazanma').value,
    normal_carpan_min:  document.getElementById('sl-normal-carpan-min').value,
    normal_carpan_max:  document.getElementById('sl-normal-carpan-max').value,
    vip_aktif:          document.getElementById('sl-vip-aktif').value === '1',
    vip_fiyat:          document.getElementById('sl-vip-fiyat').value,
    vip_kazanma_orani:  document.getElementById('sl-vip-kazanma').value,
    vip_carpan_min:     document.getElementById('sl-vip-carpan-min').value,
    vip_carpan_max:     document.getElementById('sl-vip-carpan-max').value,
    plus_aktif:         document.getElementById('sl-plus-aktif').value === '1',
    plus_fiyat:         document.getElementById('sl-plus-fiyat').value,
    plus_kazanma_orani: document.getElementById('sl-plus-kazanma').value,
    plus_carpan_min:    document.getElementById('sl-plus-carpan-min').value,
    plus_carpan_max:    document.getElementById('sl-plus-carpan-max').value,
  };
  const r = await fetch('/api/admin/slot-ayarlari', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('slot-ayar-msg', d.mesaj || (d.basari ? 'Kaydedildi' : 'Hata'), d.basari);
}

async function yukleSlotLoglari() {
  const r = await fetch('/api/admin/slot-loglari?limit=50');
  const d = await r.json();
  const tbody = document.getElementById('slot-log-tbody');
  if (!d.loglar.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:16px;">Log yok</td></tr>'; return; }
  tbody.innerHTML = d.loglar.map(l => {
    const sc = l.kazanc > 0 ? 'var(--green)' : l.kazanc < 0 ? 'var(--red)' : 'var(--t2)';
    const ss = l.kazanc > 0 ? `+${l.kazanc.toLocaleString('tr-TR')}` : (l.kazanc||0).toLocaleString('tr-TR');
    const tipRenk = l.slot_tip==='vip'?'#a78bfa':l.slot_tip==='plus'?'#38bdf8':'var(--gold)';
    return `<tr>
      <td style="font-size:11px;color:var(--t3);">${new Date(l.tarih).toLocaleString('tr-TR')}</td>
      <td><strong>${esc(l.nick||'?')}</strong></td>
      <td style="color:${tipRenk};font-weight:700;">${(l.slot_tip||'').toUpperCase()}</td>
      <td class="mono">${(l.bahis||0).toLocaleString('tr-TR')}</td>
      <td style="font-size:18px;">${(l.semboller||'').replace(/,/g,' ')}</td>
      <td class="mono" style="color:${sc};font-weight:700;">${ss}</td>
    </tr>`;
  }).join('');
}

// ─── SİTE AYARLARI ───
async function yukleSiteAyar() {
  const r = await fetch('/api/admin/site-ayarlari');
  const d = await r.json();
  if (d.basari) {
    document.getElementById('sa-isim').value = d.ayar.coin_ismi || 'DemliCoin';
    document.getElementById('sa-kisaltma').value = d.ayar.coin_kisaltma || 'DC';
    document.getElementById('sa-min-bahis').value = d.ayar.min_bahis || 150;
    document.getElementById('sa-kosul').value = d.ayar.kullanim_kosullari || '';
  }
}

async function siteAyarKaydet() {
  const body = {
    coin_ismi: document.getElementById('sa-isim').value,
    coin_kisaltma: document.getElementById('sa-kisaltma').value,
    min_bahis: parseInt(document.getElementById('sa-min-bahis').value)||150,
    kullanim_kosullari: document.getElementById('sa-kosul').value.trim() || null
  };
  const r = await fetch('/api/admin/site-ayarlari', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('sa-msg', d.mesaj || (d.basari ? 'Kaydedildi' : 'Hata'), d.basari);
}

// ─── UTILS ───
function msg(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'admin-msg ' + (ok ? 'msg-ok' : 'msg-err');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
async function cikis() { await fetch('/api/admin/cikis', { method: 'POST' }); window.location.href = '/yonetbunlari/giris'; }
