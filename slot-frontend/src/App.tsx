// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import "./index.css";
import { useMetaMask } from "./lib/wallet";
import {
  prepareEncryptedBet,
  betAndSpinTx,
  parsePlayedIndexFromReceipt,
  decryptUserRecords,
  readUserHistory,
  getPlayers,
  getUserHistoryLength,
  deposit as depositFn,
  getPoolBalance,
  claimAllMock,
  readOwnRecord,
} from "./lib/slot";
import { parseEther, formatEther } from "ethers";
import Reel from "./components/Reel";

const SLOT_ADDRESS = import.meta.env.VITE_SLOT_ADDRESS as string | undefined;
const FHEVM_MOCK = import.meta.env.VITE_FHEVM_MOCK as string | undefined;

type SpinPhase = "idle" | "spinning" | "revealing";

// Enhanced multiplier rules (kept in frontend for display):
// Tightened odds to lower win rate:
// - Three 🍀 (index 5): x50
// - Three 7️⃣ (index 4): x25
// - Three of a kind: x5
// - Any two equal of 7️⃣/🍀 only: x2
// - Any two equal of low symbols (🍒/🍋/🔔/⭐): x0.5
// - Otherwise: x0
function getMultiplierInfo(
  a: number,
  b: number,
  c: number
): { name: string; mult: number } {
  const allEq = a === b && b === c;
  const anyTwoEq = a === b || b === c || a === c;
  if (allEq) {
    if (a === 5) return { name: "Three Clovers", mult: 50 };
    if (a === 4) return { name: "Three Sevens", mult: 25 };
    return { name: "Three of a kind", mult: 5 };
  }
  if (anyTwoEq) {
    // high pair: 7 or clover
    if (
      (a === b && (a === 4 || a === 5)) ||
      (b === c && (b === 4 || b === 5)) ||
      (a === c && (a === 4 || a === 5))
    ) {
      return { name: "High Pair (7/ Clover)", mult: 2 };
    }
    // low pair: cherry/lemon/bell/star
    return { name: "Low Pair", mult: 0.5 } as any;
  }
  return { name: "No match", mult: 0 };
}

function Nav() {
  const { pathname } = useLocation();
  const tab = (to: string, label: string) => (
    <Link
      to={to}
      className={`px-4 py-2 rounded-xl border border-zinc-700/60 backdrop-blur ${
        pathname === to
          ? "bg-neon-blue text-black"
          : "bg-zinc-800/80 text-white hover:bg-zinc-700/80"
      } transition`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-2">
      {tab("/", "Welcome")}
      {tab("/game", "Game")}
      {tab("/history", "History")}
      {tab("/leaderboard", "Leaderboard")}
    </div>
  );
}

function Welcome() {
  const { isConnected, connect, accounts, chainId, signer } = useMetaMask();
  const [poolBal, setPoolBal] = useState<string>("0");
  const [depEth, setDepEth] = useState<string>("0.1");
  const canUse = isConnected && SLOT_ADDRESS;

  const refreshPool = async () => {
    if (!canUse) return;
    try {
      const bal = await getPoolBalance(SLOT_ADDRESS!, signer!);
      setPoolBal(formatEther(bal));
    } catch {}
  };

  useEffect(() => {
    refreshPool();
  }, [canUse]);

  const onDeposit = async () => {
    if (!signer || !SLOT_ADDRESS) return;
    try {
      const wei = parseEther(depEth);
      await depositFn(SLOT_ADDRESS, signer, wei);
      await refreshPool();
    } catch {}
  };

  return (
    <div className="grid gap-6">
      {/* Hero Section */}
      <div className="rounded-3xl p-10 bg-gradient-to-br from-zinc-900/60 to-black border border-zinc-800/70">
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-3">
              <span className="text-neon-blue">Private</span> ·{" "}
              <span className="text-neon-pink">Fair</span> ·{" "}
              <span className="text-white">On-chain</span>
            </h1>
            <p className="text-zinc-300 mb-5">
              Experience privacy-preserving slots powered by Fully Homomorphic
              Encryption. Bet encrypted, spin with FHE-RNG, reveal securely.
            </p>
            <div className="flex items-center gap-3">
              <Link to="/game" className="btn-primary">
                Start Playing
              </Link>
              <button
                className="px-5 py-3 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60 transition"
                onClick={connect}
                disabled={isConnected}
              >
                {isConnected ? "Connected" : "Connect Wallet"}
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800/70 bg-black/40 p-6 text-zinc-300">
            <div className="text-sm mb-3">Quick Stats</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800/70 p-4 bg-zinc-900/40">
                <div className="text-xs text-zinc-400">Contract</div>
                <div className="font-mono text-sm break-all">
                  {SLOT_ADDRESS ?? "VITE_SLOT_ADDRESS not set"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800/70 p-4 bg-zinc-900/40">
                <div className="text-xs text-zinc-400">Wallet</div>
                <div className="font-mono text-sm max-w-[18ch] truncate" title={isConnected ? accounts?.[0] : undefined}>
                  {isConnected
                    ? `${accounts?.[0]?.slice(0, 6)}...${accounts?.[0]?.slice(-4)}`
                    : "Not connected"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800/70 p-4 bg-zinc-900/40">
                <div className="text-xs text-zinc-400">Chain</div>
                <div className="font-mono text-sm">
                  {isConnected ? `${chainId}` : "-"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800/70 p-4 bg-zinc-900/40">
                <div className="text-xs text-zinc-400">Prize Pool</div>
                <div className="font-mono text-sm">{poolBal} ETH</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="rounded-3xl p-8 border border-zinc-800/70 bg-zinc-900/50">
        <h3 className="text-2xl font-semibold mb-4">Features</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            <div className="text-lg font-semibold mb-1">Encrypted Bets</div>
            <div className="text-zinc-400 text-sm">
              Your wager stays encrypted end-to-end with FHEVM.
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            <div className="text-lg font-semibold mb-1">On-chain RNG</div>
            <div className="text-zinc-400 text-sm">
              Fair spins driven by FHE-enabled randomness.
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            <div className="text-lg font-semibold mb-1">Private History</div>
            <div className="text-zinc-400 text-sm">
              Results and payouts stored encrypted on-chain.
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            <div className="text-lg font-semibold mb-1">Flexible Payouts</div>
            <div className="text-zinc-400 text-sm">
              Rich multipliers including 0.5x, 2x, 5x, 25x, 50x.
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            <div className="text-lg font-semibold mb-1">Leaderboard</div>
            <div className="text-zinc-400 text-sm">
              Compete by plays count; more metrics coming soon.
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            <div className="text-lg font-semibold mb-1">Relayer Mock</div>
            <div className="text-zinc-400 text-sm">
              Local dev without external relayer dependency.
            </div>
          </div>
        </div>
      </div>

      {/* How it Works */}
      <div className="rounded-3xl p-8 border border-zinc-800/70 bg-zinc-900/50">
        <h3 className="text-2xl font-semibold mb-4">How it works</h3>
        <ol className="grid md:grid-cols-5 gap-4 text-sm">
          <li className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            1. Encrypt bet
          </li>
          <li className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            2. Submit txn
          </li>
          <li className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            3. FHE-RNG spin
          </li>
          <li className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            4. Decrypt result
          </li>
          <li className="rounded-xl border border-zinc-800/70 p-4 bg-black/40">
            5. Claim payout
          </li>
        </ol>
      </div>

      {/* Relayer Mock Tip */}
      <div className="rounded-2xl p-5 border border-amber-500/40 bg-amber-500/10 text-amber-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Relayer Mock Mode</div>
            <div className="text-sm">
              {FHEVM_MOCK === "1"
                ? "Mock mode is ON. All FHE ops run locally for development."
                : "Mock mode is OFF. Using remote Relayer SDK."}
            </div>
          </div>
          <Link
            to="/game"
            className="px-4 py-2 rounded-xl border border-amber-500/40 hover:bg-amber-500/20 text-amber-100"
          >
            Go to Game
          </Link>
        </div>
      </div>

      <div className="neon-border rounded-2xl p-6 bg-zinc-900/70 grid gap-3">
        <h3 className="text-xl font-semibold">Prize Pool</h3>
        <div className="text-zinc-300">
          Current Balance: <span className="font-mono">{poolBal} ETH</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="px-4 py-3 rounded-xl bg-black border border-zinc-700 w-64"
            placeholder="Deposit amount (ETH)"
            value={depEth}
            onChange={(e) => setDepEth(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={onDeposit}
            disabled={!canUse || Number(depEth) <= 0}
          >
            Deposit
          </button>
          <button
            className="px-4 py-3 rounded-xl border border-zinc-700"
            onClick={refreshPool}
            disabled={!canUse}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function Game() {
  const { isConnected, signer } = useMetaMask();
  const [amountEth, setAmountEth] = useState<string>("0.01");
  const [status, setStatus] = useState<string>("Idle");
  // keep last resolved reels for win highlight/payout context
  const [reels, setReels] = useState<number[] | null>(null);
  const MIN_SPIN_MS = 2000;
  const [phase, _setPhase] = useState<SpinPhase>("idle");
  const [finalReels, setFinalReels] = useState<number[] | null>(null);
  const [targetReels, setTargetReels] = useState<number[] | null>(null);
  const [spinCols, setSpinCols] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);
  const [displayReels, setDisplayReels] = useState<
    [number | null, number | null, number | null]
  >([null, null, null]);
  const [finalPayout, setFinalPayout] = useState<string | null>(null);
  const [hitRule, setHitRule] = useState<{ name: string; mult: number } | null>(
    null
  );
  const phaseRef = useRef<SpinPhase>("idle");
  const phaseStartRef = useRef<number>(0);
  const revealTimersRef = useRef<number[]>([]);

  const setPhase = (p: SpinPhase) => {
    phaseRef.current = p;
    _setPhase(p);
  };

  const disabled =
    !isConnected ||
    !SLOT_ADDRESS ||
    !amountEth ||
    Number(amountEth) <= 0 ||
    phase !== "idle";

  const startSpinAnim = () => {
    // clear pending reveal timers
    revealTimersRef.current.forEach((id) => clearTimeout(id));
    revealTimersRef.current = [];
    setPhase("spinning");
    setFinalReels(null);
    setTargetReels(null);
    setFinalPayout(null);
    setHitRule(null);
    setDisplayReels([null, null, null]);
    setSpinCols([true, true, true]);
    phaseStartRef.current = performance.now();
  };

  useEffect(() => {
    return () => {
      revealTimersRef.current.forEach((id) => clearTimeout(id));
    };
  }, []);

  const onSpin = async () => {
    try {
      if (!signer || !SLOT_ADDRESS) return;
      startSpinAnim();
      setStatus("Encrypting bet...");
      const wei = parseEther(amountEth);
      const enc = await prepareEncryptedBet(SLOT_ADDRESS, signer, wei);
      setStatus("Waiting for wallet signature...");
      const tx = await betAndSpinTx(SLOT_ADDRESS, signer, enc, wei);
      setStatus(
        `Submitted ${tx.hash.slice(0, 10)}..., waiting for confirmation...`
      );
      const receipt = await tx.wait();
      const playedIndex = parsePlayedIndexFromReceipt(receipt);
      setStatus(
        `Confirmed ${tx.hash.slice(0, 10)} ${
          playedIndex !== undefined ? `• Played #${playedIndex}` : ""
        }`
      );

      if (playedIndex !== undefined) {
        setStatus("Fetching and decrypting result...");
        const rec = await readOwnRecord(SLOT_ADDRESS, signer, playedIndex);
        const decMap = await decryptUserRecords(SLOT_ADDRESS, signer, [rec]);
        const sym = (h: string) => {
          const v = decMap[h];
          return typeof v === "bigint"
            ? Number(v)
            : typeof v === "boolean"
            ? v
              ? 1
              : 0
            : 0;
        };
        const payout = decMap[rec.rec.encPayout];
        const result = [
          sym(rec.rec.sym1),
          sym(rec.rec.sym2),
          sym(rec.rec.sym3),
        ];
        setTargetReels(result);
        setReels(result);
        setFinalPayout(
          typeof payout === "bigint" ? `${formatEther(payout)} ETH` : "0"
        );
        const info = getMultiplierInfo(result[0], result[1], result[2]);
        setHitRule(info);
        // Begin per-column reveal: increase interval, then stop each column in sequence
        setPhase("revealing");
        // Column-wise reveal using framer-motion style: stop per column by clearing its spin flag and set its symbol
        const elapsed = performance.now() - phaseStartRef.current;
        const baseDelay = elapsed < MIN_SPIN_MS ? MIN_SPIN_MS - elapsed : 0;
        // col 0
        revealTimersRef.current.push(
          window.setTimeout(() => {
            setSpinCols(([_, b, c]) => [false, b, c]);
            setDisplayReels(([_, b, c]) => [result[0], b, c]);
          }, baseDelay + 250)
        );
        // col 1
        revealTimersRef.current.push(
          window.setTimeout(() => {
            setSpinCols(([a, _, c]) => [a, false, c]);
            setDisplayReels(([a, _, c]) => [a, result[1], c]);
          }, baseDelay + 550)
        );
        // col 2
        revealTimersRef.current.push(
          window.setTimeout(() => {
            setSpinCols(([a, b, _]) => [a, b, false]);
            setDisplayReels(([a, b, _]) => [a, b, result[2]]);
            setFinalReels(result);
            setPhase("idle");
          }, baseDelay + 850)
        );
      } else {
        setStatus("Result index not found.");
        setPhase("idle");
      }
    } catch (e: any) {
      setStatus(`Failed: ${e?.message ?? String(e)}`);
      setPhase("idle");
    }
  };

  const symbol = (v: number) => ["🍒", "🍋", "🔔", "⭐", "7️⃣", "🍀"][v] ?? "?";
  // keep states for future highlight usage (satisfy TS by reading conditionally)
  void (reels && reels.length);
  void (finalReels && finalReels.length);
  void (targetReels && targetReels.length);

  return (
    <div className="grid gap-6">
      <div className="neon-border rounded-2xl p-6 bg-zinc-900/70">
        <h2 className="text-2xl font-semibold mb-2">Place your bet</h2>
        <div className="flex gap-3 items-center">
          <input
            className="px-4 py-3 rounded-xl bg-black border border-zinc-700 w-64"
            placeholder="Bet amount (ETH)"
            value={amountEth}
            onChange={(e) => setAmountEth(e.target.value)}
          />
          <button className="btn-primary" disabled={disabled} onClick={onSpin}>
            🎰 Start
          </button>
        </div>
        <div className="text-zinc-400 mt-3">{status}</div>
      </div>
      <div className="neon-border rounded-2xl p-6 bg-zinc-900/70">
        <h3 className="text-xl font-semibold mb-2">Reels</h3>
        <div className="w-fit mx-auto grid grid-cols-3 gap-6">
          <Reel
            symbol={
              displayReels[0] !== null
                ? symbol(displayReels[0] as number)
                : "🎲"
            }
            isSpinning={spinCols[0] && phase !== "idle"}
            delay={0}
          />
          <Reel
            symbol={
              displayReels[1] !== null
                ? symbol(displayReels[1] as number)
                : "🎲"
            }
            isSpinning={spinCols[1] && phase !== "idle"}
            delay={0.15}
          />
          <Reel
            symbol={
              displayReels[2] !== null
                ? symbol(displayReels[2] as number)
                : "🎲"
            }
            isSpinning={spinCols[2] && phase !== "idle"}
            delay={0.3}
          />
        </div>
        {hitRule && (
          <div className="text-zinc-300 mt-3">
            Hit Rule:{" "}
            <span className="font-semibold text-neon-blue">{hitRule.name}</span>{" "}
            • Multiplier: <span className="font-mono">x{hitRule.mult}</span>
          </div>
        )}
        {finalPayout && (
          <div className="text-zinc-200 mt-1">
            Payout: <span className="font-mono">{finalPayout}</span>
          </div>
        )}
      </div>
      <div className="neon-border rounded-2xl p-6 bg-gradient-to-br from-zinc-900/80 to-black">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold">Multiplier Rules</h3>
          <div className="text-xs text-zinc-400">
            Encrypted logic on-chain • Displayed locally
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 max-w-3xl mx-auto">
          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/60">
            <div className="text-2xl">🍀🍀🍀</div>
            <div className="text-zinc-300">Three Clovers</div>
            <div className="text-neon-blue font-bold text-lg">x50</div>
          </div>
          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/60">
            <div className="text-2xl">7️⃣7️⃣7️⃣</div>
            <div className="text-zinc-300">Three Sevens</div>
            <div className="text-neon-pink font-bold text-lg">x25</div>
          </div>
          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/60">
            <div className="text-2xl">⭐⭐⭐ / 🔔🔔🔔</div>
            <div className="text-zinc-300">Three of a kind</div>
            <div className="text-neon-blue font-bold text-lg">x5</div>
          </div>
          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/60">
            <div className="text-2xl">7️⃣7️⃣❔ / 🍀🍀❔</div>
            <div className="text-zinc-300">High Pair (7/Clover)</div>
            <div className="text-neon-blue font-bold text-lg">x2</div>
          </div>
          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/60">
            <div className="text-2xl">🍒🍒❔ / 🍋🍋❔ / 🔔🔔❔ / ⭐⭐❔</div>
            <div className="text-zinc-300">Low Pair</div>
            <div className="text-amber-400 font-bold text-lg">x0.5</div>
          </div>
          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/60">
            <div className="text-2xl">❔❔❔</div>
            <div className="text-zinc-300">No match</div>
            <div className="text-zinc-500 font-bold text-lg">x0</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function History() {
  const { isConnected, signer } = useMetaMask();
  const [items, setItems] = useState<{ index: number; rec: any }[]>([]);
  const [clearMap, setClearMap] = useState<Record<string, bigint | boolean>>(
    {}
  );
  const [status, setStatus] = useState("Idle");
  const [claiming, setClaiming] = useState(false);

  const canLoad = useMemo(
    () => isConnected && signer && SLOT_ADDRESS,
    [isConnected, signer]
  );

  useEffect(() => {
    if (!canLoad) return;
    (async () => {
      try {
        setStatus("Fetching history...");
        const records = await readUserHistory(SLOT_ADDRESS!, signer!);
        setItems(records);
        setStatus(`Fetched ${records.length}. Decrypting...`);
        const dec = await decryptUserRecords(SLOT_ADDRESS!, signer!, records);
        setClearMap(dec);
        setStatus("Ready");
      } catch (e: any) {
        setStatus(`Failed: ${e?.message ?? String(e)}`);
      }
    })();
  }, [canLoad]);

  const get = (handle: string) => clearMap[handle];
  const symValue = (h: string) => {
    const v = get(h);
    return typeof v === "bigint"
      ? Number(v)
      : typeof v === "boolean"
      ? v
        ? 1
        : 0
      : undefined;
  };
  const symLabel = (v: number) =>
    ["🍒", "🍋", "🔔", "⭐", "7️⃣", "🍀"][v] ?? "?";

  const totalPayout = useMemo(() => {
    try {
      let sum = 0n;
      for (const { rec } of items) {
        const v = get(rec.encPayout);
        if (typeof v === "bigint") sum += v;
      }
      return sum;
    } catch {
      return 0n;
    }
  }, [items, clearMap]);

  const onClaimAll = async () => {
    if (!SLOT_ADDRESS || !signer) return;
    try {
      setClaiming(true);
      const idxs: number[] = [];
      const pays: bigint[] = [];
      for (const { index, rec } of items) {
        const payout = get(rec.encPayout);
        if (typeof payout === "bigint" && payout > 0n) {
          idxs.push(index);
          pays.push(payout);
        }
      }
      if (idxs.length === 0) {
        setStatus("Nothing to claim");
      } else {
        const rc = await claimAllMock(SLOT_ADDRESS, signer, idxs, pays);
        setStatus(`Claimed ${idxs.length} entries. Tx ${rc?.hash ?? ""}`);
      }
    } catch (e: any) {
      setStatus(`Claim failed: ${e?.message ?? String(e)}`);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="neon-border rounded-2xl p-6 bg-zinc-900/70">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold mb-2">Your History</h2>
        <div className="flex items-center gap-3">
          <div className="text-zinc-300">
            Claimable (decrypted):{" "}
            <span className="font-mono">{formatEther(totalPayout)} ETH</span>
          </div>
          <button
            className="btn-primary"
            onClick={onClaimAll}
            disabled={claiming || !isConnected || !SLOT_ADDRESS}
          >
            {claiming ? "Claiming..." : "Claim All (Demo)"}
          </button>
        </div>
      </div>
      <div className="text-zinc-400 mb-3">{status}</div>
      <div className="divide-y divide-zinc-800">
        {items.map(({ index, rec }) => {
          const bet = get(rec.encBet) as bigint | undefined;
          const s1n = symValue(rec.sym1);
          const s2n = symValue(rec.sym2);
          const s3n = symValue(rec.sym3);
          const payout = get(rec.encPayout) as bigint | undefined;
          const ruleInfo =
            s1n !== undefined && s2n !== undefined && s3n !== undefined
              ? getMultiplierInfo(s1n, s2n, s3n)
              : undefined;
          return (
            <div className="py-3" key={index}>
              <div className="text-sm text-zinc-400">
                #{index} •{" "}
                {new Date(Number(rec.timestamp) * 1000).toLocaleString()}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-zinc-200">
                  Bet: {bet !== undefined ? `${formatEther(bet)} ETH` : "..."}
                </div>
                <div className="text-zinc-200">
                  Payout:{" "}
                  {payout !== undefined ? `${formatEther(payout)} ETH` : "..."}
                </div>
                <div className="text-zinc-200">
                  Symbols:{" "}
                  {s1n !== undefined && s2n !== undefined && s3n !== undefined
                    ? `${symLabel(s1n)} ${symLabel(s2n)} ${symLabel(s3n)}`
                    : "..."}
                </div>
                <div className="text-zinc-300">
                  Rule:{" "}
                  {ruleInfo ? `${ruleInfo.name} • x${ruleInfo.mult}` : "..."}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leaderboard() {
  const { isConnected, signer } = useMetaMask();
  const [rows, setRows] = useState<{ addr: string; plays: number }[]>([]);
  const [status, setStatus] = useState("Idle");

  const canLoad = useMemo(
    () => isConnected && signer && SLOT_ADDRESS,
    [isConnected, signer]
  );

  useEffect(() => {
    if (!canLoad) return;
    (async () => {
      try {
        setStatus("Loading players...");
        const players = await getPlayers(SLOT_ADDRESS!, signer!);
        const pairs: { addr: string; plays: number }[] = [];
        for (const p of players) {
          const n = await getUserHistoryLength(SLOT_ADDRESS!, signer!, p);
          pairs.push({ addr: p, plays: n });
        }
        pairs.sort((a, b) => b.plays - a.plays);
        setRows(pairs.slice(0, 10));
        setStatus("Ready");
      } catch (e: any) {
        setStatus(`Failed: ${e?.message ?? String(e)}`);
      }
    })();
  }, [canLoad]);

  return (
    <div className="neon-border rounded-2xl p-6 bg-zinc-900/70">
      <h2 className="text-2xl font-semibold mb-2">
        Leaderboard (Top 10 by Plays)
      </h2>
      <div className="text-zinc-400 mb-3">{status}</div>
      <div className="grid gap-2">
        {rows.map((r, i) => (
          <div
            key={r.addr}
            className="flex items-center justify-between border border-zinc-800 rounded-xl px-4 py-2"
          >
            <div className="text-zinc-300">#{i + 1}</div>
            <div className="font-mono text-sm">{r.addr}</div>
            <div className="text-neon-blue font-semibold">{r.plays} plays</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header() {
  const { isConnected, connect, disconnect, accounts, provider } =
    useMetaMask();
  const [balance, setBalance] = useState<string>("0");
  // auto-refresh balance every 15s while connected
  useEffect(() => {
    let timer: number | undefined;
    const fetchBal = async () => {
      try {
        if (isConnected && provider && accounts && accounts[0]) {
          const bal = await provider.getBalance(accounts[0]);
          setBalance(formatEther(bal));
        }
      } catch {}
    };
    fetchBal();
    if (isConnected) {
      timer = window.setInterval(fetchBal, 15000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isConnected, provider, accounts?.[0]]);
  const short = (addr?: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
  const copyAddr = async () => {
    try {
      if (accounts && accounts[0]) {
        await navigator.clipboard.writeText(accounts[0]);
      }
    } catch {}
  };
  const switchToLocal = async () => {
    try {
      const eth = (window as any).ethereum;
      if (!eth) return;
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7A69" }],
      }); // 31337
    } catch {}
  };
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-black/50 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-[auto,1fr,auto] items-center gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/" className="text-2xl font-extrabold">
            <span className="text-neon-blue">FHE</span>
            <span className="text-neon-pink">-Slots</span>
          </Link>
        </div>
        <div className="hidden md:flex items-center justify-center flex-wrap gap-2">
          <Nav />
        </div>
        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            className="md:hidden px-3 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60 text-sm"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          {FHEVM_MOCK === "1" && (
            <span className="px-2 py-1 text-xs rounded-lg border border-amber-500/40 text-amber-300 bg-amber-500/10">
              Mock
            </span>
          )}
          {!isConnected ? (
            <button className="btn-primary" onClick={connect}>
              Connect
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 rounded-xl border border-zinc-700/70 bg-zinc-900/60 text-sm flex items-center gap-2 shrink-0">
                <span className="font-mono">{short(accounts?.[0])}</span>
                <span className="text-zinc-500">·</span>
                <span className="font-mono">
                  {Number(balance).toFixed(4)} ETH
                </span>
              </div>
              <button
                className="px-3 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60 text-sm"
                onClick={copyAddr}
              >
                Copy
              </button>
              <button
                className="px-3 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60 text-sm"
                onClick={switchToLocal}
              >
                31337
              </button>
              <button
                className="px-3 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60 text-sm"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-zinc-800/80 bg-black/70">
          <div className="max-w-6xl mx-auto px-6 py-3">
            <div className="flex flex-col gap-2">
              <Link
                to="/"
                className="px-4 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60"
                onClick={() => setOpen(false)}
              >
                Welcome
              </Link>
              <Link
                to="/game"
                className="px-4 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60"
                onClick={() => setOpen(false)}
              >
                Game
              </Link>
              <Link
                to="/history"
                className="px-4 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60"
                onClick={() => setOpen(false)}
              >
                History
              </Link>
              <Link
                to="/leaderboard"
                className="px-4 py-2 rounded-xl border border-zinc-700/70 hover:bg-zinc-800/60"
                onClick={() => setOpen(false)}
              >
                Leaderboard
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-zinc-800/80 bg-black/60">
      <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-zinc-500 flex items-center justify-between">
        <div>Built with FHEVM + Relayer SDK · Demo only</div>
        <div className="space-x-4">
          <a className="hover:text-zinc-300" href="#">
            Docs
          </a>
          <a className="hover:text-zinc-300" href="#">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/game" element={<Game />} />
          <Route path="/history" element={<History />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
