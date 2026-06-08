// DemliCoin Admin JS

function goster(id, btn) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('aktif-panel'));
  document.querySelectorAll('.anav-btn').forEach(b => b.classList.remove('aktif'));
  document.getElementById('panel-' + id).classList.add('aktif-panel');
  btn.classList.add('aktif');
  if (id === 'oyuncular') yukleOyuncular();
  if (id === 'botlar') yukleBotlar();
  if (id === 'itemlar') yukleItemlar();
  if (id === 'paketler') yuklePaketler();
  if (id === 'parakopar') yukleParaKopar();
}

// ─── GRAFİK ───
async function grafigKaydet() {
  const body = {
    guncelleme_suresi: parseInt(document.getElementById('g-sure').value),
    min_deger: parseFloat(document.getElementById('g-min').value),
    max_deger: parseFloat(document.getElementById('g-max').value),
    artma_orani: parseFloat(document.getElementById('g-artma').value),
    max_degisim: parseFloat(document.getElementById('g-degisim').value)
  };
  const r = await fetch('/api/admin/grafik-ayar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('grafik-msg', d.mesaj || (d.basari ? 'Kaydedildi' : 'Hata'), d.basari);
}

async function manuelGrafik() {
  const sd = parseFloat(document.getElementById('g-siradaki').value);
  if (!sd || isNaN(sd)) { msg('grafik-msg', 'Gecerli deger girin', false); return; }
  const body = {
    guncelleme_suresi: parseInt(document.getElementById('g-sure').value) || 5000,
    min_deger: parseFloat(document.getElementById('g-min').value) || 10,
    max_deger: parseFloat(document.getElementById('g-max').value) || 500,
    artma_orani: parseFloat(document.getElementById('g-artma').value) || 0.55,
    max_degisim: parseFloat(document.getElementById('g-degisim').value) || 40,
    siradaki_deger: sd,
    siradaki_sure: parseInt(document.getElementById('g-siradaki-sure').value) || null
  };
  const r = await fetch('/api/admin/grafik-ayar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  msg('grafik-msg', `Manuel deger ayarlandi: ${sd}`, d.basari);
  document.getElementById('g-siradaki').value = '';
  document.getElementById('g-siradaki-sure').value = '';
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
        <td class="mono">${(k.toplam_yatirilan || 0).toFixed(2)} TL</td>
        <td class="soluk">${tarih}</td>
        <td>
          ${k.yasak ? '<span class="rozet rozet-red">Yasak</span>' : '<span class="rozet rozet-green">Aktif</span>'}
          ${k.chat_yasak ? '<span class="rozet rozet-yellow">Chat Yasak</span>' : ''}
        </td>
        <td class="btn-grup">
          ${k.yasak
            ? `<button class="tbtn tbtn-green" onclick="yasakDegis(${k.id},false)">Yasagi Kaldir</button>`
            : `<button class="tbtn tbtn-red" onclick="yasakDegis(${k.id},true)">Yasakla</button>`}
          ${k.chat_yasak
            ? `<button class="tbtn tbtn-yellow" onclick="chatYasakDegis(${k.id},false)">Chat Yasagi Kaldir</button>`
            : `<button class="tbtn tbtn-yellow" onclick="chatYasakDegis(${k.id},true)">Chat Yasagi</button>`}
        </td>
      </tr>`;
  });
}

async function yasakDegis(id, durum) {
  await fetch('/api/admin/oyuncu-yasak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kullanici_id: id, durum }) });
  yukleOyuncular();
}

async function chatYasakDegis(id, durum) {
  await fetch('/api/admin/chat-yasak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kullanici_id: id, durum }) });
  yukleOyuncular();
}

// ─── BOTLAR ───
async function yukleBotlar() {
  const r = await fetch('/api/admin/botlar');
  const d = await r.json();
  const tbody = document.getElementById('bot-tbody');
  tbody.innerHTML = '';
  d.botlar.forEach(b => {
    tbody.innerHTML += `
      <tr>
        <td><input class="tablo-input" id="bot-nick-${b.id}" value="${esc(b.nick)}" style="width:120px" /></td>
        <td class="mono">${b.jeton.toLocaleString('tr-TR')}</td>
        <td>
          <input class="tablo-input" id="bot-beceri-${b.id}" type="number" value="${b.beceri}" min="0" max="100" style="width:70px" />
          <small class="soluk"> / 100</small>
        </td>
        <td>
          <select class="tablo-select" id="bot-aktif-${b.id}">
            <option value="1" ${b.aktif ? 'selected' : ''}>Aktif</option>
            <option value="0" ${!b.aktif ? 'selected' : ''}>Pasif</option>
          </select>
        </td>
        <td>
          <button class="tbtn tbtn-blue" onclick="botKaydet(${b.id})">Kaydet</button>
        </td>
      </tr>`;
  });
}

async function botKaydet(id) {
  const body = {
    id,
    nick: document.getElementById(`bot-nick-${id}`).value,
    beceri: parseInt(document.getElementById(`bot-beceri-${id}`).value),
    aktif: document.getElementById(`bot-aktif-${id}`).value === '1'
  };
  const r = await fetch('/api/admin/bot-guncelle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (d.basari) yukleBotlar();
}

// ─── CHAT ───
async function yukleChat() {
  const gun = document.getElementById('chat-gun').value;
  const saat = document.getElementById('chat-saat').value;
  let url = '/api/admin/chat-gecmis?';
  if (gun) url += `gun=${gun}&`;
  if (saat !== '') url += `saat=${saat}`;
  const r = await fetch(url);
  const d = await r.json();
  const liste = document.getElementById('chat-liste');
  if (!d.mesajlar.length) { liste.innerHTML = '<p class="soluk" style="padding:16px;">Mesaj bulunamadi.</p>'; return; }
  liste.innerHTML = d.mesajlar.map(m => {
    const t = new Date(m.tarih).toLocaleString('tr-TR');
    return `<div class="cg-satir"><span class="cg-zaman">${t}</span><span class="cg-nick">${esc(m.nick||'?')}</span><span class="cg-metin">${esc(m.mesaj)}</span></div>`;
  }).join('');
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
  const body = {
    id,
    isim: document.getElementById(`ii-${id}`).value,
    aciklama: document.getElementById(`ia-${id}`).value,
    fiyat: parseFloat(document.getElementById(`if-${id}`).value),
    para_birimi: document.getElementById(`ip-${id}`).value,
    kullanim_hakki: parseInt(document.getElementById(`ik-${id}`).value),
    aktif: document.getElementById(`idu-${id}`).value === '1'
  };
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
