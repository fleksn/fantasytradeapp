import React, { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

// --- Helper Types ---
type SleeperLeague = {
  league_id: string
  name: string
  season: string
  total_rosters: number
  roster_positions: string[]
  scoring_settings?: Record<string, number>
  settings?: Record<string, any>
}

type SleeperUser = { user_id: string; display_name: string }

type SleeperRoster = { roster_id: number; owner_id: string; players: string[]; taxi?: string[]; starters?: string[] }

type SleeperPlayer = {
  player_id: string
  first_name?: string
  last_name?: string
  full_name?: string
  position?: string
  team?: string
  age?: number
}

// --- Utility: Fuzzy match player names ---
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

function bestNameMatch(name: string, allNames: string[]): string | null {
  const norm = normalizeName(name)
  let best: { candidate: string; score: number } | null = null
  for (const candidate of allNames) {
    const cNorm = normalizeName(candidate)
    // simple similarity score = length of common prefix
    let score = 0
    for (let i = 0; i < Math.min(norm.length, cNorm.length); i++) {
      if (norm[i] === cNorm[i]) score++
      else break
    }
    if (!best || score > best.score) {
      best = { candidate, score }
    }
  }
  return best && best.score > 2 ? best.candidate : null
}

export default function SleeperTradeAssistant() {
  const [leagueId, setLeagueId] = useState("1232275642863591424")
  const [league, setLeague] = useState<SleeperLeague | null>(null)
  const [users, setUsers] = useState<SleeperUser[]>([])
  const [rosters, setRosters] = useState<SleeperRoster[]>([])
  const [players, setPlayers] = useState<Record<string, SleeperPlayer>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ktcMap, setKtcMap] = useState<Record<string, number>>({})
  const [csvLoaded, setCsvLoaded] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [allowedPositions, setAllowedPositions] = useState<Record<string, boolean>>({
    QB: true,
    RB: true,
    WR: true,
    TE: true,
  })

  function togglePosition(pos: string) {
    setAllowedPositions((prev) => ({ ...prev, [pos]: !prev[pos] }))
  }

  async function fetchJSON<T>(url: string): Promise<T> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
    return res.json()
  }

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const lg = await fetchJSON<SleeperLeague>(`https://api.sleeper.app/v1/league/${leagueId}`)
      setLeague(lg)
      const us = await fetchJSON<SleeperUser[]>(`https://api.sleeper.app/v1/league/${leagueId}/users`)
      setUsers(us)
      const rs = await fetchJSON<SleeperRoster[]>(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
      setRosters(rs)
      const ps = await fetchJSON<Record<string, SleeperPlayer>>(`https://api.sleeper.app/v1/players/nfl`)
      setPlayers(ps)
      console.log("Loaded league:", lg)
      console.log("Scoring settings:", lg.scoring_settings)
      console.log("Roster positions:", lg.roster_positions)
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  function playerName(pid: string) {
    const p = players[pid]
    if (!p) return pid
    return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || pid
  }
  function playerPos(pid: string) {
    const p = players[pid]
    return p?.position || ""
  }
  function valueByName(name: string): number | undefined {
    return ktcMap[name.toLowerCase()]
  }
  function valueByPlayerId(pid: string): number | undefined {
    return valueByName(playerName(pid))
  }

  function ingestFantasyProsCsv(text: string) {
    const rows = text.trim().split(/\r?\n/)
    if (!rows.length) return
    const header = rows[0].split(",").map((s) => s.trim().toLowerCase())

    const nameIdx = header.findIndex((h) => h.includes("player"))
    const rankIdx = header.findIndex((h) => h === "rk" || h.includes("avg") || h.includes("rank"))
    const map: Record<string, number> = {}

    const allPlayerNames = Object.values(players)
      .map((p) => p.full_name || `${p.first_name} ${p.last_name}`.trim())
      .filter(Boolean) as string[]

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(",")
      if (cols.length <= Math.max(nameIdx, rankIdx)) continue
      const rawName = cols[nameIdx]?.trim()
      let val = parseFloat(cols[rankIdx])
      if (rawName && Number.isFinite(val)) {
        const match = bestNameMatch(rawName, allPlayerNames) || rawName
        map[match.toLowerCase()] = 10000 - val
      }
    }
    console.log("Parsed CSV player values (sample):", Object.entries(map).slice(0, 10))
    setKtcMap(map)
    setCsvLoaded(true)
  }

  type TeamModel = {
    roster_id: number
    owner_id: string
    owner_name: string
    players: string[]
    posCounts: Record<string, number>
    totalKtc?: number
  }

  const teams: TeamModel[] = useMemo(() => {
    const nameByUser: Record<string, string> = Object.fromEntries(users.map((u) => [u.user_id, u.display_name]))
    return rosters.map((r) => {
      const counts: Record<string, number> = {}
      let total = 0
      for (const pid of r.players || []) {
        const pos = playerPos(pid) || "NA"
        counts[pos] = (counts[pos] || 0) + 1
        const v = valueByPlayerId(pid)
        if (v) total += v
      }
      return {
        roster_id: r.roster_id,
        owner_id: r.owner_id,
        owner_name: nameByUser[r.owner_id] || r.owner_id,
        players: r.players || [],
        posCounts: counts,
        totalKtc: Object.keys(ktcMap).length ? total : undefined,
      }
    })
  }, [rosters, users, players, ktcMap])

  const leaguePosAverages = useMemo(() => {
    const agg: Record<string, number> = {}
    const teamCount = teams.length || 1
    teams.forEach((t) => {
      Object.entries(t.posCounts).forEach(([pos, n]) => {
        agg[pos] = (agg[pos] || 0) + n
      })
    })
    const avg: Record<string, number> = {}
    Object.entries(agg).forEach(([pos, total]) => {
      avg[pos] = total / teamCount
    })
    console.log("League position averages:", avg)
    return avg
  }, [teams])

  function detectLeagueType(): string {
    if (!league) return ""
    const positions = league.roster_positions || []
    const scoring = league.scoring_settings || {}

    const posUpper = positions.map((p) => String(p).toUpperCase())
    const isSuperflex =
      posUpper.some((p) => p.includes("SUPER")) ||
      posUpper.some((p) => p === "SF" || p === "SUPER_FLEX" || p === "SUPERFLEX")

    const hasTaxiSlots = posUpper.includes("TAXI")
    const rostersHaveTaxi = rosters.some((r) => Array.isArray(r.taxi) && r.taxi.length > 0)
    const hasKeeperSettings = Boolean(
      league.settings && (league.settings.keepers || league.settings.keeper_positions || league.settings.max_keep)
    )
    const isDynasty = hasTaxiSlots || rostersHaveTaxi || hasKeeperSettings

    const rec = Number(scoring.rec ?? 0)
    const isFullPPR = rec === 1
    const isHalfPPR = rec === 0.5

    const parts: string[] = []
    parts.push(isDynasty ? "Dynasty" : "Redraft")
    parts.push(isSuperflex ? "SF" : "Standard")
    if (isFullPPR) parts.push("PPR")
    else if (isHalfPPR) parts.push("Half-PPR")
    else parts.push("Standard")

    return parts.join(" ")
  }

  type TradeFit = {
    fromTeam: TeamModel
    toTeam: TeamModel
    givePos: string
    getPos: string
    rationale: string
    givePlayers?: string[]
    getPlayers?: string[]
  }

  function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 1) return arr.map((x) => [x])
    const result: T[][] = []
    arr.forEach((val, i) => {
      const rest = arr.slice(i + 1)
      const sub = combinations(rest, k - 1)
      sub.forEach((s) => result.push([val, ...s]))
    })
    return result
  }

  const tradeFits: TradeFit[] = useMemo(() => {
    if (!teams.length) return []
    const fits: TradeFit[] = []
    const positions = Object.keys(allowedPositions).filter((p) => allowedPositions[p])
    function surplusDelta(team: TeamModel, pos: string) {
      return (team.posCounts[pos] || 0) - (leaguePosAverages[pos] || 0)
    }

    for (let i = 0; i < teams.length; i++) {
      for (let j = 0; j < teams.length; j++) {
        if (i === j) continue
        const A = teams[i],
          B = teams[j]
        positions.forEach((pA) => {
          const aSurplus = surplusDelta(A, pA)
          if (aSurplus <= 0) return
          positions.forEach((pB) => {
            const aNeed = surplusDelta(A, pB) < 0
            const bSurplus = surplusDelta(B, pB) > 0
            const bNeed = surplusDelta(B, pA) < 0
            if (aNeed && bSurplus && bNeed) {
              // Standard 1-for-1 suggestion
              const givePlayers = A.players
                .filter((pid) => playerPos(pid) === pA)
                .sort((x, y) => (valueByPlayerId(y) || 0) - (valueByPlayerId(x) || 0))
                .slice(0, 2)
                .map(playerName)
              const getPlayers = B.players
                .filter((pid) => playerPos(pid) === pB)
                .sort((x, y) => (valueByPlayerId(y) || 0) - (valueByPlayerId(x) || 0))
                .slice(0, 2)
                .map(playerName)
              fits.push({
                fromTeam: A,
                toTeam: B,
                givePos: pA,
                getPos: pB,
                rationale: `A surplus at ${pA}, need ${pB}; B surplus at ${pB}, need ${pA}`,
                givePlayers,
                getPlayers,
              })

              // New 2-for-1 suggestion
              const aCandidates = A.players.filter((pid) => playerPos(pid) === pA)
              const bCandidates = B.players.filter((pid) => playerPos(pid) === pB)
              const twoCombos = combinations(aCandidates, 2)
              const topB = bCandidates.sort((x, y) => (valueByPlayerId(y) || 0) - (valueByPlayerId(x) || 0)).slice(0, 3)
              twoCombos.forEach((combo) => {
                const comboVal = combo.reduce((sum, pid) => sum + (valueByPlayerId(pid) || 0), 0)
                topB.forEach((single) => {
                  const singleVal = valueByPlayerId(single) || 0
                  if (comboVal >= singleVal * 0.9 && comboVal <= singleVal * 1.2) {
                    fits.push({
                      fromTeam: A,
                      toTeam: B,
                      givePos: `${pA}+${pA}`,
                      getPos: pB,
                      rationale: `Package two ${pA}s for one ${pB}`,
                      givePlayers: combo.map(playerName),
                      getPlayers: [playerName(single)],
                    })
                  }
                })
              })
            }
          })
        })
      }
    }
    const uniq = new Map<string, TradeFit>()
    for (const f of fits) {
      uniq.set(`${f.fromTeam.roster_id}->${f.toTeam.roster_id}:${f.givePos}/${f.getPos}:${f.givePlayers?.join("+")}`, f)
    }
    console.log("Trade fits found:", uniq.size)
    return Array.from(uniq.values()).slice(0, 50)
  }, [teams, leaguePosAverages, ktcMap, allowedPositions])

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      if (text) ingestFantasyProsCsv(text)
    }
    reader.onerror = () => setError("Failed to read file")
    reader.readAsText(file)
  }

  function triggerFilePicker() {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        <motion.h1
          className="text-3xl md:text-4xl font-bold mb-2"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Sleeper Trade Assistant
        </motion.h1>
        <p className="text-sm text-gray-600 mb-6">
          Analyze your Sleeper league and get trade suggestions powered by FantasyPros rankings.
        </p>

        <div className="flex gap-3 mb-6 items-center">
          <input
            type="text"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder="Enter Sleeper League ID"
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <Button onClick={loadAll}>Load League</Button>

          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          <Button onClick={triggerFilePicker} variant="secondary">
            Upload FantasyPros CSV
          </Button>
          {uploadedFileName && <span className="text-sm text-gray-600">Loaded: {uploadedFileName}</span>}
        </div>

        {league && (
          <div className="bg-white rounded-2xl shadow p-4 mb-6">
            <h2 className="text-xl font-semibold mb-2">League Info</h2>
            <div className="text-sm text-gray-700">
              {league.name} ({league.season})
            </div>
            <div className="text-sm text-gray-700">{detectLeagueType()}</div>
            {csvLoaded && <div className="text-xs text-green-600 mt-1">FantasyPros CSV initialized</div>}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Filter Positions</h2>
          <div className="flex gap-4 flex-wrap">
            {Object.keys(allowedPositions).map((pos) => (
              <label key={pos} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowedPositions[pos]} onChange={() => togglePosition(pos)} />
                {pos}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Uncheck positions to exclude them from trade suggestions.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-xl font-semibold mb-3">Teams & Positional Depth</h2>
            {teams.map((t) => (
              <div key={t.roster_id} className="border rounded-xl p-3 mb-2">
                <div className="font-semibold flex justify-between">
                  <span>{t.owner_name}</span>
                  {t.totalKtc && <span>Total Value: {Math.round(t.totalKtc)}</span>}
                </div>
                <div className="mt-2 text-sm flex flex-wrap gap-2">
                  {Object.entries(t.posCounts).map(([pos, n]) => (
                    <span key={pos} className="px-2 py-1 rounded-full bg-gray-100">
                      {pos}: {n}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-xl font-semibold mb-3">Suggested Trades</h2>
            {tradeFits.length === 0 ? (
              <div className="text-sm text-gray-600">
                No suggestions yet. Load league to see suggested fits. (You can still upload a CSV to include ranking
                values.)
              </div>
            ) : (
              tradeFits.map((fit, idx) => (
                <div key={idx} className="border rounded-xl p-3 mb-2">
                  <div className="font-semibold">
                    {fit.fromTeam.owner_name} ➜ {fit.toTeam.owner_name}
                  </div>
                  <div className="text-sm text-gray-700">
                    Offer {fit.givePos} for {fit.getPos}
                  </div>
                  {fit.givePlayers && fit.getPlayers && (
                    <div className="text-xs text-gray-600 mt-1">
                      Suggested: {fit.givePlayers.join(", ")} ⇆ {fit.getPlayers.join(", ")}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">{fit.rationale}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
