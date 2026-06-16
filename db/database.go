package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func Connect() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5432")
		user := getEnv("DB_USER", "postgres")
		pass := getEnv("DB_PASS", "postgres")
		name := getEnv("DB_NAME", "demcoin")
		dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable", host, port, user, pass, name)
	}

	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("veritabanı bağlantısı açılamadı: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("veritabanına bağlanılamadı: %w", err)
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(10)

	log.Println("✅ PostgreSQL bağlantısı kuruldu")
	return nil
}

func Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS blocks (
			id          BIGSERIAL PRIMARY KEY,
			idx         BIGINT NOT NULL UNIQUE,
			timestamp   TIMESTAMPTZ NOT NULL,
			prev_hash   TEXT NOT NULL,
			hash        TEXT NOT NULL UNIQUE,
			validator   TEXT NOT NULL,
			nonce       BIGINT NOT NULL,
			created_at  TIMESTAMPTZ DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS transactions (
			id          BIGSERIAL PRIMARY KEY,
			tx_id       TEXT NOT NULL UNIQUE,
			block_idx   BIGINT REFERENCES blocks(idx) ON DELETE CASCADE,
			from_addr   TEXT NOT NULL,
			to_addr     TEXT NOT NULL,
			amount      NUMERIC(30,8) NOT NULL,
			gas_fee     NUMERIC(30,8) NOT NULL DEFAULT 0,
			tx_type     TEXT NOT NULL,
			data        TEXT DEFAULT '',
			signature   TEXT DEFAULT '',
			hash        TEXT NOT NULL,
			timestamp   TIMESTAMPTZ NOT NULL,
			created_at  TIMESTAMPTZ DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS wallets (
			address     TEXT PRIMARY KEY,
			balance     NUMERIC(30,8) NOT NULL DEFAULT 0,
			blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
			created_at  TIMESTAMPTZ DEFAULT NOW(),
			updated_at  TIMESTAMPTZ DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS chat_messages (
			id          BIGSERIAL PRIMARY KEY,
			from_addr   TEXT NOT NULL,
			username    TEXT NOT NULL,
			content     TEXT NOT NULL,
			tx_hash     TEXT NOT NULL,
			deleted     BOOLEAN NOT NULL DEFAULT FALSE,
			timestamp   TIMESTAMPTZ NOT NULL,
			created_at  TIMESTAMPTZ DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS user_restrictions (
			address     TEXT PRIMARY KEY,
			username    TEXT NOT NULL DEFAULT '',
			muted       BOOLEAN NOT NULL DEFAULT FALSE,
			trade_ban   BOOLEAN NOT NULL DEFAULT FALSE,
			updated_at  TIMESTAMPTZ DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS price_history (
			id          BIGSERIAL PRIMARY KEY,
			value       NUMERIC(30,8) NOT NULL,
			recorded_at TIMESTAMPTZ DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS network_state (
			id           INT PRIMARY KEY DEFAULT 1,
			locked       BOOLEAN NOT NULL DEFAULT FALSE,
			supply_fixed BOOLEAN NOT NULL DEFAULT FALSE,
			total_supply NUMERIC(30,8) NOT NULL DEFAULT 0,
			block_height BIGINT NOT NULL DEFAULT 0,
			updated_at   TIMESTAMPTZ DEFAULT NOW(),
			CONSTRAINT single_row CHECK (id = 1)
		)`,

		`INSERT INTO network_state (id, locked, supply_fixed, total_supply, block_height)
			VALUES (1, FALSE, FALSE, 0, 0)
			ON CONFLICT (id) DO NOTHING`,

		`CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_addr)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_addr)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_idx ON blocks(idx DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp DESC)`,
	}

	for _, q := range queries {
		if _, err := DB.Exec(q); err != nil {
			return fmt.Errorf("migrasyon hatası: %w\nQuery: %s", err, q)
		}
	}

	log.Println("✅ Veritabanı tabloları hazır")
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
