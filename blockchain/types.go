package blockchain

import (
	"crypto/ecdsa"
	"sync"
	"time"
)

const (
	MaxSupply      float64 = 50_000_000
	GenesisReward  float64 = 1_000_000
	BlockGasFee    float64 = 10
	ChatGasFee     float64 = 1
	TransferGasFee float64 = 5
)

type Transaction struct {
	ID        string    `json:"id"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Amount    float64   `json:"amount"`
	GasFee    float64   `json:"gas_fee"`
	Type      string    `json:"type"`
	Data      string    `json:"data"`
	Timestamp time.Time `json:"timestamp"`
	Signature string    `json:"signature"`
	Hash      string    `json:"hash"`
}

type Block struct {
	Index        uint64        `json:"index"`
	Timestamp    time.Time     `json:"timestamp"`
	Transactions []Transaction `json:"transactions"`
	PrevHash     string        `json:"prev_hash"`
	Hash         string        `json:"hash"`
	Validator    string        `json:"validator"`
	Signature    string        `json:"signature"`
	Nonce        uint64        `json:"nonce"`
}

type Wallet struct {
	Address    string  `json:"address"`
	Balance    float64 `json:"balance"`
	Blacklisted bool   `json:"blacklisted"`
	mu         sync.RWMutex
}

type Validator struct {
	Address   string            `json:"address"`
	PublicKey *ecdsa.PublicKey  `json:"-"`
	PubKeyHex string            `json:"pub_key_hex"`
	Approved  bool              `json:"approved"`
}

type ChatMessage struct {
	ID        int64     `json:"id"`
	From      string    `json:"from"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	TxHash    string    `json:"tx_hash"`
	Deleted   bool      `json:"deleted"`
}

type UserRestriction struct {
	Address  string `json:"address"`
	Username string `json:"username"`
	Muted    bool   `json:"muted"`
	TradeBan bool   `json:"trade_ban"`
}

type PricePoint struct {
	Value float64 `json:"value"`
	Time  int64   `json:"time"`
}

type NetworkState struct {
	Locked      bool   `json:"locked"`
	SupplyFixed bool   `json:"supply_fixed"`
	TotalSupply float64 `json:"total_supply"`
	BlockHeight uint64 `json:"block_height"`
}
