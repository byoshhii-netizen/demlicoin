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
	err := DB.QueryRow(`
		INSERT INTO chat_messages (from_addr, username, content, tx_hash, timestamp)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		cm.From, cm.Username, cm.Content, cm.TxHash, cm.Timestamp,
	).Scan(&cm.ID)
	return err
}

func LoadRecentChat(limit int) ([]*blockchain.ChatMessage, error) {
	rows, err := DB.Query(`
		SELECT id, from_addr, username, content, tx_hash, deleted, timestamp
		FROM chat_messages
		ORDER BY timestamp DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []*blockchain.ChatMessage
	for rows.Next() {
		cm := &blockchain.ChatMessage{}
		rows.Scan(&cm.ID, &cm.From, &cm.Username, &cm.Content, &cm.TxHash, &cm.Deleted, &cm.Timestamp)
		msgs = append(msgs, cm)
	}
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func DeleteChatMessage(id int64) error {
	_, err := DB.Exec(`UPDATE chat_messages SET deleted = TRUE WHERE id = $1`, id)
	return err
}

func GetUserRestriction(address string) (*blockchain.UserRestriction, error) {
	r := &blockchain.UserRestriction{Address: address}
	err := DB.QueryRow(`SELECT address, username, muted, trade_ban FROM user_restrictions WHERE address = $1`, address).
		Scan(&r.Address, &r.Username, &r.Muted, &r.TradeBan)
	if err != nil {
		return &blockchain.UserRestriction{Address: address}, nil
	}
	return r, nil
}

func SetUserRestriction(address, username string, muted, tradeBan bool) error {
	_, err := DB.Exec(`
		INSERT INTO user_restrictions (address, username, muted, trade_ban, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (address) DO UPDATE SET username = $2, muted = $3, trade_ban = $4, updated_at = NOW()`,
		address, username, muted, tradeBan)
	return err
}

func GetAllRestrictions() ([]*blockchain.UserRestriction, error) {
	rows, err := DB.Query(`SELECT address, username, muted, trade_ban FROM user_restrictions`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []*blockchain.UserRestriction
	for rows.Next() {
		r := &blockchain.UserRestriction{}
		rows.Scan(&r.Address, &r.Username, &r.Muted, &r.TradeBan)
		list = append(list, r)
	}
	return list, nil
}

func SavePricePoint(value float64) error {
	_, err := DB.Exec(`INSERT INTO price_history (value) VALUES ($1)`, value)
	return err
}

func GetPriceHistory(limit int) ([]*blockchain.PricePoint, error) {
	rows, err := DB.Query(`SELECT value, EXTRACT(EPOCH FROM recorded_at)::BIGINT FROM price_history ORDER BY recorded_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pts []*blockchain.PricePoint
	for rows.Next() {
		p := &blockchain.PricePoint{}
		rows.Scan(&p.Value, &p.Time)
		pts = append(pts, p)
	}
	for i, j := 0, len(pts)-1; i < j; i, j = i+1, j-1 {
		pts[i], pts[j] = pts[j], pts[i]
	}
	return pts, nil
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

func GetTopList(limit int) ([]map[string]interface{}, error) {
	rows, err := DB.Query(`
		SELECT address, balance FROM wallets
		WHERE blacklisted = FALSE AND address NOT LIKE 'DEM_BOT_%'
		ORDER BY balance DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var addr string
		var bal float64
		rows.Scan(&addr, &bal)
		end := len(addr)
		if end > 9 {
			end = 9
		}
		list = append(list, map[string]interface{}{
			"address":  addr,
			"username": "@Dem_" + addr[3:end],
			"balance":  bal,
		})
	}
	return list, nil
}

func GetAllWalletsAdmin() ([]map[string]interface{}, error) {
	rows, err := DB.Query(`
		SELECT w.address, w.balance, w.blacklisted,
		       COALESCE(r.username, ''), COALESCE(r.muted, FALSE), COALESCE(r.trade_ban, FALSE)
		FROM wallets w
		LEFT JOIN user_restrictions r ON w.address = r.address
		ORDER BY w.balance DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var addr, username string
		var bal float64
		var blacklisted, muted, tradeBan bool
		rows.Scan(&addr, &bal, &blacklisted, &username, &muted, &tradeBan)
		if username == "" {
			if len(addr) >= 9 {
				username = "@Dem_" + addr[3:9]
			} else {
				username = "@Dem_" + addr[3:]
			}
		}
		list = append(list, map[string]interface{}{
			"address":     addr,
			"username":    username,
			"balance":     bal,
			"blacklisted": blacklisted,
			"muted":       muted,
			"trade_ban":   tradeBan,
		})
	}
	return list, nil
}

func GetRecentTrades(limit int) ([]map[string]interface{}, error) {
	rows, err := DB.Query(`
		SELECT from_addr, to_addr, amount, gas_fee, tx_type, hash, timestamp
		FROM transactions
		ORDER BY timestamp DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var from, to, txType, hash string
		var amount, gasFee float64
		var ts time.Time
		rows.Scan(&from, &to, &amount, &gasFee, &txType, &hash, &ts)
		fromEnd := len(from)
		if fromEnd > 9 {
			fromEnd = 9
		}
		toEnd := len(to)
		if toEnd > 9 {
			toEnd = 9
		}
		fromUser := "@Dem_" + from[3:fromEnd]
		toUser := "@Dem_" + to[3:toEnd]
		list = append(list, map[string]interface{}{
			"from":   fromUser,
			"to":     toUser,
			"amount": amount,
			"type":   txType,
			"hash":   hash,
			"time":   ts,
		})
	}
	return list, nil
}

func init() {
	_ = time.Now()
}

// ─── IP Kayıt Sistemi ───────────────────────────────────────────────────────

// Bir IP adresinden kaç cüzdan kayıt edildiğini döner
func GetIPWalletCount(ip string) (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM wallet_registrations WHERE ip_address = $1`, ip).Scan(&count)
	return count, err
}

// IP + cüzdan kaydını kaydeder
func RegisterWalletIP(address, ip string) error {
	_, err := DB.Exec(`
		INSERT INTO wallet_registrations (address, ip_address)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, address, ip)
	return err
}

// Admin için tüm IP kayıtlarını döner
func GetAllIPRegistrations() ([]map[string]interface{}, error) {
	rows, err := DB.Query(`
		SELECT r.address, r.ip_address, r.registered_at,
		       COALESCE(w.balance, 0) as balance
		FROM wallet_registrations r
		LEFT JOIN wallets w ON r.address = w.address
		ORDER BY r.registered_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var addr, ip string
		var bal float64
		var regAt time.Time
		rows.Scan(&addr, &ip, &regAt, &bal)
		list = append(list, map[string]interface{}{
			"address":       addr,
			"ip_address":    ip,
			"registered_at": regAt,
			"balance":       bal,
		})
	}
	return list, nil
}

// Belirli bir IP'nin kayıtlı cüzdanlarını döner
func GetWalletsByIP(ip string) ([]string, error) {
	rows, err := DB.Query(`SELECT address FROM wallet_registrations WHERE ip_address = $1`, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var addrs []string
	for rows.Next() {
		var addr string
		rows.Scan(&addr)
		addrs = append(addrs, addr)
	}
	return addrs, nil
}

// ─── Davet (Referral) Sistemi ────────────────────────────────────────────────

// Davet kodu geçerli mi? (referrer'ın adresi olarak kullanılır)
func IsValidReferralCode(code string) bool {
	if code == "" {
		return false
	}
	return WalletExists(code)
}

// Davet kaydı oluştur
func CreateReferral(referrerAddr, invitedAddr string) error {
	// Zaten davet edilmiş mi kontrol et
	var count int
	DB.QueryRow(`SELECT COUNT(*) FROM referrals WHERE invited_addr = $1`, invitedAddr).Scan(&count)
	if count > 0 {
		return nil // zaten kayıtlı, hata döndürme
	}
	_, err := DB.Exec(`
		INSERT INTO referrals (referrer_addr, invited_addr)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, referrerAddr, invitedAddr)
	if err != nil {
		return err
	}
	// Referrer'ın davet görev ilerlemesini güncelle
	go updateInviteQuestProgress(referrerAddr)
	return nil
}

// Bir adresin davet sayısını döner
func GetReferralCount(address string) (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM referrals WHERE referrer_addr = $1`, address).Scan(&count)
	return count, err
}

// Kimin tarafından davet edildiğini döner
func GetReferrerOf(address string) (string, error) {
	var referrer string
	err := DB.QueryRow(`SELECT referrer_addr FROM referrals WHERE invited_addr = $1`, address).Scan(&referrer)
	return referrer, err
}

// ─── Görev Sistemi ───────────────────────────────────────────────────────────

type QuestDefinition struct {
	ID          int64   `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	QuestType   string  `json:"quest_type"`
	TargetCount int     `json:"target_count"`
	RewardDEM   float64 `json:"reward_dem"`
	Active      bool    `json:"active"`
}

type QuestProgress struct {
	QuestID     int64   `json:"quest_id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	QuestType   string  `json:"quest_type"`
	TargetCount int     `json:"target_count"`
	RewardDEM   float64 `json:"reward_dem"`
	Progress    int     `json:"progress"`
	Completed   bool    `json:"completed"`
	Rewarded    bool    `json:"rewarded"`
}

func GetAllQuests() ([]*QuestDefinition, error) {
	rows, err := DB.Query(`
		SELECT id, title, description, quest_type, target_count, reward_dem, active
		FROM quest_definitions ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []*QuestDefinition
	for rows.Next() {
		q := &QuestDefinition{}
		rows.Scan(&q.ID, &q.Title, &q.Description, &q.QuestType, &q.TargetCount, &q.RewardDEM, &q.Active)
		list = append(list, q)
	}
	return list, nil
}

func GetActiveQuests() ([]*QuestDefinition, error) {
	rows, err := DB.Query(`
		SELECT id, title, description, quest_type, target_count, reward_dem, active
		FROM quest_definitions WHERE active = TRUE ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []*QuestDefinition
	for rows.Next() {
		q := &QuestDefinition{}
		rows.Scan(&q.ID, &q.Title, &q.Description, &q.QuestType, &q.TargetCount, &q.RewardDEM, &q.Active)
		list = append(list, q)
	}
	return list, nil
}

func CreateQuest(title, description, questType string, targetCount int, rewardDEM float64) (*QuestDefinition, error) {
	q := &QuestDefinition{}
	err := DB.QueryRow(`
		INSERT INTO quest_definitions (title, description, quest_type, target_count, reward_dem)
		VALUES ($1, $2, $3, $4, $5) RETURNING id, title, description, quest_type, target_count, reward_dem, active`,
		title, description, questType, targetCount, rewardDEM,
	).Scan(&q.ID, &q.Title, &q.Description, &q.QuestType, &q.TargetCount, &q.RewardDEM, &q.Active)
	return q, err
}

func UpdateQuest(id int64, title, description string, targetCount int, rewardDEM float64, active bool) error {
	_, err := DB.Exec(`
		UPDATE quest_definitions
		SET title=$2, description=$3, target_count=$4, reward_dem=$5, active=$6
		WHERE id=$1`,
		id, title, description, targetCount, rewardDEM, active)
	return err
}

func DeleteQuest(id int64) error {
	_, err := DB.Exec(`DELETE FROM quest_definitions WHERE id = $1`, id)
	return err
}

func GetUserQuestProgress(address string) ([]*QuestProgress, error) {
	rows, err := DB.Query(`
		SELECT qd.id, qd.title, qd.description, qd.quest_type, qd.target_count, qd.reward_dem,
		       COALESCE(qp.progress, 0), COALESCE(qp.completed, FALSE), COALESCE(qp.rewarded, FALSE)
		FROM quest_definitions qd
		LEFT JOIN quest_progress qp ON qd.id = qp.quest_id AND qp.address = $1
		WHERE qd.active = TRUE
		ORDER BY qd.id ASC`, address)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []*QuestProgress
	for rows.Next() {
		qp := &QuestProgress{}
		rows.Scan(&qp.QuestID, &qp.Title, &qp.Description, &qp.QuestType,
			&qp.TargetCount, &qp.RewardDEM, &qp.Progress, &qp.Completed, &qp.Rewarded)
		list = append(list, qp)
	}
	return list, nil
}

// Görev ilerlemesini günceller; tamamlandıysa ödülü bekler (claim ile alınır)
func UpdateQuestProgress(address string, questID int64, newProgress int) error {
	var targetCount int
	err := DB.QueryRow(`SELECT target_count FROM quest_definitions WHERE id = $1`, questID).Scan(&targetCount)
	if err != nil {
		return err
	}
	completed := newProgress >= targetCount
	var completedAt interface{}
	if completed {
		completedAt = time.Now()
	}
	_, err = DB.Exec(`
		INSERT INTO quest_progress (address, quest_id, progress, completed, completed_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (address, quest_id) DO UPDATE
		SET progress = GREATEST(quest_progress.progress, $3),
		    completed = (GREATEST(quest_progress.progress, $3) >= $6),
		    completed_at = CASE WHEN quest_progress.completed = FALSE AND (GREATEST(quest_progress.progress, $3) >= $6) THEN NOW() ELSE quest_progress.completed_at END`,
		address, questID, newProgress, completed, completedAt, targetCount)
	return err
}

// Ödül al (claim)
func ClaimQuestReward(address string, questID int64) (float64, error) {
	tx, err := DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var rewardDEM float64
	var completed, rewarded bool
	err = tx.QueryRow(`
		SELECT qd.reward_dem, qp.completed, qp.rewarded
		FROM quest_progress qp
		JOIN quest_definitions qd ON qd.id = qp.quest_id
		WHERE qp.address = $1 AND qp.quest_id = $2
		FOR UPDATE`, address, questID).
		Scan(&rewardDEM, &completed, &rewarded)
	if err != nil {
		return 0, fmt.Errorf("görev bulunamadı")
	}
	if !completed {
		return 0, fmt.Errorf("görev henüz tamamlanmadı")
	}
	if rewarded {
		return 0, fmt.Errorf("ödül zaten alındı")
	}

	// Ödülü işaretle
	_, err = tx.Exec(`UPDATE quest_progress SET rewarded = TRUE WHERE address = $1 AND quest_id = $2`, address, questID)
	if err != nil {
		return 0, err
	}

	// Bakiyeye ekle
	_, err = tx.Exec(`
		INSERT INTO wallets (address, balance) VALUES ($1, $2)
		ON CONFLICT (address) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()`,
		address, rewardDEM)
	if err != nil {
		return 0, err
	}

	return rewardDEM, tx.Commit()
}

// Davet görev ilerlemesini günceller (referral oluşturulduğunda çağrılır)
func updateInviteQuestProgress(referrerAddr string) {
	count, err := GetReferralCount(referrerAddr)
	if err != nil {
		return
	}
	// Tüm invite görevlerini bul ve güncelle
	rows, err := DB.Query(`SELECT id FROM quest_definitions WHERE quest_type = 'invite' AND active = TRUE`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var questID int64
		rows.Scan(&questID)
		UpdateQuestProgress(referrerAddr, questID, count)
	}
}
