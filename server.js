const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');
const GrafikMotoru = require('./grafik');
const BotMotoru = require('./botlar');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3001;
const ADMIN_SIFRE = 'kazyontuyozazyontuyozgardas';

const NICK_RENKLERI = [
  '#e879f9','#a78bfa','#60a5fa','#34d399','#fbbf24',
  '#f87171','#fb923c','#38bdf8','#4ade80','#c084fc',
  '#f472b6','#818cf8','#2dd4bf','#facc15','#fb7185'
];

function nickRenkAl(nick) {
  let hash = 0;
  for (let i = 0; i < nick.length; i++) hash = nick.charCodeAt(i) + ((hash << 5) - hash);
  return NICK_RENKLERI[Math.abs(hash) % NICK_RENKLERI.length];
}

function getIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip']
    || req.socket.remoteAddress
    || 'bilinmiyor';
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  if (req.url.toLowerCase().includes('%c4%b1')) req.url = req.url.replace(/%[Cc]4%[Bb]1/g, 'i');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'demlicoin-gizli-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const grafik = new GrafikMotoru(io);
grafik.baslat();
const botMotoru = new BotMotoru(grafik, io);
botMotoru.baslat();

// Chat otomatik temizleme — 20 dk'da bir
setInterval(() => {
  const twentyMin = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM chat_mesajlari WHERE tarih < ?').run(twentyMin);
  db.prepare('INSERT INTO chat_silindi DEFAULT VALUES').run();
  io.emit('chat_temizlendi');
}, 20 * 60 * 1000);

function adminGerektir(req, res, next) {
  if (!req.session.admin) return res.redirect('/yonetbunlari/giris');
  next();
}

// ─── SAYFALAR ───
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'oyun.html')));
app.get('/giris', (req, res) => res.sendFile(path.join(__dirname, 'public', 'giris.html')));
app.get('/kayit', (req, res) => res.sendFile(path.join(__dirname, 'public', 'kayit.html')));
app.get('/market', (req, res) => res.sendFile(path.join(__dirname, 'public', 'market.html')));
app.get('/liderlik', (req, res) => res.sendFile(path.join(__dirname, 'public', 'liderlik.html')));
app.get('/slot', (req, res) => res.sendFile(path.join(__dirname, 'public', 'slot.html')));
app.get('/yonetbunlari/giris', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-giris.html')));

app.get('/yonetbunlari', adminGerektir, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.post('/api/giris', (req, res) => {
  const { nick, sifre } = req.body;
  if (!nick || !sifre) return res.json({ basari: false, mesaj: 'Nick ve sifre gerekli.' });
  const k = db.prepare('SELECT * FROM kullanicilar WHERE nick = ?').get(nick);
  if (!k) return res.json({ basari: false, mesaj: 'Nick veya sifre hatali.' });
  if (k.yasak) return res.json({ basari: false, mesaj: 'Hesabiniz yasaklanmistir.' });
  if (!bcrypt.compareSync(sifre, k.sifre)) return res.json({ basari: false, mesaj: 'Nick veya sifre hatali.' });
  req.session.kullanici = { id: k.id, nick: k.nick };
  try { db.prepare('INSERT INTO kullanici_ipler (kullanici_id, ip) VALUES (?, ?)').run(k.id, getIP(req)); } catch(e) {}
  res.json({ basari: true });
});

app.post('/api/kayit', (req, res) => {
  const { nick, sifre } = req.body;
  if (!nick || !sifre) return res.json({ basari: false, mesaj: 'Nick ve sifre gerekli.' });
  if (nick.length < 3 || nick.length > 20) return res.json({ basari: false, mesaj: 'Nick 3-20 karakter olmali.' });
  if (sifre.length < 4) return res.json({ basari: false, mesaj: 'Sifre en az 4 karakter olmali.' });
  if (db.prepare('SELECT id FROM kullanicilar WHERE nick = ?').get(nick)) return res.json({ basari: false, mesaj: 'Bu nick zaten alinmis.' });
  const hash = bcrypt.hashSync(sifre, 10);
  const renk = nickRenkAl(nick);
  const sonuc = db.prepare('INSERT INTO kullanicilar (nick, sifre, renk) VALUES (?, ?, ?)').run(nick, hash, renk);
  req.session.kullanici = { id: sonuc.lastInsertRowid, nick };
  res.json({ basari: true });
});

app.post('/api/cikis', (req, res) => { req.session.destroy(); res.json({ basari: true }); });

// ─── OYUN API ───
app.get('/api/benim-bilgilerim', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const k = db.prepare('SELECT id, nick, jeton, toplam_yatirilan, renk, celik_kart FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);
  if (!k) return res.status(401).json({ basari: false });
  if (!k.renk) { const renk = nickRenkAl(k.nick); db.prepare('UPDATE kullanicilar SET renk = ? WHERE id = ?').run(renk, k.id); k.renk = renk; }
  const itemler = db.prepare('SELECT * FROM kullanici_itemlari WHERE kullanici_id = ?').all(k.id);
  res.json({ basari: true, kullanici: k, itemler });
});

app.get('/api/grafik-durumu', (req, res) => {
  res.json({ mevcutDeger: grafik.mevcutDegerAl(), gecmis: grafik.gecmisAl(), turBitis: grafik.turBitisAl() });
});

app.get('/api/site-ayarlari', (req, res) => {
  const ayar = db.prepare('SELECT * FROM site_ayarlari WHERE id = 1').get();
  res.json({ basari: true, ayar: ayar || { coin_ismi: 'DemliCoin', coin_kisaltma: 'DC', min_bahis: 150 } });
});

app.get('/api/kullanim-kosullari', (req, res) => {
  const ayar = db.prepare('SELECT kullanim_kosullari FROM site_ayarlari WHERE id = 1').get();
  res.json({ basari: true, metin: (ayar && ayar.kullanim_kosullari) || '' });
});

app.post('/api/bahis', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false, mesaj: 'Giris gerekli.' });
  const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);
  if (!k || k.yasak) return res.status(401).json({ basari: false });
  const miktar = parseInt(req.body.jeton_miktari);
  console.log('[BAHIS]', { kullanici: k?.nick, miktar, turBitis: grafik.turBitisAl(), simdi: Date.now() });
  if (!miktar || miktar < 1) return res.json({ basari: false, mesaj: 'Gecersiz miktar.' });
  const ayar = db.prepare('SELECT min_bahis FROM site_ayarlari WHERE id = 1').get();
  const minBahis = ayar ? (ayar.min_bahis || 150) : 150;
  if (miktar < minBahis) return res.json({ basari: false, mesaj: `Minimum bahis ${minBahis} jetondur.` });
  if (miktar > k.jeton) return res.json({ basari: false, mesaj: 'Yetersiz jeton.' });
  // Tur bitmişse pozisyon kabul etme — 500ms tolerans ile
  const turBitisZamani = grafik.turBitisAl();
  if (turBitisZamani && Date.now() >= turBitisZamani + 500) {
    return res.json({ basari: false, mesaj: 'Yeni tur başlıyor, bekleyiniz.' });
  }
  const bahisGirdigiDeger = grafik.mevcutDegerAl();
  db.prepare('UPDATE kullanicilar SET jeton = jeton - ? WHERE id = ?').run(miktar, k.id);
  db.prepare(`INSERT INTO islemler (kullanici_id, tip, miktar, grafik_degeri, sonuc) VALUES (?, 'aktif_bahis_yukari', ?, ?, NULL)`).run(k.id, miktar, bahisGirdigiDeger);
  const bahisId = db.prepare('SELECT last_insert_rowid() as id').get().id;
  res.json({ basari: true, bahisId, girdigiDeger: bahisGirdigiDeger });
});

app.post('/api/sat', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const { bahis_id, zorunlu } = req.body;
  const bahis = db.prepare('SELECT * FROM islemler WHERE id = ? AND kullanici_id = ? AND sonuc IS NULL').get(bahis_id, req.session.kullanici.id);
  if (!bahis) return res.json({ basari: false, mesaj: 'Bahis bulunamadi.' });

  const mevcutDeger = grafik.mevcutDegerAl();
  const girisDegeri = bahis.grafik_degeri;

  // Kâr/zarar hesabı — güçlendirilmiş oran (5x çarpan)
  const oran = (mevcutDeger - girisDegeri) / girisDegeri;
  const CARPAN = 5; // kar ve zararı belirgin hale getirir
  let kazan = Math.round(bahis.miktar * oran * CARPAN);

  // Tur bitti zorla sat — koyduğun gider
  if (zorunlu) {
    kazan = -bahis.miktar;
    db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(0, req.session.kullanici.id);
  } else {
    // Celik Kart — x4 kar (aktif edilmişse)
    const celikKart = db.prepare(`SELECT ki.* FROM kullanici_itemlari ki WHERE ki.kullanici_id = ? AND ki.item_kod = 'celik_kart' AND ki.kalan_kullanim > 0 AND ki.aktif = 1`).get(req.session.kullanici.id);
    if (celikKart && kazan > 0) {
      kazan = kazan * 4;
    }
    // 2X Kar — aktif edilmişse uygula ve 1 azalt
    if (kazan > 0 && !celikKart) {
      const ikiKat = db.prepare(`SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = 'iki_kat_kar' AND kalan_kullanim > 0 AND aktif = 1`).get(req.session.kullanici.id);
      if (ikiKat) {
        kazan = kazan * 2;
        const yk = ikiKat.kalan_kullanim - 1;
        if (yk <= 0) db.prepare('DELETE FROM kullanici_itemlari WHERE id = ?').run(ikiKat.id);
        else db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = ?, aktif = 0 WHERE id = ?').run(yk, ikiKat.id);
      }
    }
    // Zarar Kalkani — aktif edilmişse uygula ve 1 azalt
    if (kazan < 0) {
      const kalkan = db.prepare(`SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = 'zarar_kalkan' AND kalan_kullanim > 0 AND aktif = 1`).get(req.session.kullanici.id);
      if (kalkan) {
        kazan = Math.round(kazan / 2);
        const yk = kalkan.kalan_kullanim - 1;
        if (yk <= 0) db.prepare('DELETE FROM kullanici_itemlari WHERE id = ?').run(kalkan.id);
        else db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = ?, aktif = 0 WHERE id = ?').run(yk, kalkan.id);
      }
    }
    const geri = bahis.miktar + kazan;
    db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(Math.max(0, geri), req.session.kullanici.id);
  }

  db.prepare('UPDATE islemler SET sonuc = ?, grafik_degeri = ? WHERE id = ?').run(kazan, mevcutDeger, bahis.id);
  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
  io.emit('jeton_guncelle', { kullanici_id: req.session.kullanici.id, jeton: yeniJeton });

  // Celik kart broadcast
  if (!zorunlu && kazan > 0) {
    const celikKontrol = db.prepare(`SELECT ki.* FROM kullanici_itemlari ki WHERE ki.kullanici_id = ? AND ki.item_kod = 'celik_kart' AND ki.kalan_kullanim > 0`).get(req.session.kullanici.id);
    if (celikKontrol) {
      io.emit('celik_kart_kazandi', { nick: req.session.kullanici.nick, miktar: kazan });
    }
  }

  try {
    db.prepare('INSERT INTO bahis_loglari (kullanici_id, nick, miktar, giris_degeri, cikis_degeri, sonuc, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.session.kullanici.id, req.session.kullanici.nick, bahis.miktar, girisDegeri, mevcutDeger, kazan, getIP(req));
  } catch(e) {}

  res.json({ basari: true, kazanc: kazan, yeniJeton, girdigiDeger: girisDegeri, ciktifiDeger: mevcutDeger, zorunlu: !!zorunlu });
});

app.post('/api/para-kopar', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const koparItem = db.prepare(`SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = 'para_kopar' AND kalan_kullanim > 0`).get(req.session.kullanici.id);
  if (!koparItem) return res.json({ basari: false, mesaj: 'Para Kopar iteminiz yok.' });
  const ayar = db.prepare('SELECT * FROM para_kopar_ayar WHERE id = 1').get();
  const min = ayar.min_miktar || 10;
  const max = ayar.max_miktar || 100;

  // Hem gerçek oyuncular hem botlar
  const hedefler = [];
  io.sockets.sockets.forEach(socket => {
    if (socket.kullanici && socket.kullanici.id !== req.session.kullanici.id) hedefler.push({ tip: 'oyuncu', data: socket.kullanici });
  });
  // Botları da ekle
  const botlar = db.prepare('SELECT id, nick, jeton FROM botlar WHERE aktif = 1 AND jeton >= ?').all(min);
  botlar.forEach(b => hedefler.push({ tip: 'bot', data: b }));

  if (hedefler.length === 0) return res.json({ basari: false, mesaj: 'Calmak icin hedef yok.' });

  const hedef = hedefler[Math.floor(Math.random() * hedefler.length)];
  const miktar = Math.floor(Math.random() * (max - min + 1)) + min;

  if (hedef.tip === 'oyuncu') {
    const hBilgi = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(hedef.data.id);
    if (!hBilgi || hBilgi.jeton < min) return res.json({ basari: false, mesaj: 'Hedefin jetonu yok.' });
    const gercekMiktar = Math.min(hBilgi.jeton, miktar);
    db.prepare('UPDATE kullanicilar SET jeton = jeton - ? WHERE id = ?').run(gercekMiktar, hedef.data.id);
    db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(gercekMiktar, req.session.kullanici.id);
    const hYeni = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(hedef.data.id).jeton;
    io.emit('jeton_guncelle', { kullanici_id: hedef.data.id, jeton: hYeni });
    const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
    io.emit('jeton_guncelle', { kullanici_id: req.session.kullanici.id, jeton: yeniJeton });
    const yk = koparItem.kalan_kullanim - 1;
    if (yk <= 0) db.prepare('DELETE FROM kullanici_itemlari WHERE id = ?').run(koparItem.id);
    else db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = ? WHERE id = ?').run(yk, koparItem.id);
    res.json({ basari: true, calinanMiktar: gercekMiktar, hedefNick: hBilgi.nick, yeniJeton });
  } else {
    // Bot hedef
    const gercekMiktar = Math.min(hedef.data.jeton, miktar);
    db.prepare('UPDATE botlar SET jeton = jeton - ? WHERE id = ?').run(gercekMiktar, hedef.data.id);
    db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(gercekMiktar, req.session.kullanici.id);
    const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
    io.emit('jeton_guncelle', { kullanici_id: req.session.kullanici.id, jeton: yeniJeton });
    const yk = koparItem.kalan_kullanim - 1;
    if (yk <= 0) db.prepare('DELETE FROM kullanici_itemlari WHERE id = ?').run(koparItem.id);
    else db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = ? WHERE id = ?').run(yk, koparItem.id);
    res.json({ basari: true, calinanMiktar: gercekMiktar, hedefNick: hedef.data.nick + ' (bot)', yeniJeton });
  }
});

// ─── İTEM AKTİF TOGGLE ───
app.post('/api/item/toggle', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const { item_id } = req.body;
  const item = db.prepare('SELECT * FROM kullanici_itemlari WHERE id = ? AND kullanici_id = ?').get(item_id, req.session.kullanici.id);
  if (!item) return res.json({ basari: false, mesaj: 'Item bulunamadi.' });

  // Celik kart toggle'lanamaz, her zaman aktif
  if (item.item_kod === 'celik_kart') {
    return res.json({ basari: false, mesaj: 'Celik Kart otomatik aktiftir.' });
  }

  // Aynı tip başka aktif var mı? Aynı anda sadece 1 aktif olabilir
  const yeniAktif = item.aktif ? 0 : 1;
  if (yeniAktif === 1) {
    // Diğer aynı türleri pasifleştir
    db.prepare('UPDATE kullanici_itemlari SET aktif = 0 WHERE kullanici_id = ? AND item_kod = ?')
      .run(req.session.kullanici.id, item.item_kod);
  }

  db.prepare('UPDATE kullanici_itemlari SET aktif = ? WHERE id = ?').run(yeniAktif, item_id);
  const guncel = db.prepare('SELECT * FROM kullanici_itemlari WHERE kullanici_id = ?').all(req.session.kullanici.id);
  res.json({ basari: true, aktif: yeniAktif === 1, itemler: guncel });
});

// ─── MARKET ───
app.get('/api/market/itemlar', (req, res) => res.json({ basari: true, itemlar: db.prepare('SELECT * FROM market_itemlari WHERE aktif = 1').all() }));
app.get('/api/market/jeton-paketleri', (req, res) => res.json({ basari: true, paketler: db.prepare('SELECT * FROM jeton_paketleri WHERE aktif = 1').all() }));

app.post('/api/market/satin-al', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const item = db.prepare('SELECT * FROM market_itemlari WHERE id = ? AND aktif = 1').get(req.body.item_id);
  if (!item) return res.json({ basari: false, mesaj: 'Item bulunamadi.' });
  const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);
  if (item.para_birimi === 'jeton') {
    if (k.jeton < item.fiyat) return res.json({ basari: false, mesaj: 'Yetersiz jeton.' });
    db.prepare('UPDATE kullanicilar SET jeton = jeton - ? WHERE id = ?').run(item.fiyat, k.id);
  } else {
    return res.json({ basari: false, mesaj: 'Bu item icin gercek odeme gerekli. Demo mod.' });
  }
  const mevcut = db.prepare('SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = ?').get(k.id, item.kod);
  if (mevcut) db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = kalan_kullanim + ? WHERE id = ?').run(item.kullanim_hakki, mevcut.id);
  else db.prepare('INSERT INTO kullanici_itemlari (kullanici_id, item_kod, kalan_kullanim) VALUES (?, ?, ?)').run(k.id, item.kod, item.kullanim_hakki);

  // Celik Kart — herkese duyur
  if (item.kod === 'celik_kart') {
    db.prepare('UPDATE kullanicilar SET celik_kart = 1 WHERE id = ?').run(k.id);
    io.emit('celik_kart_alindi', { nick: k.nick, miktar: null });
  }

  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(k.id).jeton;
  res.json({ basari: true, mesaj: `${item.isim} satin alindi!`, yeniJeton });
});

app.post('/api/market/jeton-satin-al', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const paket = db.prepare('SELECT * FROM jeton_paketleri WHERE id = ? AND aktif = 1').get(req.body.paket_id);
  if (!paket) return res.json({ basari: false, mesaj: 'Paket bulunamadi.' });
  db.prepare('UPDATE kullanicilar SET jeton = jeton + ?, toplam_yatirilan = toplam_yatirilan + ? WHERE id = ?').run(paket.jeton_miktari, paket.fiyat, req.session.kullanici.id);
  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
  res.json({ basari: true, mesaj: `${paket.jeton_miktari} jeton eklendi!`, yeniJeton });
});

// ─── LİDERLİK ───
app.get('/api/liderlik', (req, res) => {
  const gercekler = db.prepare('SELECT nick, jeton, toplam_yatirilan, renk, celik_kart FROM kullanicilar WHERE yasak = 0 ORDER BY jeton DESC LIMIT 50').all();
  const botlar = db.prepare('SELECT nick, jeton, 0 as toplam_yatirilan, NULL as renk FROM botlar WHERE aktif = 1').all();
  const hepsi = [...gercekler.map(k => ({ ...k, bot: false })), ...botlar.map(b => ({ ...b, bot: true, celik_kart: 0 }))]
    .sort((a, b) => b.jeton - a.jeton).slice(0, 50);
  res.json({ basari: true, liste: hepsi });
});

// ─── CHAT ───
app.get('/api/chat/gecmis', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const mesajlar = db.prepare(`
    SELECT cm.id, cm.nick, cm.mesaj, cm.tarih, k.jeton, k.renk, k.celik_kart,
      (SELECT COUNT(*)+1 FROM kullanicilar k2 WHERE k2.jeton > k.jeton AND k2.yasak = 0) as sira
    FROM chat_mesajlari cm
    LEFT JOIN kullanicilar k ON cm.kullanici_id = k.id
    ORDER BY cm.id DESC LIMIT 60
  `).all();
  res.json({ basari: true, mesajlar: mesajlar.reverse() });
});

// ─── DUYURU ───
app.get('/api/duyurular', (req, res) => {
  const duyurular = db.prepare('SELECT * FROM duyurular WHERE aktif = 1 ORDER BY id DESC').all();
  res.json({ basari: true, duyurular });
});

// ─── SLOT ───
// Metin bazlı semboller (emoji yok)
const SLOT_SEMBOLLER = {
  normal: ['7','BAR','DC','BAR','DC','★','BAR','DC','★','7'],
  vip:    ['7','VIP','DC','VIP','DC','★★','VIP','DC','★★','7'],
  plus:   ['7','MAX','DC','MAX','DC','★★★','MAX','DC','★★★','7']
};

const SLOT_OZEL = { normal: ['7'], vip: ['7','★★'], plus: ['7','★★★'] };

function slotCevir(tip, ayar) {
  const semboller = SLOT_SEMBOLLER[tip] || SLOT_SEMBOLLER.normal;
  const kazanmaOrani = ayar[`${tip}_kazanma_orani`] || 35;

  // 3 makara
  const s1 = semboller[Math.floor(Math.random() * semboller.length)];
  const s2 = semboller[Math.floor(Math.random() * semboller.length)];
  const s3 = semboller[Math.floor(Math.random() * semboller.length)];

  let carpan = 0;
  const carpanMin = ayar[`${tip}_carpan_min`] || 0;
  const carpanMax = ayar[`${tip}_carpan_max`] || 5;

  if (s1 === s2 && s2 === s3) {
    const ozel = SLOT_OZEL[tip] || ['7'];
    if (ozel.includes(s1)) {
      carpan = carpanMax;
    } else {
      carpan = carpanMin + (carpanMax - carpanMin) * 0.6;
    }
  } else if (s1 === s2 || s2 === s3 || s1 === s3) {
    // 2 aynı — orta kazanç
    if (Math.random() * 100 < kazanmaOrani) {
      carpan = carpanMin + (carpanMax - carpanMin) * 0.25;
    }
  } else {
    // Hiç eşleşme yok
    if (Math.random() * 100 < kazanmaOrani * 0.3) {
      carpan = carpanMin + (carpanMax - carpanMin) * 0.1;
    }
  }

  carpan = Math.round(carpan * 100) / 100;
  return { semboller: [s1, s2, s3], carpan };
}

app.get('/api/slot/ayarlar', (req, res) => {
  const ayar = db.prepare('SELECT * FROM slot_ayarlari WHERE id = 1').get();
  res.json({ basari: true, ayar: ayar || {} });
});

app.post('/api/slot/cevir', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false, mesaj: 'Giris gerekli.' });
  const { tip } = req.body; // 'normal', 'vip', 'plus'
  if (!['normal','vip','plus'].includes(tip)) return res.json({ basari: false, mesaj: 'Gecersiz slot tipi.' });

  const ayar = db.prepare('SELECT * FROM slot_ayarlari WHERE id = 1').get();
  if (!ayar) return res.json({ basari: false, mesaj: 'Slot ayarlari bulunamadi.' });

  // VIP/Plus erişim kontrolü
  if (tip === 'vip' && !ayar.vip_aktif) return res.json({ basari: false, mesaj: 'VIP Slot aktif degil.' });
  if (tip === 'plus' && !ayar.plus_aktif) return res.json({ basari: false, mesaj: 'Plus+ Slot aktif degil.' });

  const fiyat = ayar[`${tip}_fiyat`] || 50;
  const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);
  if (!k) return res.json({ basari: false, mesaj: 'Kullanici bulunamadi.' });
  if (k.jeton < fiyat) return res.json({ basari: false, mesaj: `Yetersiz jeton. Gerekli: ${fiyat}` });

  // Bahsi düş
  db.prepare('UPDATE kullanicilar SET jeton = jeton - ? WHERE id = ?').run(fiyat, k.id);

  // Çevir
  const sonuc = slotCevir(tip, ayar);
  const kazanc = Math.round(fiyat * sonuc.carpan);

  // Kazancı ekle
  if (kazanc > 0) {
    db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(kazanc, k.id);
  }

  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(k.id).jeton;

  // Log
  try {
    db.prepare('INSERT INTO slot_loglari (kullanici_id, nick, slot_tip, bahis, semboller, kazanc) VALUES (?,?,?,?,?,?)')
      .run(k.id, k.nick, tip, fiyat, sonuc.semboller.join(','), kazanc - fiyat);
  } catch(e) {}

  res.json({
    basari: true,
    semboller: sonuc.semboller,
    carpan: sonuc.carpan,
    bahis: fiyat,
    kazanc,
    net: kazanc - fiyat,
    yeniJeton
  });
});

// ─── ADMIN SLOT ───
app.get('/api/admin/slot-ayarlari', adminGerektir, (req, res) => {
  const ayar = db.prepare('SELECT * FROM slot_ayarlari WHERE id = 1').get();
  res.json({ basari: true, ayar: ayar || {} });
});

app.post('/api/admin/slot-ayarlari', adminGerektir, (req, res) => {
  const {
    normal_fiyat, vip_fiyat, plus_fiyat,
    normal_aktif, vip_aktif, plus_aktif,
    normal_carpan_min, normal_carpan_max,
    vip_carpan_min, vip_carpan_max,
    plus_carpan_min, plus_carpan_max,
    normal_kazanma_orani, vip_kazanma_orani, plus_kazanma_orani
  } = req.body;
  db.prepare(`UPDATE slot_ayarlari SET
    normal_fiyat=?, vip_fiyat=?, plus_fiyat=?,
    normal_aktif=?, vip_aktif=?, plus_aktif=?,
    normal_carpan_min=?, normal_carpan_max=?,
    vip_carpan_min=?, vip_carpan_max=?,
    plus_carpan_min=?, plus_carpan_max=?,
    normal_kazanma_orani=?, vip_kazanma_orani=?, plus_kazanma_orani=?
    WHERE id=1`).run(
    parseInt(normal_fiyat)||50, parseInt(vip_fiyat)||200, parseInt(plus_fiyat)||500,
    normal_aktif?1:0, vip_aktif?1:0, plus_aktif?1:0,
    parseFloat(normal_carpan_min)||0, parseFloat(normal_carpan_max)||5,
    parseFloat(vip_carpan_min)||0, parseFloat(vip_carpan_max)||12,
    parseFloat(plus_carpan_min)||0, parseFloat(plus_carpan_max)||30,
    parseFloat(normal_kazanma_orani)||35, parseFloat(vip_kazanma_orani)||40, parseFloat(plus_kazanma_orani)||45
  );
  res.json({ basari: true, mesaj: 'Slot ayarlari guncellendi.' });
});

app.get('/api/admin/slot-loglari', adminGerektir, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const loglar = db.prepare('SELECT * FROM slot_loglari ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ basari: true, loglar });
});

// ─── PROMOSYON ───
app.post('/api/promosyon/kullan', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false, mesaj: 'Giris gerekli.' });
  const { kod } = req.body;
  if (!kod) return res.json({ basari: false, mesaj: 'Kod gerekli.' });
  const promo = db.prepare('SELECT * FROM promosyon_kodlari WHERE kod = ? AND aktif = 1').get(kod.trim().toUpperCase());
  if (!promo) return res.json({ basari: false, mesaj: 'Gecersiz veya suresi dolmus kod.' });
  if (promo.sinirli && promo.kullanim_sayisi >= promo.kullanim_hakki) return res.json({ basari: false, mesaj: 'Kullanim limiti doldu.' });
  const onceki = db.prepare('SELECT id FROM promosyon_kullanimlari WHERE kod_id = ? AND kullanici_id = ?').get(promo.id, req.session.kullanici.id);
  if (onceki) return res.json({ basari: false, mesaj: 'Bu kodu zaten kullandiniz.' });
  if (promo.jeton > 0) db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(promo.jeton, req.session.kullanici.id);
  if (promo.item_kod && promo.item_adet > 0) {
    const mevcut = db.prepare('SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = ?').get(req.session.kullanici.id, promo.item_kod);
    if (mevcut) db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = kalan_kullanim + ? WHERE id = ?').run(promo.item_adet, mevcut.id);
    else db.prepare('INSERT INTO kullanici_itemlari (kullanici_id, item_kod, kalan_kullanim) VALUES (?, ?, ?)').run(req.session.kullanici.id, promo.item_kod, promo.item_adet);
  }
  db.prepare('INSERT INTO promosyon_kullanimlari (kod_id, kullanici_id) VALUES (?, ?)').run(promo.id, req.session.kullanici.id);
  db.prepare('UPDATE promosyon_kodlari SET kullanim_sayisi = kullanim_sayisi + 1 WHERE id = ?').run(promo.id);
  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
  let mesaj = 'Promosyon kodu kullanildi!';
  if (promo.jeton > 0) mesaj += ` +${promo.jeton} jeton.`;
  if (promo.item_kod && promo.item_adet > 0) mesaj += ` ${promo.item_adet}x item eklendi.`;
  res.json({ basari: true, mesaj, yeniJeton });
});

// ─── ADMIN ───
app.post('/api/admin/giris', (req, res) => {
  if (req.body.sifre === ADMIN_SIFRE) { req.session.admin = true; res.json({ basari: true }); }
  else res.json({ basari: false, mesaj: 'Sifre hatali.' });
});
app.post('/api/admin/cikis', (req, res) => { req.session.admin = false; res.json({ basari: true }); });

app.post('/api/admin/grafik-ayar', adminGerektir, (req, res) => {
  const { guncelleme_suresi, min_deger, max_deger, artma_orani, max_degisim, siradaki_deger, siradaki_sure, tur_suresi } = req.body;
  db.prepare(`UPDATE grafik_ayarlari SET guncelleme_suresi=?,min_deger=?,max_deger=?,artma_orani=?,max_degisim=?,siradaki_deger=?,siradaki_sure=?,tur_suresi=? WHERE id=1`)
    .run(guncelleme_suresi||3000, min_deger||50, max_deger||500, artma_orani||0.55, max_degisim||40, siradaki_deger||null, siradaki_sure||null, tur_suresi||60);
  res.json({ basari: true, mesaj: 'Grafik ayarlari guncellendi.' });
});

app.get('/api/admin/grafik-ayar-yukle', adminGerektir, (req, res) => {
  const ayar = db.prepare('SELECT * FROM grafik_ayarlari WHERE id = 1').get();
  res.json({ basari: true, ayar: ayar || {} });
});

app.get('/api/admin/oyuncular', adminGerektir, (req, res) => {
  const oyuncular = db.prepare(`
    SELECT k.id, k.nick, k.jeton, k.toplam_yatirilan, k.yasak, k.chat_yasak, k.olusturma_tarihi,
      (SELECT ki.ip FROM kullanici_ipler ki WHERE ki.kullanici_id = k.id ORDER BY ki.id DESC LIMIT 1) as son_ip
    FROM kullanicilar k ORDER BY k.jeton DESC
  `).all();
  res.json({ basari: true, oyuncular });
});

app.post('/api/admin/oyuncu-yasak', adminGerektir, (req, res) => {
  const { kullanici_id, durum } = req.body;
  db.prepare('UPDATE kullanicilar SET yasak = ? WHERE id = ?').run(durum ? 1 : 0, kullanici_id);
  if (durum) io.sockets.sockets.forEach(s => { if (s.kullanici && s.kullanici.id === parseInt(kullanici_id)) { s.emit('yasaklandi'); s.disconnect(); } });
  res.json({ basari: true });
});

app.post('/api/admin/chat-yasak', adminGerektir, (req, res) => {
  db.prepare('UPDATE kullanicilar SET chat_yasak = ? WHERE id = ?').run(req.body.durum ? 1 : 0, req.body.kullanici_id);
  res.json({ basari: true });
});

app.get('/api/admin/chat-gecmis', adminGerektir, (req, res) => {
  const { gun, saat } = req.query;
  let sorgu = 'SELECT cm.id, cm.nick, cm.mesaj, cm.tarih FROM chat_mesajlari cm WHERE 1=1';
  const params = [];
  if (gun) { sorgu += ' AND DATE(cm.tarih) = ?'; params.push(gun); }
  if (saat !== undefined && saat !== '') { sorgu += ' AND strftime("%H", cm.tarih) = ?'; params.push(String(saat).padStart(2, '0')); }
  sorgu += ' ORDER BY cm.tarih DESC LIMIT 300';
  res.json({ basari: true, mesajlar: db.prepare(sorgu).all(...params) });
});

app.post('/api/admin/chat-sil', adminGerektir, (req, res) => {
  const { mesaj_id } = req.body;
  db.prepare('DELETE FROM chat_mesajlari WHERE id = ?').run(mesaj_id);
  io.emit('chat_mesaj_silindi', { id: mesaj_id });
  res.json({ basari: true });
});

app.post('/api/admin/chat-tumunu-sil', adminGerektir, (req, res) => {
  db.prepare('DELETE FROM chat_mesajlari').run();
  io.emit('chat_temizlendi');
  res.json({ basari: true });
});

app.get('/api/admin/chat-canli', adminGerektir, (req, res) => {
  const mesajlar = db.prepare('SELECT id, nick, mesaj, tarih FROM chat_mesajlari ORDER BY id DESC LIMIT 50').all();
  res.json({ basari: true, mesajlar: mesajlar.reverse() });
});

app.get('/api/admin/itemlar', adminGerektir, (req, res) => res.json({ basari: true, itemlar: db.prepare('SELECT * FROM market_itemlari').all() }));
app.post('/api/admin/item-guncelle', adminGerektir, (req, res) => {
  const { id, isim, aciklama, fiyat, para_birimi, kullanim_hakki, aktif } = req.body;
  db.prepare('UPDATE market_itemlari SET isim=?,aciklama=?,fiyat=?,para_birimi=?,kullanim_hakki=?,aktif=? WHERE id=?').run(isim, aciklama, fiyat, para_birimi, kullanim_hakki, aktif ? 1 : 0, id);
  res.json({ basari: true });
});

app.get('/api/admin/jeton-paketleri', adminGerektir, (req, res) => res.json({ basari: true, paketler: db.prepare('SELECT * FROM jeton_paketleri').all() }));
app.post('/api/admin/paket-guncelle', adminGerektir, (req, res) => {
  const { id, fiyat, para_birimi, aktif } = req.body;
  db.prepare('UPDATE jeton_paketleri SET fiyat=?,para_birimi=?,aktif=? WHERE id=?').run(fiyat, para_birimi, aktif ? 1 : 0, id);
  res.json({ basari: true });
});

app.post('/api/admin/para-kopar-ayar', adminGerektir, (req, res) => {
  db.prepare('UPDATE para_kopar_ayar SET min_miktar=?,max_miktar=? WHERE id=1').run(req.body.min_miktar, req.body.max_miktar);
  res.json({ basari: true });
});
app.get('/api/admin/para-kopar-ayar', adminGerektir, (req, res) => res.json({ basari: true, ayar: db.prepare('SELECT * FROM para_kopar_ayar WHERE id=1').get() }));

app.get('/api/admin/botlar', adminGerektir, (req, res) => res.json({ basari: true, botlar: db.prepare('SELECT * FROM botlar ORDER BY beceri DESC').all() }));
app.post('/api/admin/bot-guncelle', adminGerektir, (req, res) => {
  const { id, nick, beceri, aktif } = req.body;
  db.prepare('UPDATE botlar SET nick=?,beceri=?,aktif=? WHERE id=?').run(nick, beceri, aktif ? 1 : 0, id);
  res.json({ basari: true });
});
app.post('/api/admin/botlar-toplu-kaydet', adminGerektir, (req, res) => {
  const { botlar } = req.body;
  if (!Array.isArray(botlar)) return res.json({ basari: false });
  const stmt = db.prepare('UPDATE botlar SET nick=?,beceri=?,aktif=? WHERE id=?');
  const toplu = db.transaction((liste) => { liste.forEach(b => stmt.run(b.nick, b.beceri, b.aktif ? 1 : 0, b.id)); });
  toplu(botlar);
  res.json({ basari: true });
});

app.get('/api/admin/site-ayarlari', adminGerektir, (req, res) => res.json({ basari: true, ayar: db.prepare('SELECT * FROM site_ayarlari WHERE id = 1').get() }));
app.post('/api/admin/site-ayarlari', adminGerektir, (req, res) => {
  const { coin_ismi, coin_kisaltma, min_bahis, kullanim_kosullari } = req.body;
  db.prepare('UPDATE site_ayarlari SET coin_ismi=?,coin_kisaltma=?,min_bahis=?,kullanim_kosullari=? WHERE id=1')
    .run(coin_ismi||'DemliCoin', coin_kisaltma||'DC', parseInt(min_bahis)||150, kullanim_kosullari||null);
  res.json({ basari: true, mesaj: 'Kaydedildi.' });
});

app.get('/api/admin/bahis-loglari', adminGerektir, (req, res) => {
  const { nick, limit } = req.query;
  let sorgu = 'SELECT * FROM bahis_loglari WHERE 1=1';
  const params = [];
  if (nick) { sorgu += ' AND nick LIKE ?'; params.push(`%${nick}%`); }
  sorgu += ' ORDER BY id DESC LIMIT ?';
  params.push(parseInt(limit) || 100);
  res.json({ basari: true, loglar: db.prepare(sorgu).all(...params) });
});

app.get('/api/admin/kullanici-ipler', adminGerektir, (req, res) => {
  const { kullanici_id } = req.query;
  if (kullanici_id) {
    res.json({ basari: true, ipler: db.prepare('SELECT ip, tarih FROM kullanici_ipler WHERE kullanici_id = ? ORDER BY id DESC LIMIT 20').all(kullanici_id) });
  } else {
    res.json({ basari: true, ipler: db.prepare(`SELECT ki.ip, ki.tarih, k.nick, k.id as kullanici_id FROM kullanici_ipler ki LEFT JOIN kullanicilar k ON ki.kullanici_id = k.id ORDER BY ki.id DESC LIMIT 200`).all() });
  }
});

app.get('/api/admin/kullanici-sifre', adminGerektir, (req, res) => {
  const k = db.prepare('SELECT id, nick, sifre FROM kullanicilar WHERE id = ?').get(req.query.kullanici_id);
  if (!k) return res.json({ basari: false, mesaj: 'Bulunamadi.' });
  res.json({ basari: true, nick: k.nick, sifre_hash: k.sifre });
});

app.post('/api/admin/kullanici-sifre-degistir', adminGerektir, (req, res) => {
  const { kullanici_id, yeni_sifre } = req.body;
  if (!yeni_sifre || yeni_sifre.length < 4) return res.json({ basari: false, mesaj: 'En az 4 karakter.' });
  db.prepare('UPDATE kullanicilar SET sifre = ? WHERE id = ?').run(bcrypt.hashSync(yeni_sifre, 10), kullanici_id);
  res.json({ basari: true, mesaj: 'Sifre guncellendi.' });
});

app.get('/api/admin/promosyonlar', adminGerektir, (req, res) => res.json({ basari: true, promolar: db.prepare('SELECT * FROM promosyon_kodlari ORDER BY id DESC').all() }));
app.post('/api/admin/promosyon-olustur', adminGerektir, (req, res) => {
  const { kod, jeton, item_kod, item_adet, sinirli, kullanim_hakki } = req.body;
  if (!kod) return res.json({ basari: false, mesaj: 'Kod gerekli.' });
  try {
    db.prepare('INSERT INTO promosyon_kodlari (kod, jeton, item_kod, item_adet, sinirli, kullanim_hakki) VALUES (?, ?, ?, ?, ?, ?)').run(kod.trim().toUpperCase(), jeton||0, item_kod||null, item_adet||0, sinirli?1:0, kullanim_hakki||1);
    res.json({ basari: true, mesaj: 'Kod olusturuldu.' });
  } catch(e) { res.json({ basari: false, mesaj: 'Bu kod zaten var.' }); }
});
app.post('/api/admin/promosyon-sil', adminGerektir, (req, res) => { db.prepare('DELETE FROM promosyon_kodlari WHERE id = ?').run(req.body.id); res.json({ basari: true }); });
app.post('/api/admin/promosyon-toggle', adminGerektir, (req, res) => { db.prepare('UPDATE promosyon_kodlari SET aktif = ? WHERE id = ?').run(req.body.aktif ? 1 : 0, req.body.id); res.json({ basari: true }); });

// Duyuru admin
app.get('/api/admin/duyurular', adminGerektir, (req, res) => res.json({ basari: true, duyurular: db.prepare('SELECT * FROM duyurular ORDER BY id DESC').all() }));
app.post('/api/admin/duyuru-ekle', adminGerektir, (req, res) => {
  const { baslik, icerik, renk, sure_dk } = req.body;
  if (!baslik || !icerik) return res.json({ basari: false, mesaj: 'Baslik ve icerik gerekli.' });
  db.prepare('INSERT INTO duyurular (baslik, icerik, renk, sure_dk) VALUES (?, ?, ?, ?)').run(baslik, icerik, renk||'gold', parseInt(sure_dk)||0);
  const yeni = db.prepare('SELECT * FROM duyurular ORDER BY id DESC LIMIT 1').get();
  io.emit('yeni_duyuru', yeni);
  res.json({ basari: true });
});
app.post('/api/admin/duyuru-guncelle', adminGerektir, (req, res) => {
  const { id, baslik, icerik, renk, sure_dk, aktif } = req.body;
  db.prepare('UPDATE duyurular SET baslik=?,icerik=?,renk=?,sure_dk=?,aktif=? WHERE id=?').run(baslik, icerik, renk||'gold', parseInt(sure_dk)||0, aktif?1:0, id);
  res.json({ basari: true });
});
app.post('/api/admin/duyuru-sil', adminGerektir, (req, res) => {
  db.prepare('DELETE FROM duyurular WHERE id = ?').run(req.body.id);
  io.emit('duyuru_silindi', { id: req.body.id });
  res.json({ basari: true });
});

// ─── SOCKET.IO ───
io.on('connection', (socket) => {
  socket.on('auth', (data) => {
    if (!data || !data.kullanici_id) return;
    const k = db.prepare('SELECT id, nick, jeton, renk FROM kullanicilar WHERE id = ? AND yasak = 0').get(data.kullanici_id);
    if (!k) return;
    socket.kullanici = k;
    socket.join('oyun');
    socket.emit('grafik_guncelle', { deger: grafik.mevcutDegerAl(), zaman: Date.now(), gecmis: grafik.gecmisAl(), turBitis: grafik.turBitisAl() });
    // Aktif duyuruları gönder
    const duyurular = db.prepare('SELECT * FROM duyurular WHERE aktif = 1 ORDER BY id DESC').all();
    if (duyurular.length) socket.emit('mevcut_duyurular', duyurular);
    yayinlaOyuncular();
  });

  socket.on('chat_mesaj', (data) => {
    if (!socket.kullanici) return;
    const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(socket.kullanici.id);
    if (!k || k.yasak || k.chat_yasak) return;
    const mesaj = String(data.mesaj || '').trim().substring(0, 200);
    if (!mesaj) return;
    db.prepare('INSERT INTO chat_mesajlari (kullanici_id, nick, mesaj) VALUES (?, ?, ?)').run(k.id, k.nick, mesaj);
    const row = db.prepare('SELECT last_insert_rowid() as id').get();
    const sira = db.prepare('SELECT COUNT(*)+1 as sira FROM kullanicilar WHERE jeton > ? AND yasak = 0').get(k.jeton).sira;
    io.emit('chat_mesaj', { id: row.id, nick: k.nick, mesaj, tarih: new Date().toISOString(), jeton: k.jeton, renk: k.renk || nickRenkAl(k.nick), sira });
  });

  socket.on('disconnect', () => yayinlaOyuncular());
});

function yayinlaOyuncular() {
  const oyuncular = [];
  const goruldu = new Set();
  io.sockets.sockets.forEach(socket => {
    if (socket.kullanici && !goruldu.has(socket.kullanici.id)) {
      goruldu.add(socket.kullanici.id);
      const k = db.prepare('SELECT id, nick, jeton, renk, celik_kart FROM kullanicilar WHERE id = ?').get(socket.kullanici.id);
      if (k) oyuncular.push({ ...k, bot: false });
    }
  });
  // Botlar — rastgele ±küçük dalgalanma ile canlı görünsün
  const botlar = db.prepare('SELECT id, nick, jeton FROM botlar WHERE aktif = 1 ORDER BY RANDOM() LIMIT 12').all();
  botlar.forEach(b => {
    const dalgalanma = Math.floor((Math.random() - 0.5) * 60); // ±30 jeton
    const gosterimJeton = Math.max(100, b.jeton + dalgalanma);
    oyuncular.push({ id: `bot_${b.id}`, nick: b.nick, jeton: gosterimJeton, renk: nickRenkAl(b.nick), bot: true, celik_kart: 0 });
  });
  io.emit('oyuncu_listesi', oyuncular);
}

server.listen(PORT, () => {
  console.log(`DemliCoin: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/yonetbunlari`);
});
