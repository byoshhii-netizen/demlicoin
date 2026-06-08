const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'demlicoin.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nick TEXT UNIQUE NOT NULL,
    sifre TEXT NOT NULL,
    jeton INTEGER DEFAULT 500,
    toplam_yatirilan REAL DEFAULT 0,
    yasak INTEGER DEFAULT 0,
    chat_yasak INTEGER DEFAULT 0,
    renk TEXT DEFAULT NULL,
    olusturma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_mesajlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    nick TEXT,
    mesaj TEXT,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(kullanici_id) REFERENCES kullanicilar(id)
  );

  CREATE TABLE IF NOT EXISTS islemler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    tip TEXT,
    miktar INTEGER,
    grafik_degeri REAL,
    sonuc INTEGER,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(kullanici_id) REFERENCES kullanicilar(id)
  );

  CREATE TABLE IF NOT EXISTS market_itemlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT UNIQUE NOT NULL,
    isim TEXT NOT NULL,
    aciklama TEXT,
    fiyat REAL DEFAULT 100,
    para_birimi TEXT DEFAULT 'jeton',
    kullanim_hakki INTEGER DEFAULT 3,
    aktif INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS kullanici_itemlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    item_kod TEXT,
    kalan_kullanim INTEGER,
    FOREIGN KEY(kullanici_id) REFERENCES kullanicilar(id)
  );

  CREATE TABLE IF NOT EXISTS jeton_paketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isim TEXT NOT NULL,
    jeton_miktari INTEGER NOT NULL,
    fiyat REAL NOT NULL,
    para_birimi TEXT DEFAULT 'tl',
    aktif INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS grafik_ayarlari (
    id INTEGER PRIMARY KEY DEFAULT 1,
    guncelleme_suresi INTEGER DEFAULT 5000,
    min_deger REAL DEFAULT 10,
    max_deger REAL DEFAULT 500,
    artma_orani REAL DEFAULT 0.55,
    azalma_orani REAL DEFAULT 0.45,
    max_degisim REAL DEFAULT 40,
    siradaki_deger REAL DEFAULT NULL,
    siradaki_sure INTEGER DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS para_kopar_ayar (
    id INTEGER PRIMARY KEY DEFAULT 1,
    min_miktar INTEGER DEFAULT 10,
    max_miktar INTEGER DEFAULT 100
  );

  CREATE TABLE IF NOT EXISTS botlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nick TEXT UNIQUE NOT NULL,
    jeton INTEGER DEFAULT 500,
    beceri INTEGER DEFAULT 50,
    aktif INTEGER DEFAULT 1
  );
`);

// Renk kolonu yoksa ekle (eski DB uyumu)
try { db.exec(`ALTER TABLE kullanicilar ADD COLUMN renk TEXT DEFAULT NULL`); } catch(e) {}

// Varsayilan market itemlari
const itemSayisi = db.prepare('SELECT COUNT(*) as c FROM market_itemlari').get();
if (itemSayisi.c === 0) {
  db.prepare(`INSERT INTO market_itemlari (kod, isim, aciklama, fiyat, para_birimi, kullanim_hakki) VALUES
    ('iki_kat_kar', '2X Kar', 'Kazandigin turlardan 2 kat para alirsin. 3 kullanim hakki.', 200, 'jeton', 3),
    ('zarar_kalkan', 'Zarar Kalkani', 'Zarar ettiginde zararinin yarisi geri gelir. 3 kullanim hakki.', 150, 'jeton', 3),
    ('para_kopar', 'Para Kopar', 'Rastgele bir oyuncudan jeton cal! 1 kullanim hakki.', 300, 'jeton', 1)
  `).run();
}

// Varsayilan jeton paketleri
const paketSayisi = db.prepare('SELECT COUNT(*) as c FROM jeton_paketleri').get();
if (paketSayisi.c === 0) {
  const paketler = [
    { isim: 'Starter', jeton: 1500, fiyat: 29.99, para_birimi: 'tl' },
    { isim: 'Bronz', jeton: 5000, fiyat: 79.99, para_birimi: 'tl' },
    { isim: 'Gumus', jeton: 7500, fiyat: 109.99, para_birimi: 'tl' },
    { isim: 'Altin', jeton: 10000, fiyat: 139.99, para_birimi: 'tl' },
    { isim: 'Elmas', jeton: 15000, fiyat: 199.99, para_birimi: 'tl' },
    { isim: 'Efsane', jeton: 20000, fiyat: 249.99, para_birimi: 'tl' }
  ];
  const stmt = db.prepare('INSERT INTO jeton_paketleri (isim, jeton_miktari, fiyat, para_birimi) VALUES (?, ?, ?, ?)');
  paketler.forEach(p => stmt.run(p.isim, p.jeton, p.fiyat, p.para_birimi));
}

const grafAyar = db.prepare('SELECT COUNT(*) as c FROM grafik_ayarlari').get();
if (grafAyar.c === 0) {
  db.prepare('INSERT INTO grafik_ayarlari (id) VALUES (1)').run();
}

const koparAyar = db.prepare('SELECT COUNT(*) as c FROM para_kopar_ayar').get();
if (koparAyar.c === 0) {
  db.prepare('INSERT INTO para_kopar_ayar (id) VALUES (1)').run();
}

// 30 bot olustur
const botSayisi = db.prepare('SELECT COUNT(*) as c FROM botlar').get();
if (botSayisi.c === 0) {
  const botIsimler = [
    'Ahmet_T', 'MehmetX', 'AliVeli', 'Kemal55', 'Serkan7',
    'Emre_K', 'Burak99', 'Onur_23', 'Murat_D', 'Hakan_R',
    'Selim_Y', 'Tolga_B', 'Oguz_44', 'Erkan_5', 'Baran_X',
    'Cem_Pro', 'Doruk_1', 'Kaan_77', 'Ege_Bot', 'Tuna_22',
    'Sinan_K', 'Yusuf_G', 'Umut_88', 'Furkan3', 'Inan_55',
    'Alper_J', 'Taylan2', 'Volkan9', 'Sertac6', 'Gokhan0'
  ];
  const stmt = db.prepare('INSERT INTO botlar (nick, jeton, beceri) VALUES (?, ?, ?)');
  botIsimler.forEach((nick, i) => {
    // Beceri 10-60 arasi (cok iyi degil ama leaderda gorunsunler)
    const beceri = 10 + Math.floor(Math.random() * 50);
    const jeton = 300 + Math.floor(Math.random() * 700);
    stmt.run(nick, jeton, beceri);
  });
}

module.exports = db;
