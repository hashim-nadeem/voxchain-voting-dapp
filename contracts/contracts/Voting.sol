// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title VoxChain Voting
/// @notice Open YES/NO voting. Anyone can create a proposal; every address can vote
///         once per proposal, before the proposal's deadline.
/// @dev There is intentionally no owner and no admin function: nobody can edit, delete,
///      pause or censor proposals or votes. The contract holds no ETH and makes no
///      external calls. NOT AUDITED.
contract Voting {
    // ───────────────────────────── Types ─────────────────────────────

    /// @dev `None` (the default value 0) means "has not voted".
    enum VoteChoice {
        None,
        Yes,
        No
    }

    /// @dev Simple majority, no quorum. Zero votes after the deadline counts as `Tied`.
    enum Status {
        Active,
        Passed,
        Rejected,
        Tied
    }

    struct Proposal {
        string title;
        string description;
        address creator; // 20 bytes ┐
        uint48 createdAt; //  6 bytes ├ packed into one 32-byte storage slot
        uint48 deadline; //   6 bytes ┘
        uint128 yesVotes; // 16 bytes ┐ second slot
        uint128 noVotes; //  16 bytes ┘
    }

    // ─────────────────────────── Constants ───────────────────────────
    // Lengths are in BYTES (UTF-8), not characters: "é" = 2 bytes, most emoji = 4.

    uint256 public constant MAX_TITLE_LENGTH = 120;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 1000;
    uint256 public constant MIN_DURATION = 1 minutes;
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MAX_PAGE_SIZE = 50;

    // ──────────────────────────── Storage ────────────────────────────

    /// @dev Proposal ID == array index, so IDs are 0, 1, 2, ...
    Proposal[] private _proposals;

    /// @dev proposalId => voter => choice. Enforces one vote per address per proposal.
    mapping(uint256 proposalId => mapping(address voter => VoteChoice)) private _votes;

    // ───────────────────────────── Events ────────────────────────────

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed creator,
        string title,
        uint256 deadline
    );

    /// @dev Includes the new totals so the UI can update without an extra read.
    event Voted(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 yesVotes,
        uint256 noVotes
    );

    // ───────────────────────────── Errors ────────────────────────────

    error EmptyTitle();
    error TitleTooLong(uint256 length, uint256 maxLength);
    error EmptyDescription();
    error DescriptionTooLong(uint256 length, uint256 maxLength);
    error InvalidDuration(uint256 duration, uint256 minDuration, uint256 maxDuration);
    error ProposalNotFound(uint256 proposalId);
    error VotingClosed(uint256 proposalId, uint256 deadline);
    error AlreadyVoted(uint256 proposalId, address voter);

    // ──────────────────────────── Modifiers ──────────────────────────

    modifier proposalExists(uint256 proposalId) {
        if (proposalId >= _proposals.length) revert ProposalNotFound(proposalId);
        _;
    }

    // ───────────────────────────── Writes ────────────────────────────

    /// @notice Create a proposal that accepts votes for `duration` seconds.
    /// @return proposalId The new proposal's ID.
    function createProposal(
        string calldata title,
        string calldata description,
        uint256 duration
    ) external returns (uint256 proposalId) {
        // Checks
        uint256 titleLength = bytes(title).length;
        if (titleLength == 0) revert EmptyTitle();
        if (titleLength > MAX_TITLE_LENGTH) revert TitleTooLong(titleLength, MAX_TITLE_LENGTH);

        uint256 descriptionLength = bytes(description).length;
        if (descriptionLength == 0) revert EmptyDescription();
        if (descriptionLength > MAX_DESCRIPTION_LENGTH) {
            revert DescriptionTooLong(descriptionLength, MAX_DESCRIPTION_LENGTH);
        }

        if (duration < MIN_DURATION || duration > MAX_DURATION) {
            revert InvalidDuration(duration, MIN_DURATION, MAX_DURATION);
        }

        // Effects
        proposalId = _proposals.length;
        uint256 deadline = block.timestamp + duration;

        _proposals.push(
            Proposal({
                title: title,
                description: description,
                creator: msg.sender,
                createdAt: SafeCast.toUint48(block.timestamp),
                deadline: SafeCast.toUint48(deadline),
                yesVotes: 0,
                noVotes: 0
            })
        );

        emit ProposalCreated(proposalId, msg.sender, title, deadline);
    }

    /// @notice Vote YES (`support = true`) or NO (`support = false`). One vote per address, final.
    function vote(uint256 proposalId, bool support) external proposalExists(proposalId) {
        Proposal storage proposal = _proposals[proposalId];

        // Checks
        if (block.timestamp >= proposal.deadline) revert VotingClosed(proposalId, proposal.deadline);
        if (_votes[proposalId][msg.sender] != VoteChoice.None) revert AlreadyVoted(proposalId, msg.sender);

        // Effects
        _votes[proposalId][msg.sender] = support ? VoteChoice.Yes : VoteChoice.No;
        if (support) {
            proposal.yesVotes += 1;
        } else {
            proposal.noVotes += 1;
        }

        emit Voted(proposalId, msg.sender, support, proposal.yesVotes, proposal.noVotes);
    }

    // ───────────────────────────── Reads (free) ──────────────────────

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint256 proposalId) external view proposalExists(proposalId) returns (Proposal memory) {
        return _proposals[proposalId];
    }

    /// @notice Up to `limit` proposals starting at `offset` (limit is capped at MAX_PAGE_SIZE).
    ///         Returns an empty array when `offset` is past the end.
    function getProposals(uint256 offset, uint256 limit) external view returns (Proposal[] memory page) {
        uint256 total = _proposals.length;
        if (offset >= total) return new Proposal[](0);
        if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

        uint256 end = offset + limit; // cannot overflow: offset < total, limit <= 50
        if (end > total) end = total;

        page = new Proposal[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _proposals[i];
        }
    }

    /// @notice How `voter` voted on a proposal (`None` if they have not voted).
    function getVote(uint256 proposalId, address voter) external view proposalExists(proposalId) returns (VoteChoice) {
        return _votes[proposalId][voter];
    }

    /// @notice `Active` until the deadline, then the simple-majority result.
    /// @dev Uses the latest block's timestamp. On a local chain that only mines on demand,
    ///      that timestamp can lag real time, so UIs should also compare `deadline` to the clock.
    function getStatus(uint256 proposalId) external view proposalExists(proposalId) returns (Status) {
        Proposal storage proposal = _proposals[proposalId];
        if (block.timestamp < proposal.deadline) return Status.Active;
        if (proposal.yesVotes > proposal.noVotes) return Status.Passed;
        if (proposal.noVotes > proposal.yesVotes) return Status.Rejected;
        return Status.Tied;
    }
}
