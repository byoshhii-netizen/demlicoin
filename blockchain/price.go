package blockchain

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

type PriceEngine struct {
	mu       sync.RWMutex
	current  float64
	momentum float64
	history  []PricePoint
	maxHist  int
	onUpdate func(float64, []PricePoint)
}

func NewPriceEngine(start float64, onUpdate func(float64, []PricePoint)) *PriceEngine {
	pe := &PriceEngine{
		current:  start,
		momentum: 0,
		history:  make([]PricePoint, 0, 120),
		maxHist:  120,
		onUpdate: onUpdate,
	}
	pe.history = append(pe.history, PricePoint{Value: start, Time: time.Now().UnixMilli()})
	return pe
}

func (pe *PriceEngine) Start() {
	go pe.loop()
}

func (pe *PriceEngine) loop() {
	for {
		time.Sleep(3 * time.Second)
		pe.step()
	}
}

func (pe *PriceEngine) step() {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	minVal := 0.001
	maxVal := 100.0
	aralik := maxVal - minVal

	pozisyon := (pe.current - minVal) / aralik
	pozisyonBaskisi := (pozisyon - 0.5) * 0.3
	artmaOrani := 0.52
	efektif := math.Max(0.2, math.Min(0.8, artmaOrani-pozisyonBaskisi))

	yukari := rand.Float64() < efektif
	degisimOrani := math.Pow(rand.Float64(), 1.5)
	maxDegisim := pe.current * 0.04
	degisim := degisimOrani * maxDegisim

	pe.momentum = pe.momentum*0.65 + func() float64 {
		if yukari {
			return degisim * 0.35
		}
		return -degisim * 0.35
	}()

	delta := degisim
	if !yukari {
		delta = -degisim
	}
	pe.current += delta + pe.momentum*0.4

	if pe.current < minVal {
		pe.current = minVal + math.Abs(pe.current-minVal)*0.3
		pe.momentum = math.Abs(pe.momentum) * 0.5
	}
	if pe.current > maxVal {
		pe.current = maxVal - math.Abs(pe.current-maxVal)*0.3
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
