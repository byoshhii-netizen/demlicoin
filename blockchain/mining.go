package blockchain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

const (
	BlockRewardBase    float64 = 50.0
	HalvingInterval    uint64  = 210000
	MinStakeAmount     float64 = 100.0
	BlockTime          = 15 * time.Second
	MerkleEmptyHash            = "0000000000000000000000000000000000000000000000000000000000000000"
)

type StakeInfo struct {
	Address   string    `json:"address"`
	Amount    float64   `json:"amount"`
	Since     time.Time `json:"since"`
	Rewards   float64   `json:"rewards"`
	BlocksMined uint64  `json:"blocks_mined"`
}

type MempoolTx struct {
	Transaction
	ReceivedAt time.Time `json:"received_at"`
	Priority   float64   `json:"priority"`
}

type MiningEngine struct {
	mu         sync.RWMutex
	chain      *Chain
	stakes     map[string]*StakeInfo
	mempool    []*MempoolTx
	mempoolMu  sync.RWMutex
	onNewBlock func(*Block, string)
	stopCh     chan struct{}
	running    bool
}

func NewMiningEngine(chain *Chain, onNewBlock func(*Block, string)) *MiningEngine {
	return &MiningEngine{
		chain:      chain,
		stakes:     make(map[string]*StakeInfo),
		mempool:    make([]*MempoolTx, 0),
		onNewBlock: onNewBlock,
		stopCh:     make(chan struct{}),
	}
}

func (m *MiningEngine) Start() {
	m.mu.Lock()
	m.running = true
	m.mu.Unlock()
	go m.loop()
}

func (m *MiningEngine) loop() {
	ticker := time.NewTicker(BlockTime)
	defer ticker.Stop()
	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.tryProduceBlock()
		}
	}
}

func (m *MiningEngine) tryProduceBlock() {
	m.mu.RLock()
	stakes := make([]*StakeInfo, 0, len(m.stakes))
	for _, s := range m.stakes {
		if s.Amount >= MinStakeAmount {
			stakes = append(stakes, s)
		}
	}
	m.mu.RUnlock()

	if len(stakes) == 0 {
		return
	}

	validator := m.selectValidator(stakes)
	if validator == nil {
		return
	}

	txs := m.drainMempool(10)

	reward := m.calcReward()
	rewardTx := Transaction{
		ID:        fmt.Sprintf("reward_%d_%d", time.Now().UnixNano(), rand.Uint32()),
		From:      "NETWORK",
		To:        validator.Address,
		Amount:    reward,
		GasFee:    0,
		Type:      "STAKE_REWARD",
		Data:      fmt.Sprintf("Blok ödülü #%d", m.chain.State.BlockHeight+1),
		Timestamp: time.Now(),
	}
	rewardTx.Hash = calcTxHashStatic(&rewardTx)
	txs = append([]Transaction{rewardTx}, txs...)

	m.chain.RegisterValidator(&Validator{Address: validator.Address, Approved: true})
	block := m.chain.AddBlock(validator.Address, txs)
	if block != nil {
		block.MerkleRoot = CalcMerkleRoot(txs)
		if m.chain.store != nil {
			m.chain.store.EnsureWallet(validator.Address)
		}
		if err := m.chain.MintToFounder(validator.Address, reward); err == nil {
			validator.Rewards += reward
		}
		validator.BlocksMined++
		m.mu.Lock()
		m.stakes[validator.Address] = validator
		m.mu.Unlock()
		if m.onNewBlock != nil {
			m.onNewBlock(block, validator.Address)
		}
	}
}

func (m *MiningEngine) selectValidator(stakes []*StakeInfo) *StakeInfo {
	total := 0.0
	for _, s := range stakes {
		total += s.Amount
	}
	if total == 0 {
		return nil
	}
	pick := rand.Float64() * total
	cum := 0.0
	for _, s := range stakes {
		cum += s.Amount
		if pick <= cum {
			return s
		}
	}
	return stakes[len(stakes)-1]
}

func (m *MiningEngine) calcReward() float64 {
	height := m.chain.State.BlockHeight
	halvings := height / HalvingInterval
	if halvings >= 64 {
		return 0
	}
	reward := BlockRewardBase
	for i := uint64(0); i < halvings; i++ {
		reward /= 2
	}
	return reward
}

func (m *MiningEngine) Stake(address string, amount float64) error {
	if amount < MinStakeAmount {
		return fmt.Errorf("minimum stake miktarı %.0f DEM", MinStakeAmount)
	}
	if err := m.chain.Transfer(address, "STAKE_POOL", amount); err != nil {
		return fmt.Errorf("stake transfer hatası: %w", err)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.stakes[address]; ok {
		existing.Amount += amount
	} else {
		m.stakes[address] = &StakeInfo{
			Address: address,
			Amount:  amount,
			Since:   time.Now(),
		}
	}
	return nil
}

func (m *MiningEngine) Unstake(address string, amount float64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.stakes[address]
	if !ok {
		return fmt.Errorf("aktif stake bulunamadı")
	}
	if amount > s.Amount {
		return fmt.Errorf("yetersiz stake miktarı")
	}
	s.Amount -= amount
	if s.Amount < MinStakeAmount {
		delete(m.stakes, address)
	}
	if err := m.chain.MintToFounder(address, amount); err != nil {
		return fmt.Errorf("unstake geri ödeme hatası: %w", err)
	}
	return nil
}

func (m *MiningEngine) GetStake(address string) *StakeInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if s, ok := m.stakes[address]; ok {
		cp := *s
		return &cp
	}
	return nil
}

func (m *MiningEngine) GetAllStakes() []*StakeInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]*StakeInfo, 0, len(m.stakes))
	for _, s := range m.stakes {
		cp := *s
		result = append(result, &cp)
	}
	return result
}

func (m *MiningEngine) AddToMempool(tx *MempoolTx) {
	m.mempoolMu.Lock()
	defer m.mempoolMu.Unlock()
	tx.Priority = tx.GasFee
	m.mempool = append(m.mempool, tx)
	if len(m.mempool) > 1000 {
		m.mempool = m.mempool[len(m.mempool)-1000:]
	}
}

func (m *MiningEngine) drainMempool(max int) []Transaction {
	m.mempoolMu.Lock()
	defer m.mempoolMu.Unlock()
	if len(m.mempool) == 0 {
		return nil
	}
	take := max
	if take > len(m.mempool) {
		take = len(m.mempool)
	}
	txs := make([]Transaction, take)
	for i := 0; i < take; i++ {
		txs[i] = m.mempool[i].Transaction
	}
	m.mempool = m.mempool[take:]
	return txs
}

func (m *MiningEngine) GetMempoolSize() int {
	m.mempoolMu.RLock()
	defer m.mempoolMu.RUnlock()
	return len(m.mempool)
}

func (m *MiningEngine) GetMempoolTxs(limit int) []*MempoolTx {
	m.mempoolMu.RLock()
	defer m.mempoolMu.RUnlock()
	if limit > len(m.mempool) {
		limit = len(m.mempool)
	}
	result := make([]*MempoolTx, limit)
	copy(result, m.mempool[:limit])
	return result
}

func CalcMerkleRoot(txs []Transaction) string {
	if len(txs) == 0 {
		return MerkleEmptyHash
	}
	hashes := make([]string, len(txs))
	for i, tx := range txs {
		data, _ := json.Marshal(tx)
		h := sha256.Sum256(data)
		hashes[i] = hex.EncodeToString(h[:])
	}
	for len(hashes) > 1 {
		if len(hashes)%2 != 0 {
			hashes = append(hashes, hashes[len(hashes)-1])
		}
		next := make([]string, len(hashes)/2)
		for i := 0; i < len(hashes); i += 2 {
			combined := hashes[i] + hashes[i+1]
			h := sha256.Sum256([]byte(combined))
			next[i/2] = hex.EncodeToString(h[:])
		}
		hashes = next
	}
	return hashes[0]
}

func calcTxHashStatic(tx *Transaction) string {
	data := fmt.Sprintf("%s%s%s%.8f%s%s", tx.From, tx.To, tx.Type, tx.Amount, tx.Data, tx.Timestamp.String())
	h := sha256.Sum256([]byte(data))
	return "0x" + hex.EncodeToString(h[:])[:16]
}
