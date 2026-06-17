package blockchain

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

var BOT_ISIMLER = []string{
	"@Dem_Wolf", "@Dem_Kara", "@Dem_Aslan", "@Dem_Gece",
	"@Dem_Fırtına", "@Dem_Yıldız", "@Dem_Ateş", "@Dem_Demir",
	"@Dem_Bulut", "@Dem_Taş", "@Dem_Deniz", "@Dem_Rüzgar",
	"@Dem_Şimşek", "@Dem_Kartal", "@Dem_Kurt", "@Dem_Bora",
}

var BOT_MESAJLAR_YUKARI = []string{
	"grafik uçuyor la, girin",
	"yukari gidiyor kesin al",
	"bu momentum devam eder",
	"gir gir bekleyenler pişman olur",
	"al pozisyon dur durma",
}

var BOT_MESAJLAR_ASAGI = []string{
	"dip mi oluyor bekle",
	"dur bir bakim, dipten mi alim",
	"biraz daha dusun sonra girerim",
	"strateji: bekle fiyat oturs",
	"paniklemiyorum ama dikkat",
}

var BOT_MESAJLAR_NOTR = []string{
	"yatay gidiyor, bekliyorum",
	"konsolidasyon süreci bu",
	"sabir, zaman gelince girecegim",
	"gözlüyorum henüz girmiyorum",
	"strateji: bekle firsat çik",
}

type BotEngine struct {
	mu     sync.Mutex
	chain  *Chain
	hub    interface {
		BroadcastChat(cm *ChatMessage)
	}
	price  *PriceEngine
	active bool
	stopCh chan struct{}
}

func NewBotEngine(chain *Chain, hub interface{ BroadcastChat(cm *ChatMessage) }, price *PriceEngine) *BotEngine {
	return &BotEngine{chain: chain, hub: hub, price: price, stopCh: make(chan struct{})}
}

func (b *BotEngine) Start() {
	b.mu.Lock()
	b.active = true
	b.mu.Unlock()
	go b.loop()
}

func (b *BotEngine) Stop() {
	b.mu.Lock()
	b.active = false
	b.mu.Unlock()
}

func (b *BotEngine) loop() {
	for {
		select {
		case <-b.stopCh:
			return
		case <-time.After(time.Duration(15+rand.Intn(45)) * time.Second):
			b.mu.Lock()
			active := b.active
			b.mu.Unlock()
			if active {
				b.sendBotMessage()
				if rand.Float64() < 0.3 {
					b.doBotTrade()
				}
			}
		}
	}
}

func (b *BotEngine) sendBotMessage() {
	botIdx := rand.Intn(len(BOT_ISIMLER))
	botName := BOT_ISIMLER[botIdx]
	botAddr := fmt.Sprintf("DEM_BOT_%03d", botIdx)

	var msgs []string
	price := b.price.GetCurrent()
	hist := b.price.GetHistory()
	if len(hist) >= 5 {
		prev := hist[len(hist)-5].Value
		if price > prev*1.005 {
			msgs = BOT_MESAJLAR_YUKARI
		} else if price < prev*0.995 {
			msgs = BOT_MESAJLAR_ASAGI
		} else {
			msgs = BOT_MESAJLAR_NOTR
		}
	} else {
		msgs = BOT_MESAJLAR_NOTR
	}

	content := msgs[rand.Intn(len(msgs))]
	cm := &ChatMessage{
		From:      botAddr,
		Username:  botName,
		Content:   content,
		Timestamp: time.Now(),
		TxHash:    fmt.Sprintf("0xbot%08x", rand.Uint32()),
	}
	b.hub.BroadcastChat(cm)
}

func (b *BotEngine) doBotTrade() {
	amount := float64(50 + rand.Intn(200))
	direction := rand.Float64() > 0.5

	hist := b.price.GetHistory()
	if len(hist) < 2 {
		return
	}

	var impact float64
	if direction {
		impact = amount * 0.0001
	} else {
		impact = -amount * 0.00008
	}

	b.price.ApplyImpact(impact)
}
