package api

import (
	"demcoin/blockchain"
	"demcoin/console"
	"demcoin/p2p"
	"demcoin/wallet"
	"encoding/json"
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
	chain   *blockchain.Chain
	hub     *p2p.Hub
	console *console.Console
	router  *mux.Router
}

func NewServer(chain *blockchain.Chain, hub *p2p.Hub, con *console.Console) *Server {
	s := &Server{chain: chain, hub: hub, console: con, router: mux.NewRouter()}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.HandleFunc("/ws", s.handleWS)
	s.router.HandleFunc("/api/wallet/new", s.handleNewWallet).Methods("GET")
	s.router.HandleFunc("/api/wallet/{address}/balance", s.handleBalance).Methods("GET")
	s.router.HandleFunc("/api/transfer", s.handleTransfer).Methods("POST")
	s.router.HandleFunc("/api/blocks", s.handleBlocks).Methods("GET")
	s.router.HandleFunc("/api/state", s.handleState).Methods("GET")
	s.router.HandleFunc("/api/chat/history", s.handleChatHistory).Methods("GET")
	s.router.HandleFunc("/api/admin/kilitle", s.handleKilitle).Methods("POST")
	s.router.HandleFunc("/api/admin/ac", s.handleAc).Methods("POST")
	s.router.HandleFunc("/api/admin/yasakla", s.handleYasakla).Methods("POST")
	s.router.HandleFunc("/api/admin/arz-sabitle", s.handleArzSabitle).Methods("POST")
	s.router.HandleFunc("/api/admin/validator-ekle", s.handleValidatorEkle).Methods("POST")
	s.router.HandleFunc("/api/admin/token-bas", s.handleTokenBas).Methods("POST")
	s.router.HandleFunc("/api/admin/imza-olustur", s.handleImzaOlustur).Methods("POST")
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

func jsonOK(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonErr(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"hata": msg})
}
