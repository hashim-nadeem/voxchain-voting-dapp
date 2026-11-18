# Local Hardhat blockchain (chain ID 31337) for development only.
FROM node:22.22.0-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

EXPOSE 8545
# 0.0.0.0 = accept connections from outside the container (Windows browser, other services).
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]
