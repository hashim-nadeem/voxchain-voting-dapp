# VoxChain Architecture

## Big picture

VoxChain has **no backend server and no database**. The smart contract on the blockchain
is both the data store and the business-rule layer. The browser talks to it directly.

```
 ┌──────────────────────── Windows browser ────────────────────────┐
 │                                                                  │
 │  Next.js UI (React, Tailwind, R3F)                               │
 │     │  reads (free) ──────────────► JSON-RPC  ──┐                │
 │     │  writes ──► MetaMask (signs with your key) ┤                │
 │                                                  ▼                │
 └──────────────────────────────────────────  http://127.0.0.1:8545 ┘
                                                    │
                                   Hardhat node (chain ID 31337)
                                   └── Voting.sol (proposals, votes, events)
```

| Familiar concept (Laravel) | VoxChain equivalent |
|---|---|
| Eloquent model + validation rules | `Voting.sol` (state + `require` checks) |
| MySQL database | Contract storage on the chain |
| REST API / route list | Contract ABI (JSON list of functions & events) |
| HTTP client (Guzzle/axios) | ethers.js v6 |
| Auth session / login | Wallet signature via MetaMask |
| Laravel events / broadcasting | Solidity events (`ProposalCreated`, `Voted`) |
| `php artisan serve` + local DB | `npx hardhat node` |
| Migrations / deploy | Deployment script (Phase 2) |

**Key rule:** a contract cannot be edited after deployment. Fixes mean deploying a new
contract at a new address, which is why every rule is tested before deploying.

## Repository layout

```
voxchain-voting-dapp/
├── contracts/            Hardhat 3 project (ESM, JavaScript)
│   ├── contracts/        Solidity sources (Voting.sol, Phase 2)
│   ├── scripts/          Deployment scripts
│   ├── test/             Mocha + Chai + ethers tests
│   └── hardhat.config.js
├── frontend/             Next.js 16 App Router (TypeScript)
│   ├── app/              Routes, layout, global CSS
│   ├── components/       ui/ and 3d/ components
│   ├── hooks/            Wallet / contract React hooks
│   ├── lib/blockchain/   ABI, provider, contract helpers
│   └── types/
├── docs/
└── docker-compose.yml    Optional local stack
```

The two packages are independent npm projects with their own `package-lock.json`.
No monorepo tooling is used, because there is nothing to share at build time except
the ABI, which is copied into the frontend.

## Toolchain (pinned)

| Area | Choice | Why |
|---|---|---|
| Runtime | Node 22.22.0 | Hardhat 3 requires ≥ 22.13.0 |
| Contracts | Hardhat 3.22.0, `hardhat-toolbox-mocha-ethers` 4.0.0 | Current line; Mocha/Chai/ethers as required |
| Compiler | solc 0.8.28, optimizer 200 runs | Stable; OpenZeppelin 5.x needs ≥ 0.8.20 |
| Frontend | Next 16.4.6, React 19.3.0, Tailwind 4.3 | React kept < 19.4 for React Three Fiber 9 |
| 3D | three 0.187, R3F 9.8, drei 10.7, postprocessing 3.2 | Mutually compatible set |
| Web3 | ethers 6.17.0 (both packages) | Same version front and back |
| Motion | `motion` 14.14 (Framer Motion's current package name) | |

All versions are exact (`.npmrc` → `save-exact=true`) and locked in `package-lock.json`.

## Docker networking

| From | To | Address |
|---|---|---|
| Windows browser / MetaMask | Hardhat | `http://127.0.0.1:8545` (published port) |
| Windows browser | Frontend | `http://localhost:3000` |
| Frontend container | Hardhat container | `http://hardhat:8545` (service name) |

`localhost` inside a container refers to that container itself. Because all chain
calls happen in the browser, `NEXT_PUBLIC_RPC_URL` stays `http://127.0.0.1:8545`
even when the frontend runs in Docker.
