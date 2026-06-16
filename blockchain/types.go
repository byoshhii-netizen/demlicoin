package blockchain

import (
	"crypto/ecdsa"
	"sync"
	"time"
)

const (
	MaxSupply       = 50_000_000
	GenesisReward   = 1_000_000
	BlockGasFee     = 10
	ChatGasFee      = 1
	TransferGasFee  = 5
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
	From      string    `json:"from"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	TxHash    string    `json:"tx_hash"`
}

type NetworkState struct {
	Locked      bool   `json:"locked"`
	SupplyFixed bool   `json:"supply_fixed"`
	TotalSupply float64 `json:"total_supply"`
	BlockHeight uint64 `json:"block_height"`
}
