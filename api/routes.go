package api

import (
	"demcoin/blockchain"
	"demcoin/console"
	"demcoin/p2p"
	"demcoin/wallet"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Server struct {
	chain       *blockchain.Chain
	hub         *p2p.Hub
	console     *console.Console
	router      *mux.Router
	store       storeIface
	priceEngine *blockchain.PriceEngine
}

type storeIface interface {
	DeleteChatMessage(id int64) error
	GetUserRestriction(addr string) (*blockchain.UserRestriction, error)
	SetUserRestriction(addr, username string, muted, tradeBan bool) error
	GetAllRestrictions() ([]*blockchain.UserRestriction, error)
	GetPriceHistory(limit int) ([]*blockchain.PricePoint, error)
	GetTopList(limit int) ([]map[string]interface{}, error)
	GetAllWalletsAdmin() ([]map[string]interface{}, error)
	GetRecentTrades(limit int) ([]map[string]interface{}, error)
}

func NewServer(chain *blockchain.Chain, hub *p2p.Hub, con *console.Console, store storeIface) *Server {
	s := &Server{chain: chain, hub: hub, console: con, router: mux.NewRouter(), store: store}
	s.setupRoutes()
	return s
}

func NewServerWithPrice(chain *blockchain.Chain, hub *p2p.Hub, con *console.Console, store storeIface, pe *blockchain.PriceEngine) *Server {
	s := &Server{chain: chain, hub: hub, console: con, router: mux.NewRouter(), store: store, priceEngine: pe}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.HandleFunc("/ws", s.handleWS)
	s.router.HandleFunc("/api/wallet/new", s.handleNewWallet).Methods("GET")
	s.router.HandleFunc("/api/wallet/import", s.handleImportWallet).Methods("POST")
	s.router.HandleFunc("/api/wallet/{address}/balance", s.handleBalance).Methods("GET")
	s.router.HandleFunc("/api/transfer", s.handleTransfer).Methods("POST")
	s.router.HandleFunc("/api/blocks", s.handleBlocks).Methods("GET")
	s.router.HandleFunc("/api/state", s.handleState).Methods("GET")
	s.router.HandleFunc("/api/chat/history", s.handleChatHistory).Methods("GET")
	s.router.HandleFunc("/api/chat/delete", s.handleDeleteChat).Methods("POST")
	s.router.HandleFunc("/api/price/history", s.handlePriceHistory).Methods("GET")
	s.router.HandleFunc("/api/price/settings", s.handleGetPriceSettings).Methods("GET")
	s.router.HandleFunc("/api/price/settings", s.handleSetPriceSettings).Methods("POST")
	s.router.HandleFunc("/api/price/set", s.handleSetPrice).Methods("POST")
	s.router.HandleFunc("/api/users/restrictions", s.handleGetRestrictions).Methods("GET")
	s.router.HandleFunc("/api/users/restrict", s.handleSetRestriction).Methods("POST")
	s.router.HandleFunc("/api/admin/kilitle", s.handleKilitle).Methods("POST")
	s.router.HandleFunc("/api/admin/ac", s.handleAc).Methods("POST")
	s.router.HandleFunc("/api/admin/yasakla", s.handleYasakla).Methods("POST")
	s.router.HandleFunc("/api/admin/arz-sabitle", s.handleArzSabitle).Methods("POST")
	s.router.HandleFunc("/api/admin/validator-ekle", s.handleValidatorEkle).Methods("POST")
	s.router.HandleFunc("/api/admin/token-bas", s.handleTokenBas).Methods("POST")
	s.router.HandleFunc("/api/admin/imza-olustur", s.handleImzaOlustur).Methods("POST")
	s.router.HandleFunc("/api/toplist", s.handleTopList).Methods("GET")
	s.router.HandleFunc("/api/admin/wallets", s.handleAdminWallets).Methods("GET")
	s.router.HandleFunc("/api/trades/recent", s.handleRecentTrades).Methods("GET")
	s.router.PathPrefix("/").Handler(http.FileServer(http.Dir("./public")))
}

func (s *Server) Handler() http.Handler {
	return s.router
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, "adres gerekli", 400)
		return
	}
	s.chain.GetOrCreateWallet(address)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade hata: %v", err)
		return
	}
	s.hub.RegisterClient(conn, address)
}

func (s *Server) handleImportWallet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PrivKey string `json:"priv_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "Geçersiz istek", 400)
		return
	}
	priv, err := wallet.HexToPrivKey(req.PrivKey)
	if err != nil {
		jsonErr(w, "Geçersiz private key", 400)
		return
	}
	address := wallet.PubKeyToAddress(&priv.PublicKey)
	pubKey := wallet.PubKeyToHex(&priv.PublicKey)
	s.chain.GetOrCreateWallet(address)
	jsonOK(w, map[string]string{
		"address": address,
		"pub_key": pubKey,
	})
}

func (s *Server) handleNewWallet(w http.ResponseWriter, r *http.Request) {
	kp, err := wallet.Generate()
	if err != nil {
		jsonErr(w, "Cüzdan oluşturulamadı", 500)
		return
	}
	jsonOK(w, map[string]string{
		"address":     kp.Address,
		"priv_key":    wallet.PrivKeyToHex(kp.PrivateKey),
		"pub_key":     wallet.PubKeyToHex(kp.PublicKey),
	})
}

func (s *Server) handleBalance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	addr := vars["address"]
	bal := s.chain.GetBalance(addr)
	blacklisted := s.chain.Blacklist[addr]
	jsonOK(w, map[string]interface{}{
		"address":     addr,
		"balance":     bal,
		"blacklisted": blacklisted,
	})
}

func (s *Server) handleTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From      string  `json:"from"`
		To        string  `json:"to"`
		Amount    float64 `json:"amount"`
		Signature string  `json:"signature"`
		PubKey    string  `json:"pub_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "Geçersiz istek formatı", 400)
		return
	}

	pub, err := wallet.HexToPubKey(req.PubKey)
	if err != nil {
		jsonErr(w, "Geçersiz public key", 400)
		return
	}
	sigData := req.From + req.To + strconv.FormatFloat(req.Amount, 'f', 8, 64)
	if !wallet.Verify(pub, sigData, req.Signature) {
		jsonErr(w, "GEÇERSİZ_İMZA: İşlem reddedildi", 401)
		return
	}

	if err := s.chain.Transfer(req.From, req.To, req.Amount); err != nil {
		jsonErr(w, err.Error(), 400)
		return
	}

	tx := &blockchain.Transaction{
		From:      req.From,
		To:        req.To,
		Amount:    req.Amount,
		GasFee:    blockchain.TransferGasFee,
		Type:      "TRANSFER",
		Timestamp: time.Now(),
	}
	tx.Hash = s.chain.CalcTxHash(tx)

	txs := []blockchain.Transaction{*tx}
	block := s.chain.AddBlock(s.console.GetFounderAddress(), txs)
	if block != nil {
		s.hub.BroadcastBlock(block)
		if s.priceEngine != nil && req.Amount > 0 {
			impact := req.Amount * 0.00005
			s.priceEngine.ApplyImpact(impact)
		}
	}

	jsonOK(w, map[string]interface{}{
		"basarili": true,
		"tx_hash":  tx.Hash,
		"mesaj":    "Transfer başarıyla gerçekleştirildi",
	})
}

func (s *Server) handleBlocks(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	blocks := s.chain.GetRecentBlocks(limit)
	jsonOK(w, blocks)
}

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]interface{}{
		"network":        s.chain.State,
		"online":         s.hub.GetOnlineCount(),
		"total_wallets":  s.chain.GetTotalWallets(),
		"total_supply":   s.chain.GetCurrentSupply(),
		"founder_address": s.console.GetFounderAddress(),
	})
}

func (s *Server) handleChatHistory(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, s.hub.Messages)
}

func (s *Server) handleDeleteChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza string `json:"imza"`
		ID   int64  `json:"id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !s.console.DogrulaKurucu(req.Imza, fmt.Sprintf("DeleteChat:%d", req.ID)) {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	if err := s.store.DeleteChatMessage(req.ID); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	s.hub.BroadcastDeleteMsg(req.ID)
	jsonOK(w, map[string]bool{"ok": true})
}

func (s *Server) handlePriceHistory(w http.ResponseWriter, r *http.Request) {
	if s.priceEngine != nil {
		jsonOK(w, s.priceEngine.GetHistory())
		return
	}
	pts, err := s.store.GetPriceHistory(120)
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, pts)
}

func (s *Server) handleGetPriceSettings(w http.ResponseWriter, r *http.Request) {
	if s.priceEngine == nil {
		jsonErr(w, "Fiyat motoru yok", 500)
		return
	}
	jsonOK(w, s.priceEngine.GetSettings())
}

func (s *Server) handleSetPriceSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza         string  `json:"imza"`
		ArtmaOrani   float64 `json:"artma_orani"`
		MaxDegisim   float64 `json:"max_degisim"`
		GuncelleSure int     `json:"guncelleme_suresi"`
		MinDeger     float64 `json:"min_deger"`
		MaxDeger     float64 `json:"max_deger"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !s.console.DogrulaKurucu(req.Imza, "PriceSettings") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	if s.priceEngine == nil {
		jsonErr(w, "Fiyat motoru yok", 500)
		return
	}
	s.priceEngine.UpdateSettings(blockchain.PriceSettings{
		ArtmaOrani:   req.ArtmaOrani,
		MaxDegisim:   req.MaxDegisim,
		GuncelleSure: req.GuncelleSure,
		MinDeger:     req.MinDeger,
		MaxDeger:     req.MaxDeger,
	})
	jsonOK(w, map[string]interface{}{"ok": true, "settings": s.priceEngine.GetSettings()})
}

func (s *Server) handleSetPrice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza  string  `json:"imza"`
		Fiyat float64 `json:"fiyat"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !s.console.DogrulaKurucu(req.Imza, "SetPrice") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	if s.priceEngine == nil {
		jsonErr(w, "Fiyat motoru yok", 500)
		return
	}
	if req.Fiyat <= 0 {
		jsonErr(w, "Geçersiz fiyat", 400)
		return
	}
	s.priceEngine.SetPrice(req.Fiyat)
	jsonOK(w, map[string]interface{}{"ok": true, "fiyat": req.Fiyat})
}

func (s *Server) handleGetRestrictions(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.GetAllRestrictions()
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, list)
}

func (s *Server) handleSetRestriction(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza     string `json:"imza"`
		Adres    string `json:"adres"`
		Username string `json:"username"`
		Muted    bool   `json:"muted"`
		TradeBan bool   `json:"trade_ban"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !s.console.DogrulaKurucu(req.Imza, "Restrict:"+req.Adres) {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	if err := s.store.SetUserRestriction(req.Adres, req.Username, req.Muted, req.TradeBan); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

func (s *Server) handleKilitle(w http.ResponseWriter, r *http.Request) {
	var req struct{ Imza string `json:"imza"` }
	json.NewDecoder(r.Body).Decode(&req)
	sonuc := s.console.AgiKilitle(req.Imza)
	if !sonuc.Basarili {
		jsonErr(w, sonuc.Mesaj, 403)
		return
	}
	jsonOK(w, sonuc)
}

func (s *Server) handleAc(w http.ResponseWriter, r *http.Request) {
	var req struct{ Imza string `json:"imza"` }
	json.NewDecoder(r.Body).Decode(&req)
	sonuc := s.console.AgiAc(req.Imza)
	if !sonuc.Basarili {
		jsonErr(w, sonuc.Mesaj, 403)
		return
	}
	jsonOK(w, sonuc)
}

func (s *Server) handleYasakla(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza  string `json:"imza"`
		Adres string `json:"adres"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	sonuc := s.console.CuzdanYasakla(req.Imza, req.Adres)
	if !sonuc.Basarili {
		jsonErr(w, sonuc.Mesaj, 403)
		return
	}
	jsonOK(w, sonuc)
}

func (s *Server) handleArzSabitle(w http.ResponseWriter, r *http.Request) {
	var req struct{ Imza string `json:"imza"` }
	json.NewDecoder(r.Body).Decode(&req)
	sonuc := s.console.ArzSabitle(req.Imza)
	if !sonuc.Basarili {
		jsonErr(w, sonuc.Mesaj, 403)
		return
	}
	jsonOK(w, sonuc)
}

func (s *Server) handleValidatorEkle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza      string `json:"imza"`
		Adres     string `json:"adres"`
		PubKeyHex string `json:"pub_key_hex"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	sonuc := s.console.ValidatorEkle(req.Imza, req.Adres, req.PubKeyHex)
	if !sonuc.Basarili {
		jsonErr(w, sonuc.Mesaj, 403)
		return
	}
	jsonOK(w, sonuc)
}

func (s *Server) handleTokenBas(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza   string  `json:"imza"`
		Adres  string  `json:"adres"`
		Miktar float64 `json:"miktar"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	sonuc := s.console.TokenBas(req.Imza, req.Adres, req.Miktar)
	if !sonuc.Basarili {
		jsonErr(w, sonuc.Mesaj, 403)
		return
	}
	jsonOK(w, sonuc)
}

func (s *Server) handleImzaOlustur(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PrivKey string `json:"priv_key"`
		Veri    string `json:"veri"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	priv, err := wallet.HexToPrivKey(req.PrivKey)
	if err != nil {
		jsonErr(w, "Geçersiz private key", 400)
		return
	}
	imza, err := wallet.Sign(priv, req.Veri)
	if err != nil {
		jsonErr(w, "İmza oluşturulamadı", 500)
		return
	}
	jsonOK(w, map[string]string{"imza": imza})
}

func (s *Server) handleTopList(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.GetTopList(50)
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, list)
}

func (s *Server) handleAdminWallets(w http.ResponseWriter, r *http.Request) {
	imza := r.URL.Query().Get("imza")
	if !s.console.DogrulaKurucu(imza, "AdminWallets") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	list, err := s.store.GetAllWalletsAdmin()
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, list)
}

func (s *Server) handleRecentTrades(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.GetRecentTrades(30)
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, list)
}

func jsonOK(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonErr(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"hata": msg})
}
