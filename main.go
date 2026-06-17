package main

import (
	"demcoin/api"
	"demcoin/blockchain"
	"demcoin/console"
	"demcoin/db"
	"demcoin/p2p"
	"demcoin/wallet"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════╗")
	fmt.Println("║     DEM COIN - Layer 1 Blockchain        ║")
	fmt.Println("║     Güvenli • Kalıcı • Merkeziyetsiz     ║")
	fmt.Println("╚══════════════════════════════════════════╝")

	if err := db.Connect(); err != nil {
		log.Fatalf("❌ PostgreSQL bağlantısı kurulamadı: %v\nDATABASE_URL veya DB_* ortam değişkenlerini kontrol edin.", err)
	}

	if err := db.Migrate(); err != nil {
		log.Fatalf("❌ Veritabanı migrasyonu başarısız: %v", err)
	}

	store := db.NewStoreAdapter()
	chain := blockchain.NewChain(store)
	hub := p2p.NewHub(chain, store)
	go hub.Run()

	founderPrivHex := os.Getenv("DEMCOIN_FOUNDER_KEY")
	if founderPrivHex == "" {
		founderPrivHex = loadOrCreateFounder()
	}

	con, err := console.New(chain, hub, founderPrivHex)
	if err != nil {
		log.Fatalf("Konsol başlatılamadı: %v", err)
	}

	chain.RegisterValidator(&blockchain.Validator{
		Address:  con.GetFounderAddress(),
		Approved: true,
	})

	if chain.GetBalance(con.GetFounderAddress()) == 0 {
		if err := chain.MintToFounder(con.GetFounderAddress(), blockchain.GenesisReward); err != nil {
			log.Printf("Genesis mint uyarı: %v", err)
		}
	}

	priceEngine := blockchain.NewPriceEngine(1.0, func(price float64, history []blockchain.PricePoint) {
		hub.BroadcastPrice(price, history)
		go store.SavePricePoint(price)
	})
	priceEngine.Start()

	botEngine := blockchain.NewBotEngine(chain, hub, priceEngine)
	botEngine.Start()

	fmt.Printf("Kurucu Adresi : %s\n", con.GetFounderAddress())
	fmt.Printf("Bakiye        : %.0f DEM\n", chain.GetBalance(con.GetFounderAddress()))
	fmt.Printf("Max Arz       : %.0f DEM\n", blockchain.MaxSupply)
	fmt.Printf("Veritabani    : PostgreSQL\n")

	srv := api.NewServerWithPrice(chain, hub, con, store, priceEngine)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("🌐 Sunucu: http://localhost:%s\n\n", port)
	log.Fatal(http.ListenAndServe(":"+port, srv.Handler()))
}

func loadOrCreateFounder() string {
	keyFile := "founder_wallet.json"

	if data, err := os.ReadFile(keyFile); err == nil {
		var saved struct {
			Address    string `json:"address"`
			PrivKeyHex string `json:"priv_key_hex"`
		}
		if json.Unmarshal(data, &saved) == nil && saved.PrivKeyHex != "" {
			fmt.Printf("✅ Kurucu cüzdanı yüklendi: %s\n", saved.Address)
			return saved.PrivKeyHex
		}
	}

	kp, err := wallet.Generate()
	if err != nil {
		log.Fatalf("Kurucu cüzdanı oluşturulamadı: %v", err)
	}

	saved := struct {
		Address    string `json:"address"`
		PrivKeyHex string `json:"priv_key_hex"`
		PubKeyHex  string `json:"pub_key_hex"`
	}{
		Address:    kp.Address,
		PrivKeyHex: wallet.PrivKeyToHex(kp.PrivateKey),
		PubKeyHex:  wallet.PubKeyToHex(kp.PublicKey),
	}

	data, _ := json.MarshalIndent(saved, "", "  ")
	os.WriteFile(keyFile, data, 0600)

	fmt.Printf("🆕 Yeni kurucu cüzdanı: %s\n", kp.Address)
	fmt.Printf("🔐 Kaydedildi: %s — GİZLİ TUTUN!\n", keyFile)

	return wallet.PrivKeyToHex(kp.PrivateKey)
}
