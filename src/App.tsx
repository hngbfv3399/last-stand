import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { BattlefieldCanvas } from './game/BattlefieldCanvas'
import './App.css'

type Tab = 'resource' | 'unit' | 'turret' | 'upgrade' | 'building'
type ItemKind = Exclude<Tab, 'resource'>
type Item = {
  id: string
  name: string
  icon: string
  kind: ItemKind
  cost: number
  sub: string
  range?: number
  detectionRange?: number
  maxHp?: number
  damage?: number
  attackInterval?: number
  moveSpeed?: number
  blockCount?: number
  splashRadius?: number
  healAmount?: number
  healTargets?: number
}
type BuildingModal = { id: string; item: Item }
type Production = { item: Item; remaining: number }
type EmergencyAction = { id: 'flare' | 'shockwave' | 'medkit'; nonce: number } | null
type TrainingDoctrine = 'vanguard' | 'ranger' | null

const items: Item[] = [
  { id: 'warrior', name: '검사', icon: '⚔️', kind: 'unit', cost: 36, sub: '전방 저지 · 높은 체력', range: 1, detectionRange: 5, maxHp: 16, damage: 1.4, attackInterval: 650, moveSpeed: .13, blockCount: 2 },
  { id: 'archer', name: '궁수', icon: '🏹', kind: 'unit', cost: 40, sub: '긴 사거리 · 낮은 체력', range: 3, detectionRange: 4, maxHp: 6, damage: 1.15, attackInterval: 500, moveSpeed: .17, blockCount: 1 },
  { id: 'guardian', name: '방패병', icon: '🛡️', kind: 'unit', cost: 55, sub: '강한 저지 · 매우 높은 체력', range: 1, maxHp: 28, damage: .8, attackInterval: 800, moveSpeed: .10, blockCount: 4 },
  { id: 'pyromancer', name: '화염술사', icon: '🔥', kind: 'unit', cost: 58, sub: '범위 공격 · 다수 적 대응', range: 2.5, maxHp: 8, damage: 1.05, attackInterval: 850, moveSpeed: .14, blockCount: 1, splashRadius: 54 },
  { id: 'medic', name: '매딕', icon: '💉', kind: 'unit', cost: 52, sub: '밤 지원 · 최대 2명 동시 치료', range: 2.4, maxHp: 9, damage: 0, attackInterval: 1050, moveSpeed: .16, blockCount: 0, healAmount: 2, healTargets: 2 },
  { id: 'arrow-tower', name: '화살 포탑', icon: '🏰', kind: 'turret', cost: 80, sub: '빠른 단일 공격', range: 3, detectionRange: 4 },
  { id: 'bomb-trap', name: '폭발 덫', icon: '💥', kind: 'turret', cost: 55, sub: '범위 피해 · 재장전', range: 2, detectionRange: 2 },
  { id: 'frost-tower', name: '냉각 포탑', icon: '❄️', kind: 'turret', cost: 95, sub: '적 감속 · 약한 단일 피해', range: 3, detectionRange: 4 },
  { id: 'training', name: '훈련소', icon: '🛡️', kind: 'building', cost: 120, sub: '유닛 강화 연구소' },
  { id: 'workshop', name: '야전 공방', icon: '🔧', kind: 'building', cost: 110, sub: '포탑 · 덫 보강' },
  { id: 'infirmary', name: '의무소', icon: '⛑️', kind: 'building', cost: 95, sub: '유닛 체력 회복 지원' },
  { id: 'supply', name: '보급소', icon: '📦', kind: 'building', cost: 100, sub: '유닛 고용 비용 절감' },
]

const upgrades = [
  { id: 'sharp', name: '날 선 무기', text: '모든 유닛 공격력 +10%', cost: 70 },
  { id: 'guard', name: '견고한 방패', text: '근접 유닛 최대 체력 +20%', cost: 85 },
  { id: 'focus', name: '집중 사격', text: '궁수 공격 범위 +1', cost: 100 },
]

const PHASE_SECONDS = { 낮: 60, 황혼: 10, 밤: 30 } as const

const DAY_GOALS: Record<number, { id: string; action: 'unit' | 'turret' | 'manage' | 'boss'; label: string; detail: string; reward: number }> = {
  1: { id: 'day-1-unit', action: 'unit', label: '유닛 생산', detail: '검사 또는 궁수를 생산 대기열에 넣으세요.', reward: 20 },
  2: { id: 'day-2-turret', action: 'turret', label: '포탑 설치', detail: '본진 주변의 파란 슬롯에 포탑을 설치하세요.', reward: 25 },
  3: { id: 'day-3-manage', action: 'manage', label: '건축물 관리', detail: '필드의 건축물을 눌러 관리 화면을 확인하세요.', reward: 25 },
  5: { id: 'day-5-boss', action: 'boss', label: '첫 보스 격파', detail: '이번 밤에 출현하는 보스를 쓰러뜨리세요.', reward: 50 },
}

const BASE_UPGRADES = [
  { id: 'economy', icon: '⛏️', name: '자급자족', text: '골드 수입 +0.25/초 · 철근 생산 가속', baseCost: 70 },
  { id: 'fortify', icon: '🛡️', name: '거점 방어', text: '본진 최대 체력 +20 · 강화 시 체력 회복', baseCost: 85 },
  { id: 'command', icon: '📯', name: '지휘 체계', text: '생산 대기열 +2 · 유닛 생산 시간 단축', baseCost: 75 },
  { id: 'steel', icon: '🔩', name: '제련 설비', text: '철근 생산 주기 -1초', baseCost: 80 },
]

const BUILDING_SLOTS = [
  { x: 3820, y: 3820, label: '북서' }, { x: 4180, y: 3820, label: '북동' },
  { x: 4180, y: 4180, label: '남동' }, { x: 3820, y: 4180, label: '남서' },
]

const SAVE_KEY = 'last-stand-save-v1'
const getItem = (id: string) => items.find((item) => item.id === id)!
const DEFAULT_PLACED: Record<string, { item: Item; x: number; y: number }> = {
  'training-initial': { item: getItem('training'), x: 3820, y: 3820 }, 'workshop-initial': { item: getItem('workshop'), x: 4180, y: 3820 },
  'infirmary-initial': { item: getItem('infirmary'), x: 3820, y: 4180 }, 'supply-initial': { item: getItem('supply'), x: 4180, y: 4180 },
}
type SaveData = Partial<{ placed: Record<string, { item: Item; x: number; y: number }>; gold: number; steelBars: number; storedGold: number; storedSteelBars: number; phase: '낮' | '황혼' | '밤'; day: number; timeLeft: number; baseHp: number; productionQueue: Production[]; buildingLevels: Record<string, number>; baseUpgrades: Record<string, number>; supplyUpgrades: Record<'discount' | 'yield', number>; buildingHp: Record<string, number>; purchased: string[]; kills: number; emergencyRepairDay: number | null; emergencyUses: Record<string, number>; completedGoals: string[]; trainingDoctrine: TrainingDoctrine; gameSpeed: 1 | 2 }>
function loadSave(): SaveData {
  try { const value = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}'); return value && typeof value === 'object' ? value : {} } catch { return {} }
}

function App() {
  const [saved] = useState<SaveData>(loadSave)
  const [tab, setTab] = useState<Tab>('unit')
  const [selected, setSelected] = useState<Item | null>(null)
  const [dragging, setDragging] = useState<Item | null>(null)
  const [dragCursor, setDragCursor] = useState<{ x: number; y: number } | null>(null)
  const draggingItemRef = useRef<Item | null>(null)
  const [placed, setPlaced] = useState<Record<string, { item: Item; x: number; y: number }>>(saved.placed ?? DEFAULT_PLACED)
  const [gold, setGold] = useState(saved.gold ?? 168)
  const [steelBars, setSteelBars] = useState(saved.steelBars ?? 0)
  const [storedGold, setStoredGold] = useState(saved.storedGold ?? 0)
  const [storedSteelBars, setStoredSteelBars] = useState(saved.storedSteelBars ?? 0)
  const [phase, setPhase] = useState<'낮' | '황혼' | '밤'>(saved.phase ?? '낮')
  const [day, setDay] = useState(saved.day ?? 1)
  const [timeLeft, setTimeLeft] = useState<number>(saved.timeLeft ?? PHASE_SECONDS.낮)
  const [baseHp, setBaseHp] = useState(saved.baseHp ?? 100)
  const [gameOver, setGameOver] = useState(false)
  const [basePanelOpen, setBasePanelOpen] = useState(true)
  const [productionQueue, setProductionQueue] = useState<Production[]>(saved.productionQueue ?? [])
  const [modal, setModal] = useState<BuildingModal | null>(null)
  const [buildingLevels, setBuildingLevels] = useState<Record<string, number>>(saved.buildingLevels ?? {})
  const [baseUpgrades, setBaseUpgrades] = useState<Record<string, number>>(saved.baseUpgrades ?? {})
  const [supplyUpgrades, setSupplyUpgrades] = useState<Record<'discount' | 'yield', number>>(saved.supplyUpgrades ?? { discount: 0, yield: 0 })
  const [buildingHp, setBuildingHp] = useState<Record<string, number>>(saved.buildingHp ?? {})
  const [purchased, setPurchased] = useState<string[]>(saved.purchased ?? [])
  const [kills, setKills] = useState(saved.kills ?? 0)
  const [emergencyRepairDay, setEmergencyRepairDay] = useState<number | null>(saved.emergencyRepairDay ?? null)
  const [notice, setNotice] = useState('낮 동안 기지를 보강하세요.')
  const [gameSpeed, setGameSpeed] = useState<1 | 2>(saved.gameSpeed ?? 1)
  const [isPaused, setIsPaused] = useState(false)
  const [showEmergencyGuide, setShowEmergencyGuide] = useState(false)
  const [emergencyAction, setEmergencyAction] = useState<EmergencyAction>(null)
  const [emergencyUses, setEmergencyUses] = useState<Record<string, number>>(saved.emergencyUses ?? {})
  const [completedGoals, setCompletedGoals] = useState<string[]>(saved.completedGoals ?? [])
  const [trainingDoctrine, setTrainingDoctrine] = useState<TrainingDoctrine>(saved.trainingDoctrine ?? null)
  const [tutorialStep, setTutorialStep] = useState(() => Number(window.localStorage.getItem('last-stand-tutorial-step') ?? 0))
  const killsRef = useRef(0)
  const nightStartKillsRef = useRef(0)
  const nightRewardRef = useRef(0)
  const nightDestroyedRef = useRef(0)
  const [nightReport, setNightReport] = useState<{ day: number; kills: number; reward: number; losses: number; tip: string } | null>(null)
  const [highScore, setHighScore] = useState(() => Number(window.localStorage.getItem('last-stand-high-score') ?? 0))
  const previousPhaseRef = useRef(phase)
  const production = productionQueue[0] ?? null
  const activeProductionId = production?.item.id

  const tabItems = useMemo(() => items.filter((item) => item.kind === tab), [tab])
  const economyLevel = baseUpgrades.economy ?? 0
  const fortifyLevel = baseUpgrades.fortify ?? 0
  const commandLevel = baseUpgrades.command ?? 0
  const steelLevel = baseUpgrades.steel ?? 0
  const baseMaxHp = 100 + fortifyLevel * 20
  const queueCapacity = 8 + commandLevel * 2
  const canPrepare = phase !== '밤' && !gameOver
  const getBuildingLevel = (buildingId: string) => Math.max(1, ...Object.entries(placed)
    .filter(([, entity]) => entity.item.id === buildingId)
    .map(([id]) => buildingLevels[id] ?? 1))
  const trainingLevel = getBuildingLevel('training')
  const unitDamageMultiplier = 1 + (trainingLevel - 1) * .05 + (purchased.includes('sharp') ? .1 : 0)
  const warriorHpMultiplier = purchased.includes('guard') ? 1.2 : 1
  const archerRangeBonus = purchased.includes('focus') ? 1 : 0
  const warriorBlockBonus = trainingDoctrine === 'vanguard' ? 1 : 0
  const archerAttackSpeedMultiplier = trainingDoctrine === 'ranger' ? .75 : 1
  const workshopLevel = getBuildingLevel('workshop')
  const infirmaryLevel = getBuildingLevel('infirmary')
  const supplyDiscountLevel = supplyUpgrades.discount
  const supplyYieldLevel = supplyUpgrades.yield
  const getUnitCost = (item: Item) => Math.ceil(item.cost * (1 - Math.min(.25, supplyDiscountLevel * .05)))
  const warriorCount = Object.values(placed).filter((entity) => entity.item.id === 'warrior').length
  const archerCount = Object.values(placed).filter((entity) => entity.item.id === 'archer').length
  const combatPower = Math.round(Object.values(placed).reduce((total, entity) => {
    const item = entity.item
    if (item.kind === 'turret') return total + (item.id === 'arrow-tower' ? 22 : item.id === 'bomb-trap' ? 27 : 25) * (1 + (workshopLevel - 1) * .12)
    if (item.kind !== 'unit') return total
    if (item.id === 'medic') return total + 22
    const hp = (item.maxHp ?? 8) * (item.id === 'warrior' ? warriorHpMultiplier : 1)
    const attackRate = 1000 / ((item.attackInterval ?? 700) * (item.id === 'archer' ? archerAttackSpeedMultiplier : 1))
    const block = (item.blockCount ?? 1) + (item.id === 'warrior' ? warriorBlockBonus : 0)
    return total + hp * .55 + (item.damage ?? 0) * unitDamageMultiplier * attackRate * 10 + (item.range ?? 1) * 2 + block * 2
  }, 0) + fortifyLevel * 3)
  const nightThreat = Math.round(18 + day * 7 + (day >= 4 ? 7 : 0) + (day >= 6 ? 10 : 0) + (day >= 8 ? 12 : 0) + (day % 5 === 0 ? 30 : 0))
  const threatStatus = combatPower < nightThreat * .8 ? '위험' : combatPower > nightThreat * 1.2 ? '안정' : '경계'
  const threatEnemies = `${day >= 8 ? '공병 · ' : ''}${day >= 6 ? '파괴병 · ' : ''}${day >= 4 ? '돌진병 · ' : ''}일반 좀비${day % 5 === 0 ? ' · 보스' : ''}`
  const activeGoal = DAY_GOALS[day]
  const isGoalDone = activeGoal ? completedGoals.includes(activeGoal.id) : false

  useLayoutEffect(() => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ placed, gold, steelBars, storedGold, storedSteelBars, phase, day, timeLeft, baseHp, productionQueue, buildingLevels, baseUpgrades, supplyUpgrades, buildingHp, purchased, kills, emergencyRepairDay, emergencyUses, completedGoals, trainingDoctrine, gameSpeed }))
  }, [placed, gold, steelBars, storedGold, storedSteelBars, phase, day, timeLeft, baseHp, productionQueue, buildingLevels, baseUpgrades, supplyUpgrades, buildingHp, purchased, kills, emergencyRepairDay, emergencyUses, completedGoals, trainingDoctrine, gameSpeed])

  useEffect(() => {
    let seconds = 0
    const income = window.setInterval(() => {
      seconds += 1
      setStoredGold((value) => value + 1 + (seconds % 4 === 0 ? economyLevel + supplyYieldLevel : 0))
      const steelCycle = Math.max(3, 8 - Math.floor(economyLevel / 2) - steelLevel)
      if (seconds % steelCycle === 0) setStoredSteelBars((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(income)
  }, [economyLevel, supplyYieldLevel, steelLevel])

  useEffect(() => {
    // On restore, previousPhaseRef already equals phase. This also makes Strict Mode's extra effect pass harmless.
    if (previousPhaseRef.current === phase) return
    setTimeLeft(PHASE_SECONDS[phase])
    setEmergencyUses({})
    setEmergencyAction(null)
    if (phase === '밤') { nightStartKillsRef.current = killsRef.current; nightRewardRef.current = 0; nightDestroyedRef.current = 0 }
    previousPhaseRef.current = phase
  }, [phase])

  useEffect(() => { killsRef.current = kills }, [kills])

  useEffect(() => {
    if (gameOver || isPaused) return
    const timer = window.setInterval(() => setTimeLeft((current) => Math.max(0, current - gameSpeed)), 1000)
    return () => window.clearInterval(timer)
  }, [gameOver, isPaused, gameSpeed])

  useEffect(() => {
    if (gameOver || timeLeft !== 0) return
    if (phase === '낮') {
      setTimeLeft(PHASE_SECONDS.황혼)
      setPhase('황혼')
      return
    }
    if (phase === '황혼') {
      setTimeLeft(PHASE_SECONDS.밤)
      setPhase('밤')
      return
    }
    const nightKills = killsRef.current - nightStartKillsRef.current
    const tip = nightDestroyedRef.current > 0 ? '파괴된 시설을 재건하세요.' : baseHp < baseMaxHp * .65 ? '철근으로 본진을 수리하세요.' : warriorCount + archerCount < day + 2 ? '다음 밤을 위해 유닛을 보충하세요.' : '강화 또는 포탑으로 방어선을 보강하세요.'
    setNightReport({ day, kills: nightKills, reward: nightRewardRef.current, losses: nightDestroyedRef.current, tip })
    setNotice('밤 생존 성공 · 처치 ' + nightKills + '마리')
    setTimeLeft(PHASE_SECONDS.낮)
    setDay((current) => current + 1)
    setPhase('낮')
  }, [timeLeft, gameOver, phase, day, baseHp, baseMaxHp, warriorCount, archerCount])

  useEffect(() => {
    if (baseHp === 0) {
      setGameOver(true)
      const record = Math.max(highScore, day)
      setHighScore(record)
      window.localStorage.setItem('last-stand-high-score', String(record))
      setNotice(`DAY ${day}: 최후의 생존자가 무너졌습니다.`)
    }
  }, [baseHp, day, highScore])

  useEffect(() => {
    if (!activeProductionId) return
    const timer = window.setInterval(() => {
      setProductionQueue((current) => {
        const active = current[0]
        if (!active) return current
        if (active.remaining > 1) return [{ ...active, remaining: active.remaining - 1 }, ...current.slice(1)]
        const count = getProductionSpec(active.item).count
        setPlaced((entities) => {
          const next = { ...entities }
          for (let index = 0; index < count; index += 1) {
            let x = 4000
            let y = 4000
            for (let attempt = 0; attempt < 12; attempt += 1) {
              const angle = Math.random() * Math.PI * 2
              const distance = 120 + Math.random() * 120
              const candidateX = Math.round((4000 + Math.cos(angle) * distance) / 60) * 60
              const candidateY = Math.round((4000 + Math.sin(angle) * distance) / 60) * 60
              const isFree = Object.values(next).every((entity) => Math.hypot(entity.x - candidateX, entity.y - candidateY) >= 70)
              if (isFree) { x = candidateX; y = candidateY; break }
            }
            next[active.item.id + '-' + Date.now() + '-' + index] = { item: active.item, x, y }
          }
          return next
        })
        setNotice(active.item.name + ' ' + count + '명 생산 완료!')
        return current.slice(1)
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [activeProductionId])

  function beginDrag(event: PointerEvent<HTMLButtonElement>, item: Item) {
    console.log('[Last Stand] drag:start', { itemId: item.id, gold })
    event.preventDefault()
    draggingItemRef.current = item
    setSelected(item)
    setDragging(item)
    setDragCursor({ x: event.clientX, y: event.clientY })
  }

  const completeDailyGoal = useCallback((action: 'unit' | 'turret' | 'manage' | 'boss') => {
    if (!activeGoal || activeGoal.action !== action || completedGoals.includes(activeGoal.id)) return
    setCompletedGoals((current) => [...current, activeGoal.id])
    setGold((current) => current + activeGoal.reward)
    setNotice(`목표 완료: ${activeGoal.label} · 코인 +${activeGoal.reward}`)
  }, [activeGoal, completedGoals])

  const getProductionSpec = (item: Item) => item.id === 'warrior' ? { count: 2, seconds: 4 } : item.id === 'guardian' || item.id === 'pyromancer' || item.id === 'medic' ? { count: 1, seconds: 6 } : { count: 1, seconds: 5 }

  function startUnitProduction(item: Item) {
    if (!canPrepare) { setNotice('밤에는 유닛 생산을 시작할 수 없습니다.'); return }
    const cost = getUnitCost(item)
    if (gold < cost) { setNotice('골드가 부족합니다.'); return }
    if (productionQueue.length >= queueCapacity) { setNotice('생산 대기열이 가득 찼습니다. 거점 강화로 최대 수를 늘릴 수 있습니다.'); return }
    setGold((value) => value - cost)
    setProductionQueue((current) => [...current, { item, remaining: Math.max(2, Math.ceil(getProductionSpec(item).seconds * (1 - Math.min(.4, commandLevel * .1)))) }])
    completeDailyGoal('unit')
    setNotice(`${item.name}을(를) 생산 대기열에 추가했습니다.`)
  }

  useEffect(() => {
    if (!dragging) return
    const move = (event: globalThis.PointerEvent) => setDragCursor({ x: event.clientX, y: event.clientY })
    const end = () => {
      draggingItemRef.current = null
      setDragging(null)
      setDragCursor(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
  }, [dragging])

  const place = useCallback((x: number, y: number, itemId?: string) => {
    const item = itemId ? items.find((candidate) => candidate.id === itemId) ?? null : draggingItemRef.current ?? dragging ?? selected
    console.log('[Last Stand] placement:attempt', { x: Math.round(x), y: Math.round(y), itemId, resolvedItem: item?.id, gold })
    if (!item) {
      console.warn('[Last Stand] placement:failed', { reason: 'missing-item' })
      setNotice('생성할 유닛을 찾지 못했습니다. 카드를 다시 드래그해 주세요.')
      return
    }
    if (tab === 'upgrade') return
    if (!canPrepare) { setNotice('밤에는 건설할 수 없습니다. 긴급 수리만 가능합니다.'); return }
    if (item.kind === 'turret') {
      console.warn('[Last Stand] placement:failed', { reason: 'turret-slot-only', item: item.id })
      setNotice('포탑은 최후의 생존자 주변 4방향의 파란 포탑 슬롯에만 설치할 수 있습니다.')
      setDragging(null)
      return
    }
    if (gold < item.cost) {
      console.warn('[Last Stand] placement:failed', { reason: 'insufficient-gold', gold, cost: item.cost })
      setNotice('골드가 부족합니다.')
      setDragging(null)
      return
    }
    let snappedX = Math.round(x / 60) * 60
    let snappedY = Math.round(y / 60) * 60
    if (item.kind === 'building') {
      const slot = BUILDING_SLOTS.find((candidate) => Math.hypot(candidate.x - x, candidate.y - y) <= 82)
      if (!slot) {
        setNotice('건축물은 본진 주변의 황금 건축 슬롯에만 설치할 수 있습니다.')
        setDragging(null)
        return
      }
      snappedX = slot.x
      snappedY = slot.y
    }
    const isOccupied = Object.values(placed).some((entity) => Math.hypot(entity.x - snappedX, entity.y - snappedY) < 70)
    if (isOccupied) {
      console.warn('[Last Stand] placement:failed', { reason: 'occupied', x: snappedX, y: snappedY })
      setNotice('다른 시설이나 유닛과 너무 가깝습니다.')
      setDragging(null)
      return
    }
    const id = `${item.id}-${snappedX}-${snappedY}`
    setPlaced((current) => ({ ...current, [id]: { item, x: snappedX, y: snappedY } }))
    console.log('[Last Stand] placement:success', { id, item: item.id, x: snappedX, y: snappedY, cost: item.cost })
    setGold((value) => value - item.cost)
    setNotice(`${item.name}을(를) 필드에 설치했습니다.`)
    draggingItemRef.current = null
    setDragging(null)
  }, [canPrepare, dragging, gold, placed, selected, tab])

  const handlePlacedClick = useCallback((id: string, item: Item) => {
    if (item.kind === 'building') {
      setModal({ id, item })
      completeDailyGoal('manage')
      setNotice(`${item.name} 관리 페이지를 열었습니다.`)
    }
    else setNotice(`${item.name}: ${item.sub}`)
  }, [completeDailyGoal])

  const handleCoreClick = useCallback(() => {
    setBasePanelOpen(true)
    setTab('resource')
    setNotice('최후의 생존자 운영 패널을 열었습니다.')
  }, [setNotice])

  const collectBaseResources = () => {
    if (storedGold === 0 && storedSteelBars === 0) { setNotice('기지가 자원을 생성 중입니다.'); return }
    setGold((value) => value + storedGold)
    setSteelBars((value) => value + storedSteelBars)
    setStoredGold(0)
    setStoredSteelBars(0)
    setNotice(`기지 자원 회수: 코인 +${storedGold}, 철근 +${storedSteelBars}`)
  }

  const handleEntityDestroyed = useCallback((id: string, name: string, item: Item) => {
    setPlaced((current) => {
      const { [id]: destroyed, ...remaining } = current
      return destroyed ? remaining : current
    })
    if (phase === '밤') nightDestroyedRef.current += 1
    setNotice(`${name}이(가) 몬스터에게 파괴되었습니다. 건축물 탭에서 재건할 수 있습니다.`)
    if (item.kind === 'building') setTab('building')
  }, [phase])

  const handleBaseDamaged = useCallback((damage: number) => {
    if (gameOver) return
    setBaseHp((current) => Math.max(0, current - damage))
  }, [gameOver])

  const handleBuildingHpChange = useCallback((id: string, hp: number) => {
    setBuildingHp((current) => current[id] === hp ? current : { ...current, [id]: hp })
  }, [])

  const handleEnemyDefeated = useCallback((reward: number, isBoss: boolean) => {
    if (phase === '밤') nightRewardRef.current += reward
    if (isBoss) completeDailyGoal('boss')
    setGold((current) => current + reward)
    setKills((current) => current + 1)
  }, [phase, completeDailyGoal])

  function triggerEmergencySkill(id: 'flare' | 'shockwave' | 'medkit') {
    if (phase !== '밤' || gameOver) { setNotice('긴급 스킬은 밤 전투 중에만 사용할 수 있습니다.'); return }
    if (emergencyUses[id]) { setNotice('이번 밤에는 이미 사용한 긴급 스킬입니다.'); return }
    const cost = id === 'medkit' ? 2 : 1
    if (steelBars < cost) { setNotice(`긴급 스킬에 철근 ${cost}개가 필요합니다.`); return }
    setSteelBars((current) => current - cost)
    setEmergencyUses((current) => ({ ...current, [id]: 1 }))
    setEmergencyAction({ id, nonce: Date.now() })
    setNotice(id === 'flare' ? '조명탄 발사: 모든 적에게 피해를 줍니다.' : id === 'shockwave' ? '방벽 충격파: 적을 밀어냅니다.' : '응급 치료: 모든 아군 체력을 회복합니다.')
  }

  function finishTutorial() {
    window.localStorage.setItem('last-stand-tutorial-step', '3')
    setTutorialStep(3)
  }

  const getBaseRepairCost = () => Math.max(1, Math.ceil((baseMaxHp - baseHp) / 20))

  function repairBase() {
    if (baseHp >= baseMaxHp) { setNotice('본진 체력이 이미 최대입니다.'); return }
    if (phase === '밤' && emergencyRepairDay === day) { setNotice('이번 밤의 긴급 수리는 이미 사용했습니다.'); return }
    const cost = getBaseRepairCost()
    if (steelBars < cost) { setNotice(`본진 수리에 철근 ${cost}개가 필요합니다.`); return }
    setSteelBars((current) => current - cost)
    setBaseHp(baseMaxHp)
    if (phase === '밤') setEmergencyRepairDay(day)
    setNotice(phase === '밤' ? `긴급 수리 완료: 철근 ${cost}개로 본진을 완전히 수리했습니다.` : `본진 완전 수리 완료: 철근 ${cost}개 사용`)
  }

  function upgradeBuilding() {
    if (!canPrepare) { setNotice('밤에는 건축물 강화를 할 수 없습니다.'); return }
    if (!modal) return
    const level = buildingLevels[modal.id] ?? 1
    const cost = Math.ceil(modal.item.cost * 0.55 * 1.18 ** (level - 1))
    if (gold < cost) { setNotice('골드가 부족합니다.'); return }
    setGold((value) => value - cost)
    setBuildingLevels((current) => ({ ...current, [modal.id]: level + 1 }))
    setNotice(`${modal.item.name}이(가) Lv.${level + 1}로 강화되었습니다.`)
  }

  const getRepairCost = (id: string) => Math.max(1, Math.ceil((100 - (buildingHp[id] ?? 100)) / 20))

  function repairBuilding() {
    if (!canPrepare) { setNotice('밤에는 건축물 수리를 할 수 없습니다.'); return }
    if (!modal) return
    const currentHp = buildingHp[modal.id] ?? 100
    if (currentHp >= 100) { setNotice('이미 최대 체력입니다.'); return }
    const cost = getRepairCost(modal.id)
    if (steelBars < cost) { setNotice('수리에 필요한 철근이 부족합니다.'); return }
    setSteelBars((value) => value - cost)
    setBuildingHp((current) => ({ ...current, [modal.id]: 100 }))
    setNotice(`${modal.item.name}을(를) 수리했습니다.`)
  }

  const placeTurret = useCallback((x: number, y: number) => {
    if (!canPrepare) { setNotice('밤에는 포탑을 설치할 수 없습니다.'); return }
    if (!selected || selected.kind !== 'turret') {
      setNotice('포탑을 선택한 뒤, 최후의 생존자 주변의 파란 포탑 슬롯을 탭하세요.')
      return
    }
    if (gold < selected.cost) {
      setNotice('골드가 부족합니다.')
      return
    }
    if (Object.values(placed).some((entity) => entity.item.kind === 'turret' && Math.hypot(entity.x - x, entity.y - y) < 2)) {
      setNotice('이미 포탑이 설치된 방향입니다.')
      return
    }
    setPlaced((current) => ({ ...current, [`${selected.id}-${x}-${y}`]: { item: selected, x, y } }))
    setGold((value) => value - selected.cost)
    completeDailyGoal('turret')
    setNotice(`${selected.name}을(를) 포탑 슬롯에 설치했습니다.`)
  }, [canPrepare, gold, placed, selected, completeDailyGoal])

  function buySupplyUpgrade(track: 'discount' | 'yield') {
    if (!canPrepare) { setNotice('밤에는 보급소 강화를 할 수 없습니다.'); return }
    const level = supplyUpgrades[track]
    const cost = Math.ceil(55 * 1.25 ** level)
    if (gold < cost) { setNotice('골드가 부족합니다.'); return }
    setGold((current) => current - cost)
    setSupplyUpgrades((current) => ({ ...current, [track]: level + 1 }))
    setNotice(track === 'discount' ? '유닛 고용 비용이 감소했습니다.' : '기지 보급 생산량이 증가했습니다.')
  }

  function buyBaseUpgrade(id: string, baseCost: number) {
    if (!canPrepare) { setNotice('밤에는 거점 강화를 할 수 없습니다.'); return }
    const level = baseUpgrades[id] ?? 0
    const cost = Math.ceil(baseCost * 1.22 ** level)
    if (gold < cost) { setNotice('골드가 부족합니다.'); return }
    setGold((current) => current - cost)
    setBaseUpgrades((current) => ({ ...current, [id]: level + 1 }))
    if (id === 'fortify') setBaseHp((current) => Math.min(baseMaxHp + 20, current + 20))
    setNotice('거점 강화 완료!')
  }

  const getBuildingEffectText = (item: Item, level: number) => {
    if (item.id === 'training') return `유닛 공격력 +${(level - 1) * 5}%`
    if (item.id === 'workshop') return `포탑 피해 +${(level - 1) * 25}% · 덫 재장전 -${(level - 1) * 90}ms`
    if (item.id === 'infirmary') return `낮 전환 시 유닛 체력 +${2 + level * 2}`
    return `고용 비용 -${Math.min(25, supplyDiscountLevel * 5)}% · 보급 생산 +${supplyYieldLevel}/4초`
  }

  const getBaseUpgradePreview = (id: string, level: number) => {
    if (id === 'economy') return `골드 +${(level * .25).toFixed(2)}/초 → +${((level + 1) * .25).toFixed(2)}/초`
    if (id === 'fortify') return `본진 최대 체력 ${100 + level * 20} → ${100 + (level + 1) * 20}`
    if (id === 'command') return `대기열 ${8 + level * 2} → ${10 + level * 2} · 생산 시간 -${level * 10}% → -${Math.min(40, (level + 1) * 10)}%`
    return `철근 생산 ${Math.max(3, 8 - Math.floor(economyLevel / 2) - level)}초 → ${Math.max(3, 8 - Math.floor(economyLevel / 2) - level - 1)}초`
  }

  const getSupplyPreview = (track: 'discount' | 'yield') => {
    const level = supplyUpgrades[track]
    return track === 'discount'
      ? `고용 비용 -${Math.min(25, level * 5)}% → -${Math.min(25, (level + 1) * 5)}%`
      : `보급 생산 +${level}/4초 → +${level + 1}/4초`
  }

  function chooseDoctrine(doctrine: Exclude<TrainingDoctrine, null>) {
    if (!canPrepare) { setNotice('밤에는 전술 교리를 선택할 수 없습니다.'); return }
    if (trainingDoctrine) { setNotice('전술 교리는 이미 선택했습니다.'); return }
    if (gold < 90) { setNotice('전술 교리 선택에는 골드 90이 필요합니다.'); return }
    setGold((current) => current - 90)
    setTrainingDoctrine(doctrine)
    setNotice(doctrine === 'vanguard' ? '전술 교리: 전위대 — 검사 저지 수 +1' : '전술 교리: 사수대 — 궁수 공격 속도 +25%')
  }

  function buyUpgrade(id: string, cost: number) {
    if (!canPrepare) { setNotice('밤에는 연구할 수 없습니다.'); return }
    if (purchased.includes(id)) return
    if (gold < cost) {
      setNotice('골드가 부족합니다.')
      return
    }
    setGold((value) => value - cost)
    setPurchased((current) => [...current, id])
    setNotice('훈련이 완료되었습니다. 유닛이 강해졌습니다.')
  }

  return (
    <main className="game-shell">
      <header className="hud">
        <div className="day-block"><span>DAY</span><strong>{String(day).padStart(2, '0')}</strong></div>
        <div className={`phase-button ${phase}`}>
          <span>{phase === '낮' ? '☀️' : phase === '황혼' ? '🌆' : '🌙'}</span>{phase} <b>{String(timeLeft).padStart(2, '0')}초</b>
          <div className="time-controls"><button onClick={() => setIsPaused((value) => !value)} aria-label={isPaused ? '계속' : '일시정지'}>{isPaused ? '▶' : 'Ⅱ'}</button><button onClick={() => setGameSpeed((value) => value === 1 ? 2 : 1)} aria-label="배속 변경">{gameSpeed}×</button></div>
        </div>
        <div className="base-health"><span>본진 · ⚔ {combatPower}</span><div><i className={baseHp / baseMaxHp > .6 ? 'healthy' : baseHp / baseMaxHp > .3 ? 'caution' : 'critical'} style={{ width: `${baseHp / baseMaxHp * 100}%` }} /></div><b>{baseHp} / {baseMaxHp}</b></div>
      </header>

      <section className="resources" aria-label="자원">
        <span>🪙 <b>{gold}</b></span><span>🔩 <b>{steelBars}</b></span><span>⚔️ <b>{warriorCount}</b></span><span>🏹 <b>{archerCount}</b></span><span>☠ <b>{kills}</b></span>
        <small>기지 비축: 🪙 {storedGold} · 🔩 {storedSteelBars}</small>
      </section>

      <section className="battlefield" aria-label="8방향 본진 지도">
        <BattlefieldCanvas placed={placed} selected={selected} preview={dragging} previewCursor={dragCursor} phase={phase} day={day} isGameOver={gameOver} gameSpeed={gameSpeed} isPaused={isPaused} emergencyAction={emergencyAction} buildingHp={buildingHp} trainingLevel={trainingLevel} unitDamageMultiplier={unitDamageMultiplier} warriorHpMultiplier={warriorHpMultiplier} archerRangeBonus={archerRangeBonus} warriorBlockBonus={warriorBlockBonus} archerAttackSpeedMultiplier={archerAttackSpeedMultiplier} workshopLevel={workshopLevel} infirmaryLevel={infirmaryLevel} combatPower={combatPower} nightThreat={nightThreat} threatStatus={threatStatus} threatEnemies={threatEnemies} onMapClick={place} onTurretSlotClick={placeTurret} onEntityDestroyed={handleEntityDestroyed} onEntityClick={handlePlacedClick} onCoreClick={handleCoreClick} onBaseDamaged={handleBaseDamaged} onEnemyDefeated={handleEnemyDefeated} onBuildingHpChange={handleBuildingHpChange} />
      </section>

      <p className="notice">{notice}</p>
      {activeGoal && <section className={`daily-goal ${isGoalDone ? 'done' : ''}`}><span>{isGoalDone ? '✓' : '◎'}</span><div><b>DAY {day} 목표 · {activeGoal.label}</b><small>{isGoalDone ? `완료 · 코인 +${activeGoal.reward}` : activeGoal.detail}</small></div></section>}

      {basePanelOpen && <>
        <nav className="tabs" aria-label="기지 운영 메뉴">
          {([['resource', '⛏', '자원채취'], ['unit', '⚔', '유닛'], ['turret', '⌖', '포탑'], ['upgrade', '✦', '거점 강화'], ['building', '⌂', '건축물']] as const).map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setSelected(null) }}><span>{icon}</span>{label}</button>
          ))}
        </nav>

        <section className="build-panel">
          {tab === 'resource' && <div className="upgrade-guide"><span>🏕️</span><div><b>기지 자원 비축</b><p>코인 {storedGold} · 철근 {storedSteelBars}<br />결손 체력 20당 철근 1개</p></div><button onClick={collectBaseResources}>자원 회수</button><button onClick={repairBase} disabled={baseHp >= baseMaxHp || (phase === '밤' && emergencyRepairDay === day)}>🔩 {getBaseRepairCost()} 완전 수리</button></div>}
          {tab === 'unit' && tabItems.map((item) => (
            <button key={item.id} onClick={() => startUnitProduction(item)} disabled={!canPrepare} className="build-card">
              <span className="card-icon">{item.icon}</span><span className="card-copy"><b>{item.name}</b><small>{getProductionSpec(item).seconds}초 후 {getProductionSpec(item).count}명 생성</small></span><span className="cost">🪙 {getUnitCost(item)}</span>
            </button>
          ))}
          {tab === 'turret' && tabItems.map((item) => (
            <button key={item.id} onClick={() => { setSelected(item); setNotice(`${item.name} 선택됨 — 기지 주변 포탑 슬롯을 탭하세요.`) }} disabled={!canPrepare} className={`build-card ${selected?.id === item.id ? 'selected' : ''}`}>
              <span className="card-icon">{item.icon}</span><span className="card-copy"><b>{item.name}</b><small>{item.sub}</small></span><span className="cost">🪙 {item.cost}</span>
            </button>
          ))}
          {tab === 'upgrade' && BASE_UPGRADES.map((upgrade) => { const level = baseUpgrades[upgrade.id] ?? 0; const cost = Math.ceil(upgrade.baseCost * 1.22 ** level); return <button key={upgrade.id} onClick={() => buyBaseUpgrade(upgrade.id, upgrade.baseCost)} disabled={!canPrepare} className="build-card"><span className="card-icon">{upgrade.icon}</span><span className="card-copy"><b>{upgrade.name} Lv.{level}</b><small>{upgrade.text}<br /><b className="upgrade-preview">{getBaseUpgradePreview(upgrade.id, level)}</b></small></span><span className="cost">🪙 {cost}</span></button> })}
          {tab === 'building' && tabItems.map((item) => { const installed = Object.values(placed).some((entity) => entity.item.id === item.id); return (
            <button key={item.id} onPointerDown={(event) => beginDrag(event, item)} disabled={!canPrepare || installed} className={`build-card ${selected?.id === item.id ? 'selected' : ''} ${installed ? 'installed' : 'rebuild'}`}>
              <span className="card-icon">{item.icon}</span><span className="card-copy"><b>{installed ? item.name : `${item.name} 재건`}</b><small>{installed ? '설치 완료 · 필드에서 관리' : `${item.sub} · 빈 황금 슬롯에 드래그`}</small></span><span className="cost">{installed ? '설치됨' : `🪙 ${item.cost}`}</span>
            </button>
          )})}
          {production && <div className="production-status"><b>생산</b> {production.item.icon} {production.item.name} · {production.remaining}초 {productionQueue.length > 1 && <span>대기 {productionQueue.length - 1} · {productionQueue.slice(1).map((entry) => entry.item.icon).join(' ')}</span>}</div>}
        </section>
      </>}

      {phase === '밤' && !gameOver && <section className="emergency-skills"><b>긴급 대응</b><button className="emergency-help" onClick={() => setShowEmergencyGuide(true)}>?</button><button disabled={Boolean(emergencyUses.flare)} onClick={() => triggerEmergencySkill('flare')}>🔦 조명탄<small>🔩 1</small></button><button disabled={Boolean(emergencyUses.shockwave)} onClick={() => triggerEmergencySkill('shockwave')}>🛡 충격파<small>🔩 1</small></button><button disabled={Boolean(emergencyUses.medkit)} onClick={() => triggerEmergencySkill('medkit')}>⛑ 응급치료<small>🔩 2</small></button></section>}

      {showEmergencyGuide && <div className="modal-backdrop" onClick={() => setShowEmergencyGuide(false)}><section className="research-modal" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowEmergencyGuide(false)}>×</button><span className="modal-icon">🚨</span><p className="eyebrow">밤 전투 전용</p><h1>긴급 대응</h1><p className="modal-description">각 스킬은 <b>밤마다 1회</b>만 사용할 수 있고, 철근을 소비합니다.</p><div className="research-list"><article><div><b>🔦 조명탄 · 철근 1</b><span>필드의 모든 적에게 3 피해를 줍니다. 다수의 일반 적을 정리할 때 사용하세요.</span></div></article><article><div><b>🛡 충격파 · 철근 1</b><span>모든 적을 본진 바깥으로 밀어내고 공격 타이밍을 늦춥니다. 방어선이 뚫렸을 때 유용합니다.</span></div></article><article><div><b>⛑ 응급치료 · 철근 2</b><span>모든 생존 유닛의 체력을 7 회복합니다. 전방 검사가 위급할 때 사용하세요.</span></div></article></div></section></div>}

      {tutorialStep < 3 && !gameOver && <div className="modal-backdrop tutorial"><section className="research-modal"><span className="modal-icon">{['🏕️', '⚔️', '🌙'][tutorialStep]}</span><p className="eyebrow">최후의 생존자 · {tutorialStep + 1}/3</p><h1>{['낮에는 방어선을 준비하세요', '유닛과 포탑으로 길을 막으세요', '밤에는 한 번의 선택이 중요합니다'][tutorialStep]}</h1><p className="modal-description">{['기지에서 생성된 코인과 철근을 회수하세요. 철근은 수리와 긴급 스킬에만 씁니다.', '검사·궁수는 생산 대기열에 넣고, 포탑은 본진 사방의 파란 슬롯에 설치합니다.', '밤에는 적이 몰려옵니다. 조명탄·충격파·응급치료는 각각 밤에 한 번만 쓸 수 있습니다.'][tutorialStep]}</p><div className="tutorial-actions"><button onClick={finishTutorial}>건너뛰기</button><button onClick={() => tutorialStep === 2 ? finishTutorial() : setTutorialStep((current) => current + 1)}>{tutorialStep === 2 ? '생존 시작' : '다음'}</button></div></section></div>}

      {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="research-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close" onClick={() => setModal(null)}>×</button><span className="modal-icon">{modal.item.icon}</span><p className="eyebrow">LV. {buildingLevels[modal.id] ?? 1} · 체력 {buildingHp[modal.id] ?? 100}/100</p><h1>{modal.item.name}</h1><p className="modal-description">{modal.item.sub}<br /><b>현재: {getBuildingEffectText(modal.item, buildingLevels[modal.id] ?? 1)}</b>{modal.item.id !== 'supply' && <><br /><b className="upgrade-preview">다음: {getBuildingEffectText(modal.item, (buildingLevels[modal.id] ?? 1) + 1)}</b></>}</p>
        {modal.item.id === 'supply' ? <div className="supply-actions"><button onClick={repairBuilding} disabled={!canPrepare || (buildingHp[modal.id] ?? 100) >= 100}>🔩 {getRepairCost(modal.id)} 완전 수리</button><button onClick={() => buySupplyUpgrade('discount')} disabled={!canPrepare}>🪙 비용 절감 Lv.{supplyDiscountLevel}<small>{getSupplyPreview('discount')}<br />비용 {Math.ceil(55 * 1.25 ** supplyDiscountLevel)}</small></button><button onClick={() => buySupplyUpgrade('yield')} disabled={!canPrepare}>🪙 생산량 증가 Lv.{supplyYieldLevel}<small>{getSupplyPreview('yield')}<br />비용 {Math.ceil(55 * 1.25 ** supplyYieldLevel)}</small></button></div> : <div className="building-actions"><button onClick={repairBuilding} disabled={!canPrepare || (buildingHp[modal.id] ?? 100) >= 100}>🔩 {getRepairCost(modal.id)} 완전 수리</button><button onClick={upgradeBuilding} disabled={!canPrepare}>🪙 다음 레벨 {Math.ceil(modal.item.cost * 0.55 * 1.18 ** ((buildingLevels[modal.id] ?? 1) - 1))}</button></div>}
        {modal.item.id === 'training' && <div className="research-list"><article className={trainingDoctrine ? 'done' : ''}><div><b>전술 교리 · 1회 선택</b><span>전위대: 검사 저지 수 +1 / 사수대: 궁수 공격 속도 +25%</span></div><button disabled={!canPrepare || Boolean(trainingDoctrine)} onClick={() => chooseDoctrine('vanguard')}>{trainingDoctrine === 'vanguard' ? '전위대 완료' : trainingDoctrine ? '선택 완료' : '전위대 🪙90'}</button><button disabled={!canPrepare || Boolean(trainingDoctrine)} onClick={() => chooseDoctrine('ranger')}>{trainingDoctrine === 'ranger' ? '사수대 완료' : trainingDoctrine ? '선택 완료' : '사수대 🪙90'}</button></article>{upgrades.map((upgrade) => <article key={upgrade.id} className={purchased.includes(upgrade.id) ? 'done' : ''}><div><b>{upgrade.name}</b><span>{upgrade.text}</span></div><button disabled={purchased.includes(upgrade.id) || !canPrepare} onClick={() => buyUpgrade(upgrade.id, upgrade.cost)}>{purchased.includes(upgrade.id) ? '완료' : `🪙 ${upgrade.cost}`}</button></article>)}</div>}
      </section></div>}
      {nightReport && <div className="modal-backdrop night-report"><section className="research-modal"><span className="modal-icon">🌅</span><p className="eyebrow">DAY {String(nightReport.day).padStart(2, '0')} NIGHT REPORT</p><h1>생존 성공</h1><p className="modal-description">이번 밤 처치: <b>{nightReport.kills}마리</b> · 전투 보상: <b>🪙 {nightReport.reward}</b><br />파괴된 시설/유닛: <b>{nightReport.losses}</b><br /><b>추천:</b> {nightReport.tip}</p><button className="report-close" onClick={() => setNightReport(null)}>계속하기</button></section></div>}
      {gameOver && <div className="game-over"><div><span>☠️</span><p>최후의 거점 함락</p><h1>DAY {String(day).padStart(2, '0')}</h1><small>처치 {kills}마리 · 최고 기록 DAY {Math.max(highScore, day)}</small><button onClick={() => { window.localStorage.removeItem(SAVE_KEY); window.location.reload() }}>다시 생존하기</button></div></div>}
      {dragging && dragCursor && <span className="drag-ghost" style={{ left: dragCursor.x, top: dragCursor.y }}>{dragging.icon}</span>}
    </main>
  )
}

export default App
