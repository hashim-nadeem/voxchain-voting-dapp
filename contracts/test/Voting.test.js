import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.getOrCreate();
const { loadFixture, time } = networkHelpers;

// Enum values as returned by ethers (bigint).
const Vote = { None: 0n, Yes: 1n, No: 2n };
const Status = { Active: 0n, Passed: 1n, Rejected: 2n, Tied: 3n };

const HOUR = 60 * 60;
const MIN_DURATION = 60;
const MAX_DURATION = 30 * 24 * HOUR;

async function deployFixture() {
  const [alice, bob, carol, dave] = await ethers.getSigners();
  const voting = await ethers.deployContract("Voting");
  return { voting, alice, bob, carol, dave };
}

async function withProposalFixture() {
  const base = await deployFixture();
  await base.voting.createProposal("Adopt dark mode", "Make the UI dark by default.", HOUR);
  const { deadline } = await base.voting.getProposal(0);
  return { ...base, deadline };
}

describe("Voting", function () {
  describe("deployment", function () {
    it("starts with zero proposals and exposes its limits", async function () {
      const { voting } = await loadFixture(deployFixture);
      expect(await voting.proposalCount()).to.equal(0n);
      expect(await voting.MAX_TITLE_LENGTH()).to.equal(120n);
      expect(await voting.MAX_DESCRIPTION_LENGTH()).to.equal(1000n);
      expect(await voting.MIN_DURATION()).to.equal(BigInt(MIN_DURATION));
      expect(await voting.MAX_DURATION()).to.equal(BigInt(MAX_DURATION));
      expect(await voting.MAX_PAGE_SIZE()).to.equal(50n);
    });
  });

  describe("createProposal", function () {
    it("stores every field and emits ProposalCreated", async function () {
      const { voting, alice } = await loadFixture(deployFixture);

      const tx = voting.createProposal("Title", "Description", HOUR);
      await expect(tx).to.not.revert(ethers);
      const now = await time.latest();

      await expect(tx)
        .to.emit(voting, "ProposalCreated")
        .withArgs(0n, alice.address, "Title", BigInt(now + HOUR));

      const p = await voting.getProposal(0);
      expect(p.title).to.equal("Title");
      expect(p.description).to.equal("Description");
      expect(p.creator).to.equal(alice.address);
      expect(p.createdAt).to.equal(BigInt(now));
      expect(p.deadline).to.equal(BigInt(now + HOUR));
      expect(p.yesVotes).to.equal(0n);
      expect(p.noVotes).to.equal(0n);
      expect(await voting.proposalCount()).to.equal(1n);
    });

    it("assigns sequential IDs and records each creator", async function () {
      const { voting, alice, bob } = await loadFixture(deployFixture);
      await expect(voting.connect(alice).createProposal("A", "a", HOUR))
        .to.emit(voting, "ProposalCreated").withArgs(0n, alice.address, "A", (v) => v > 0n);
      await expect(voting.connect(bob).createProposal("B", "b", HOUR))
        .to.emit(voting, "ProposalCreated").withArgs(1n, bob.address, "B", (v) => v > 0n);

      expect(await voting.proposalCount()).to.equal(2n);
      expect((await voting.getProposal(0)).creator).to.equal(alice.address);
      expect((await voting.getProposal(1)).creator).to.equal(bob.address);
    });

    it("lets any account create a proposal (no admin required)", async function () {
      const { voting, dave } = await loadFixture(deployFixture);
      await expect(voting.connect(dave).createProposal("Open", "Anyone may propose.", HOUR)).to.not.revert(ethers);
    });

    it("rejects an empty title", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createProposal("", "Description", HOUR))
        .to.be.revertedWithCustomError(voting, "EmptyTitle");
    });

    it("rejects an empty description", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createProposal("Title", "", HOUR))
        .to.be.revertedWithCustomError(voting, "EmptyDescription");
    });

    it("accepts a title of exactly 120 bytes and rejects 121", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createProposal("t".repeat(120), "d", HOUR)).to.not.revert(ethers);
      await expect(voting.createProposal("t".repeat(121), "d", HOUR))
        .to.be.revertedWithCustomError(voting, "TitleTooLong").withArgs(121n, 120n);
    });

    it("accepts a description of exactly 1000 bytes and rejects 1001", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createProposal("t", "d".repeat(1000), HOUR)).to.not.revert(ethers);
      await expect(voting.createProposal("t", "d".repeat(1001), HOUR))
        .to.be.revertedWithCustomError(voting, "DescriptionTooLong").withArgs(1001n, 1000n);
    });

    it("measures length in UTF-8 bytes, not characters", async function () {
      const { voting } = await loadFixture(deployFixture);
      // "é" is 2 bytes: 60 of them = 120 bytes (ok), 61 = 122 bytes (too long).
      await expect(voting.createProposal("é".repeat(60), "d", HOUR)).to.not.revert(ethers);
      await expect(voting.createProposal("é".repeat(61), "d", HOUR))
        .to.be.revertedWithCustomError(voting, "TitleTooLong").withArgs(122n, 120n);
    });

    it("enforces the duration bounds exactly", async function () {
      const { voting } = await loadFixture(deployFixture);
      const err = (d) => [BigInt(d), BigInt(MIN_DURATION), BigInt(MAX_DURATION)];

      await expect(voting.createProposal("t", "d", 0))
        .to.be.revertedWithCustomError(voting, "InvalidDuration").withArgs(...err(0));
      await expect(voting.createProposal("t", "d", MIN_DURATION - 1))
        .to.be.revertedWithCustomError(voting, "InvalidDuration").withArgs(...err(MIN_DURATION - 1));
      await expect(voting.createProposal("t", "d", MIN_DURATION)).to.not.revert(ethers);
      await expect(voting.createProposal("t", "d", MAX_DURATION)).to.not.revert(ethers);
      await expect(voting.createProposal("t", "d", MAX_DURATION + 1))
        .to.be.revertedWithCustomError(voting, "InvalidDuration").withArgs(...err(MAX_DURATION + 1));
    });

    it("does not change state when a creation reverts", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createProposal("", "d", HOUR)).to.revert(ethers);
      expect(await voting.proposalCount()).to.equal(0n);
    });
  });

  describe("vote", function () {
    it("records a YES vote, updates the tally and emits Voted", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await expect(voting.connect(bob).vote(0, true))
        .to.emit(voting, "Voted").withArgs(0n, bob.address, true, 1n, 0n);

      const p = await voting.getProposal(0);
      expect(p.yesVotes).to.equal(1n);
      expect(p.noVotes).to.equal(0n);
      expect(await voting.getVote(0, bob.address)).to.equal(Vote.Yes);
    });

    it("records a NO vote, updates the tally and emits Voted", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await expect(voting.connect(bob).vote(0, false))
        .to.emit(voting, "Voted").withArgs(0n, bob.address, false, 0n, 1n);

      const p = await voting.getProposal(0);
      expect(p.yesVotes).to.equal(0n);
      expect(p.noVotes).to.equal(1n);
      expect(await voting.getVote(0, bob.address)).to.equal(Vote.No);
    });

    it("reports None for an address that has not voted", async function () {
      const { voting, carol } = await loadFixture(withProposalFixture);
      expect(await voting.getVote(0, carol.address)).to.equal(Vote.None);
    });

    it("rejects a second vote with the same choice", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await voting.connect(bob).vote(0, true);
      await expect(voting.connect(bob).vote(0, true))
        .to.be.revertedWithCustomError(voting, "AlreadyVoted").withArgs(0n, bob.address);
    });

    it("rejects changing a vote and leaves the tally unchanged", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await voting.connect(bob).vote(0, true);
      await expect(voting.connect(bob).vote(0, false))
        .to.be.revertedWithCustomError(voting, "AlreadyVoted").withArgs(0n, bob.address);

      const p = await voting.getProposal(0);
      expect(p.yesVotes).to.equal(1n);
      expect(p.noVotes).to.equal(0n);
      expect(await voting.getVote(0, bob.address)).to.equal(Vote.Yes);
    });

    it("lets the proposal creator vote on their own proposal", async function () {
      const { voting, alice } = await loadFixture(withProposalFixture);
      await expect(voting.connect(alice).vote(0, true)).to.not.revert(ethers);
    });

    it("tallies many voters correctly", async function () {
      const { voting, alice, bob, carol, dave } = await loadFixture(withProposalFixture);
      await voting.connect(alice).vote(0, true);
      await voting.connect(bob).vote(0, true);
      await voting.connect(carol).vote(0, false);
      await expect(voting.connect(dave).vote(0, true))
        .to.emit(voting, "Voted").withArgs(0n, dave.address, true, 3n, 1n);

      const p = await voting.getProposal(0);
      expect(p.yesVotes).to.equal(3n);
      expect(p.noVotes).to.equal(1n);
    });

    it("only ever records a vote for the signer, never for anyone else", async function () {
      const { voting, alice, bob } = await loadFixture(withProposalFixture);
      await voting.connect(bob).vote(0, true);
      expect(await voting.getVote(0, bob.address)).to.equal(Vote.Yes);
      expect(await voting.getVote(0, alice.address)).to.equal(Vote.None);
      // Alice is still free to cast her own (different) vote.
      await expect(voting.connect(alice).vote(0, false)).to.not.revert(ethers);
    });

    it("keeps proposals independent: one voter can vote on several", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await voting.createProposal("Second", "Another one", HOUR);

      await voting.connect(bob).vote(0, true);
      await voting.connect(bob).vote(1, false);

      const p0 = await voting.getProposal(0);
      const p1 = await voting.getProposal(1);
      expect([p0.yesVotes, p0.noVotes]).to.deep.equal([1n, 0n]);
      expect([p1.yesVotes, p1.noVotes]).to.deep.equal([0n, 1n]);
      expect(await voting.getVote(0, bob.address)).to.equal(Vote.Yes);
      expect(await voting.getVote(1, bob.address)).to.equal(Vote.No);
    });

    it("rejects votes on a non-existent proposal", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await expect(voting.connect(bob).vote(1, true))
        .to.be.revertedWithCustomError(voting, "ProposalNotFound").withArgs(1n);
      await expect(voting.connect(bob).vote(ethers.MaxUint256, true))
        .to.be.revertedWithCustomError(voting, "ProposalNotFound").withArgs(ethers.MaxUint256);
    });

    it("rejects votes when there are no proposals at all", async function () {
      const { voting, bob } = await loadFixture(deployFixture);
      await expect(voting.connect(bob).vote(0, true))
        .to.be.revertedWithCustomError(voting, "ProposalNotFound").withArgs(0n);
    });
  });

  describe("deadline", function () {
    it("accepts a vote one second before the deadline", async function () {
      const { voting, bob, deadline } = await loadFixture(withProposalFixture);
      await time.setNextBlockTimestamp(deadline - 1n);
      await expect(voting.connect(bob).vote(0, true)).to.not.revert(ethers);
    });

    it("rejects a vote exactly at the deadline", async function () {
      const { voting, bob, deadline } = await loadFixture(withProposalFixture);
      await time.setNextBlockTimestamp(deadline);
      await expect(voting.connect(bob).vote(0, true))
        .to.be.revertedWithCustomError(voting, "VotingClosed").withArgs(0n, deadline);
    });

    it("rejects a vote long after the deadline", async function () {
      const { voting, bob, deadline } = await loadFixture(withProposalFixture);
      await time.increaseTo(deadline + 1000n);
      await expect(voting.connect(bob).vote(0, false))
        .to.be.revertedWithCustomError(voting, "VotingClosed").withArgs(0n, deadline);
    });

    it("closes each proposal on its own deadline", async function () {
      const { voting, bob, deadline } = await loadFixture(withProposalFixture);
      await voting.createProposal("Long", "Runs a day", 24 * HOUR);
      await time.increaseTo(deadline);

      await expect(voting.connect(bob).vote(0, true)).to.be.revertedWithCustomError(voting, "VotingClosed");
      await expect(voting.connect(bob).vote(1, true)).to.not.revert(ethers);
    });
  });

  describe("getStatus", function () {
    it("is Active before the deadline", async function () {
      const { voting } = await loadFixture(withProposalFixture);
      expect(await voting.getStatus(0)).to.equal(Status.Active);
    });

    it("is Passed when YES > NO after the deadline", async function () {
      const { voting, alice, bob, carol, deadline } = await loadFixture(withProposalFixture);
      await voting.connect(alice).vote(0, true);
      await voting.connect(bob).vote(0, true);
      await voting.connect(carol).vote(0, false);
      await time.increaseTo(deadline);
      expect(await voting.getStatus(0)).to.equal(Status.Passed);
    });

    it("is Rejected when NO > YES after the deadline", async function () {
      const { voting, alice, bob, deadline } = await loadFixture(withProposalFixture);
      await voting.connect(alice).vote(0, false);
      await voting.connect(bob).vote(0, false);
      await time.increaseTo(deadline);
      expect(await voting.getStatus(0)).to.equal(Status.Rejected);
    });

    it("is Tied when votes are equal after the deadline", async function () {
      const { voting, alice, bob, deadline } = await loadFixture(withProposalFixture);
      await voting.connect(alice).vote(0, true);
      await voting.connect(bob).vote(0, false);
      await time.increaseTo(deadline);
      expect(await voting.getStatus(0)).to.equal(Status.Tied);
    });

    it("is Tied when nobody voted", async function () {
      const { voting, deadline } = await loadFixture(withProposalFixture);
      await time.increaseTo(deadline);
      expect(await voting.getStatus(0)).to.equal(Status.Tied);
    });

    it("reverts for a non-existent proposal", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.getStatus(0)).to.be.revertedWithCustomError(voting, "ProposalNotFound").withArgs(0n);
    });
  });

  describe("read functions", function () {
    it("getProposal and getVote revert for invalid IDs", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await expect(voting.getProposal(1)).to.be.revertedWithCustomError(voting, "ProposalNotFound").withArgs(1n);
      await expect(voting.getVote(1, bob.address))
        .to.be.revertedWithCustomError(voting, "ProposalNotFound").withArgs(1n);
    });

    it("getProposals returns an empty page when there are no proposals", async function () {
      const { voting } = await loadFixture(deployFixture);
      expect(await voting.getProposals(0, 10)).to.have.length(0);
    });

    it("getProposals pages through proposals in order", async function () {
      const { voting } = await loadFixture(deployFixture);
      for (let i = 0; i < 5; i++) await voting.createProposal(`P${i}`, "d", HOUR);

      const first = await voting.getProposals(0, 2);
      const second = await voting.getProposals(2, 2);
      const last = await voting.getProposals(4, 2); // only one left
      expect(first.map((p) => p.title)).to.deep.equal(["P0", "P1"]);
      expect(second.map((p) => p.title)).to.deep.equal(["P2", "P3"]);
      expect(last.map((p) => p.title)).to.deep.equal(["P4"]);
    });

    it("getProposals returns empty when offset is past the end or limit is 0", async function () {
      const { voting } = await loadFixture(withProposalFixture);
      expect(await voting.getProposals(1, 10)).to.have.length(0);
      expect(await voting.getProposals(ethers.MaxUint256, 10)).to.have.length(0);
      expect(await voting.getProposals(0, 0)).to.have.length(0);
    });

    it("getProposals caps the page size at MAX_PAGE_SIZE", async function () {
      const { voting } = await loadFixture(deployFixture);
      for (let i = 0; i < 51; i++) await voting.createProposal(`P${i}`, "d", HOUR);

      const page = await voting.getProposals(0, ethers.MaxUint256);
      expect(page).to.have.length(50);
      expect(page[49].title).to.equal("P49");
      expect((await voting.getProposals(50, 50)).map((p) => p.title)).to.deep.equal(["P50"]);
    });

    it("reflects live vote counts in paged results", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      await voting.connect(bob).vote(0, true);
      const [p] = await voting.getProposals(0, 1);
      expect(p.yesVotes).to.equal(1n);
    });
  });

  describe("ETH safety", function () {
    it("rejects plain ETH transfers (the contract can never hold funds)", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      await expect(alice.sendTransaction({ to: await voting.getAddress(), value: 1n })).to.revert(ethers);
      expect(await ethers.provider.getBalance(await voting.getAddress())).to.equal(0n);
    });
  });

  describe("hardening", function () {
    const tallyOf = async (voting, id) => {
      const p = await voting.getProposal(id);
      return [p.yesVotes, p.noVotes];
    };

    it("leaves tallies unchanged when a vote is rejected for any reason", async function () {
      const { voting, bob, carol, deadline } = await loadFixture(withProposalFixture);
      await voting.connect(bob).vote(0, true);
      const before = await tallyOf(voting, 0);

      // AlreadyVoted
      await expect(voting.connect(bob).vote(0, false)).to.be.revertedWithCustomError(voting, "AlreadyVoted");
      // ProposalNotFound
      await expect(voting.connect(carol).vote(1, true)).to.be.revertedWithCustomError(voting, "ProposalNotFound");
      expect(await voting.proposalCount()).to.equal(1n);
      // VotingClosed
      await time.increaseTo(deadline);
      await expect(voting.connect(carol).vote(0, false)).to.be.revertedWithCustomError(voting, "VotingClosed");

      expect(await tallyOf(voting, 0)).to.deep.equal(before);
      expect(await voting.getVote(0, carol.address)).to.equal(Vote.None);
    });

    it("createProposal returns the new proposal's ID", async function () {
      const { voting } = await loadFixture(deployFixture);
      // staticCall simulates the transaction and returns the function's return value.
      expect(await voting.createProposal.staticCall("A", "a", HOUR)).to.equal(0n);
      await voting.createProposal("A", "a", HOUR);
      expect(await voting.createProposal.staticCall("B", "b", HOUR)).to.equal(1n);
      await voting.createProposal("B", "b", HOUR);
      expect(await voting.proposalCount()).to.equal(2n);
    });

    it("rejects a raw transaction that sends ETH to vote()", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      const to = await voting.getAddress();
      const data = voting.interface.encodeFunctionData("vote", [0, true]);

      // Bypasses ethers' client-side "non-payable" check, so the contract itself must reject it.
      await expect(bob.sendTransaction({ to, data, value: 1n })).to.revert(ethers);

      expect(await tallyOf(voting, 0)).to.deep.equal([0n, 0n]);
      expect(await voting.getVote(0, bob.address)).to.equal(Vote.None);
      expect(await ethers.provider.getBalance(to)).to.equal(0n);
    });

    it("reverts on calldata that matches no function", async function () {
      const { voting, bob } = await loadFixture(withProposalFixture);
      const to = await voting.getAddress();
      await expect(bob.sendTransaction({ to, data: "0xdeadbeef" })).to.revert(ethers);
      await expect(bob.sendTransaction({ to, data: "0xdeadbeef", value: 1n })).to.revert(ethers);
      expect(await ethers.provider.getBalance(to)).to.equal(0n);
    });

    it("keeps YES + NO equal to the number of recorded voters after mixed operations", async function () {
      const { voting, deadline } = await loadFixture(withProposalFixture);
      const signers = (await ethers.getSigners()).slice(0, 10);
      await voting.createProposal("Second", "Another one", 24 * HOUR);

      // Mixed sequence: valid votes, duplicates, changes of mind, invalid IDs, late votes.
      const plan = [
        [0, 0, true], [1, 0, false], [2, 0, true], [0, 0, true], [1, 0, true],
        [3, 1, false], [0, 1, false], [4, 0, false], [3, 1, true], [5, 9, true],
        [6, 1, true], [2, 1, false], [7, 0, true], [4, 0, true],
      ];
      for (const [who, id, support] of plan) {
        try { await voting.connect(signers[who]).vote(id, support); } catch { /* rejected, as intended */ }
      }
      await time.increaseTo(deadline); // closes proposal 0 only
      for (const who of [8, 9]) {
        try { await voting.connect(signers[who]).vote(0, true); } catch { /* VotingClosed */ }
        await voting.connect(signers[who]).vote(1, false);
      }

      for (const id of [0, 1]) {
        let yes = 0n, no = 0n;
        for (const s of signers) {
          const choice = await voting.getVote(id, s.address);
          if (choice === Vote.Yes) yes++;
          if (choice === Vote.No) no++;
        }
        expect(await tallyOf(voting, id)).to.deep.equal([yes, no]);
      }
      // Hand-checked expectation: #0 = 3 YES (0,2,7) / 2 NO (1,4); #1 = 1 YES (6) / 5 NO (3,0,2,8,9).
      expect(await tallyOf(voting, 0)).to.deep.equal([3n, 2n]);
      expect(await tallyOf(voting, 1)).to.deep.equal([1n, 5n]);
    });
  });
});
