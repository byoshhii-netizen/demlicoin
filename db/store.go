package db

import (
	"demcoin/blockchain"
	"fmt"
	"time"
)

func SaveBlock(b *blockchain.Block) error {
	_, err := DB.Exec(`
		INSERT INTO blocks (idx, timestamp, prev_hash, hash, validator, nonce)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (idx) DO NOTHING`,
		b.Index, b.Timestamp, b.PrevHash, b.Hash, b.Validator, b.Nonce,
	)
	if err != nil {
		return err
	}
	for _, tx := range b.Transactions {
		SaveTransaction(&tx, b.Index)
	}
	return nil
}

func SaveTransaction(tx *blockchain.Transaction, blockIdx uint64) error {
	_, err := DB.Exec(`
		INSERT INTO transactions (tx_id, block_idx, from_addr, to_addr, amount, gas_fee, tx_type, data, signature, hash, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (tx_id) DO NOTHING`,
		tx.ID, blockIdx, tx.From, tx.To, tx.Amount, tx.GasFee,
		tx.Type, tx.Data, tx.Signature, tx.Hash, tx.Timestamp,
	)
	return err
}

func SaveWallet(address string, balance float64, blacklisted bool) error {
	_, err := DB.Exec(`
		INSERT INTO wallets (address, balance, blacklisted, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (address) DO UPDATE
		SET balance = $2, blacklisted = $3, updated_at = NOW()`,
		address, balance, blacklisted,
	)
	return err
}

func LoadAllWallets() (map[string]*blockchain.Wallet, error) {
	rows, err := DB.Query(`SELECT address, balance, blacklisted FROM wallets`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	wallets := make(map[string]*blockchain.Wallet)
	for rows.Next() {
		w := &blockchain.Wallet{}
		if err := rows.Scan(&w.Address, &w.Balance, &w.Blacklisted); err != nil {
			continue
		}
		wallets[w.Address] = w
	}
	return wallets, nil
}

func LoadAllBlocks() ([]*blockchain.Block, error) {
	rows, err := DB.Query(`
		SELECT idx, timestamp, prev_hash, hash, validator, nonce
		FROM blocks ORDER BY idx ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var blocks []*blockchain.Block
	for rows.Next() {
		b := &blockchain.Block{}
		if err := rows.Scan(&b.Index, &b.Timestamp, &b.PrevHash, &b.Hash, &b.Validator, &b.Nonce); err != nil {
			continue
		}
		b.Transactions = loadBlockTransactions(b.Index)
		blocks = append(blocks, b)
	}
	return blocks, nil
}

func loadBlockTransactions(blockIdx uint64) []blockchain.Transaction {
	rows, err := DB.Query(`
		SELECT tx_id, from_addr, to_addr, amount, gas_fee, tx_type, data, signature, hash, timestamp
		FROM transactions WHERE block_idx = $1`, blockIdx)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var txs []blockchain.Transaction
	for rows.Next() {
		var tx blockchain.Transaction
		rows.Scan(&tx.ID, &tx.From, &tx.To, &tx.Amount, &tx.GasFee,
			&tx.Type, &tx.Data, &tx.Signature, &tx.Hash, &tx.Timestamp)
		txs = append(txs, tx)
	}
	return txs
}

func LoadNetworkState() (*blockchain.NetworkState, error) {
	state := &blockchain.NetworkState{}
	err := DB.QueryRow(`
		SELECT locked, supply_fixed, total_supply, block_height
		FROM network_state WHERE id = 1`).
		Scan(&state.Locked, &state.SupplyFixed, &state.TotalSupply, &state.BlockHeight)
	if err != nil {
		return nil, err
	}
	return state, nil
}

func SaveNetworkState(state *blockchain.NetworkState) error {
	_, err := DB.Exec(`
		UPDATE network_state
		SET locked = $1, supply_fixed = $2, total_supply = $3, block_height = $4, updated_at = NOW()
		WHERE id = 1`,
		state.Locked, state.SupplyFixed, state.TotalSupply, state.BlockHeight,
	)
	return err
}

func SaveChatMessage(cm *blockchain.ChatMessage) error {
	_, err := DB.Exec(`
		INSERT INTO chat_messages (from_addr, username, content, tx_hash, timestamp)
		VALUES ($1, $2, $3, $4, $5)`,
		cm.From, cm.Username, cm.Content, cm.TxHash, cm.Timestamp,
	)
	return err
}

func LoadRecentChat(limit int) ([]*blockchain.ChatMessage, error) {
	rows, err := DB.Query(`
		SELECT from_addr, username, content, tx_hash, timestamp
		FROM chat_messages
		ORDER BY timestamp DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []*blockchain.ChatMessage
	for rows.Next() {
		cm := &blockchain.ChatMessage{}
		rows.Scan(&cm.From, &cm.Username, &cm.Content, &cm.TxHash, &cm.Timestamp)
		msgs = append(msgs, cm)
	}

	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func LoadRecentBlocks(limit int) ([]*blockchain.Block, error) {
	rows, err := DB.Query(`
		SELECT idx, timestamp, prev_hash, hash, validator, nonce
		FROM blocks ORDER BY idx DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var blocks []*blockchain.Block
	for rows.Next() {
		b := &blockchain.Block{}
		rows.Scan(&b.Index, &b.Timestamp, &b.PrevHash, &b.Hash, &b.Validator, &b.Nonce)
		b.Transactions = loadBlockTransactions(b.Index)
		blocks = append(blocks, b)
	}
	return blocks, nil
}

func GetWalletBalance(address string) (float64, bool, error) {
	var balance float64
	var blacklisted bool
	err := DB.QueryRow(`SELECT balance, blacklisted FROM wallets WHERE address = $1`, address).
		Scan(&balance, &blacklisted)
	if err != nil {
		return 0, false, err
	}
	return balance, blacklisted, nil
}

func BlacklistWalletDB(address string) error {
	_, err := DB.Exec(`
		UPDATE wallets SET balance = 0, blacklisted = TRUE, updated_at = NOW()
		WHERE address = $1`, address)
	return err
}

func TransferDB(from, to string, amount, gasFee float64) error {
	tx, err := DB.Begin()
	if err != nil {
		return fmt.Errorf("TX_BASLATILAMADI: %w", err)
	}
	defer tx.Rollback()

	var fromBal float64
	var fromBlacklisted bool
	err = tx.QueryRow(`SELECT balance, blacklisted FROM wallets WHERE address = $1 FOR UPDATE`, from).
		Scan(&fromBal, &fromBlacklisted)
	if err != nil {
		return fmt.Errorf("CUZDAN_YOK: Gönderici bulunamadı")
	}
	if fromBlacklisted {
		return fmt.Errorf("CUZDAN_YASAKLI: Bu cüzdan kara listede")
	}

	total := amount + gasFee
	if fromBal < total {
		return fmt.Errorf("YETERSIZ_BAKIYE: Gerekli=%.2f Mevcut=%.2f", total, fromBal)
	}

	_, err = tx.Exec(`UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE address = $2`, total, from)
	if err != nil {
		return fmt.Errorf("GONDERICI_GUNCELLENEMEDI: %w", err)
	}

	_, err = tx.Exec(`
		INSERT INTO wallets (address, balance, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (address) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()`,
		to, amount)
	if err != nil {
		return fmt.Errorf("ALICI_GUNCELLENEMEDI: %w", err)
	}

	return tx.Commit()
}

func DeductGasDB(address string, fee float64) error {
	result, err := DB.Exec(`
		UPDATE wallets SET balance = balance - $1, updated_at = NOW()
		WHERE address = $2 AND balance >= $1 AND blacklisted = FALSE`,
		fee, address)
	if err != nil {
		return fmt.Errorf("GAS_DB_HATA: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("GAS_YETERSIZ: %.2f DEM gerekli", fee)
	}
	return nil
}

func GetTotalWallets() int {
	var count int
	DB.QueryRow(`SELECT COUNT(*) FROM wallets`).Scan(&count)
	return count
}

func IsBlacklisted(address string) bool {
	var blacklisted bool
	DB.QueryRow(`SELECT blacklisted FROM wallets WHERE address = $1`, address).Scan(&blacklisted)
	return blacklisted
}

func EnsureWallet(address string) error {
	_, err := DB.Exec(`
		INSERT INTO wallets (address, balance, blacklisted)
		VALUES ($1, 0, FALSE)
		ON CONFLICT (address) DO NOTHING`, address)
	return err
}

func MintTokens(address string, amount float64, currentSupply float64, maxSupply float64) error {
	if currentSupply+amount > maxSupply {
		return fmt.Errorf("MAX_ARZ_ASIMI")
	}

	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO wallets (address, balance, blacklisted)
		VALUES ($1, $2, FALSE)
		ON CONFLICT (address) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()`,
		address, amount)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`
		UPDATE network_state SET total_supply = total_supply + $1, updated_at = NOW() WHERE id = 1`,
		amount)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func GetCurrentSupply() float64 {
	var supply float64
	DB.QueryRow(`SELECT total_supply FROM network_state WHERE id = 1`).Scan(&supply)
	return supply
}

func SetNetworkLocked(locked bool) error {
	_, err := DB.Exec(`UPDATE network_state SET locked = $1, updated_at = NOW() WHERE id = 1`, locked)
	return err
}

func SetSupplyFixed(fixed bool) error {
	_, err := DB.Exec(`UPDATE network_state SET supply_fixed = $1, updated_at = NOW() WHERE id = 1`, fixed)
	return err
}

func UpdateBlockHeight(height uint64) error {
	_, err := DB.Exec(`UPDATE network_state SET block_height = $1, updated_at = NOW() WHERE id = 1`, height)
	return err
}

func IsNetworkLocked() bool {
	var locked bool
	DB.QueryRow(`SELECT locked FROM network_state WHERE id = 1`).Scan(&locked)
	return locked
}

func IsSupplyFixed() bool {
	var fixed bool
	DB.QueryRow(`SELECT supply_fixed FROM network_state WHERE id = 1`).Scan(&fixed)
	return fixed
}

func WalletExists(address string) bool {
	var exists bool
	DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM wallets WHERE address = $1)`, address).Scan(&exists)
	return exists
}

func GetBlockCount() int64 {
	var count int64
	DB.QueryRow(`SELECT COUNT(*) FROM blocks`).Scan(&count)
	return count
}

func init() {
	_ = time.Now()
}
