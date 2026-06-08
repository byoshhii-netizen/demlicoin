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

// Nick renk paleti (kalici, random)
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// URL rewrite: Turkce karakter iceren URL'leri decode et
app.use((req, res, next) => {
  if (req.url.toLowerCase().includes('%c4%b1')) {
    req.url = req.url.replace(/%[Cc]4%[Bb]1/g, 'i');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'demlicoin-super-gizli-anahtar-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Grafik + Bot motorlari
const grafik = new GrafikMotoru(io);
grafik.baslat();
const botMotoru = new BotMotoru(grafik);
botMotoru.baslat();

// Auth middleware
function girisGerektir(req, res, next) {
  if (!req.session.kullanici) return res.status(401).json({ basari: false, mesaj: 'Giris gerekli' });
  const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);
  if (!k || k.yasak) { req.session.destroy(); return res.status(401).json({ basari: false, mesaj: 'Yasak' }); }
  req.kullanici = k;
  next();
}

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
app.get('/yonetbunlari/giris', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-giris.html')));
app.get('/yonetbunlari', adminGerektir, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ─── AUTH API ───
app.post('/api/giris', (req, res) => {
  const { nick, sifre } = req.body;
  if (!nick || !sifre) return res.json({ basari: false, mesaj: 'Nick ve sifre gerekli.' });
  const k = db.prepare('SELECT * FROM kullanicilar WHERE nick = ?').get(nick);
  if (!k) return res.json({ basari: false, mesaj: 'Nick veya sifre hatali.' });
  if (k.yasak) return res.json({ basari: false, mesaj: 'Hesabiniz yasaklanmistir.' });
  if (!bcrypt.compareSync(sifre, k.sifre)) return res.json({ basari: false, mesaj: 'Nick veya sifre hatali.' });
  req.session.kullanici = { id: k.id, nick: k.nick };
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
  const k = db.prepare('SELECT id, nick, jeton, toplam_yatirilan, renk FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);
  if (!k) return res.status(401).json({ basari: false });
  if (!k.renk) {
    const renk = nickRenkAl(k.nick);
    db.prepare('UPDATE kullanicilar SET renk = ? WHERE id = ?').run(renk, k.id);
    k.renk = renk;
  }
  const itemler = db.prepare('SELECT * FROM kullanici_itemlari WHERE kullanici_id = ?').all(k.id);
  res.json({ basari: true, kullanici: k, itemler });
});

app.get('/api/grafik-durumu', (req, res) => {
  res.json({ mevcutDeger: grafik.mevcutDegerAl(), gecmis: grafik.gecmisAl() });
});

app.post('/api/bahis', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false, mesaj: 'Giris gerekli.' });
  const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);
  if (!k || k.yasak) return res.status(401).json({ basari: false, mesaj: 'Yetkisiz.' });

  const miktar = parseInt(req.body.jeton_miktari);
  if (!miktar || miktar < 1) return res.json({ basari: false, mesaj: 'Gecersiz miktar.' });
  if (miktar > k.jeton) return res.json({ basari: false, mesaj: 'Yetersiz jeton.' });

  const bahisGirdigiDeger = grafik.mevcutDegerAl();
  db.prepare('UPDATE kullanicilar SET jeton = jeton - ? WHERE id = ?').run(miktar, k.id);
  db.prepare(`INSERT INTO islemler (kullanici_id, tip, miktar, grafik_degeri, sonuc) VALUES (?, 'aktif_bahis_yukari', ?, ?, NULL)`).run(k.id, miktar, bahisGirdigiDeger);
  const bahisId = db.prepare('SELECT last_insert_rowid() as id').get().id;

  res.json({ basari: true, bahisId, girdigiDeger: bahisGirdigiDeger });
});

app.post('/api/sat', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false, mesaj: 'Giris gerekli.' });
  const { bahis_id } = req.body;
  const bahis = db.prepare('SELECT * FROM islemler WHERE id = ? AND kullanici_id = ? AND sonuc IS NULL').get(bahis_id, req.session.kullanici.id);
  if (!bahis) return res.json({ basari: false, mesaj: 'Bahis bulunamadi.' });

  const mevcutDeger = grafik.mevcutDegerAl();
  const oran = (mevcutDeger - bahis.grafik_degeri) / bahis.grafik_degeri;
  let kazan = Math.round(bahis.miktar * oran);

  // 2X Kar itemi
  if (kazan > 0) {
    const ikiKat = db.prepare(`SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = 'iki_kat_kar' AND kalan_kullanim > 0`).get(req.session.kullanici.id);
    if (ikiKat) {
      kazan = kazan * 2;
      const yeniKullanim = ikiKat.kalan_kullanim - 1;
      if (yeniKullanim <= 0) db.prepare('DELETE FROM kullanici_itemlari WHERE id = ?').run(ikiKat.id);
      else db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = ? WHERE id = ?').run(yeniKullanim, ikiKat.id);
    }
  }

  // Zarar Kalkani itemi
  if (kazan < 0) {
    const kalkan = db.prepare(`SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = 'zarar_kalkan' AND kalan_kullanim > 0`).get(req.session.kullanici.id);
    if (kalkan) {
      kazan = Math.round(kazan / 2);
      const yeniKullanim = kalkan.kalan_kullanim - 1;
      if (yeniKullanim <= 0) db.prepare('DELETE FROM kullanici_itemlari WHERE id = ?').run(kalkan.id);
      else db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = ? WHERE id = ?').run(yeniKullanim, kalkan.id);
    }
  }

  const jetonDegisim = bahis.miktar + kazan;
  db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(Math.max(0, jetonDegisim), req.session.kullanici.id);
  db.prepare('UPDATE islemler SET sonuc = ?, grafik_degeri = ? WHERE id = ?').run(kazan, mevcutDeger, bahis.id);

  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
  io.emit('jeton_guncelle', { kullanici_id: req.session.kullanici.id, jeton: yeniJeton });

  res.json({ basari: true, kazanc: kazan, yeniJeton, girdigiDeger: bahis.grafik_degeri, ciktifiDeger: mevcutDeger });
});

app.post('/api/para-kopar', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const koparItem = db.prepare(`SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = 'para_kopar' AND kalan_kullanim > 0`).get(req.session.kullanici.id);
  if (!koparItem) return res.json({ basari: false, mesaj: 'Para Kopar iteminiz yok.' });

  const ayar = db.prepare('SELECT * FROM para_kopar_ayar WHERE id = 1').get();
  const min = ayar.min_miktar || 10;
  const max = ayar.max_miktar || 100;

  const oyuncular = [];
  io.sockets.sockets.forEach(socket => {
    if (socket.kullanici && socket.kullanici.id !== req.session.kullanici.id) oyuncular.push(socket.kullanici);
  });
  if (oyuncular.length === 0) return res.json({ basari: false, mesaj: 'Calmak icin baska oyuncu yok.' });

  const hedef = oyuncular[Math.floor(Math.random() * oyuncular.length)];
  const hedefBilgi = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(hedef.id);
  if (!hedefBilgi || hedefBilgi.jeton < min) return res.json({ basari: false, mesaj: 'Hedef oyuncunun yeterli jetonu yok.' });

  const miktar = Math.min(hedefBilgi.jeton, Math.floor(Math.random() * (max - min + 1)) + min);
  db.prepare('UPDATE kullanicilar SET jeton = jeton - ? WHERE id = ?').run(miktar, hedef.id);
  db.prepare('UPDATE kullanicilar SET jeton = jeton + ? WHERE id = ?').run(miktar, req.session.kullanici.id);

  const yeniKullanim = koparItem.kalan_kullanim - 1;
  if (yeniKullanim <= 0) db.prepare('DELETE FROM kullanici_itemlari WHERE id = ?').run(koparItem.id);
  else db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = ? WHERE id = ?').run(yeniKullanim, koparItem.id);

  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
  const hedefYeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(hedef.id).jeton;
  io.emit('jeton_guncelle', { kullanici_id: req.session.kullanici.id, jeton: yeniJeton });
  io.emit('jeton_guncelle', { kullanici_id: hedef.id, jeton: hedefYeniJeton });

  res.json({ basari: true, calinanMiktar: miktar, hedefNick: hedefBilgi.nick, yeniJeton });
});

// ─── MARKET API ───
app.get('/api/market/itemlar', (req, res) => {
  res.json({ basari: true, itemlar: db.prepare('SELECT * FROM market_itemlari WHERE aktif = 1').all() });
});

app.get('/api/market/jeton-paketleri', (req, res) => {
  res.json({ basari: true, paketler: db.prepare('SELECT * FROM jeton_paketleri WHERE aktif = 1').all() });
});

app.post('/api/market/satin-al', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const item = db.prepare('SELECT * FROM market_itemlari WHERE id = ? AND aktif = 1').get(req.body.item_id);
  if (!item) return res.json({ basari: false, mesaj: 'Item bulunamadi.' });
  const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id);

  if (item.para_birimi === 'jeton') {
    if (k.jeton < item.fiyat) return res.json({ basari: false, mesaj: 'Yetersiz jeton.' });
    db.prepare('UPDATE kullanicilar SET jeton = jeton - ? WHERE id = ?').run(item.fiyat, k.id);
  } else {
    return res.json({ basari: false, mesaj: 'Bu item icin gercek odeme gerekli. Demo modda.' });
  }

  const mevcut = db.prepare('SELECT * FROM kullanici_itemlari WHERE kullanici_id = ? AND item_kod = ?').get(k.id, item.kod);
  if (mevcut) db.prepare('UPDATE kullanici_itemlari SET kalan_kullanim = kalan_kullanim + ? WHERE id = ?').run(item.kullanim_hakki, mevcut.id);
  else db.prepare('INSERT INTO kullanici_itemlari (kullanici_id, item_kod, kalan_kullanim) VALUES (?, ?, ?)').run(k.id, item.kod, item.kullanim_hakki);

  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(k.id).jeton;
  res.json({ basari: true, mesaj: `${item.isim} satin alindi!`, yeniJeton });
});

app.post('/api/market/jeton-satin-al', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const paket = db.prepare('SELECT * FROM jeton_paketleri WHERE id = ? AND aktif = 1').get(req.body.paket_id);
  if (!paket) return res.json({ basari: false, mesaj: 'Paket bulunamadi.' });
  db.prepare('UPDATE kullanicilar SET jeton = jeton + ?, toplam_yatirilan = toplam_yatirilan + ? WHERE id = ?')
    .run(paket.jeton_miktari, paket.fiyat, req.session.kullanici.id);
  const yeniJeton = db.prepare('SELECT jeton FROM kullanicilar WHERE id = ?').get(req.session.kullanici.id).jeton;
  res.json({ basari: true, mesaj: `${paket.jeton_miktari} jeton hesabiniza eklendi!`, yeniJeton });
});

// ─── LIDERLIK API ───
app.get('/api/liderlik', (req, res) => {
  const gercekler = db.prepare('SELECT nick, jeton, toplam_yatirilan, renk FROM kullanicilar WHERE yasak = 0 ORDER BY jeton DESC LIMIT 50').all();
  const botlar = db.prepare('SELECT nick, jeton, 0 as toplam_yatirilan, NULL as renk FROM botlar WHERE aktif = 1').all();
  const hepsi = [...gercekler.map(k => ({ ...k, bot: false })), ...botlar.map(b => ({ ...b, bot: true }))]
    .sort((a, b) => b.jeton - a.jeton)
    .slice(0, 50);
  res.json({ basari: true, liste: hepsi });
});

// ─── CHAT API ───
app.get('/api/chat/gecmis', (req, res) => {
  if (!req.session.kullanici) return res.status(401).json({ basari: false });
  const mesajlar = db.prepare(`
    SELECT cm.nick, cm.mesaj, cm.tarih, k.jeton, k.renk,
      (SELECT COUNT(*)+1 FROM kullanicilar k2 WHERE k2.jeton > k.jeton AND k2.yasak = 0) as sira
    FROM chat_mesajlari cm
    LEFT JOIN kullanicilar k ON cm.kullanici_id = k.id
    ORDER BY cm.id DESC LIMIT 60
  `).all();
  res.json({ basari: true, mesajlar: mesajlar.reverse() });
});

// ─── ADMIN API ───
app.post('/api/admin/giris', (req, res) => {
  if (req.body.sifre === ADMIN_SIFRE) { req.session.admin = true; res.json({ basari: true }); }
  else res.json({ basari: false, mesaj: 'Sifre hatali.' });
});

app.post('/api/admin/cikis', (req, res) => { req.session.admin = false; res.json({ basari: true }); });

app.post('/api/admin/grafik-ayar', adminGerektir, (req, res) => {
  const { guncelleme_suresi, min_deger, max_deger, artma_orani, max_degisim, siradaki_deger, siradaki_sure } = req.body;
  db.prepare(`UPDATE grafik_ayarlari SET guncelleme_suresi=?,min_deger=?,max_deger=?,artma_orani=?,max_degisim=?,siradaki_deger=?,siradaki_sure=? WHERE id=1`)
    .run(guncelleme_suresi||5000, min_deger||10, max_deger||500, artma_orani||0.55, max_degisim||40, siradaki_deger||null, siradaki_sure||null);
  res.json({ basari: true, mesaj: 'Grafik ayarlari guncellendi.' });
});

app.get('/api/admin/oyuncular', adminGerektir, (req, res) => {
  const oyuncular = db.prepare('SELECT id, nick, jeton, toplam_yatirilan, yasak, chat_yasak, olusturma_tarihi FROM kullanicilar ORDER BY jeton DESC').all();
  res.json({ basari: true, oyuncular });
});

app.post('/api/admin/oyuncu-yasak', adminGerektir, (req, res) => {
  const { kullanici_id, durum } = req.body;
  db.prepare('UPDATE kullanicilar SET yasak = ? WHERE id = ?').run(durum ? 1 : 0, kullanici_id);
  if (durum) {
    io.sockets.sockets.forEach(socket => {
      if (socket.kullanici && socket.kullanici.id === parseInt(kullanici_id)) { socket.emit('yasaklandi'); socket.disconnect(); }
    });
  }
  res.json({ basari: true });
});

app.post('/api/admin/chat-yasak', adminGerektir, (req, res) => {
  db.prepare('UPDATE kullanicilar SET chat_yasak = ? WHERE id = ?').run(req.body.durum ? 1 : 0, req.body.kullanici_id);
  res.json({ basari: true });
});

app.get('/api/admin/chat-gecmis', adminGerektir, (req, res) => {
  const { gun, saat } = req.query;
  let sorgu = 'SELECT cm.*, k.nick FROM chat_mesajlari cm LEFT JOIN kullanicilar k ON cm.kullanici_id = k.id WHERE 1=1';
  const params = [];
  if (gun) { sorgu += ' AND DATE(cm.tarih) = ?'; params.push(gun); }
  if (saat !== undefined && saat !== '') { sorgu += ' AND strftime("%H", cm.tarih) = ?'; params.push(String(saat).padStart(2, '0')); }
  sorgu += ' ORDER BY cm.tarih DESC LIMIT 200';
  res.json({ basari: true, mesajlar: db.prepare(sorgu).all(...params) });
});

app.get('/api/admin/itemlar', adminGerektir, (req, res) => res.json({ basari: true, itemlar: db.prepare('SELECT * FROM market_itemlari').all() }));

app.post('/api/admin/item-guncelle', adminGerektir, (req, res) => {
  const { id, isim, aciklama, fiyat, para_birimi, kullanim_hakki, aktif } = req.body;
  db.prepare('UPDATE market_itemlari SET isim=?,aciklama=?,fiyat=?,para_birimi=?,kullanim_hakki=?,aktif=? WHERE id=?')
    .run(isim, aciklama, fiyat, para_birimi, kullanim_hakki, aktif ? 1 : 0, id);
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

// Bot admin API
app.get('/api/admin/botlar', adminGerektir, (req, res) => res.json({ basari: true, botlar: db.prepare('SELECT * FROM botlar ORDER BY beceri DESC').all() }));

app.post('/api/admin/bot-guncelle', adminGerektir, (req, res) => {
  const { id, nick, beceri, aktif } = req.body;
  db.prepare('UPDATE botlar SET nick=?,beceri=?,aktif=? WHERE id=?').run(nick, beceri, aktif ? 1 : 0, id);
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
    socket.emit('grafik_guncelle', { deger: grafik.mevcutDegerAl(), zaman: Date.now(), gecmis: grafik.gecmisAl() });
    yayinlaOyuncular();
  });

  socket.on('chat_mesaj', (data) => {
    if (!socket.kullanici) return;
    const k = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(socket.kullanici.id);
    if (!k || k.yasak || k.chat_yasak) return;
    const mesaj = String(data.mesaj || '').trim().substring(0, 200);
    if (!mesaj) return;

    db.prepare('INSERT INTO chat_mesajlari (kullanici_id, nick, mesaj) VALUES (?, ?, ?)').run(k.id, k.nick, mesaj);

    // Sira hesapla
    const sira = db.prepare('SELECT COUNT(*)+1 as sira FROM kullanicilar WHERE jeton > ? AND yasak = 0').get(k.jeton).sira;

    io.emit('chat_mesaj', {
      nick: k.nick,
      mesaj,
      tarih: new Date().toISOString(),
      jeton: k.jeton,
      renk: k.renk || nickRenkAl(k.nick),
      sira
    });
  });

  socket.on('disconnect', () => { yayinlaOyuncular(); });
});

function yayinlaOyuncular() {
  const oyuncular = [];
  const goruldu = new Set();
  io.sockets.sockets.forEach(socket => {
    if (socket.kullanici && !goruldu.has(socket.kullanici.id)) {
      goruldu.add(socket.kullanici.id);
      const k = db.prepare('SELECT id, nick, jeton, renk FROM kullanicilar WHERE id = ?').get(socket.kullanici.id);
      if (k) oyuncular.push(k);
    }
  });
  io.emit('oyuncu_listesi', oyuncular);
}

server.listen(PORT, () => {
  console.log(`DemliCoin calisiyor: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/yonetbunlari`);
});
