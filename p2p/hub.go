package p2p

import (
	"demcoin/blockchain"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	conn    *websocket.Conn
	Address string
	send    chan []byte
	hub     *Hub
}

type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type ChatStore interface {
	SaveChatMessage(cm *blockchain.ChatMessage) error
	LoadRecentChat(limit int) ([]*blockchain.ChatMessage, error)
	DeleteChatMessage(id int64) error
	GetUserRestriction(addr string) (*blockchain.UserRestriction, error)
	SetUserRestriction(addr, username string, muted, tradeBan bool) error
	GetAllRestrictions() ([]*blockchain.UserRestriction, error)
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	chain      *blockchain.Chain
	mu         sync.RWMutex
	Messages   []*blockchain.ChatMessage
	store      ChatStore
}

func NewHub(chain *blockchain.Chain, store ChatStore) *Hub {
	h := &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		chain:      chain,
		Messages:   make([]*blockchain.ChatMessage, 0),
		store:      store,
	}

	if store != nil {
		if msgs, err := store.LoadRecentChat(200); err == nil {
			h.Messages = msgs
		}
	}

	return h
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			h.sendStateToClient(client)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- msg:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) sendStateToClient(c *Client) {
	state := Message{
		Type: "STATE",
		Payload: map[string]interface{}{
			"network": h.chain.State,
			"balance": h.chain.GetBalance(c.Address),
		},
	}
	data, _ := json.Marshal(state)
	select {
	case c.send <- data:
	default:
	}
}

func (h *Hub) BroadcastBlock(b *blockchain.Block) {
	msg := Message{Type: "NEW_BLOCK", Payload: b}
	data, _ := json.Marshal(msg)
	h.broadcast <- data
}

func (h *Hub) BroadcastChat(cm *blockchain.ChatMessage) {
	h.mu.Lock()
	h.Messages = append(h.Messages, cm)
	if len(h.Messages) > 500 {
		h.Messages = h.Messages[len(h.Messages)-500:]
	}
	h.mu.Unlock()

	if h.store != nil {
		if err := h.store.SaveChatMessage(cm); err != nil {
			cm.ID = 0
		}
	}

	msg := Message{Type: "CHAT", Payload: cm}
	data, _ := json.Marshal(msg)
	h.broadcast <- data
}

func (h *Hub) BroadcastPrice(price float64, history []blockchain.PricePoint) {
	msg := Message{Type: "PRICE", Payload: map[string]interface{}{
		"price":   price,
		"history": history,
	}}
	data, _ := json.Marshal(msg)
	h.broadcast <- data
}

func (h *Hub) BroadcastDeleteMsg(id int64) {
	msg := Message{Type: "DELETE_MSG", Payload: id}
	data, _ := json.Marshal(msg)
	h.broadcast <- data
}

func (h *Hub) BroadcastNetworkAlert(event string) {
	msg := Message{Type: "ALERT", Payload: map[string]string{"event": event, "time": time.Now().Format("15:04:05")}}
	data, _ := json.Marshal(msg)
	h.broadcast <- data
}

func (h *Hub) RegisterClient(conn *websocket.Conn, address string) {
	c := &Client{
		conn:    conn,
		Address: address,
		send:    make(chan []byte, 256),
		hub:     h,
	}
	h.register <- c
	go c.writePump()
	go c.readPump(h)
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(2048)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway) {
				log.Printf("ws hata: %v", err)
			}
			break
		}
		var incoming Message
		if err := json.Unmarshal(raw, &incoming); err != nil {
			continue
		}
		h.handleIncoming(c, &incoming)
	}
}

func (h *Hub) handleIncoming(c *Client, msg *Message) {
	if h.chain.GetNetworkLocked() {
		errMsg := Message{Type: "ERROR", Payload: "AG_KILITLI: Ağ şu anda dondurulmuş durumda"}
		data, _ := json.Marshal(errMsg)
		select {
		case c.send <- data:
		default:
		}
		return
	}

	switch msg.Type {
	case "CHAT":
		h.handleChat(c, msg)
	case "PING":
		pong := Message{Type: "PONG", Payload: time.Now().UnixMilli()}
		data, _ := json.Marshal(pong)
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *Hub) handleChat(c *Client, msg *Message) {
	if h.chain.Blacklist[c.Address] {
		return
	}

	restr, _ := h.store.GetUserRestriction(c.Address)
	if restr != nil && restr.Muted {
		errMsg := Message{Type: "ERROR", Payload: "Susturuldunuz — mesaj atamazsınız"}
		data, _ := json.Marshal(errMsg)
		select { case c.send <- data: default: }
		return
	}

	if err := h.chain.DeductGas(c.Address, blockchain.ChatGasFee); err != nil {
		errMsg := Message{Type: "ERROR", Payload: fmt.Sprintf("Chat için %.0f DEM bakiye gerekli", blockchain.ChatGasFee)}
		data, _ := json.Marshal(errMsg)
		select {
		case c.send <- data:
		default:
		}
		return
	}

	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		return
	}
	content, _ := payload["content"].(string)
	if len(content) > 500 {
		content = content[:500]
	}
	if content == "" {
		return
	}

	username := "@Dem_User_" + c.Address[3:7]

	cm := &blockchain.ChatMessage{
		From:      c.Address,
		Username:  username,
		Content:   content,
		Timestamp: time.Now(),
		TxHash:    h.chain.CalcTxHash(&blockchain.Transaction{From: c.Address, Data: content, Timestamp: time.Now()}),
	}
	h.BroadcastChat(cm)
}

func (h *Hub) GetOnlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
