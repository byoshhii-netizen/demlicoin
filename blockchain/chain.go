package blockchain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

type DBStore interface {
	SaveBlock(b *Block) error
	SaveWallet(address string, balance float64, blacklisted bool) error
	LoadAllWallets() (map[string]*Wallet, error)
	LoadAllBlocks() ([]*Block, error)
	LoadNetworkState() (*NetworkState, error)
	SaveNetworkState(state *NetworkState) error
	SaveChatMessage(cm *ChatMessage) error
	LoadRecentChat(limit int) ([]*ChatMessage, error)
	LoadRecentBlocks(limit int) ([]*Block, error)
	GetWalletBalance(address string) (float64, bool, error)
	BlacklistWalletDB(address string) error
	TransferDB(from, to string, amount, gasFee float64) error
	DeductGasDB(address string, fee float64) error
	GetTotalWallets() int
	IsBlacklisted(address string) bool
	EnsureWallet(address string) error
	MintTokens(address string, amount float64, currentSupply float64, maxSupply float64) error
	GetCurrentSupply() float64
	SetNetworkLocked(locked bool) error
	SetSupplyFixed(fixed bool) error
	UpdateBlockHeight(height uint64) error
	IsNetworkLocked() bool
	IsSupplyFixed() bool
	WalletExists(address string) bool
	GetBlockCount() int64
}

type Chain struct {
	Blocks     []*Block
	Wallets    map[string]*Wallet
	Validators map[string]*Validator
	Blacklist  map[string]bool
	State      NetworkState
	mu         sync.RWMutex
	walletMu   sync.RWMutex
	store      DBStore
}

func NewChain(store DBStore) *Chain {
	c := &Chain{
		Blocks:     make([]*Block, 0),
		Wallets:    make(map[string]*Wallet),
		Validators: make(map[string]*Validator),
		Blacklist:  make(map[string]bool),
		store:      store,
	}

	if store != nil {
		c.loadFromDB()
	}

	if len(c.Blocks) == 0 {
		genesis := c.createGenesis()
		c.Blocks = append(c.Blocks, genesis)
		if store != nil {
			store.SaveBlock(genesis)
		}
	}

	return c
}

func (c *Chain) loadFromDB() {
	if state, err := c.store.LoadNetworkState(); err == nil {
		c.State = *state
	}

	if wallets, err := c.store.LoadAllWallets(); err == nil {
		c.Wallets = wallets
		for addr, w := range wallets {
			if w.Blacklisted {
				c.Blacklist[addr] = true
			}
		}
	}

	if blocks, err := c.store.LoadAllBlocks(); err == nil && len(blocks) > 0 {
		c.Blocks = blocks
	}
}

func (c *Chain) createGenesis() *Block {
	g := &Block{
		Index:        0,
		Timestamp:    time.Now(),
		Transactions: []Transaction{},
		PrevHash:     "0000000000000000000000000000000000000000000000000000000000000000",
		Validator:    "GENESIS",
		Nonce:        0,
	}
	g.Hash = c.calcBlockHash(g)
	c.State.BlockHeight = 0
	return g
}

func (c *Chain) calcBlockHash(b *Block) string {
	data, _ := json.Marshal(struct {
		Index        uint64
		Timestamp    time.Time
		Transactions []Transaction
		PrevHash     string
		Validator    string
		Nonce        uint64
	}{b.Index, b.Timestamp, b.Transactions, b.PrevHash, b.Validator, b.Nonce})
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func (c *Chain) CalcTxHash(tx *Transaction) string {
	data := fmt.Sprintf("%s%s%s%.8f%s%s", tx.From, tx.To, tx.Type, tx.Amount, tx.Data, tx.Timestamp.String())
	h := sha256.Sum256([]byte(data))
	return "0x" + hex.EncodeToString(h[:])[:16]
}

func (c *Chain) GetLatestBlock() *Block {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Blocks[len(c.Blocks)-1]
}

func (c *Chain) GetOrCreateWallet(address string) *Wallet {
	c.walletMu.Lock()
	defer c.walletMu.Unlock()
	if w, ok := c.Wallets[address]; ok {
		return w
	}
	w := &Wallet{Address: address, Balance: 0, Blacklisted: false}
	c.Wallets[address] = w
	if c.store != nil {
		c.store.EnsureWallet(address)
	}
	return w
}

func (c *Chain) GetBalance(address string) float64 {
	if c.store != nil {
		bal, _, err := c.store.GetWalletBalance(address)
		if err == nil {
			return bal
		}
	}
	c.walletMu.RLock()
	defer c.walletMu.RUnlock()
	if w, ok := c.Wallets[address]; ok {
		w.mu.RLock()
		defer w.mu.RUnlock()
		return w.Balance
	}
	return 0
}

func (c *Chain) Transfer(from, to string, amount float64) error {
	locked := false
	if c.store != nil {
		locked = c.store.IsNetworkLocked()
	} else {
		locked = c.State.Locked
	}
	if locked {
		return errors.New("AG_KILITLI: Transfer işlemleri dondurulmuştur")
	}

	if c.store != nil {
		if c.store.IsBlacklisted(from) {
			return errors.New("CUZDAN_YASAKLI: Bu cüzdan kara listede")
		}
		if c.store.IsBlacklisted(to) {
			return errors.New("HEDEF_YASAKLI: Hedef cüzdan kara listede")
		}
		c.store.EnsureWallet(from)
		c.store.EnsureWallet(to)
		if err := c.store.TransferDB(from, to, amount, TransferGasFee); err != nil {
			return fmt.Errorf("YETERSIZ_BAKIYE: Transfer başarısız")
		}
		bal, _, _ := c.store.GetWalletBalance(from)
		c.walletMu.Lock()
		if w, ok := c.Wallets[from]; ok {
			w.mu.Lock()
			w.Balance = bal
			w.mu.Unlock()
		}
		c.walletMu.Unlock()
		return nil
	}

	c.walletMu.Lock()
	defer c.walletMu.Unlock()

	if c.Blacklist[from] {
		return errors.New("CUZDAN_YASAKLI: Bu cüzdan kara listede")
	}
	if c.Blacklist[to] {
		return errors.New("HEDEF_YASAKLI: Hedef cüzdan kara listede")
	}

	fromWallet := c.Wallets[from]
	if fromWallet == nil {
		return errors.New("CUZDAN_YOK: Gönderici cüzdan bulunamadı")
	}

	fromWallet.mu.Lock()
	defer fromWallet.mu.Unlock()

	total := amount + TransferGasFee
	if fromWallet.Balance < total {
		return fmt.Errorf("YETERSIZ_BAKIYE: Gerekli=%.2f Mevcut=%.2f", total, fromWallet.Balance)
	}

	if _, ok := c.Wallets[to]; !ok {
		c.Wallets[to] = &Wallet{Address: to, Balance: 0}
	}
	toWallet := c.Wallets[to]
	toWallet.mu.Lock()
	defer toWallet.mu.Unlock()

	fromWallet.Balance -= total
	toWallet.Balance += amount
	return nil
}

func (c *Chain) MintToFounder(address string, amount float64) error {
	if c.store != nil {
		if c.store.IsSupplyFixed() {
			return errors.New("ARZ_SABITLENDI: Yeni token basılamaz")
		}
		supply := c.store.GetCurrentSupply()
		if supply+amount > MaxSupply {
			return fmt.Errorf("MAX_ARZ_ASIMI: Maksimum arz %d DEM", MaxSupply)
		}
		c.store.EnsureWallet(address)
		if err := c.store.MintTokens(address, amount, supply, MaxSupply); err != nil {
			return err
		}
		c.State.TotalSupply = supply + amount
		return nil
	}

	c.walletMu.Lock()
	defer c.walletMu.Unlock()

	if c.State.SupplyFixed {
		return errors.New("ARZ_SABITLENDI: Yeni token basılamaz")
	}
	if c.State.TotalSupply+amount > MaxSupply {
		return fmt.Errorf("MAX_ARZ_ASIMI: Maksimum arz %d DEM", MaxSupply)
	}
	if _, ok := c.Wallets[address]; !ok {
		c.Wallets[address] = &Wallet{Address: address, Balance: 0}
	}
	c.Wallets[address].Balance += amount
	c.State.TotalSupply += amount
	return nil
}

func (c *Chain) AddBlock(validator string, txs []Transaction) *Block {
	c.mu.Lock()
	defer c.mu.Unlock()

	if v, ok := c.Validators[validator]; !ok || !v.Approved {
		return nil
	}

	prev := c.Blocks[len(c.Blocks)-1]
	b := &Block{
		Index:        prev.Index + 1,
		Timestamp:    time.Now(),
		Transactions: txs,
		PrevHash:     prev.Hash,
		Validator:    validator,
		Nonce:        uint64(time.Now().UnixNano()),
	}
	b.Hash = c.calcBlockHash(b)
	c.Blocks = append(c.Blocks, b)
	c.State.BlockHeight = b.Index

	if c.store != nil {
		c.store.SaveBlock(b)
		c.store.UpdateBlockHeight(b.Index)
	}

	return b
}

func (c *Chain) BlacklistWallet(address string) {
	c.walletMu.Lock()
	defer c.walletMu.Unlock()
	c.Blacklist[address] = true
	if w, ok := c.Wallets[address]; ok {
		w.mu.Lock()
		w.Balance = 0
		w.Blacklisted = true
		w.mu.Unlock()
	}
	if c.store != nil {
		c.store.BlacklistWalletDB(address)
	}
}

func (c *Chain) LockNetwork() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.State.Locked = true
	if c.store != nil {
		c.store.SetNetworkLocked(true)
	}
}

func (c *Chain) UnlockNetwork() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.State.Locked = false
	if c.store != nil {
		c.store.SetNetworkLocked(false)
	}
}

func (c *Chain) FixSupply() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.State.SupplyFixed = true
	if c.store != nil {
		c.store.SetSupplyFixed(true)
	}
}

func (c *Chain) RegisterValidator(v *Validator) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Validators[v.Address] = v
}

func (c *Chain) IsValidatorApproved(address string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.Validators[address]
	return ok && v.Approved
}

func (c *Chain) GetRecentBlocks(limit int) []*Block {
	if c.store != nil {
		blocks, err := c.store.LoadRecentBlocks(limit)
		if err == nil {
			return blocks
		}
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	total := len(c.Blocks)
	if limit > total {
		limit = total
	}
	result := make([]*Block, limit)
	copy(result, c.Blocks[total-limit:])
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result
}

func (c *Chain) DeductGas(address string, fee float64) error {
	if c.store != nil {
		if err := c.store.DeductGasDB(address, fee); err != nil {
			return errors.New("GAS_YETERSIZ")
		}
		return nil
	}

	c.walletMu.Lock()
	defer c.walletMu.Unlock()
	w, ok := c.Wallets[address]
	if !ok || w.Balance < fee {
		return errors.New("GAS_YETERSIZ")
	}
	w.mu.Lock()
	w.Balance -= fee
	w.mu.Unlock()
	return nil
}

func (c *Chain) GetNetworkLocked() bool {
	if c.store != nil {
		return c.store.IsNetworkLocked()
	}
	return c.State.Locked
}

func (c *Chain) GetTotalWallets() int {
	if c.store != nil {
		return c.store.GetTotalWallets()
	}
	return len(c.Wallets)
}

func (c *Chain) GetCurrentSupply() float64 {
	if c.store != nil {
		return c.store.GetCurrentSupply()
	}
	return c.State.TotalSupply
}
