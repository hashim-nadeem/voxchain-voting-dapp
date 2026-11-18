// Deploy Voting.sol to the LOCAL Hardhat chain.
// Usage (from contracts/, with `npx hardhat node` running in another terminal):
//   npx hardhat run scripts/deploy.js --network localhost
import { network } from "hardhat";

const LOCAL_CHAIN_ID = 31337n;

const { ethers, networkName } = await network.getOrCreate();

// Guard 1: require the persistent local node. Without `--network localhost`, Hardhat
// uses a temporary in-memory chain (also chain ID 31337) that vanishes when this script ends.
if (networkName !== "localhost") {
  throw new Error(
    `Refusing to deploy: run with --network localhost (got "${networkName}"). ` +
      "Without it, Hardhat uses a temporary in-memory chain that disappears when this script ends.",
  );
}

// Guard 2: the node behind "localhost" must really be the Hardhat local chain.
const { chainId } = await ethers.provider.getNetwork();
if (chainId !== LOCAL_CHAIN_ID) {
  throw new Error(`Refusing to deploy: expected chain ID ${LOCAL_CHAIN_ID}, got ${chainId}.`);
}

const [deployer] = await ethers.getSigners();
console.log(`Deploying Voting from ${deployer.address} on chain ${chainId}...`);

const voting = await ethers.deployContract("Voting");
await voting.waitForDeployment();

const address = await voting.getAddress();
const receipt = await voting.deploymentTransaction().wait();

console.log(`Voting deployed at ${address}`);
console.log(`  block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`);
console.log(`\nAdd this to frontend/.env.local:\nNEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
