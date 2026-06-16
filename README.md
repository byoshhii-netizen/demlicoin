# DEM COIN — Layer 1 Blockchain

Sıfırdan Go ile yazılmış, güvenli, siberpunk arayüzlü Layer 1 blockchain.

## Başlatma

```bash
# Bağımlılıkları indir
go mod tidy

# Sunucuyu başlat
go run .
```

Veya Windows'ta `start.bat` dosyasını çalıştır.

Tarayıcıdan aç: **http://localhost:8080**

## Güvenlik Mimarisi

| Tehdit | Koruma |
|---|---|
| %51 Saldırısı | Sadece kurucu onaylı validatorlar blok basabilir |
| Sybil Saldırısı | Yabancı düğümlerin ağda söz hakkı yok |
| Race Condition | sync.RWMutex ile cüzdan kilitleme |
| Double Spending | Transfer atomik kilit altında işlenir |
| Spam/Bot | Gas fee sistemi (Chat: 1 DEM, Transfer: 5 DEM) |
| Sahte İmza | ECDSA P-256 imza doğrulama |

## Türkçe Yönetim Konsolu

| Komut | Açıklama |
|---|---|
| `AgiKilitle` | Tüm transferleri ve chat'i dondurur |
| `AgiAc` | Ağ kilidini açar |
| `CuzdanYasakla(adres)` | Cüzdanı kara listeye alır, bakiyeyi dondurur |
| `ArzSabitle` | 50.000.000 DEM arzını kalıcı olarak kilitler |
| `TokenBas` | Belirtilen adrese token basar |
| `ValidatorEkle` | Yeni validator onaylar |

## Ortam Değişkenleri

```
DEMCOIN_FOUNDER_KEY=<hex_private_key>   # Kurucu özel anahtarı
PORT=8080                                # Sunucu portu
```
