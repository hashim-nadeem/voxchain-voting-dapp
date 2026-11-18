# VoxChain

> **Your Voice. Your Vote. On-Chain.**

A decentralized YES/NO voting dApp built with Solidity, Hardhat 3, Next.js 16, ethers.js v6
and a React Three Fiber 3D interface.

> 🚧 **Status: Phase 2 (smart contract).** UI and public deployment arrive in later phases.
> The contract has **not** been audited.

## Smart contract

[`contracts/contracts/Voting.sol`](contracts/contracts/Voting.sol): open YES/NO voting.

- Anyone can create a proposal (title 1–120 bytes, description 1–1000 bytes, duration 1 min – 30 days).
- Each address votes **once** per proposal; votes are final and enforced on-chain.
- Voting closes at the deadline; `getStatus` returns `Active`, `Passed`, `Rejected` or `Tied` (simple majority, no quorum).
- No owner/admin, no ETH handling, no external calls. Events: `ProposalCreated`, `Voted`.

```powershell
# Working directory: contracts/
npm run compile
npm test                        # 44 Mocha tests
npx hardhat test --gas-stats    # with gas report

# Local deployment (terminal 1)
npm run node
# Local deployment (terminal 2)
npm run deploy:local            # requires --network localhost and chain ID 31337
```

## Tech stack

- **Contracts:** Solidity 0.8.28, Hardhat 3 (ESM), Mocha, Chai, ethers v6, OpenZeppelin 5
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Motion, Lucide
- **3D:** Three.js, React Three Fiber, drei, postprocessing
- **Infra:** Docker Compose (optional), GitHub, Vercel Hobby

See [docs/architecture.md](docs/architecture.md) for the design and pinned versions.

## Requirements

- Node.js **≥ 22.13.0** (developed on 22.22.0)
- npm 10+
- MetaMask browser extension
- Docker Desktop (optional)

## Local setup (npm, no Docker)

```powershell
# Working directory: repository root
Set-Location contracts
npm ci
npx hardhat compile
npx hardhat test

# Terminal 1, still in contracts/: start the local blockchain (chain ID 31337)
npx hardhat node

# Terminal 2: from repository root
Set-Location frontend
npm ci
Copy-Item .env.local.example .env.local
npm run dev        # http://localhost:3000
```

## Docker setup (optional)

```powershell
# Working directory: repository root
Copy-Item .env.example .env
docker compose up --build     # chain on :8545, app on :3000
docker compose down           # stop and remove containers
```

## Environment variables

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `31337` | Hardhat local chain |
| `NEXT_PUBLIC_RPC_URL` | `http://127.0.0.1:8545` | As seen from the browser |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | *(after deploy)* | Set in Phase 2 |

`NEXT_PUBLIC_*` values are public (embedded in browser JS). **Never put private keys,
mnemonics or API secrets in any env file.** Real `.env` files are git-ignored.

## Frontend checks

```powershell
# Working directory: frontend/
npm run lint
npm run typecheck
npm run build
```

## Known dependency advisories

`npm audit` reports advisories in **development-only** tooling (`zod` via Hardhat;
`glob` and `minimatch` via Mocha; `picomatch` via ESLint). None of this code ships to the browser or the
blockchain. No non-breaking fix exists at the time of writing; they are re-checked each phase.

## Cost

Built and run entirely on free, open-source tools and free tiers. Total spend: **$0**.

## License

MIT
