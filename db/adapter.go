package db

import "demcoin/blockchain"

type StoreAdapter struct{}

func NewStoreAdapter() *StoreAdapter { return &StoreAdapter{} }

func (s *StoreAdapter) SaveBlock(b *blockchain.Block) error              { return SaveBlock(b) }
func (s *StoreAdapter) SaveWallet(a string, bal float64, bl bool) error { return SaveWallet(a, bal, bl) }
func (s *StoreAdapter) LoadAllWallets() (map[string]*blockchain.Wallet, error) {
	return LoadAllWallets()
}
func (s *StoreAdapter) LoadAllBlocks() ([]*blockchain.Block, error)   { return LoadAllBlocks() }
func (s *StoreAdapter) LoadNetworkState() (*blockchain.NetworkState, error) {
	return LoadNetworkState()
}
func (s *StoreAdapter) SaveNetworkState(state *blockchain.NetworkState) error {
	return SaveNetworkState(state)
}
func (s *StoreAdapter) SaveChatMessage(cm *blockchain.ChatMessage) error { return SaveChatMessage(cm) }
func (s *StoreAdapter) LoadRecentChat(limit int) ([]*blockchain.ChatMessage, error) {
	return LoadRecentChat(limit)
}
func (s *StoreAdapter) LoadRecentBlocks(limit int) ([]*blockchain.Block, error) {
	return LoadRecentBlocks(limit)
}
func (s *StoreAdapter) GetWalletBalance(address string) (float64, bool, error) {
	return GetWalletBalance(address)
}
func (s *StoreAdapter) BlacklistWalletDB(address string) error           { return BlacklistWalletDB(address) }
func (s *StoreAdapter) TransferDB(f, t string, a, g float64) error       { return TransferDB(f, t, a, g) }
func (s *StoreAdapter) DeductGasDB(address string, fee float64) error    { return DeductGasDB(address, fee) }
func (s *StoreAdapter) GetTotalWallets() int                              { return GetTotalWallets() }
func (s *StoreAdapter) IsBlacklisted(address string) bool                { return IsBlacklisted(address) }
func (s *StoreAdapter) EnsureWallet(address string) error                { return EnsureWallet(address) }
func (s *StoreAdapter) MintTokens(a string, amt, cur, max float64) error {
	return MintTokens(a, amt, cur, max)
}
func (s *StoreAdapter) GetCurrentSupply() float64                    { return GetCurrentSupply() }
func (s *StoreAdapter) SetNetworkLocked(locked bool) error           { return SetNetworkLocked(locked) }
func (s *StoreAdapter) SetSupplyFixed(fixed bool) error              { return SetSupplyFixed(fixed) }
func (s *StoreAdapter) UpdateBlockHeight(height uint64) error        { return UpdateBlockHeight(height) }
func (s *StoreAdapter) IsNetworkLocked() bool                        { return IsNetworkLocked() }
func (s *StoreAdapter) IsSupplyFixed() bool                          { return IsSupplyFixed() }
func (s *StoreAdapter) WalletExists(address string) bool             { return WalletExists(address) }
func (s *StoreAdapter) GetBlockCount() int64                         { return GetBlockCount() }
func (s *StoreAdapter) DeleteChatMessage(id int64) error             { return DeleteChatMessage(id) }
func (s *StoreAdapter) GetUserRestriction(addr string) (*blockchain.UserRestriction, error) {
	return GetUserRestriction(addr)
}
func (s *StoreAdapter) SetUserRestriction(addr, username string, muted, tradeBan bool) error {
	return SetUserRestriction(addr, username, muted, tradeBan)
}
func (s *StoreAdapter) GetAllRestrictions() ([]*blockchain.UserRestriction, error) {
	return GetAllRestrictions()
}
func (s *StoreAdapter) SavePricePoint(value float64) error { return SavePricePoint(value) }
func (s *StoreAdapter) GetPriceHistory(limit int) ([]*blockchain.PricePoint, error) {
	return GetPriceHistory(limit)
}
