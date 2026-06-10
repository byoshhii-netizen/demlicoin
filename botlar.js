// Bot motoru — beceri bazlı + yapay zeka chat sistemi
const db = require('./database');

// ─── BOT CHAT MESAJ HAVUZU ───
const MESAJLAR = {
  // Grafik yükselirken
  yukari: [
    'la bu ne yükseliş ya 🚀',
    'gir gir gir bekleme',
    'yukarı gidiyor kesin',
    'al şimdi çık para var',
    'off ne vurgun yaptım la',
    'abi bu treni kaçırma',
    'girenler kar edecek bugün',
    'çıkış yok sadece yükseliş',
    'bu momentum devam eder',
    'al pozisyon aç dur durma',
    'yükseleceğini biliyordum zaten',
    'herkese kolay gelsin ben çıktım +800',
    'şu an girmek mantıklı bence',
  ],
  // Grafik düşerken
  asagi: [
    'satın çabuk düşüyor',
    'dipten alım fırsatı mı bu',
    'dur bekliyorum dip görünce girerim',
    'biraz daha düşsün sonra alırım',
    'bu dip olmaz daha düşer',
    'zararı kes dur bekle',
    'neden düştü ya anlamadım',
    'bir şeyler oluyor galiba',
    'paniklemiyorum ama dikkat edin',
    'hmm gözüm kadar beklicem',
    'dipten alan kazanır diyorlar',
  ],
  // Sakin/nötr grafik
  notr: [
    'grafik yatay gidiyor bekliyorum',
    'ne zaman hareket edecek bu',
    'sabır sabreden derviş',
    'biraz bekleyip bakacağım',
    'konsolidasyon mu bu',
    'hareketlenecek birazdan',
    'gözlüyorum henüz girmiyorum',
    'strateji: bekle fırsat çık',
    'zamanını bekle her şey geçer',
    'dur bir şeyler oluyor gibi',
  ],
  // Kazandıktan sonra
  kazan: [
    'off ne vurgun yaptım la 😂',
    'ben bir çay alıp geleyim la',
    'bu iş böyle yapılır',
    'herkese kolay gelsin 🤑',
    'tutturdum yine abi',
    'para para para 💰',
    'sistem bende galiba',
    'stratejim tuttu yine',
    'kahve ısmarlayım mı yoksa 😄',
    'tamam tamam çay molası',
    'bu gece yemek benden',
    'bildiğim gibi oldu',
    'ne diyeyim abi çalıştı 🎯',
  ],
  // Kaybettikten sonra
  kaybet: [
    'yanlış zamanda girdim',
    'bir dahaki sefere daha iyi',
    'neyse olur böyle şeyler',
    'sıkı tutunun',
    'geri alırım endişe etmeyin',
    'strateji değişikliği lazım galiba',
    'tamam tamam anladım bekleyeceğim',
    'zararı kes tekrar dene',
    'kimseye söylemeyin 😅',
    'hata yaptım kabul',
  ],
  // Genel sohbet
  genel: [
    'slm nasılsınız',
    'bugün iyi günler diliyorum herkese',
    'bilen söylesin grafik nereye gider',
    'analiz yapıyorum birazdan paylaşırım',
    'dikkatli olun ani hareketler var',
    'sabah sabah market hareketli',
    'bu aralar çok kazanıyorum be',
    'öğrendikçe daha iyi oluyorum',
    'herkes kazansın diyorum',
    'iyi oyunlar 🎮',
    'nerede bu yükseliş la',
    'az önce güzel bir hareket kaçırdım',
    'takip ediyorum şimdilik',
    'strateji: sabırlı ol, fırsat bekle',
    'bu oyunda bilgi güç',
  ],
};

// Bot kişilik tipleri
const KISILIKLER = [
  { isim: 'agresif',  kazanMesaj: 'kazan', kayipMesaj: 'kaybet', yukariMesaj: 'yukari', asagiMesaj: 'asagi', chatSiklik: 0.7 },
  { isim: 'temkinli', kazanMesaj: 'kazan', kayipMesaj: 'kaybet', yukariMesaj: 'notr',   asagiMesaj: 'notr',  chatSiklik: 0.3 },
  { isim: 'konuskan', kazanMesaj: 'kazan', kayipMesaj: 'kaybet', yukariMesaj: 'yukari', asagiMesaj: 'asagi', chatSiklik: 0.9 },
  { isim: 'sakin',    kazanMesaj: 'genel', kayipMesaj: 'genel',  yukariMesaj: 'genel',  asagiMesaj: 'genel', chatSiklik: 0.2 },
  { isim: 'analist',  kazanMesaj: 'kazan', kayipMesaj: 'kaybet', yukariMesaj: 'yukari', asagiMesaj: 'asagi', chatSiklik: 0.5 },
];

function rastgeleMesaj(kategori) {
  const liste = MESAJLAR[kategori] || MESAJLAR.genel;
  return liste[Math.floor(Math.random() * liste.length)];
}

function botRenk(nick) {
  const renkler = ['#e879f9','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#fb923c','#38bdf8','#4ade80','#c084fc'];
  let hash = 0;
  for (let i = 0; i < nick.length; i++) hash = nick.charCodeAt(i) + ((hash << 5) - hash);
  return renkler[Math.abs(hash) % renkler.length];
}

class BotMotoru {
  constructor(grafik, io) {
    this.grafik = grafik;
    this.io = io;
    this.aktifPozisyonlar = new Map(); // botId -> {miktar, girdigiDeger, yon}
    this.botKisilikler = new Map();    // botId -> kisalik
    this.chatTimerlar = new Map();     // botId -> timer
    this.timer = null;
    this.oncekiDeger = null;
  }

  baslat() {
    this.adimAt();
    // Botları yükle ve chat timer'larını başlat
    setTimeout(() => this.chatTimerlariBaSlaT(), 3000);
  }

  // ─── BOT KİŞİLİĞİ ───
  botKisiliginiAl(bot) {
    if (!this.botKisilikler.has(bot.id)) {
      // Beceriye göre kişilik ata
      let kisalik;
      if (bot.beceri >= 80) kisalik = KISILIKLER[4]; // analist
      else if (bot.beceri >= 60) kisalik = KISILIKLER[0]; // agresif
      else if (bot.beceri >= 40) kisalik = KISILIKLER[2]; // konuşkan
      else if (bot.beceri >= 20) kisalik = KISILIKLER[1]; // temkinli
      else kisalik = KISILIKLER[3]; // sakin
      this.botKisilikler.set(bot.id, kisalik);
    }
    return this.botKisilikler.get(bot.id);
  }

  // ─── CHAT GÖNDERİCİ ───
  botChatGonder(bot, mesajKategorisi) {
    if (!this.io) return;
    const mesaj = rastgeleMesaj(mesajKategorisi);
    const renk = botRenk(bot.nick);
    // Gerçek sırayı hesapla (botun jetonu kaç kişinin jetonundan fazla)
    let sira = 999;
    try {
      const gercekOyuncuSayisi = db.prepare('SELECT COUNT(*) as c FROM kullanicilar WHERE yasak = 0').get().c;
      const ustundekiler = db.prepare('SELECT COUNT(*) as c FROM kullanicilar WHERE jeton > ? AND yasak = 0').get(bot.jeton).c;
      const botUstundekiler = db.prepare('SELECT COUNT(*) as c FROM botlar WHERE jeton > ? AND aktif = 1').get(bot.jeton).c;
      sira = ustundekiler + botUstundekiler + 1;
    } catch(e) {}
    // DB'ye kaydet
    try {
      db.prepare('INSERT INTO chat_mesajlari (kullanici_id, nick, mesaj) VALUES (NULL, ?, ?)').run(bot.nick, mesaj);
      const row = db.prepare('SELECT last_insert_rowid() as id').get();
      this.io.emit('chat_mesaj', {
        id: row.id,
        nick: bot.nick,
        mesaj,
        tarih: new Date().toISOString(),
        jeton: bot.jeton,
        renk,
        sira,
        celik_kart: 0
      });
    } catch(e) {}
  }

  // ─── CHAT TIMER'LARI ───
  chatTimerlariBaSlaT() {
    try {
      const botlar = db.prepare('SELECT * FROM botlar WHERE aktif = 1').all();
      botlar.forEach(bot => this.botChatTimerBaSlaT(bot));
    } catch(e) {}
  }

  botChatTimerBaSlaT(bot) {
    if (this.chatTimerlar.has(bot.id)) {
      clearTimeout(this.chatTimerlar.get(bot.id));
    }
    const kisalik = this.botKisiliginiAl(bot);

    const zamanlandir = () => {
      // Rastgele aralık: kişiliğe göre 2-8 dakika arası
      const minSure = 120000; // 2 dakika minimum
      const maxSure = kisalik.chatSiklik > 0.7 ? 240000  // konuşkan: 2-4 dk
                    : kisalik.chatSiklik > 0.4 ? 360000  // normal: 2-6 dk
                    : 480000;                             // sakin: 2-8 dk
      const sure = minSure + Math.random() * (maxSure - minSure);

      const t = setTimeout(() => {
        try {
          const guncelBot = db.prepare('SELECT * FROM botlar WHERE id = ? AND aktif = 1').get(bot.id);
          if (!guncelBot) return; // bot silinmiş/pasifleşmiş

          // Grafik yönüne göre mesaj kategorisi seç
          const mevcutDeger = this.grafik.mevcutDegerAl();
          const onceki = this.oncekiDeger || mevcutDeger;
          let kategori;

          if (Math.random() < 0.15) {
            // %15 ihtimalle tamamen genel sohbet
            kategori = 'genel';
          } else if (mevcutDeger > onceki * 1.01) {
            kategori = kisalik.yukariMesaj;
          } else if (mevcutDeger < onceki * 0.99) {
            kategori = kisalik.asagiMesaj;
          } else {
            kategori = 'notr';
          }

          // Kişilik sıklığına göre gerçekten yazıp yazmayacağına karar ver
          if (Math.random() < kisalik.chatSiklik) {
            this.botChatGonder(guncelBot, kategori);
          }
        } catch(e) {}

        zamanlandir(); // tekrar planla
      }, sure);

      this.chatTimerlar.set(bot.id, t);
    };

    zamanlandir();
  }

  // ─── BAHİS ADIMI ───
  adimAt() {
    try {
      const botlar = db.prepare('SELECT * FROM botlar WHERE aktif = 1').all();
      const mevcutDeger = this.grafik.mevcutDegerAl();

      botlar.forEach(bot => {
        if (this.aktifPozisyonlar.has(bot.id)) {
          // Pozisyon kapat
          const poz = this.aktifPozisyonlar.get(bot.id);
          const oran = (mevcutDeger - poz.girdigiDeger) / poz.girdigiDeger;
          let sonuc = poz.yon === 'yukari'
            ? Math.round(poz.miktar * oran * 5)
            : Math.round(poz.miktar * -oran * 5);

          const beceriPenalti = 1 - (bot.beceri / 200);
          sonuc = Math.round(sonuc * beceriPenalti);

          const yeniJeton = Math.max(100, bot.jeton + sonuc);
          db.prepare('UPDATE botlar SET jeton = ? WHERE id = ?').run(yeniJeton, bot.id);
          this.aktifPozisyonlar.delete(bot.id);

          // Kazandıysa/kaybettiyse chat mesajı at (düşük ihtimalle)
          const kisalik = this.botKisiliginiAl(bot);
          if (Math.random() < kisalik.chatSiklik * 0.4) {
            setTimeout(() => {
              try {
                const gb = db.prepare('SELECT * FROM botlar WHERE id = ? AND aktif = 1').get(bot.id);
                if (gb) this.botChatGonder(gb, sonuc > 0 ? kisalik.kazanMesaj : kisalik.kayipMesaj);
              } catch(e) {}
            }, 1000 + Math.random() * 3000);
          }
        } else {
          // Yeni pozisyon
          const oynamaEsigi = 25 + bot.beceri * 0.25;
          if (Math.random() * 100 > oynamaEsigi) return;

          const maxMiktar = Math.min(bot.jeton * 0.15, 80 + bot.beceri * 3);
          const miktar = Math.max(150, Math.floor(Math.random() * maxMiktar));
          if (miktar > bot.jeton) return;

          const dogruTarafOlasiligi = 0.4 + (bot.beceri / 500);
          const yon = Math.random() < dogruTarafOlasiligi ? 'yukari' : 'asagi';

          this.aktifPozisyonlar.set(bot.id, { miktar, girdigiDeger: mevcutDeger, yon });
        }
      });

      this.oncekiDeger = mevcutDeger;
    } catch(e) {}

    const sure = 6000 + Math.random() * 10000;
    this.timer = setTimeout(() => this.adimAt(), sure);
  }

  botJetonAl(botId, miktar) {
    const bot = db.prepare('SELECT jeton FROM botlar WHERE id = ?').get(botId);
    if (bot && bot.jeton >= miktar) {
      db.prepare('UPDATE botlar SET jeton = jeton - ? WHERE id = ?').run(miktar, botId);
      return true;
    }
    return false;
  }

  durdur() {
    if (this.timer) clearTimeout(this.timer);
    this.chatTimerlar.forEach(t => clearTimeout(t));
    this.chatTimerlar.clear();
  }
}

module.exports = BotMotoru;
