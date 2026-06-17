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

		`CREATE TABLE IF NOT EXISTS site_content (
			key         TEXT PRIMARY KEY,
			value       TEXT NOT NULL,
			updated_at  TIMESTAMPTZ DEFAULT NOW()
		)`,

		`INSERT INTO site_content (key, value) VALUES
			('about_title', 'Biz Kimiz?'),
			('about_body', 'Biz DemliCoin ekibi olarak çay içmeyi seviyor ve coin piyasasına rakip olarak gelmeyi hedefliyoruz. Sanılanın aksine bir meme coin değil başlı başına bir coin olmayı hedefliyoruz.'),
			('about_mission', 'Misyonumuz: Güvenli, hızlı ve herkesin kullanabileceği bir blockchain altyapısı kurmak.'),
			('about_vision', 'Vizyonumuz: DemCoin''i global ölçekte tanınan, gerçek değer yaratan bir dijital para birimi haline getirmek.')
		ON CONFLICT (key) DO NOTHING`,

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

		`CREATE TABLE IF NOT EXISTS price_history (
			id          BIGSERIAL PRIMARY KEY,
			value       NUMERIC(30,8) NOT NULL,
			recorded_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_addr)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_idx ON blocks(idx DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp DESC)`,

		// IP kayıt tablosu: bir IP'den max 3 cüzdan
		`CREATE TABLE IF NOT EXISTS wallet_registrations (
			id          BIGSERIAL PRIMARY KEY,
			address     TEXT NOT NULL,
			ip_address  TEXT NOT NULL,
			registered_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_ip ON wallet_registrations(ip_address)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_address ON wallet_registrations(address)`,

		// Davet sistemi
		`CREATE TABLE IF NOT EXISTS referrals (
			id            BIGSERIAL PRIMARY KEY,
			referrer_addr TEXT NOT NULL,
			invited_addr  TEXT NOT NULL,
			created_at    TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals(referrer_addr)`,

		// Görev tanımları (admin tarafından oluşturulur)
		`CREATE TABLE IF NOT EXISTS quest_definitions (
			id           BIGSERIAL PRIMARY KEY,
			title        TEXT NOT NULL,
			description  TEXT NOT NULL,
			quest_type   TEXT NOT NULL,
			target_count INT NOT NULL DEFAULT 1,
			reward_dem   NUMERIC(30,8) NOT NULL DEFAULT 0,
			active       BOOLEAN NOT NULL DEFAULT TRUE,
			created_at   TIMESTAMPTZ DEFAULT NOW()
		)`,

		// Kullanıcı görev ilerlemesi
		`CREATE TABLE IF NOT EXISTS quest_progress (
			id           BIGSERIAL PRIMARY KEY,
			address      TEXT NOT NULL,
			quest_id     BIGINT REFERENCES quest_definitions(id) ON DELETE CASCADE,
			progress     INT NOT NULL DEFAULT 0,
			completed    BOOLEAN NOT NULL DEFAULT FALSE,
			rewarded     BOOLEAN NOT NULL DEFAULT FALSE,
			completed_at TIMESTAMPTZ,
			UNIQUE(address, quest_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_qp_address ON quest_progress(address)`,

		// Varsayılan görevler
		`INSERT INTO quest_definitions (title, description, quest_type, target_count, reward_dem) VALUES
			('İlk Davet', '1 kişiyi DemCoin''e davet et', 'invite', 1, 1),
			('Davet Ustası', '5 kişiyi DemCoin''e davet et', 'invite', 5, 5),
			('Sosyal Kelebek', '10 kişiyi DemCoin''e davet et', 'invite', 10, 15)
		ON CONFLICT DO NOTHING`,
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
