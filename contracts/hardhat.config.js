import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // A running `npx hardhat node` (chain ID 31337). Deploy scripts target this.
    localhost: {
      type: "http",
      chainType: "l1",
      url: process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545",
    },
  },
});
