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
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS islemler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    tip TEXT,
    miktar INTEGER,
    grafik_degeri REAL,
    sonuc INTEGER,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
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
    kalan_kullanim INTEGER
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
    guncelleme_suresi INTEGER DEFAULT 3000,
    min_deger REAL DEFAULT 50,
    max_deger REAL DEFAULT 500,
    artma_orani REAL DEFAULT 0.55,
    azalma_orani REAL DEFAULT 0.45,
    max_degisim REAL DEFAULT 40,
    siradaki_deger REAL DEFAULT NULL,
    siradaki_sure INTEGER DEFAULT NULL,
    tur_suresi INTEGER DEFAULT 60
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
  CREATE TABLE IF NOT EXISTS promosyon_kodlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT UNIQUE NOT NULL,
    jeton INTEGER DEFAULT 0,
    item_kod TEXT DEFAULT NULL,
    item_adet INTEGER DEFAULT 0,
    sinirli INTEGER DEFAULT 1,
    kullanim_hakki INTEGER DEFAULT 1,
    kullanim_sayisi INTEGER DEFAULT 0,
    aktif INTEGER DEFAULT 1,
    olusturma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS promosyon_kullanimlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod_id INTEGER,
    kullanici_id INTEGER,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS site_ayarlari (
    id INTEGER PRIMARY KEY DEFAULT 1,
    coin_ismi TEXT DEFAULT 'DemliCoin',
    coin_kisaltma TEXT DEFAULT 'DC',
    min_bahis INTEGER DEFAULT 150
  );
  CREATE TABLE IF NOT EXISTS bahis_loglari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    nick TEXT,
    miktar INTEGER,
    giris_degeri REAL,
    cikis_degeri REAL,
    sonuc INTEGER,
    ip TEXT,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS kullanici_ipler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    ip TEXT,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS duyurular (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baslik TEXT NOT NULL,
    icerik TEXT NOT NULL,
    renk TEXT DEFAULT 'gold',
    sure_dk INTEGER DEFAULT 0,
    aktif INTEGER DEFAULT 1,
    olusturma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS chat_silindi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── SLOT TABLOLARI ───
try { db.exec(`
  CREATE TABLE IF NOT EXISTS slot_ayarlari (
    id INTEGER PRIMARY KEY DEFAULT 1,
    normal_fiyat INTEGER DEFAULT 50,
    vip_fiyat INTEGER DEFAULT 200,
    plus_fiyat INTEGER DEFAULT 500,
    normal_aktif INTEGER DEFAULT 1,
    vip_aktif INTEGER DEFAULT 1,
    plus_aktif INTEGER DEFAULT 1,
    normal_carpan_min REAL DEFAULT 0,
    normal_carpan_max REAL DEFAULT 5,
    vip_carpan_min REAL DEFAULT 0,
    vip_carpan_max REAL DEFAULT 12,
    plus_carpan_min REAL DEFAULT 0,
    plus_carpan_max REAL DEFAULT 30,
    normal_kazanma_orani REAL DEFAULT 35,
    vip_kazanma_orani REAL DEFAULT 40,
    plus_kazanma_orani REAL DEFAULT 45
  );
  CREATE TABLE IF NOT EXISTS slot_loglari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    nick TEXT,
    slot_tip TEXT,
    bahis INTEGER,
    semboller TEXT,
    kazanc INTEGER,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`); } catch(e) {}

// ─── SLOT TABLOLARI ───
try { db.exec(`ALTER TABLE site_ayarlari ADD COLUMN min_bahis INTEGER DEFAULT 150`); } catch(e) {}
try { db.exec(`ALTER TABLE grafik_ayarlari ADD COLUMN tur_suresi INTEGER DEFAULT 60`); } catch(e) {}
try { db.exec(`ALTER TABLE kullanicilar ADD COLUMN celik_kart INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE kullanici_itemlari ADD COLUMN aktif INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE site_ayarlari ADD COLUMN kullanim_kosullari TEXT DEFAULT NULL`); } catch(e) {}

// Çark tablosu
try { db.exec(`
  CREATE TABLE IF NOT EXISTS cark_ayarlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tip TEXT NOT NULL,
    isim TEXT NOT NULL,
    fiyat INTEGER DEFAULT 100,
    aktif INTEGER DEFAULT 1,
    dilimler TEXT NOT NULL DEFAULT '[]'
  );
`); } catch(e) {}

// Çark varsayılan veriler
try {
  const carkSayisi = db.prepare('SELECT COUNT(*) as c FROM cark_ayarlari').get();
  if (carkSayisi.c === 0) {
    const normalDilimler = JSON.stringify([
      { isim: 'IFLAS',     jeton: 50,   sans: 30, iflas: true  },
      { isim: '50 JETON',  jeton: 50,   sans: 25, iflas: false },
      { isim: '100 JETON', jeton: 100,  sans: 20, iflas: false },
      { isim: '200 JETON', jeton: 200,  sans: 12, iflas: false },
      { isim: '500 JETON', jeton: 500,  sans: 8,  iflas: false },
      { isim: '1K JETON',  jeton: 1000, sans: 4,  iflas: false },
      { isim: '2K JETON',  jeton: 2000, sans: 1,  iflas: false }
    ]);
    const vipDilimler = JSON.stringify([
      { isim: 'IFLAS',     jeton: 200,  sans: 20, iflas: true  },
      { isim: '200 JETON', jeton: 200,  sans: 25, iflas: false },
      { isim: '500 JETON', jeton: 500,  sans: 20, iflas: false },
      { isim: '1K JETON',  jeton: 1000, sans: 15, iflas: false },
      { isim: '2K JETON',  jeton: 2000, sans: 10, iflas: false },
      { isim: '5K JETON',  jeton: 5000, sans: 8,  iflas: false },
      { isim: '10K JETON', jeton: 10000,sans: 2,  iflas: false }
    ]);
    const plusDilimler = JSON.stringify([
      { isim: 'IFLAS',     jeton: 500,   sans: 15, iflas: true  },
      { isim: '1K JETON',  jeton: 1000,  sans: 25, iflas: false },
      { isim: '2K JETON',  jeton: 2000,  sans: 20, iflas: false },
      { isim: '5K JETON',  jeton: 5000,  sans: 18, iflas: false },
      { isim: '10K JETON', jeton: 10000, sans: 12, iflas: false },
      { isim: '25K JETON', jeton: 25000, sans: 8,  iflas: false },
      { isim: '50K JETON', jeton: 50000, sans: 2,  iflas: false }
    ]);
    db.prepare("INSERT INTO cark_ayarlari (tip, isim, fiyat, aktif, dilimler) VALUES (?,?,?,?,?)").run('normal', 'Normal Cark', 100, 1, normalDilimler);
    db.prepare("INSERT INTO cark_ayarlari (tip, isim, fiyat, aktif, dilimler) VALUES (?,?,?,?,?)").run('vip', 'VIP Cark', 400, 1, vipDilimler);
    db.prepare("INSERT INTO cark_ayarlari (tip, isim, fiyat, aktif, dilimler) VALUES (?,?,?,?,?)").run('plus', 'Plus+ Cark', 1000, 1, plusDilimler);
  }
} catch(e) {}

// Site ayarları
const siteAyarSayisi = db.prepare('SELECT COUNT(*) as c FROM site_ayarlari').get();
if (siteAyarSayisi.c === 0) {
  db.prepare('INSERT INTO site_ayarlari (id, min_bahis) VALUES (1, 150)').run();
} else {
  const mevcut = db.prepare('SELECT min_bahis FROM site_ayarlari WHERE id = 1').get();
  if (mevcut && (mevcut.min_bahis === 10 || mevcut.min_bahis === null)) {
    db.prepare('UPDATE site_ayarlari SET min_bahis = 150 WHERE id = 1').run();
  }
}

// Grafik ayarları
const grafAyar = db.prepare('SELECT COUNT(*) as c FROM grafik_ayarlari').get();
if (grafAyar.c === 0) db.prepare('INSERT INTO grafik_ayarlari (id, tur_suresi) VALUES (1, 60)').run();

// Para kopar
const koparAyar = db.prepare('SELECT COUNT(*) as c FROM para_kopar_ayar').get();
if (koparAyar.c === 0) db.prepare('INSERT INTO para_kopar_ayar (id) VALUES (1)').run();

// Market itemları
const itemSayisi = db.prepare('SELECT COUNT(*) as c FROM market_itemlari').get();
if (itemSayisi.c === 0) {
  db.prepare(`INSERT INTO market_itemlari (kod, isim, aciklama, fiyat, para_birimi, kullanim_hakki) VALUES
    ('iki_kat_kar', '2X Kar', 'Kazandigin turlarda 2 kat kazanirsin. 3 kullanim hakki.', 200, 'jeton', 3),
    ('zarar_kalkan', 'Zarar Kalkani', 'Zarar ettiginde zararinin yarisi geri gelir. 3 kullanim hakki.', 150, 'jeton', 3),
    ('para_kopar', 'Para Kopar', 'Rastgele bir oyuncudan jeton al! 1 kullanim hakki.', 300, 'jeton', 1),
    ('celik_kart', 'Celik Kart', 'Kalici efekt! Her turda x4 kazanc, ozel renk ve rozet. Herkese duyurulur.', 5000, 'jeton', 9999)
  `).run();
} else {
  // Celik kart yoksa ekle
  const celik = db.prepare("SELECT id FROM market_itemlari WHERE kod = 'celik_kart'").get();
  if (!celik) {
    db.prepare(`INSERT INTO market_itemlari (kod, isim, aciklama, fiyat, para_birimi, kullanim_hakki) VALUES
      ('celik_kart', 'Celik Kart', 'Kalici efekt! Her turda x4 kazanc, ozel renk ve rozet. Herkese duyurulur.', 5000, 'jeton', 9999)
    `).run();
  }
}

// Jeton paketleri
const paketSayisi = db.prepare('SELECT COUNT(*) as c FROM jeton_paketleri').get();
if (paketSayisi.c === 0) {
  const paketler = [
    { isim: 'Starter', jeton: 1500, fiyat: 29.99, para_birimi: 'tl' },
    { isim: 'Bronz',   jeton: 5000, fiyat: 79.99, para_birimi: 'tl' },
    { isim: 'Gumus',   jeton: 7500, fiyat: 109.99, para_birimi: 'tl' },
    { isim: 'Altin',   jeton: 10000, fiyat: 139.99, para_birimi: 'tl' },
    { isim: 'Elmas',   jeton: 15000, fiyat: 199.99, para_birimi: 'tl' },
    { isim: 'Efsane',  jeton: 20000, fiyat: 249.99, para_birimi: 'tl' }
  ];
  const stmt = db.prepare('INSERT INTO jeton_paketleri (isim, jeton_miktari, fiyat, para_birimi) VALUES (?, ?, ?, ?)');
  paketler.forEach(p => stmt.run(p.isim, p.jeton, p.fiyat, p.para_birimi));
}

// Botlar
const botSayisi = db.prepare('SELECT COUNT(*) as c FROM botlar').get();
if (botSayisi.c === 0) {
  const botIsimler = [
    'CryptoKing','MoonRider','BitHunter','SatoshiX','TradeMaster',
    'CoinSniper','AlphaBot','LunaWolf','HashBull','TokenGhost',
    'SilverPeak','GoldRush88','ByteStorm','NightTrader','QuickFlip',
    'DiamondFist','IceBreaker','FireTrade','StealthX','OmegaTrade',
    'PhantomBull','SwiftCoin','IronHand','VaultKing','ShadowFund',
    'NeonTrader','CodeWolf','ZeroRisk','DarkHorse','StarGate99'
  ];
  const stmt = db.prepare('INSERT INTO botlar (nick, jeton, beceri) VALUES (?, ?, ?)');
  botIsimler.forEach(nick => {
    const beceri = 15 + Math.floor(Math.random() * 45);
    const jeton = 400 + Math.floor(Math.random() * 800);
    stmt.run(nick, jeton, beceri);
  });
}

module.exports = db;
