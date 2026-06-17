package blockchain

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

type PriceSettings struct {
	ArtmaOrani   float64 `json:"artma_orani"`
	MaxDegisim   float64 `json:"max_degisim"`
	GuncelleSure int     `json:"guncelleme_suresi"`
	MinDeger     float64 `json:"min_deger"`
	MaxDeger     float64 `json:"max_deger"`
}

type PriceEngine struct {
	mu       sync.RWMutex
	current  float64
	momentum float64
	history  []PricePoint
	maxHist  int
	settings PriceSettings
	onUpdate func(float64, []PricePoint)
	stopCh   chan struct{}
}

func NewPriceEngine(start float64, onUpdate func(float64, []PricePoint)) *PriceEngine {
	pe := &PriceEngine{
		current:  start,
		momentum: 0,
		history:  make([]PricePoint, 0, 120),
		maxHist:  120,
		settings: PriceSettings{
			ArtmaOrani:   0.52,
			MaxDegisim:   4.0,
			GuncelleSure: 3000,
			MinDeger:     0.001,
			MaxDeger:     100.0,
		},
		onUpdate: onUpdate,
		stopCh:   make(chan struct{}),
	}
	pe.history = append(pe.history, PricePoint{Value: start, Time: time.Now().UnixMilli()})
	return pe
}

func (pe *PriceEngine) Start() {
	go pe.loop()
}

func (pe *PriceEngine) loop() {
	for {
		pe.mu.RLock()
		ms := pe.settings.GuncelleSure
		pe.mu.RUnlock()

		select {
		case <-pe.stopCh:
			return
		case <-time.After(time.Duration(ms) * time.Millisecond):
			pe.step()
		}
	}
}

func (pe *PriceEngine) step() {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	s := pe.settings
	aralik := s.MaxDeger - s.MinDeger
	if aralik <= 0 {
		aralik = 1
	}

	pozisyon := (pe.current - s.MinDeger) / aralik
	pozisyonBaskisi := (pozisyon - 0.5) * 0.3
	efektif := math.Max(0.1, math.Min(0.9, s.ArtmaOrani/100.0-pozisyonBaskisi))

	yukari := rand.Float64() < efektif
	degisimOrani := math.Pow(rand.Float64(), 1.5)
	maxD := pe.current * (s.MaxDegisim / 100.0)
	degisim := degisimOrani * maxD

	if yukari {
		pe.momentum = pe.momentum*0.65 + degisim*0.35
	} else {
		pe.momentum = pe.momentum*0.65 - degisim*0.35
	}

	delta := degisim
	if !yukari {
		delta = -degisim
	}
	pe.current += delta + pe.momentum*0.4

	if pe.current < s.MinDeger {
		pe.current = s.MinDeger + math.Abs(pe.current-s.MinDeger)*0.3
		pe.momentum = math.Abs(pe.momentum) * 0.5
	}
	if pe.current > s.MaxDeger {
		pe.current = s.MaxDeger - math.Abs(pe.current-s.MaxDeger)*0.3
		pe.momentum = -math.Abs(pe.momentum) * 0.5
	}

	pe.current = math.Round(pe.current*10000) / 10000

	pt := PricePoint{Value: pe.current, Time: time.Now().UnixMilli()}
	pe.history = append(pe.history, pt)
	if len(pe.history) > pe.maxHist {
		pe.history = pe.history[len(pe.history)-pe.maxHist:]
	}

	hist := make([]PricePoint, len(pe.history))
	copy(hist, pe.history)

	if pe.onUpdate != nil {
		go pe.onUpdate(pe.current, hist)
	}
}

func (pe *PriceEngine) GetCurrent() float64 {
	pe.mu.RLock()
	defer pe.mu.RUnlock()
	return pe.current
}

func (pe *PriceEngine) GetHistory() []PricePoint {
	pe.mu.RLock()
	defer pe.mu.RUnlock()
	hist := make([]PricePoint, len(pe.history))
	copy(hist, pe.history)
	return hist
}

func (pe *PriceEngine) GetSettings() PriceSettings {
	pe.mu.RLock()
	defer pe.mu.RUnlock()
	return pe.settings
}

func (pe *PriceEngine) UpdateSettings(s PriceSettings) {
	pe.mu.Lock()
	defer pe.mu.Unlock()
	if s.ArtmaOrani > 0 {
		pe.settings.ArtmaOrani = s.ArtmaOrani
	}
	if s.MaxDegisim > 0 {
		pe.settings.MaxDegisim = s.MaxDegisim
	}
	if s.GuncelleSure >= 500 {
		pe.settings.GuncelleSure = s.GuncelleSure
	}
	if s.MinDeger > 0 {
		pe.settings.MinDeger = s.MinDeger
	}
	if s.MaxDeger > s.MinDeger {
		pe.settings.MaxDeger = s.MaxDeger
	}
}

func (pe *PriceEngine) SetPrice(price float64) {
	pe.mu.Lock()
	defer pe.mu.Unlock()
	pe.current = price
	pe.momentum = 0
	pt := PricePoint{Value: price, Time: time.Now().UnixMilli()}
	pe.history = append(pe.history, pt)
	if len(pe.history) > pe.maxHist {
		pe.history = pe.history[len(pe.history)-pe.maxHist:]
	}
}

func (pe *PriceEngine) ApplyImpact(delta float64) {
	pe.mu.Lock()
	defer pe.mu.Unlock()
	pe.current += delta
	if pe.current < pe.settings.MinDeger {
		pe.current = pe.settings.MinDeger
	}
	if pe.current > pe.settings.MaxDeger {
		pe.current = pe.settings.MaxDeger
	}
	pe.current = math.Round(pe.current*10000) / 10000
}
