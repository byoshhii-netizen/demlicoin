package api

import (
	"demcoin/blockchain"
	"demcoin/console"
	"demcoin/db"
	"demcoin/p2p"
	"demcoin/wallet"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
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
	chain        *blockchain.Chain
	hub          *p2p.Hub
	console      *console.Console
	router       *mux.Router
	store        storeIface
	priceEngine  *blockchain.PriceEngine
	miningEngine *blockchain.MiningEngine
}

func NewServerFull(chain *blockchain.Chain, hub *p2p.Hub, con *console.Console, store storeIface, pe *blockchain.PriceEngine, me *blockchain.MiningEngine) *Server {
	s := &Server{chain: chain, hub: hub, console: con, router: mux.NewRouter(), store: store, priceEngine: pe, miningEngine: me}
	s.setupRoutes()
	return s
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
	// IP kontrol
	GetIPWalletCount(ip string) (int, error)
	RegisterWalletIP(address, ip string) error
	GetAllIPRegistrations() ([]map[string]interface{}, error)
	GetWalletsByIP(ip string) ([]string, error)
	// Davet
	IsValidReferralCode(code string) bool
	CreateReferral(referrer, invited string) error
	GetReferralCount(address string) (int, error)
	GetReferrerOf(address string) (string, error)
	// Görevler
	GetAllQuests() ([]*db.QuestDefinition, error)
	GetActiveQuests() ([]*db.QuestDefinition, error)
	CreateQuest(title, desc, qtype string, target int, reward float64) (*db.QuestDefinition, error)
	UpdateQuest(id int64, title, desc string, target int, reward float64, active bool) error
	DeleteQuest(id int64) error
	GetUserQuestProgress(address string) ([]*db.QuestProgress, error)
	ClaimQuestReward(address string, questID int64) (float64, error)
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
	s.router.HandleFunc("/api/mining/stake", s.handleStake).Methods("POST")
	s.router.HandleFunc("/api/mining/unstake", s.handleUnstake).Methods("POST")
	s.router.HandleFunc("/api/mining/status", s.handleMiningStatus).Methods("GET")
	s.router.HandleFunc("/api/mining/mempool", s.handleMempool).Methods("GET")
	s.router.HandleFunc("/api/mining/stakes", s.handleAllStakes).Methods("GET")
	// Davet ve kayıt
	s.router.HandleFunc("/api/wallet/register", s.handleRegisterWallet).Methods("POST")
	s.router.HandleFunc("/api/referral/info", s.handleReferralInfo).Methods("GET")
	// Görevler
	s.router.HandleFunc("/api/quests", s.handleGetQuests).Methods("GET")
	s.router.HandleFunc("/api/quests/claim", s.handleClaimQuest).Methods("POST")
	// Admin - IP
	s.router.HandleFunc("/api/admin/ip-list", s.handleAdminIPList).Methods("GET")
	// Admin - Görev yönetimi
	s.router.HandleFunc("/api/admin/quests", s.handleAdminGetQuests).Methods("GET")
	s.router.HandleFunc("/api/admin/quests/create", s.handleAdminCreateQuest).Methods("POST")
	s.router.HandleFunc("/api/admin/quests/update", s.handleAdminUpdateQuest).Methods("POST")
	s.router.HandleFunc("/api/admin/quests/delete", s.handleAdminDeleteQuest).Methods("POST")
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

func (s *Server) handleStake(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From      string  `json:"from"`
		Amount    float64 `json:"amount"`
		Signature string  `json:"signature"`
		PubKey    string  `json:"pub_key"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	pub, err := wallet.HexToPubKey(req.PubKey)
	if err != nil {
		jsonErr(w, "Geçersiz public key", 400)
		return
	}
	sigData := req.From + "STAKE" + strconv.FormatFloat(req.Amount, 'f', 8, 64)
	if !wallet.Verify(pub, sigData, req.Signature) {
		jsonErr(w, "GEÇERSİZ_İMZA", 401)
		return
	}
	if s.miningEngine == nil {
		jsonErr(w, "Mining engine yok", 500)
		return
	}
	if err := s.miningEngine.Stake(req.From, req.Amount); err != nil {
		jsonErr(w, err.Error(), 400)
		return
	}
	jsonOK(w, map[string]interface{}{
		"ok":     true,
		"mesaj":  fmt.Sprintf("%.2f DEM stake edildi. Blok üretimine katılıyorsunuz.", req.Amount),
		"stake":  s.miningEngine.GetStake(req.From),
	})
}

func (s *Server) handleUnstake(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From      string  `json:"from"`
		Amount    float64 `json:"amount"`
		Signature string  `json:"signature"`
		PubKey    string  `json:"pub_key"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	pub, err := wallet.HexToPubKey(req.PubKey)
	if err != nil {
		jsonErr(w, "Geçersiz public key", 400)
		return
	}
	sigData := req.From + "UNSTAKE" + strconv.FormatFloat(req.Amount, 'f', 8, 64)
	if !wallet.Verify(pub, sigData, req.Signature) {
		jsonErr(w, "GEÇERSİZ_İMZA", 401)
		return
	}
	if s.miningEngine == nil {
		jsonErr(w, "Mining engine yok", 500)
		return
	}
	if err := s.miningEngine.Unstake(req.From, req.Amount); err != nil {
		jsonErr(w, err.Error(), 400)
		return
	}
	jsonOK(w, map[string]interface{}{
		"ok":    true,
		"mesaj": fmt.Sprintf("%.2f DEM unstake edildi, cüzdanına geri yüklendi.", req.Amount),
	})
}

func (s *Server) handleMiningStatus(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if s.miningEngine == nil {
		jsonErr(w, "Mining engine yok", 500)
		return
	}
	height := s.chain.State.BlockHeight
	halvings := height / blockchain.HalvingInterval
	reward := blockchain.BlockRewardBase
	for i := uint64(0); i < halvings; i++ {
		reward /= 2
	}
	resp := map[string]interface{}{
		"block_height":    height,
		"current_reward":  reward,
		"next_halving":    blockchain.HalvingInterval - (height % blockchain.HalvingInterval),
		"total_stakers":   len(s.miningEngine.GetAllStakes()),
		"mempool_size":    s.miningEngine.GetMempoolSize(),
		"min_stake":       blockchain.MinStakeAmount,
		"block_time_secs": 15,
	}
	if address != "" {
		resp["my_stake"] = s.miningEngine.GetStake(address)
	}
	jsonOK(w, resp)
}

func (s *Server) handleMempool(w http.ResponseWriter, r *http.Request) {
	if s.miningEngine == nil {
		jsonOK(w, []interface{}{})
		return
	}
	txs := s.miningEngine.GetMempoolTxs(20)
	jsonOK(w, txs)
}

func (s *Server) handleAllStakes(w http.ResponseWriter, r *http.Request) {
	if s.miningEngine == nil {
		jsonOK(w, []interface{}{})
		return
	}
	stakes := s.miningEngine.GetAllStakes()
	type stakeOut struct {
		Address     string    `json:"address"`
		Username    string    `json:"username"`
		Amount      float64   `json:"amount"`
		Rewards     float64   `json:"rewards"`
		BlocksMined uint64    `json:"blocks_mined"`
		Since       time.Time `json:"since"`
	}
	result := make([]stakeOut, len(stakes))
	for i, s2 := range stakes {
		addr := s2.Address
		un := "@Dem_"
		if len(addr) >= 9 {
			un += addr[3:9]
		}
		result[i] = stakeOut{
			Address:     addr,
			Username:    un,
			Amount:      s2.Amount,
			Rewards:     s2.Rewards,
			BlocksMined: s2.BlocksMined,
			Since:       s2.Since,
		}
	}
	jsonOK(w, result)
}

// getClientIP: gerçek IP'yi alır (proxy/nginx arkasında da çalışır)
func getClientIP(r *http.Request) string {
	// X-Forwarded-For başlığı (Railway, nginx vb.)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	// X-Real-IP başlığı
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	// Doğrudan bağlantı
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return strings.Trim(ip, "[]")
}

// ─── Cüzdan Kayıt (IP Kontrol + Davet) ──────────────────────────────────────

func (s *Server) handleRegisterWallet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ReferralCode string `json:"referral_code"` // boş olabilir
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Yeni cüzdan üret
	kp, err := wallet.Generate()
	if err != nil {
		jsonErr(w, "Cüzdan oluşturulamadı", 500)
		return
	}

	// IP kontrolü — bir IP'den max 3 cüzdan
	clientIP := getClientIP(r)
	const maxPerIP = 3
	count, err := s.store.GetIPWalletCount(clientIP)
	if err != nil {
		jsonErr(w, "IP kontrol hatası", 500)
		return
	}
	if count >= maxPerIP {
		jsonErr(w, fmt.Sprintf("Bu IP adresinden zaten %d cüzdan kayıtlı. Mevcut hesabınızı kullanın.", maxPerIP), 429)
		return
	}

	// Davet kodu kontrolü
	var referralValid bool
	referralCode := strings.TrimSpace(req.ReferralCode)
	if referralCode != "" {
		if !s.store.IsValidReferralCode(referralCode) {
			jsonErr(w, "Geçersiz davet kodu. Lütfen doğru bir cüzdan adresi girin.", 400)
			return
		}
		referralValid = true
	}

	// Cüzdanı blockchain'de oluştur
	s.chain.GetOrCreateWallet(kp.Address)

	// IP kaydını kaydet
	if err := s.store.RegisterWalletIP(kp.Address, clientIP); err != nil {
		log.Printf("IP kayıt hatası: %v", err)
	}

	// Davet ilişkisini kaydet
	if referralValid && referralCode != kp.Address {
		if err := s.store.CreateReferral(referralCode, kp.Address); err != nil {
			log.Printf("Referral kayıt hatası: %v", err)
		}
	}

	resp := map[string]interface{}{
		"address":        kp.Address,
		"priv_key":       wallet.PrivKeyToHex(kp.PrivateKey),
		"pub_key":        wallet.PubKeyToHex(kp.PublicKey),
		"referral_used":  referralValid,
		"ip_slot_used":   count + 1,
		"ip_slots_left":  maxPerIP - count - 1,
	}
	jsonOK(w, resp)
}

// ─── Referral Bilgisi ────────────────────────────────────────────────────────

func (s *Server) handleReferralInfo(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		jsonErr(w, "Adres gerekli", 400)
		return
	}
	count, _ := s.store.GetReferralCount(address)
	referrer, _ := s.store.GetReferrerOf(address)
	jsonOK(w, map[string]interface{}{
		"address":       address,
		"invited_count": count,
		"referral_code": address, // kendi adresi davet kodu olarak kullanılır
		"referred_by":   referrer,
	})
}

// ─── Görevler (Kullanıcı) ────────────────────────────────────────────────────

func (s *Server) handleGetQuests(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		// Adres yoksa sadece tanımları döndür
		quests, err := s.store.GetActiveQuests()
		if err != nil {
			jsonErr(w, err.Error(), 500)
			return
		}
		jsonOK(w, quests)
		return
	}
	progress, err := s.store.GetUserQuestProgress(address)
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, progress)
}

func (s *Server) handleClaimQuest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Address   string `json:"address"`
		QuestID   int64  `json:"quest_id"`
		Signature string `json:"signature"`
		PubKey    string `json:"pub_key"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	pub, err := wallet.HexToPubKey(req.PubKey)
	if err != nil {
		jsonErr(w, "Geçersiz public key", 400)
		return
	}
	sigData := req.Address + "CLAIM" + strconv.FormatInt(req.QuestID, 10)
	if !wallet.Verify(pub, sigData, req.Signature) {
		jsonErr(w, "GEÇERSİZ_İMZA", 401)
		return
	}

	reward, err := s.store.ClaimQuestReward(req.Address, req.QuestID)
	if err != nil {
		jsonErr(w, err.Error(), 400)
		return
	}

	// In-memory bakiyeyi güncelle
	s.chain.GetOrCreateWallet(req.Address)

	jsonOK(w, map[string]interface{}{
		"ok":         true,
		"reward_dem": reward,
		"mesaj":      fmt.Sprintf("%.2f DEM ödülü cüzdanınıza aktarıldı!", reward),
	})
}

// ─── Admin - IP Listesi ──────────────────────────────────────────────────────

func (s *Server) handleAdminIPList(w http.ResponseWriter, r *http.Request) {
	imza := r.URL.Query().Get("imza")
	if !s.console.DogrulaKurucu(imza, "AdminIPList") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	list, err := s.store.GetAllIPRegistrations()
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	// IP'lere göre grupla
	ipMap := make(map[string][]map[string]interface{})
	for _, item := range list {
		ip := item["ip_address"].(string)
		ipMap[ip] = append(ipMap[ip], item)
	}
	type ipGroup struct {
		IP      string                   `json:"ip"`
		Count   int                      `json:"count"`
		Wallets []map[string]interface{} `json:"wallets"`
	}
	var groups []ipGroup
	for ip, wallets := range ipMap {
		groups = append(groups, ipGroup{IP: ip, Count: len(wallets), Wallets: wallets})
	}
	jsonOK(w, map[string]interface{}{
		"toplam_kayit": len(list),
		"ip_gruplari":  groups,
		"kayitlar":     list,
	})
}

// ─── Admin - Görev Yönetimi ──────────────────────────────────────────────────

func (s *Server) handleAdminGetQuests(w http.ResponseWriter, r *http.Request) {
	imza := r.URL.Query().Get("imza")
	if !s.console.DogrulaKurucu(imza, "AdminQuests") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	quests, err := s.store.GetAllQuests()
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, quests)
}

func (s *Server) handleAdminCreateQuest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza        string  `json:"imza"`
		Title       string  `json:"title"`
		Description string  `json:"description"`
		QuestType   string  `json:"quest_type"`
		TargetCount int     `json:"target_count"`
		RewardDEM   float64 `json:"reward_dem"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !s.console.DogrulaKurucu(req.Imza, "CreateQuest") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	if req.Title == "" || req.TargetCount <= 0 || req.RewardDEM <= 0 {
		jsonErr(w, "Geçersiz görev bilgisi", 400)
		return
	}
	q, err := s.store.CreateQuest(req.Title, req.Description, req.QuestType, req.TargetCount, req.RewardDEM)
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, q)
}

func (s *Server) handleAdminUpdateQuest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza        string  `json:"imza"`
		ID          int64   `json:"id"`
		Title       string  `json:"title"`
		Description string  `json:"description"`
		TargetCount int     `json:"target_count"`
		RewardDEM   float64 `json:"reward_dem"`
		Active      bool    `json:"active"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !s.console.DogrulaKurucu(req.Imza, "UpdateQuest") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	if err := s.store.UpdateQuest(req.ID, req.Title, req.Description, req.TargetCount, req.RewardDEM, req.Active); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

func (s *Server) handleAdminDeleteQuest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Imza string `json:"imza"`
		ID   int64  `json:"id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !s.console.DogrulaKurucu(req.Imza, "DeleteQuest") {
		jsonErr(w, "YETKİSİZ", 403)
		return
	}
	if err := s.store.DeleteQuest(req.ID); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
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
