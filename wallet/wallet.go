package wallet

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
)

type KeyPair struct {
	PrivateKey *ecdsa.PrivateKey
	PublicKey  *ecdsa.PublicKey
	Address    string
}

func Generate() (*KeyPair, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	addr := PubKeyToAddress(&priv.PublicKey)
	return &KeyPair{
		PrivateKey: priv,
		PublicKey:  &priv.PublicKey,
		Address:    addr,
	}, nil
}

func PubKeyToAddress(pub *ecdsa.PublicKey) string {
	raw := elliptic.Marshal(pub.Curve, pub.X, pub.Y)
	h := sha256.Sum256(raw)
	return "DEM" + strings.ToUpper(hex.EncodeToString(h[:])[:32])
}

func Sign(priv *ecdsa.PrivateKey, data string) (string, error) {
	h := sha256.Sum256([]byte(data))
	r, s, err := ecdsa.Sign(rand.Reader, priv, h[:])
	if err != nil {
		return "", err
	}
	sig := fmt.Sprintf("%s:%s", r.Text(16), s.Text(16))
	return sig, nil
}

func Verify(pub *ecdsa.PublicKey, data, signature string) bool {
	parts := strings.Split(signature, ":")
	if len(parts) != 2 {
		return false
	}
	r := new(big.Int)
	s := new(big.Int)
	r.SetString(parts[0], 16)
	s.SetString(parts[1], 16)
	h := sha256.Sum256([]byte(data))
	return ecdsa.Verify(pub, h[:], r, s)
}

func PrivKeyToHex(priv *ecdsa.PrivateKey) string {
	return hex.EncodeToString(priv.D.Bytes())
}

func HexToPrivKey(hexStr string) (*ecdsa.PrivateKey, error) {
	b, err := hex.DecodeString(hexStr)
	if err != nil {
		return nil, err
	}
	priv := new(ecdsa.PrivateKey)
	priv.Curve = elliptic.P256()
	priv.D = new(big.Int).SetBytes(b)
	priv.PublicKey.Curve = elliptic.P256()
	priv.PublicKey.X, priv.PublicKey.Y = elliptic.P256().ScalarBaseMult(priv.D.Bytes())
	return priv, nil
}

func PubKeyToHex(pub *ecdsa.PublicKey) string {
	raw := elliptic.Marshal(pub.Curve, pub.X, pub.Y)
	return hex.EncodeToString(raw)
}

func HexToPubKey(hexStr string) (*ecdsa.PublicKey, error) {
	b, err := hex.DecodeString(hexStr)
	if err != nil {
		return nil, err
	}
	x, y := elliptic.Unmarshal(elliptic.P256(), b)
	if x == nil {
		return nil, errors.New("gecersiz public key")
	}
	return &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, nil
}

type SavedWallet struct {
	Address    string `json:"address"`
	PrivKeyHex string `json:"priv_key_hex"`
	PubKeyHex  string `json:"pub_key_hex"`
}

func SaveToFile(kp *KeyPair, path string) error {
	sw := SavedWallet{
		Address:    kp.Address,
		PrivKeyHex: PrivKeyToHex(kp.PrivateKey),
		PubKeyHex:  PubKeyToHex(kp.PublicKey),
	}
	data, err := json.MarshalIndent(sw, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func LoadFromFile(path string) (*KeyPair, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var sw SavedWallet
	if err := json.Unmarshal(data, &sw); err != nil {
		return nil, err
	}
	priv, err := HexToPrivKey(sw.PrivKeyHex)
	if err != nil {
		return nil, err
	}
	return &KeyPair{
		PrivateKey: priv,
		PublicKey:  &priv.PublicKey,
		Address:    sw.Address,
	}, nil
}

func ExportPEM(priv *ecdsa.PrivateKey) (string, error) {
	der, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return "", err
	}
	block := &pem.Block{Type: "EC PRIVATE KEY", Bytes: der}
	return string(pem.EncodeToMemory(block)), nil
}
