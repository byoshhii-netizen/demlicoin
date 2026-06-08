// Bot motoru - botlar grafige gore jeton kazanip kaybeder
const db = require('./database');

class BotMotoru {
  constructor(grafik) {
    this.grafik = grafik;
    this.aktifPozisyonlar = new Map(); // botId -> {miktar, girdigiDeger}
    this.timer = null;
  }

  baslat() {
    // Her 8-15 saniyede bir botlari guncelle
    this.adimAt();
  }

  adimAt() {
    try {
      const botlar = db.prepare('SELECT * FROM botlar WHERE aktif = 1').all();
      const mevcutDeger = this.grafik.mevcutDegerAl();

      botlar.forEach(bot => {
        // Aktif pozisyon varsa kapat
        if (this.aktifPozisyonlar.has(bot.id)) {
          const poz = this.aktifPozisyonlar.get(bot.id);
          const oran = (mevcutDeger - poz.girdigiDeger) / poz.girdigiDeger;
          const yon = poz.yon;
          let sonuc;
          if (yon === 'yukari') {
            sonuc = Math.round(poz.miktar * oran);
          } else {
            sonuc = Math.round(poz.miktar * -oran);
          }
          const yeniJeton = Math.max(50, bot.jeton + sonuc);
          db.prepare('UPDATE botlar SET jeton = ? WHERE id = ?').run(yeniJeton, bot.id);
          this.aktifPozisyonlar.delete(bot.id);
        } else {
          // Beceriye gore yeni pozisyon ac
          const rast = Math.random() * 100;
          // Dusuk becerili botlar daha az oynar
          const oynamaEsigi = 20 + bot.beceri * 0.3; // beceri 10 = %23, beceri 60 = %38
          if (rast > oynamaEsigi) return;

          // Beceriye gore miktar
          const maxMiktar = Math.min(bot.jeton * 0.2, 50 + bot.beceri * 2);
          const miktar = Math.max(10, Math.floor(Math.random() * maxMiktar));
          if (miktar > bot.jeton) return;

          // Beceri: yuksek becerili botlar daha iyi taraf secer
          // Ama yine de kotudurler genel olarak
          const yon = Math.random() < 0.48 ? 'yukari' : 'asagi'; // hafif kotu

          this.aktifPozisyonlar.set(bot.id, {
            miktar,
            girdigiDeger: mevcutDeger,
            yon
          });
        }
      });
    } catch(e) {}

    // Bir sonraki tur
    const sure = 8000 + Math.random() * 12000;
    this.timer = setTimeout(() => this.adimAt(), sure);
  }

  durdur() {
    if (this.timer) clearTimeout(this.timer);
  }
}

module.exports = BotMotoru;
