// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, euint32, euint64, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title FHESlotMachine - A privacy-preserving slot machine using FHEVM
/// @notice Users place encrypted bets; the contract spins 3 encrypted reels, computes payout homomorphically,
/// then pays out in ETH while keeping on-chain history encrypted for privacy. Leaderboard tracks plaintext totals for transparency.
contract FHESlotMachine is SepoliaConfig {
    /// @dev Compute multiplier from three encrypted symbols using enhanced rules
    /// - Three 🍀 (index 5): x50
    /// - Three 7️⃣ (index 4): x25
    /// - Three of a kind: x5
    /// - Any two equal of 7️⃣/🍀 only: x2
    /// - Any two equal of low symbols (🍒/🍋/🔔/⭐): x0.5 (encoded as 255 sentinel)
    /// - Otherwise: x0
    function _computeMultiplier(euint8 s1, euint8 s2, euint8 s3) internal returns (euint8) {
        euint8 x0 = FHE.asEuint8(0);
        euint8 x2 = FHE.asEuint8(2);
        euint8 x5 = FHE.asEuint8(5);
        euint8 x25 = FHE.asEuint8(25);
        euint8 x50 = FHE.asEuint8(50);
        euint8 xHalfCode = FHE.asEuint8(255); // sentinel to represent 0.5x

        ebool s1eqs2 = FHE.eq(s1, s2);
        ebool s2eqs3 = FHE.eq(s2, s3);
        ebool s1eqs3 = FHE.eq(s1, s3);
        ebool threeEq = FHE.and(s1eqs2, s2eqs3);
        ebool twoEq = FHE.or(s1eqs2, FHE.or(s2eqs3, s1eqs3));

        // three-equal special cases derived from s1 (all equal implies s1==s2==s3)
        euint8 threeEqMult = FHE.select(
            FHE.eq(s1, FHE.asEuint8(5)), // 🍀
            x50,
            FHE.select(FHE.eq(s1, FHE.asEuint8(4)), x25, x5) // 7️⃣ else x5
        );

        // two-equal high pair (only if the repeated symbol is 7️⃣ or 🍀)
        // pick the repeated symbol using nested selects
        euint8 pairSym = FHE.select(
            s1eqs2,
            s1,
            FHE.select(
                s2eqs3,
                s2,
                FHE.select(
                    s1eqs3,
                    s1,
                    FHE.asEuint8(255) // sentinel (won't match 4/5)
                )
            )
        );
        ebool pairIsHigh = FHE.or(FHE.eq(pairSym, FHE.asEuint8(4)), FHE.eq(pairSym, FHE.asEuint8(5)));
        // low pair if twoEq and not high
        ebool pairIsLow = FHE.and(twoEq, FHE.not(pairIsHigh));

        // For low pairs, return sentinel 255 to indicate 0.5x to caller
        euint8 twoEqMult = FHE.select(pairIsHigh, x2, xHalfCode);

        return FHE.select(
            threeEq,
            threeEqMult,
            FHE.select(
                twoEq,
                twoEqMult,
                x0
            )
        );
    }
    /// @dev Encrypted game record per play
    struct GameRecord {
        euint64 encBet;     // encrypted bet amount
        euint8 sym1;        // encrypted reel 1 symbol (0..5)
        euint8 sym2;        // encrypted reel 2 symbol (0..5)
        euint8 sym3;        // encrypted reel 3 symbol (0..5)
        euint64 encPayout;  // encrypted payout = bet * multiplier
        uint256 timestamp;  // plaintext block timestamp
        bool claimed;       // payout claimed flag (DEV/DEMO only, see claimAllMock)
    }

    mapping(address => GameRecord[]) private _history;
    address[] private _players; // unique players list for frontend to sort off-chain
    mapping(address => bool) private _isPlayer;

    event Deposit(address indexed from, uint256 amount);
    event Played(address indexed player, uint256 indexed index);

    /// @notice Fund the prize pool with ETH
    function deposit() external payable {
        require(msg.value > 0, "No ETH sent");
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Returns the ETH balance of the contract prize pool
    function poolBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Place an encrypted bet and spin the slot
    /// @param betExt Encrypted bet amount (external handle)
    /// @param proof ZK proof for the encrypted input
    function betAndSpin(externalEuint64 betExt, bytes calldata proof) external payable {
        // 1) Resolve bet: prefer msg.value (deduct funds) if provided; fallback to encrypted external input
        euint64 bet = (msg.value > 0)
            ? FHE.asEuint64(uint64(msg.value))
            : FHE.fromExternal(betExt, proof);

        // 2) Generate 3 encrypted symbols in [0,6)
        // Use 6 symbols (0..5). FHE.rem(FHE.randEuint32(), 6)
        euint8 s1 = FHE.asEuint8(FHE.rem(FHE.randEuint32(), 6));
        euint8 s2 = FHE.asEuint8(FHE.rem(FHE.randEuint32(), 6));
        euint8 s3 = FHE.asEuint8(FHE.rem(FHE.randEuint32(), 6));

        // 3) Compute multiplier using enhanced rules
        euint8 mult = _computeMultiplier(s1, s2, s3);

        // 4) Compute encrypted payout with support for 0.5x sentinel (255)
        euint64 intPayout = FHE.mul(bet, FHE.asEuint64(mult));
        ebool isHalf = FHE.eq(mult, FHE.asEuint8(255));
        euint64 halfPayout = FHE.div(bet, 2);
        euint64 encPayout = FHE.select(isHalf, halfPayout, intPayout);

        // 5) NOTE: On-chain payout transfer from encrypted values is not performed here,
        // because decryption is not available in state-changing context.
        // Frontend can decrypt using Relayer SDK and display results; settlement strategy can be added later.

        // 6) Record encrypted history; authorize user and this contract for these encrypted values
        _history[msg.sender].push();
        GameRecord storage rec = _history[msg.sender][_history[msg.sender].length - 1];
        rec.encBet = bet;
        rec.sym1 = s1;
        rec.sym2 = s2;
        rec.sym3 = s3;
        rec.encPayout = encPayout;
        rec.timestamp = block.timestamp;
        rec.claimed = false;

        // Grant ACL so user can decrypt their own game data later
        FHE.allow(rec.encBet, msg.sender);
        FHE.allow(rec.sym1, msg.sender);
        FHE.allow(rec.sym2, msg.sender);
        FHE.allow(rec.sym3, msg.sender);
        FHE.allow(rec.encPayout, msg.sender);

        // Also allow this contract for future internal logic if needed
        FHE.allowThis(rec.encBet);
        FHE.allowThis(rec.sym1);
        FHE.allowThis(rec.sym2);
        FHE.allowThis(rec.sym3);
        FHE.allowThis(rec.encPayout);

        // Track unique player for leaderboard list
        if (!_isPlayer[msg.sender]) {
            _isPlayer[msg.sender] = true;
            _players.push(msg.sender);
        }

    
        emit Played(msg.sender, _history[msg.sender].length - 1);
    }

    // -------------------------
    // Views for Frontend
    // -------------------------

    function getUserHistoryLength(address user) external view returns (uint256) {
        return _history[user].length;
    }

    function getUserRecord(address user, uint256 index)
        external
        view
        returns (
            euint64 encBet,
            euint8 sym1,
            euint8 sym2,
            euint8 sym3,
            euint64 encPayout,
            uint256 timestamp
        )
    {
        require(index < _history[user].length, "Index out of bounds");
        GameRecord storage r = _history[user][index];
        return (r.encBet, r.sym1, r.sym2, r.sym3, r.encPayout, r.timestamp);
    }

    /// @notice Returns whether a record has been claimed (DEV/DEMO helper)
    function getUserRecordStatus(address user, uint256 index) external view returns (bool) {
        require(index < _history[user].length, "Index out of bounds");
        return _history[user][index].claimed;
    }

    /// ---------------------------------------------------------------------
    /// DEV/DEMO ONLY: Claim payouts without cryptographic verification
    /// ---------------------------------------------------------------------
    /// In production, claims must be verified using proper decryption proofs.
    /// This function is only for local/mock demos: it trusts the provided
    /// clear payout amounts and marks the entries as claimed.
    function claimAllMock(uint256[] calldata indexes, uint64[] calldata clearPayouts) external {
        require(indexes.length == clearPayouts.length, "Length mismatch");

        uint256 total = 0;
        for (uint256 i = 0; i < indexes.length; ++i) {
            uint256 idx = indexes[i];
            require(idx < _history[msg.sender].length, "Index OOB");
            GameRecord storage r = _history[msg.sender][idx];
            require(!r.claimed, "Already claimed");
            r.claimed = true;
            total += clearPayouts[i];
        }

        require(address(this).balance >= total, "Insufficient pool");
        if (total > 0) {
            (bool ok, ) = payable(msg.sender).call{ value: total }("");
            require(ok, "Transfer failed");
        }
    }

    /// @notice Return the list of players (frontend can sort totals off-chain)
    function getPlayers() external view returns (address[] memory) {
        return _players;
    }
}


