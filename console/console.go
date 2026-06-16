package console

import (
	"crypto/ecdsa"
	"demcoin/blockchain"
	"demcoin/p2p"
	"demcoin/wallet"
	"errors"
)

type Console struct {
	chain       *blockchain.Chain
	hub         *p2p.Hub
	founderKey  *ecdsa.PrivateKey
	founderAddr string
}

type KomutSonucu struct {
	Basarili bool   `json:"basarili"`
	Mesaj    string `json:"mesaj"`
}

func New(chain *blockchain.Chain, hub *p2p.Hub, founderPrivHex string) (*Console, error) {
	priv, err := wallet.HexToPrivKey(founderPrivHex)
	if err != nil {
		return nil, errors.New("kurucu private key yüklenemedi")
	}
	addr := wallet.PubKeyToAddress(&priv.PublicKey)
	return &Console{
		chain:       chain,
		hub:         hub,
		founderKey:  priv,
		founderAddr: addr,
	}, nil
}

func (con *Console) DogrulaKurucu(imza, veri string) bool {
	return wallet.Verify(&con.founderKey.PublicKey, veri, imza)
}

func (con *Console) AgiKilitle(imza string) KomutSonucu {
	if !con.DogrulaKurucu(imza, "AgiKilitle") {
		return KomutSonucu{false, "YETKİSİZ: Sadece kurucu bu komutu çalıştırabilir"}
	}
	con.chain.LockNetwork()
	con.hub.BroadcastNetworkAlert("AG_KILITLANDI")
	return KomutSonucu{true, "✅ Ağ başarıyla kilitlendi. Tüm transferler ve chat donduruldu."}
}

func (con *Console) AgiAc(imza string) KomutSonucu {
	if !con.DogrulaKurucu(imza, "AgiAc") {
		return KomutSonucu{false, "YETKİSİZ: Sadece kurucu bu komutu çalıştırabilir"}
	}
	con.chain.UnlockNetwork()
	con.hub.BroadcastNetworkAlert("AG_ACILDI")
	return KomutSonucu{true, "✅ Ağ kilidi açıldı. İşlemler tekrar aktif."}
}

func (con *Console) CuzdanYasakla(imza, adres string) KomutSonucu {
	if !con.DogrulaKurucu(imza, "CuzdanYasakla:"+adres) {
		return KomutSonucu{false, "YETKİSİZ: Sadece kurucu bu komutu çalıştırabilir"}
	}
	if adres == con.founderAddr {
		return KomutSonucu{false, "HATA: Kurucu cüzdanı yasaklanamaz"}
	}
	con.chain.BlacklistWallet(adres)
	con.hub.BroadcastNetworkAlert("CUZDAN_YASAKLANDI:" + adres[:8] + "...")
	return KomutSonucu{true, "✅ Cüzdan yasaklandı ve bakiyesi donduruldu: " + adres}
}

func (con *Console) ArzSabitle(imza string) KomutSonucu {
	if !con.DogrulaKurucu(imza, "ArzSabitle") {
		return KomutSonucu{false, "YETKİSİZ: Sadece kurucu bu komutu çalıştırabilir"}
	}
	con.chain.FixSupply()
	con.hub.BroadcastNetworkAlert("ARZ_SABITLENDI")
	return KomutSonucu{true, "✅ Maksimum arz 50.000.000 DEM olarak kilitlendi. Artık yeni token basılamaz."}
}

func (con *Console) ValidatorEkle(imza, adres, pubKeyHex string) KomutSonucu {
	if !con.DogrulaKurucu(imza, "ValidatorEkle:"+adres) {
		return KomutSonucu{false, "YETKİSİZ: Sadece kurucu validator ekleyebilir"}
	}
	pub, err := wallet.HexToPubKey(pubKeyHex)
	if err != nil {
		return KomutSonucu{false, "HATA: Geçersiz public key formatı"}
	}
	v := &blockchain.Validator{
		Address:   adres,
		PublicKey: pub,
		PubKeyHex: pubKeyHex,
		Approved:  true,
	}
	con.chain.RegisterValidator(v)
	return KomutSonucu{true, "✅ Validator onaylandı: " + adres}
}

func (con *Console) ValidatorKaldir(imza, adres string) KomutSonucu {
	if !con.DogrulaKurucu(imza, "ValidatorKaldir:"+adres) {
		return KomutSonucu{false, "YETKİSİZ: Sadece kurucu validator kaldırabilir"}
	}
	con.chain.RegisterValidator(&blockchain.Validator{
		Address:  adres,
		Approved: false,
	})
	return KomutSonucu{true, "✅ Validator yetkisi kaldırıldı: " + adres}
}

func (con *Console) TokenBas(imza, adres string, miktar float64) KomutSonucu {
	if !con.DogrulaKurucu(imza, "TokenBas:"+adres) {
		return KomutSonucu{false, "YETKİSİZ: Sadece kurucu token basabilir"}
	}
	if err := con.chain.MintToFounder(adres, miktar); err != nil {
		return KomutSonucu{false, err.Error()}
	}
	return KomutSonucu{true, "✅ Token basıldı ve gönderildi"}
}

func (con *Console) GetFounderAddress() string {
	return con.founderAddr
}

func (con *Console) ImzaOlustur(veri string) (string, error) {
	return wallet.Sign(con.founderKey, veri)
}
