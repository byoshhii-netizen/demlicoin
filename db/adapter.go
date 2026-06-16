package db

import "demcoin/blockchain"

type StoreAdapter struct{}

func NewStoreAdapter() *StoreAdapter {
	return &StoreAdapter{}
}

func (s *StoreAdapter) SaveBlock(b *blockchain.Block) error {
	return SaveBlock(b)
}

func (s *StoreAdapter) SaveWallet(address string, balance float64, blacklisted bool) error {
	return SaveWallet(address, balance, blacklisted)
}

func (s *StoreAdapter) LoadAllWallets() (map[string]*blockchain.Wallet, error) {
	return LoadAllWallets()
}

func (s *StoreAdapter) LoadAllBlocks() ([]*blockchain.Block, error) {
	return LoadAllBlocks()
}

func (s *StoreAdapter) LoadNetworkState() (*blockchain.NetworkState, error) {
	return LoadNetworkState()
}

func (s *StoreAdapter) SaveNetworkState(state *blockchain.NetworkState) error {
	return SaveNetworkState(state)
}

func (s *StoreAdapter) SaveChatMessage(cm *blockchain.ChatMessage) error {
	return SaveChatMessage(cm)
}

func (s *StoreAdapter) LoadRecentChat(limit int) ([]*blockchain.ChatMessage, error) {
	return LoadRecentChat(limit)
}

func (s *StoreAdapter) LoadRecentBlocks(limit int) ([]*blockchain.Block, error) {
	return LoadRecentBlocks(limit)
}

func (s *StoreAdapter) GetWalletBalance(address string) (float64, bool, error) {
	return GetWalletBalance(address)
}

func (s *StoreAdapter) BlacklistWalletDB(address string) error {
	return BlacklistWalletDB(address)
}

func (s *StoreAdapter) TransferDB(from, to string, amount, gasFee float64) error {
	return TransferDB(from, to, amount, gasFee)
}

func (s *StoreAdapter) DeductGasDB(address string, fee float64) error {
	return DeductGasDB(address, fee)
}

func (s *StoreAdapter) GetTotalWallets() int {
	return GetTotalWallets()
}

func (s *StoreAdapter) IsBlacklisted(address string) bool {
	return IsBlacklisted(address)
}

func (s *StoreAdapter) EnsureWallet(address string) error {
	return EnsureWallet(address)
}

func (s *StoreAdapter) MintTokens(address string, amount float64, currentSupply float64, maxSupply float64) error {
	return MintTokens(address, amount, currentSupply, maxSupply)
}

func (s *StoreAdapter) GetCurrentSupply() float64 {
	return GetCurrentSupply()
}

func (s *StoreAdapter) SetNetworkLocked(locked bool) error {
	return SetNetworkLocked(locked)
}

func (s *StoreAdapter) SetSupplyFixed(fixed bool) error {
	return SetSupplyFixed(fixed)
}

func (s *StoreAdapter) UpdateBlockHeight(height uint64) error {
	return UpdateBlockHeight(height)
}

func (s *StoreAdapter) IsNetworkLocked() bool {
	return IsNetworkLocked()
}

func (s *StoreAdapter) IsSupplyFixed() bool {
	return IsSupplyFixed()
}

func (s *StoreAdapter) WalletExists(address string) bool {
	return WalletExists(address)
}

func (s *StoreAdapter) GetBlockCount() int64 {
	return GetBlockCount()
}
