# SlotGuard

> Privacy‑preserving slot machine DApp powered by Zama FHEVM

SlotGuard is a decentralized slot machine built with Fully Homomorphic Encryption (FHE) via Zama’s FHEVM. Spins, RNG checks, and payouts are computed over encrypted inputs, keeping player data private while outcomes stay verifiable on‑chain.

---

## Why SlotGuard

- ❌ Exposed play data and RNG → ✅ Encrypted spins and private RNG checks
- ❌ Opaque fairness → ✅ Verifiable on‑chain result proofs
- ❌ Centralized custody → ✅ Self‑sovereign play with transparent payouts

---

## Zama FHEVM Integration

FHEVM enables smart contracts to operate on ciphertexts. SlotGuard evaluates reels, checks wins, and settles payouts without seeing plaintext player inputs.

```
Player Client
  └─ FHE Encrypt (spin seed, bet)
         └─ Encrypted Spin → FHEVM Contracts
                               └─ Encrypted RNG/Reel Checks
                                       └─ Verifiable Outcome → On‑chain Payout
```

Key properties
- No plaintext bets or seeds on‑chain
- Encrypted RNG and line evaluation
- Auditable outcomes and payouts

---

## Getting Started

Prerequisites: Node.js 18+, MetaMask, Sepolia ETH

Setup
```bash
git clone https://github.com/counterbluer7x/SlotGuard
cd SlotGuard
npm install
cp .env.example .env.local
```

Deploy
```bash
npm run deploy:sepolia
```

Run
```bash
npm run dev
```

---

## Play Flow

1) Choose bet → client encrypts seed and amount
2) Submit encrypted spin to contract
3) FHEVM computes RNG, evaluates lines privately
4) Outcome posted on‑chain; payouts minted to player

Privacy model
- Encrypted: seeds, bets, spin signals
- Transparent: payout events, house edge policy, contract code

---

## Architecture

| Layer            | Technology            | Role                                  |
|------------------|-----------------------|---------------------------------------|
| Encryption       | Zama FHE              | Client‑side encryption of spin data    |
| Smart Contracts  | Solidity + FHEVM      | Encrypted RNG and line checks          |
| Blockchain       | Ethereum Sepolia      | Execution and settlement               |
| Frontend         | React + TypeScript    | Game UI + local crypto                 |
| Tooling          | Hardhat, Ethers       | Build/test/deploy                      |

Core contracts
- SlotMachine: encrypted spin evaluation and payouts
- Bank/Treasury: bankroll and risk controls
- VRF/Oracle adapter (optional): hybrid randomness where needed

---

## Features

- 🔐 Encrypted spins and RNG checks
- 🎰 Multiple paylines and volatility modes
- 🧾 Verifiable outcomes and payouts
- 🎟️ Bonus rounds and multipliers (privacy‑preserving)

---

## Fairness & Security

- Public house edge policy, auditable returns
- Independent audits recommended (circuits and contracts)
- EIP‑712 signing to prevent replay; per‑session keys
- Minimize metadata; rotate FHE keys per season

---

## Roadmap

- v1: Core encrypted slots, payouts
- v1.1: Bonus games, jackpots, RTP dashboards
- v1.2: Mobile PWA, cross‑chain deployments

---

## Contributing

PRs welcome: RNG circuits, audits, UI/UX, analytics.

---

## Resources

- Zama: https://www.zama.ai
- FHEVM Docs: https://docs.zama.ai/fhevm
- Sepolia Explorer: https://sepolia.etherscan.io

---

## License

MIT — see LICENSE.

Built with Zama FHEVM — private spins, fair outcomes, public trust.
