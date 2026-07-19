import { useEffect, useRef } from 'react'
import Phaser from 'phaser'

type CanvasItem = {
  id: string
  name: string
  icon: string
  kind: 'unit' | 'turret' | 'upgrade' | 'building'
  cost: number
  sub: string
  range?: number
  detectionRange?: number
  maxHp?: number
  damage?: number
  attackInterval?: number
  moveSpeed?: number
  blockCount?: number
}

type PlacedEntity = { item: CanvasItem; x: number; y: number }

type Props = {
  placed: Record<string, PlacedEntity>
  selected: CanvasItem | null
  preview: CanvasItem | null
  previewCursor: { x: number; y: number } | null
  phase: '낮' | '황혼' | '밤'
  day: number
  isGameOver: boolean
  gameSpeed: 1 | 2
  isPaused: boolean
  emergencyAction: { id: 'flare' | 'shockwave' | 'medkit'; nonce: number } | null
  buildingHp: Record<string, number>
  trainingLevel: number
  unitDamageMultiplier: number
  warriorHpMultiplier: number
  archerRangeBonus: number
  unitPriorities: Record<'warrior' | 'archer', 'normal' | 'sapper' | 'boss'>
  warriorBlockBonus: number
  archerAttackSpeedMultiplier: number
  workshopLevel: number
  infirmaryLevel: number
  onMapClick: (x: number, y: number, itemId?: string) => void
  onTurretSlotClick: (x: number, y: number) => void
  onEntityDestroyed: (id: string, name: string, item: CanvasItem) => void
  onEntityClick: (id: string, item: CanvasItem) => void
  onCoreClick: () => void
  onBaseDamaged: (damage: number) => void
  onEnemyDefeated: (reward: number, isBoss: boolean) => void
  onBuildingHpChange: (id: string, hp: number) => void
}

const WORLD_SIZE = 8000
const CENTER = WORLD_SIZE / 2
const LAST_STAND_RING_RADIUS = 62
const TURRET_SLOTS = [
  { x: CENTER, y: CENTER - 112, label: '북' }, { x: CENTER + 112, y: CENTER, label: '동' },
  { x: CENTER, y: CENTER + 112, label: '남' }, { x: CENTER - 112, y: CENTER, label: '서' },
]
const LANE_NAMES = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']
const BUILDING_SLOTS = [
  { x: CENTER - 180, y: CENTER - 180, label: '북서' }, { x: CENTER + 180, y: CENTER - 180, label: '북동' },
  { x: CENTER + 180, y: CENTER + 180, label: '남동' }, { x: CENTER - 180, y: CENTER + 180, label: '남서' },
]
type HealthBar = { back: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle; width: number }
type EnemyRole = 'normal' | 'runner' | 'brute' | 'sapper' | 'boss'
type ActiveEnemy = { sprite: Phaser.GameObjects.Text; roleTag: Phaser.GameObjects.Text; detection: Phaser.GameObjects.Arc; hp: number; maxHp: number; speed: number; slowUntil: number; damage: number; reward: number; isBoss: boolean; role: EnemyRole; bar: HealthBar; assignedUnits: number; blocker: ActiveUnit | null; nextAttackAt: number }
type ActiveUnit = { id: string; item: CanvasItem; sprite: Phaser.GameObjects.Container; homeX: number; homeY: number; hp: number; maxHp: number; bar: HealthBar; damage: number; attackInterval: number; moveSpeed: number; blockCount: number; engagedEnemies: number; nextAttackAt: number; target: ActiveEnemy | null }
type ActiveTurret = { item: CanvasItem; sprite: Phaser.GameObjects.Container; direction: Phaser.Math.Vector2; hp: number; maxHp: number; bar: HealthBar; nextAttackAt: number }
type ActiveBuilding = { id: string; item: CanvasItem; sprite: Phaser.GameObjects.Container; warning: Phaser.GameObjects.Text; hp: number; maxHp: number; bar: HealthBar }

export function BattlefieldCanvas({ placed, selected, preview, previewCursor, phase, day, isGameOver, gameSpeed, isPaused, emergencyAction, buildingHp, trainingLevel, unitDamageMultiplier, warriorHpMultiplier, archerRangeBonus, unitPriorities, warriorBlockBonus, archerAttackSpeedMultiplier, workshopLevel, infirmaryLevel, onMapClick, onTurretSlotClick, onEntityDestroyed, onEntityClick, onCoreClick, onBaseDamaged, onEnemyDefeated, onBuildingHpChange }: Props) {
  const parent = useRef<HTMLDivElement>(null)
  const onMapClickRef = useRef(onMapClick)
  const onEntityClickRef = useRef(onEntityClick)
  const onCoreClickRef = useRef(onCoreClick)
  const onTurretSlotClickRef = useRef(onTurretSlotClick)
  const onEntityDestroyedRef = useRef(onEntityDestroyed)
  const onBaseDamagedRef = useRef(onBaseDamaged)
  const onEnemyDefeatedRef = useRef(onEnemyDefeated)
  const onBuildingHpChangeRef = useRef(onBuildingHpChange)
  const selectedRef = useRef(selected)
  const phaseRef = useRef(phase)
  const trainingLevelRef = useRef(trainingLevel)
  const unitDamageMultiplierRef = useRef(unitDamageMultiplier)
  const warriorHpMultiplierRef = useRef(warriorHpMultiplier)
  const archerRangeBonusRef = useRef(archerRangeBonus)
  const unitPrioritiesRef = useRef(unitPriorities)
  const warriorBlockBonusRef = useRef(warriorBlockBonus)
  const archerAttackSpeedMultiplierRef = useRef(archerAttackSpeedMultiplier)
  const workshopLevelRef = useRef(workshopLevel)
  const infirmaryLevelRef = useRef(infirmaryLevel)
  const dayRef = useRef(day)
  const gameOverRef = useRef(isGameOver)
  const gameSpeedRef = useRef(gameSpeed)
  const isPausedRef = useRef(isPaused)
  const emergencyActionRef = useRef(emergencyAction)
  const buildingHpRef = useRef(buildingHp)
  const previewRef = useRef(preview)
  const placedRef = useRef(placed)
  const setPreviewRef = useRef<((item: CanvasItem | null) => void) | null>(null)
  const movePreviewFromClientRef = useRef<((x: number, y: number) => void) | null>(null)
  const syncPlacedRef = useRef<((entities: Record<string, PlacedEntity>) => void) | null>(null)
  const setPhaseRef = useRef<((nextPhase: Props['phase']) => void) | null>(null)
  const setBuildingHealthRef = useRef<((health: Record<string, number>) => void) | null>(null)
  const useEmergencyRef = useRef<((action: NonNullable<Props['emergencyAction']>) => void) | null>(null)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onEntityClickRef.current = onEntityClick }, [onEntityClick])
  useEffect(() => { onCoreClickRef.current = onCoreClick }, [onCoreClick])
  useEffect(() => { onTurretSlotClickRef.current = onTurretSlotClick }, [onTurretSlotClick])
  useEffect(() => { onEntityDestroyedRef.current = onEntityDestroyed }, [onEntityDestroyed])
  useEffect(() => { onBaseDamagedRef.current = onBaseDamaged }, [onBaseDamaged])
  useEffect(() => { onEnemyDefeatedRef.current = onEnemyDefeated }, [onEnemyDefeated])
  useEffect(() => { onBuildingHpChangeRef.current = onBuildingHpChange }, [onBuildingHpChange])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { phaseRef.current = phase; setPhaseRef.current?.(phase) }, [phase])
  useEffect(() => { trainingLevelRef.current = trainingLevel }, [trainingLevel])
  useEffect(() => { unitDamageMultiplierRef.current = unitDamageMultiplier }, [unitDamageMultiplier])
  useEffect(() => { warriorHpMultiplierRef.current = warriorHpMultiplier }, [warriorHpMultiplier])
  useEffect(() => { archerRangeBonusRef.current = archerRangeBonus }, [archerRangeBonus])
  useEffect(() => { unitPrioritiesRef.current = unitPriorities }, [unitPriorities])
  useEffect(() => { warriorBlockBonusRef.current = warriorBlockBonus }, [warriorBlockBonus])
  useEffect(() => { archerAttackSpeedMultiplierRef.current = archerAttackSpeedMultiplier }, [archerAttackSpeedMultiplier])
  useEffect(() => { workshopLevelRef.current = workshopLevel }, [workshopLevel])
  useEffect(() => { infirmaryLevelRef.current = infirmaryLevel }, [infirmaryLevel])
  useEffect(() => { dayRef.current = day }, [day])
  useEffect(() => { gameOverRef.current = isGameOver }, [isGameOver])
  useEffect(() => { gameSpeedRef.current = gameSpeed; isPausedRef.current = isPaused }, [gameSpeed, isPaused])
  useEffect(() => { emergencyActionRef.current = emergencyAction; if (emergencyAction) useEmergencyRef.current?.(emergencyAction) }, [emergencyAction])
  useEffect(() => { buildingHpRef.current = buildingHp; setBuildingHealthRef.current?.(buildingHp) }, [buildingHp])
  useEffect(() => { previewRef.current = preview; setPreviewRef.current?.(preview) }, [preview])
  useEffect(() => { placedRef.current = placed; syncPlacedRef.current?.(placed) }, [placed])
  useEffect(() => { if (previewCursor) movePreviewFromClientRef.current?.(previewCursor.x, previewCursor.y) }, [previewCursor])

  useEffect(() => {
    if (!parent.current) return
    let movePreview: ((x: number, y: number) => void) | undefined
    let getCameraPosition = () => ({ x: 0, y: 0 })

    class InfiniteFieldScene extends Phaser.Scene {
      private guide?: Phaser.GameObjects.Arc
      private detectionGuide?: Phaser.GameObjects.Arc
      private guideText?: Phaser.GameObjects.Text
      private previewIcon?: Phaser.GameObjects.Text
      private enemies: ActiveEnemy[] = []
      private units: ActiveUnit[] = []
      private turrets: ActiveTurret[] = []
      private buildings: ActiveBuilding[] = []
      private laneLabels: Phaser.GameObjects.Text[] = []
      private nextLaneUpdateAt = 0
      private placedObjects: Phaser.GameObjects.GameObject[] = []
      private fieldBackground?: Phaser.GameObjects.Rectangle
      private atmosphere?: Phaser.GameObjects.Rectangle
      private currentPhase: Props['phase'] = '낮'
      private dragging = false
      private lastPointer?: Phaser.Math.Vector2
      private boss?: ActiveEnemy
      private bossBar?: HealthBar
      private bossLabel?: Phaser.GameObjects.Text

      constructor() { super('infinite-field') }

      create() {
        movePreview = (x, y) => this.movePreviewTo(x, y)
        getCameraPosition = () => ({ x: this.cameras.main.scrollX, y: this.cameras.main.scrollY })
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE)
        this.cameras.main.centerOn(CENTER, CENTER)
        this.drawField()
        setPhaseRef.current = (nextPhase) => this.applyPhase(nextPhase)
        this.applyPhase(phaseRef.current)
        this.drawLastStand()
        this.drawLaneIndicators()
        syncPlacedRef.current = (entities) => {
          if (this.sys.isActive()) this.syncPlacedEntities(entities)
        }
        setBuildingHealthRef.current = (health) => {
          this.buildings.forEach((building) => { building.hp = health[building.id] ?? building.hp })
        }
        this.syncPlacedEntities(placedRef.current)
        useEmergencyRef.current = (action) => this.useEmergency(action)
        this.startEnemyWaves()
        this.enableCameraDrag()
        setPreviewRef.current = (item) => this.setPreview(item)
        this.setPreview(previewRef.current)
      }

      private drawField() {
        const field = this.add.graphics()
        this.fieldBackground = this.add.rectangle(CENTER, CENTER, WORLD_SIZE, WORLD_SIZE, 0x1a3437).setDepth(-3)
        field.lineStyle(1, 0xffffff, .035)
        for (let coordinate = 0; coordinate <= WORLD_SIZE; coordinate += 80) {
          field.lineBetween(coordinate, 0, coordinate, WORLD_SIZE)
          field.lineBetween(0, coordinate, WORLD_SIZE, coordinate)
        }
        field.lineStyle(1, 0x83bc95, .13)
        field.strokeCircle(CENTER, CENTER, 175).strokeCircle(CENTER, CENTER, 310)
        for (let angle = 0; angle < 360; angle += 45) {
          const vector = new Phaser.Math.Vector2(1, 0).rotate(Phaser.Math.DegToRad(angle)).scale(600)
          field.lineBetween(CENTER, CENTER, CENTER + vector.x, CENTER + vector.y)
        }
        const plants = this.add.graphics().fillStyle(0x70ad72, .18)
        for (let index = 0; index < 75; index += 1) {
          const angle = index * 2.4
          const radius = 220 + ((index * 91) % 900)
          plants.fillCircle(CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius, 3 + (index % 4))
        }
        this.atmosphere = this.add.rectangle(CENTER, CENTER, WORLD_SIZE, WORLD_SIZE, 0xffffff, 0).setDepth(-1)
      }

      private applyPhase(nextPhase: Props['phase']) {
        if (!this.fieldBackground || !this.atmosphere) return
        const previousPhase = this.currentPhase
        this.currentPhase = nextPhase
        const palette = {
          낮: { ground: 0x1f5149, overlay: 0xffed9c, alpha: 0.05 },
          황혼: { ground: 0x493e48, overlay: 0xe9865b, alpha: 0.17 },
          밤: { ground: 0x101b35, overlay: 0x394caa, alpha: 0.24 },
        }[nextPhase]
        this.fieldBackground.setFillStyle(palette.ground)
        this.atmosphere.setFillStyle(palette.overlay, palette.alpha)
        if (nextPhase === '밤' && previousPhase !== '밤') {
          const initialWave = Math.min(8, 2 + dayRef.current)
          for (let direction = 0; direction < initialWave; direction += 1) this.spawnEnemy(direction % 8, direction * 160)
          if (dayRef.current % 5 === 0) this.spawnEnemy(0, initialWave * 170, 'boss')
        }
        if (nextPhase === '낮' && previousPhase === '밤') {
          this.clearEnemies()
          const recovery = 2 + infirmaryLevelRef.current * 2
          this.units.forEach((unit) => { unit.hp = Math.min(unit.maxHp, unit.hp + recovery) })
        }
      }

      private useEmergency(action: NonNullable<Props['emergencyAction']>) {
        if (action.id === 'flare') { this.enemies.filter((enemy) => enemy.sprite.active).forEach((enemy) => { enemy.hp -= 3; this.tweens.add({ targets: enemy.sprite, alpha: .15, duration: 90, yoyo: true }); if (enemy.hp <= 0) this.defeatEnemy(enemy) }) }
        if (action.id === 'shockwave') this.enemies.filter((enemy) => enemy.sprite.active).forEach((enemy) => { const angle = Phaser.Math.Angle.Between(CENTER, CENTER, enemy.sprite.x, enemy.sprite.y); enemy.sprite.x += Math.cos(angle) * 120; enemy.sprite.y += Math.sin(angle) * 120; enemy.nextAttackAt = this.time.now + 1200 })
        if (action.id === 'medkit') this.units.forEach((unit) => { unit.hp = Math.min(unit.maxHp, unit.hp + 7); this.tweens.add({ targets: unit.sprite, alpha: .35, duration: 100, yoyo: true }) })
      }

      private drawLaneIndicators() {
        LANE_NAMES.forEach((name, index) => {
          const angle = Phaser.Math.DegToRad(-90 + index * 45)
          const label = this.add.text(CENTER + Math.cos(angle) * 185, CENTER + Math.sin(angle) * 185, name + ' 0', { fontFamily: 'sans-serif', fontSize: '9px', color: '#9ab9b0', backgroundColor: '#10242acc', padding: { x: 4, y: 3 } }).setOrigin(.5).setDepth(2)
          this.laneLabels.push(label)
        })
      }

      private updateLaneIndicators() {
        const counts = Array.from({ length: 8 }, () => 0)
        this.enemies.filter((enemy) => enemy.sprite.active).forEach((enemy) => {
          const degrees = Phaser.Math.RadToDeg(Math.atan2(enemy.sprite.y - CENTER, enemy.sprite.x - CENTER))
          const index = (Math.round((degrees + 90) / 45) % 8 + 8) % 8
          counts[index] += 1
        })
        this.laneLabels.forEach((label, index) => {
          const count = counts[index]
          label.setText(LANE_NAMES[index] + ' ' + count)
          label.setColor(count >= 4 ? '#ff8976' : count >= 2 ? '#ffd477' : '#9ab9b0')
        })
      }

      private drawLastStand() {
        const core = this.add.circle(CENTER, CENTER, 56, 0x274e46).setStrokeStyle(3, 0xf4d56f).setInteractive({ useHandCursor: true })
        this.add.circle(CENTER, CENTER - 17, 19, 0xeef0a6, .85)
        this.add.text(CENTER, CENTER + 1, '✦', { fontSize: '27px', color: '#fff6a5' }).setOrigin(.5)
        this.add.text(CENTER, CENTER + 29, '최후의 생존자', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '13px', color: '#fff1bd' }).setOrigin(.5)
        this.add.text(CENTER, CENTER + 45, '코인 · 철근 비축', { fontFamily: 'sans-serif', fontSize: '9px', color: '#c9e1bd' }).setOrigin(.5)
        core.on('pointerdown', () => onCoreClickRef.current())
      }

      private syncPlacedEntities(entities: Record<string, PlacedEntity>) {
        this.placedObjects.forEach((object) => object.destroy())
        this.placedObjects = []
        this.enemies.forEach((enemy) => { enemy.assignedUnits = 0 })
        this.units = []
        this.turrets = []
        this.buildings = []
        this.drawTurretSlots(entities)
        this.drawBuildingSlots(entities)
        Object.entries(entities).forEach(([id, entity]) => this.drawEntity(id, entity))
      }

      private drawBuildingSlots(entities: Record<string, PlacedEntity>) {
        BUILDING_SLOTS.forEach((slot) => {
          const occupiedEntry = Object.entries(entities).find(([, entity]) => entity.item.kind === 'building' && Phaser.Math.Distance.Between(entity.x, entity.y, slot.x, slot.y) < 2)
          const occupied = occupiedEntry?.[1]
          const tile = this.add.rectangle(slot.x, slot.y, 60, 60, occupied ? 0x2b4a48 : 0x5a4b28, occupied ? .22 : .38).setStrokeStyle(1, occupied ? 0x95b596 : 0xe6c965, .8).setDepth(-.2).setInteractive({ useHandCursor: true })
          const label = this.add.text(slot.x, slot.y + 39, occupied ? slot.label : slot.label + ' 건축', { fontFamily: 'sans-serif', fontSize: '8px', color: occupied ? '#a9c8bc' : '#ead58a' }).setOrigin(.5)
          this.placedObjects.push(tile, label)
          if (!occupied) this.placedObjects.push(this.add.text(slot.x, slot.y - 2, '+ ', { fontFamily: 'sans-serif', fontSize: '18px', color: '#f1d979' }).setOrigin(.5))
          tile.on('pointerdown', () => {
            if (occupied && occupiedEntry) onEntityClickRef.current(occupiedEntry[0], occupied.item)
            else if (selectedRef.current?.kind === 'building') onMapClickRef.current(slot.x, slot.y, selectedRef.current.id)
          })
        })
      }

      private drawTurretSlots(entities: Record<string, PlacedEntity>) {
        TURRET_SLOTS.forEach((slot) => {
          const occupiedEntry = Object.entries(entities).find(([, entity]) => entity.item.kind === 'turret' && Phaser.Math.Distance.Between(entity.x, entity.y, slot.x, slot.y) < 2)
          const occupied = occupiedEntry?.[1]
          const tile = this.add.rectangle(slot.x, slot.y, 46, 46, occupied ? 0x354758 : 0x203b40, .9).setStrokeStyle(1, occupied ? 0xe6d689 : 0x76d8ec, .8).setInteractive({ useHandCursor: true })
          const label = this.add.text(slot.x, slot.y + 30, `${slot.label} 포탑`, { fontFamily: 'sans-serif', fontSize: '8px', color: '#a9c8bc' }).setOrigin(.5)
          this.placedObjects.push(tile, label)
          if (!occupied) this.placedObjects.push(this.add.text(slot.x, slot.y - 2, '+', { fontFamily: 'sans-serif', fontSize: '19px', color: '#8bd1df' }).setOrigin(.5))
          tile.on('pointerdown', () => occupied && occupiedEntry ? onEntityClickRef.current(occupiedEntry[0], occupied.item) : onTurretSlotClickRef.current(slot.x, slot.y))
        })
      }

      private createHealthBar(x: number, y: number, width = 36, scrollFactor = 1): HealthBar {
        const back = this.add.rectangle(x, y, width, 4, 0x10151a, .9).setOrigin(.5).setScrollFactor(scrollFactor).setDepth(8)
        const fill = this.add.rectangle(x - width / 2, y, width, 3, 0x9fdb72, 1).setOrigin(0, .5).setScrollFactor(scrollFactor).setDepth(9)
        return { back, fill, width }
      }

      private updateHealthBar(bar: HealthBar, x: number, y: number, hp: number, maxHp: number) {
        const ratio = Math.max(0, Math.min(1, hp / maxHp))
        const color = ratio > .6 ? 0x8fda72 : ratio > .3 ? 0xf0cf67 : 0xef6e67
        bar.back.setPosition(x, y)
        bar.fill.setFillStyle(color).setPosition(x - bar.width / 2, y).setDisplaySize(bar.width * ratio, 3)
      }

      private drawEntity(id: string, entity: PlacedEntity) {
        const { item, x, y } = entity
        const color = item.kind === 'building' ? 0x2b4a48 : item.kind === 'turret' ? 0x354758 : 0x3e4f3c
        const sprite = this.add.container(x, y)
        const tile = this.add.rectangle(0, 0, 52, 52, color, .98).setStrokeStyle(1, 0xe6d689, .8)
        const icon = this.add.text(0, -6, item.icon, { fontSize: '24px' }).setOrigin(.5)
        const label = this.add.text(0, 17, item.name, { fontFamily: 'sans-serif', fontSize: '8px', color: '#fff0bb' }).setOrigin(.5)
        sprite.add([tile, icon, label]).setSize(52, 52).setInteractive({ useHandCursor: true })
        this.placedObjects.push(sprite)
        sprite.on('pointerdown', () => onEntityClickRef.current(id, item))
        const bar = this.createHealthBar(x, y - 34)
        this.placedObjects.push(bar.back, bar.fill)
        if (item.kind === 'unit') { const maxHp = (item.maxHp ?? 8) * (item.id === 'warrior' ? warriorHpMultiplierRef.current : 1); this.units.push({ id, item, sprite, homeX: x, homeY: y, hp: maxHp, maxHp, bar, damage: item.damage ?? 1, attackInterval: (item.attackInterval ?? 600) * (item.id === 'archer' ? archerAttackSpeedMultiplierRef.current : 1), moveSpeed: item.moveSpeed ?? .16, blockCount: (item.blockCount ?? 1) + (item.id === 'warrior' ? warriorBlockBonusRef.current : 0), engagedEnemies: 0, nextAttackAt: 0, target: null }) }
        if (item.kind === 'turret') { const direction = new Phaser.Math.Vector2(x - CENTER, y - CENTER).normalize(); this.turrets.push({ item, sprite, direction, hp: 12, maxHp: 12, bar, nextAttackAt: 0 }) }
        if (item.kind === 'building') { const warning = this.add.text(0, -35, '⚠', { fontSize: '14px', color: '#ff8077' }).setOrigin(.5).setVisible(false); sprite.add(warning); const hp = buildingHpRef.current[id] ?? 100; this.buildings.push({ id, item, sprite, warning, hp, maxHp: 100, bar }) }
      }

      private startEnemyWaves() {
        this.time.addEvent({ delay: 2000, loop: true, callback: () => {
          if (this.currentPhase === '밤' && !gameOverRef.current) this.spawnEnemy(Phaser.Math.Between(0, 7))
        } })
      }

      private spawnEnemy(direction: number, delay = 0, forced?: 'boss') {
        const angle = Phaser.Math.DegToRad(-90 + direction * 45)
        const x = CENTER + Math.cos(angle) * 235
        const y = CENTER + Math.sin(angle) * 205
        this.time.delayedCall(delay, () => {
          if (this.currentPhase !== '밤' || gameOverRef.current) return
          const level = Math.max(1, dayRef.current)
          const roll = Math.random()
          const profile: { icon: string; hp: number; speed: number; damage: number; reward: number; role: EnemyRole } = forced === 'boss'
            ? { icon: '👹', hp: 5.2, speed: .65, damage: 4, reward: 20, role: 'boss' }
            : level >= 8 && roll < .16
            ? { icon: '🧟‍♀️', hp: 1.15, speed: 1.05, damage: 1.45, reward: 5, role: 'sapper' }
            : level >= 6 && roll < .31
            ? { icon: '🧌', hp: 2.6, speed: .72, damage: 2, reward: 6, role: 'brute' }
            : level >= 4 && roll < .62
              ? { icon: '🧟‍♂️', hp: .65, speed: 1.7, damage: 1, reward: 3, role: 'runner' }
              : { icon: '🧟', hp: 1, speed: 1, damage: 1, reward: 2, role: 'normal' }
          const enemy = this.add.text(x, y, profile.icon, { fontSize: '27px' }).setOrigin(.5)
          const roleName = ({ normal: '일반', runner: '돌진', brute: '파괴', sapper: '공병', boss: '보스' } as const)[profile.role]
          const roleTag = this.add.text(x, y + 17, roleName, { fontFamily: 'sans-serif', fontSize: '7px', color: profile.role === 'boss' ? '#ffd37f' : '#f3c6bb', backgroundColor: '#271d27bb', padding: { x: 3, y: 1 } }).setOrigin(.5)
          const detection = this.add.circle(x, y, 105, 0xef7777, .035).setStrokeStyle(1, 0xef7777, .35)
          const baseDamage = 1 + Math.floor((level - 1) / 3)
          const maxHp = (2 + level * 2) * profile.hp
          const bar = this.createHealthBar(x, y - 22, forced === 'boss' ? 52 : 30)
          const activeEnemy: ActiveEnemy = { sprite: enemy, detection, hp: maxHp, maxHp, speed: (.048 + Math.min(level, 15) * .003) * profile.speed, damage: baseDamage * profile.damage, reward: profile.reward, isBoss: forced === 'boss', role: profile.role, roleTag, bar, assignedUnits: 0, blocker: null, nextAttackAt: 0, slowUntil: 0 }
          this.enemies.push(activeEnemy)
          if (activeEnemy.isBoss) this.showBossBar(activeEnemy)
          // Movement is controlled by updateEnemy so target priorities can change in real time.
        })
      }

      private showBossBar(enemy: ActiveEnemy) {
        this.boss = enemy
        this.bossBar?.back.destroy(); this.bossBar?.fill.destroy(); this.bossLabel?.destroy()
        this.bossBar = this.createHealthBar(this.cameras.main.width / 2, 22, 170, 0)
        this.bossLabel = this.add.text(this.cameras.main.width / 2, 8, '👹 보스 습격', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '12px', color: '#ffd28a' }).setOrigin(.5).setScrollFactor(0).setDepth(10)
      }

      private updateBossBar() {
        if (!this.boss || !this.boss.sprite.active || !this.bossBar) return
        this.updateHealthBar(this.bossBar, this.cameras.main.width / 2, 22, this.boss.hp, this.boss.maxHp)
      }

      private clearEnemies() {
        this.enemies.forEach((enemy) => {
          enemy.sprite.destroy()
          enemy.detection.destroy()
          enemy.roleTag.destroy()
          enemy.bar.back.destroy()
          enemy.bar.fill.destroy()
        })
        this.enemies = []
      }

      private enableCameraDrag() {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, targets: Phaser.GameObjects.GameObject[]) => {
          if (targets.length > 0 || selectedRef.current) {
            if (targets.length === 0 && selectedRef.current) onMapClickRef.current(pointer.worldX, pointer.worldY)
            return
          }
          this.dragging = true
          this.lastPointer = new Phaser.Math.Vector2(pointer.x, pointer.y)
        })
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (this.guide) this.guide.setPosition(pointer.worldX, pointer.worldY)
          if (this.detectionGuide) this.detectionGuide.setPosition(pointer.worldX, pointer.worldY)
          if (this.guideText) this.guideText.setPosition(pointer.worldX, pointer.worldY - 18)
          if (this.previewIcon) this.previewIcon.setPosition(pointer.worldX, pointer.worldY)
          if (!this.dragging || !this.lastPointer) return
          this.cameras.main.scrollX -= pointer.x - this.lastPointer.x
          this.cameras.main.scrollY -= pointer.y - this.lastPointer.y
          this.lastPointer.set(pointer.x, pointer.y)
        })
        this.input.on('pointerup', () => { this.dragging = false; this.lastPointer = undefined })
      }

      private setPreview(item: CanvasItem | null) {
        // React development mode can briefly retain a callback from a destroyed Scene.
        if (!this.sys.isActive()) return
        this.guide?.destroy()
        this.detectionGuide?.destroy()
        this.previewIcon?.destroy()
        this.guideText?.destroy()
        this.guide = undefined
        this.detectionGuide = undefined
        this.previewIcon = undefined
        this.guideText = undefined
        if (item) this.showPreview(item)
      }

      private showPreview(item: CanvasItem) {
        const attackRadius = (item.range ?? 1) * 45
        const detectionRadius = (item.detectionRange ?? item.range ?? 1) * 45
        if (item.kind !== 'unit') this.detectionGuide = this.add.circle(CENTER, CENTER, detectionRadius, 0x76d8ec, .06).setStrokeStyle(1, 0x76d8ec, .82)
        this.guide = this.add.circle(CENTER, CENTER, attackRadius, 0xf0d86d, .12).setStrokeStyle(1.5, 0xf0d86d, .95)
        this.previewIcon = this.add.text(CENTER, CENTER, item.icon, { fontSize: '28px' }).setOrigin(.5).setAlpha(.78)
        this.guideText = this.add.text(CENTER, CENTER - 18, item.kind === 'unit' ? '노랑: 공격 · 탐지: 무제한' : '노랑: 공격 · 파랑: 탐지', { fontFamily: 'sans-serif', fontSize: '9px', color: '#fff0a7', backgroundColor: '#17303acc', padding: { x: 5, y: 3 } }).setOrigin(.5)
        this.guide.setVisible(false)
        this.detectionGuide?.setVisible(false)
        this.previewIcon.setVisible(false)
        this.guideText.setVisible(false)
      }

      movePreviewTo(worldX: number, worldY: number) {
        this.guide?.setPosition(worldX, worldY).setVisible(true)
        this.detectionGuide?.setPosition(worldX, worldY).setVisible(true)
        this.previewIcon?.setPosition(worldX, worldY).setVisible(true)
        this.guideText?.setPosition(worldX, worldY - 18).setVisible(true)
      }

      private launchArrow(sourceX: number, sourceY: number, target: ActiveEnemy, color = 0xf5df82) {
        const targetX = target.sprite.x
        const targetY = target.sprite.y
        const projectile = this.add.rectangle(sourceX, sourceY, 11, 2, color, 1).setOrigin(.15, .5).setDepth(12)
        projectile.setRotation(Phaser.Math.Angle.Between(sourceX, sourceY, targetX, targetY))
        this.tweens.add({ targets: projectile, x: targetX, y: targetY, duration: Math.max(110, Math.min(260, Phaser.Math.Distance.Between(sourceX, sourceY, targetX, targetY) * .55)), ease: 'Linear', onComplete: () => projectile.destroy() })
      }

      private assignTarget(unit: ActiveUnit) {
        const candidate = this.enemies
          .filter((enemy) => enemy.sprite.active)
          .map((enemy) => ({ enemy, distance: Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, enemy.sprite.x, enemy.sprite.y) }))
          .sort((a, b) => { const priority = unitPrioritiesRef.current[unit.item.id === 'warrior' ? 'warrior' : 'archer']; const aPriority = a.enemy.role === priority ? 0 : 1; const bPriority = b.enemy.role === priority ? 0 : 1; return aPriority - bPriority || a.enemy.assignedUnits - b.enemy.assignedUnits || a.distance - b.distance })[0]?.enemy ?? null
        if (candidate) candidate.assignedUnits += 1
        return candidate
      }

      update(time: number, delta: number) {
        if (gameOverRef.current || isPausedRef.current) return
        delta *= gameSpeedRef.current
        if (time >= this.nextLaneUpdateAt) {
          this.nextLaneUpdateAt = time + 350
          this.updateLaneIndicators()
        }
        this.enemies = this.enemies.filter((enemy) => {
          if (enemy.sprite.active) return true
          enemy.detection.destroy()
          return false
        })
        this.turrets = this.turrets.filter((turret) => turret.sprite.active)
        this.units = this.units.filter((unit) => {
          if (unit.sprite.active) return true
          if (unit.target?.sprite.active) unit.target.assignedUnits = Math.max(0, unit.target.assignedUnits - 1)
          this.enemies.forEach((enemy) => { if (enemy.blocker === unit) enemy.blocker = null })
          onEntityDestroyedRef.current(unit.id, unit.item.name, unit.item)
          return false
        })
        this.buildings = this.buildings.filter((building) => building.sprite.active)
        this.units.forEach((unit) => {
          const attackRadius = ((unit.item.range ?? 1) + (unit.item.id === 'archer' ? archerRangeBonusRef.current : 0)) * 45
          if (!unit.target || !unit.target.sprite.active) unit.target = this.assignTarget(unit)
          const target = unit.target
          if (!target) {
            const distanceHome = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, unit.homeX, unit.homeY)
            if (distanceHome > 2) this.moveToward(unit.sprite, unit.homeX, unit.homeY, delta, unit.moveSpeed * .65)
            return
          }
          const distance = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, target.sprite.x, target.sprite.y)
          if (unit.item.id === 'archer' && distance < attackRadius * .42) {
            this.moveAway(unit.sprite, target.sprite.x, target.sprite.y, delta, unit.moveSpeed)
            return
          }
          if (distance > attackRadius * .85) {
            this.moveToward(unit.sprite, target.sprite.x, target.sprite.y, delta, unit.moveSpeed)
            return
          }
          if (time >= unit.nextAttackAt) {
            unit.nextAttackAt = time + unit.attackInterval
            if (unit.item.id === 'archer') this.launchArrow(unit.sprite.x, unit.sprite.y - 5, target, 0xa6e4ff)
            target.hp -= unit.damage * unitDamageMultiplierRef.current
            this.tweens.add({ targets: target.sprite, alpha: .35, duration: 80, yoyo: true })
            if (target.hp <= 0) this.defeatEnemy(target)
          }
        })
        this.turrets.forEach((turret) => {
          const range = (turret.item.range ?? 1) * 140
          const targets = this.enemies
            .map((enemy) => { const dx = enemy.sprite.x - turret.sprite.x; const dy = enemy.sprite.y - turret.sprite.y; const forward = dx * turret.direction.x + dy * turret.direction.y; const lateral = Math.abs(dx * turret.direction.y - dy * turret.direction.x); return { enemy, distance: Math.hypot(dx, dy), forward, lateral } })
            .filter(({ distance, forward, lateral, enemy }) => forward > 0 && distance <= range && lateral <= 62 && enemy.sprite.active)
            .sort((a, b) => a.distance - b.distance)
          if (targets.length === 0 || time < turret.nextAttackAt) return
          if (turret.item.id === 'bomb-trap') {
            turret.nextAttackAt = time + Math.max(800, 1400 - (workshopLevelRef.current - 1) * 90)
            targets.forEach(({ enemy }) => {
              enemy.hp -= 3 + (workshopLevelRef.current - 1) * .65
              this.tweens.add({ targets: enemy.sprite, alpha: .2, duration: 90, yoyo: true })
              if (enemy.hp <= 0) this.defeatEnemy(enemy)
            })
            this.tweens.add({ targets: turret.sprite, scaleX: 1.22, scaleY: 1.22, duration: 110, yoyo: true })
            return
          }
          if (turret.item.id === 'frost-tower') {
            turret.nextAttackAt = time + Math.max(650, 950 - (workshopLevelRef.current - 1) * 45)
            const target = targets[0].enemy
            this.launchArrow(turret.sprite.x, turret.sprite.y - 8, target, 0x8de8ff)
            target.hp -= .65 + (workshopLevelRef.current - 1) * .15
            target.slowUntil = time + 1300
            this.tweens.add({ targets: target.sprite, alpha: .45, duration: 90, yoyo: true })
            if (target.hp <= 0) this.defeatEnemy(target)
            return
          }
          turret.nextAttackAt = time + Math.max(280, 450 - (workshopLevelRef.current - 1) * 20)
          this.launchArrow(turret.sprite.x, turret.sprite.y - 8, targets[0].enemy)
          targets[0].enemy.hp -= 1 + (workshopLevelRef.current - 1) * .25
          this.tweens.add({ targets: targets[0].enemy.sprite, alpha: .3, duration: 75, yoyo: true })
          if (targets[0].enemy.hp <= 0) this.defeatEnemy(targets[0].enemy)
        })
        this.units.forEach((unit) => this.updateHealthBar(unit.bar, unit.sprite.x, unit.sprite.y - 34, unit.hp, unit.maxHp))
        this.turrets.forEach((turret) => this.updateHealthBar(turret.bar, turret.sprite.x, turret.sprite.y - 34, turret.hp, turret.maxHp))
        this.buildings.forEach((building) => { this.updateHealthBar(building.bar, building.sprite.x, building.sprite.y - 34, building.hp, building.maxHp); const low = building.hp / building.maxHp <= .35; building.warning.setVisible(low); const tile = building.sprite.list[0] as Phaser.GameObjects.Rectangle; tile.setStrokeStyle(low ? 2 : 1, low ? 0xff6f68 : 0xe6d689, .9) })
        this.enemies.forEach((enemy) => this.updateEnemy(enemy, time, delta))
        this.updateBossBar()
      }

      private updateEnemy(enemy: ActiveEnemy, time: number, delta: number) {
        enemy.detection.setPosition(enemy.sprite.x, enemy.sprite.y)
        enemy.roleTag.setPosition(enemy.sprite.x, enemy.sprite.y + 17)
        this.updateHealthBar(enemy.bar, enemy.sprite.x, enemy.sprite.y - 22, enemy.hp, enemy.maxHp)
        const detectionRadius = 105
        const unitTarget = this.units
          .map((unit) => ({ unit, distance: Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, unit.sprite.x, unit.sprite.y) }))
          .filter(({ unit, distance }) => distance <= detectionRadius && (enemy.blocker === unit || unit.engagedEnemies < unit.blockCount))
          .sort((a, b) => a.distance - b.distance)[0]
        const nextBlocker = unitTarget?.unit ?? null
        if (enemy.blocker !== nextBlocker) {
          if (enemy.blocker) enemy.blocker.engagedEnemies = Math.max(0, enemy.blocker.engagedEnemies - 1)
          enemy.blocker = nextBlocker
          if (nextBlocker) nextBlocker.engagedEnemies += 1
        }
        const turretTarget: { turret: ActiveTurret; distance: number } | undefined = unitTarget || enemy.role === 'runner'
          ? undefined
          : this.turrets
              .map((turret) => ({ turret, distance: Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, turret.sprite.x, turret.sprite.y) }))
              .filter(({ distance }) => distance <= detectionRadius)
              .sort((a, b) => a.distance - b.distance)[0]
        const buildingTarget: { building: ActiveBuilding; distance: number } | undefined = unitTarget || turretTarget
          ? undefined
          : this.buildings
              .map((building) => ({ building, distance: Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, building.sprite.x, building.sprite.y) }))
              .filter(({ distance }) => distance <= detectionRadius)
              .sort((a, b) => a.distance - b.distance)[0]
        const sapperTarget = enemy.role === 'sapper' ? this.buildings.map((building) => ({ building, distance: Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, building.sprite.x, building.sprite.y) })).sort((a, b) => a.distance - b.distance)[0] : undefined
        const resolvedBuildingTarget = sapperTarget ?? buildingTarget
        const targetX = unitTarget ? unitTarget.unit.sprite.x : turretTarget ? turretTarget.turret.sprite.x : resolvedBuildingTarget ? resolvedBuildingTarget.building.sprite.x : CENTER
        const targetY = unitTarget ? unitTarget.unit.sprite.y : turretTarget ? turretTarget.turret.sprite.y : resolvedBuildingTarget ? resolvedBuildingTarget.building.sprite.y : CENTER
        const targetRange = unitTarget || turretTarget || resolvedBuildingTarget ? 29 : LAST_STAND_RING_RADIUS
        const distance = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, targetX, targetY)
        if (distance > targetRange) {
          this.moveTextToward(enemy.sprite, targetX, targetY, delta, enemy.speed * (time < enemy.slowUntil ? .55 : 1))
          return
        }
        if (time < enemy.nextAttackAt) return
        enemy.nextAttackAt = time + 950
        this.tweens.add({ targets: enemy.sprite, scaleX: 1.16, scaleY: 1.16, duration: 140, yoyo: true })
        if (unitTarget) {
          unitTarget.unit.hp -= 1
          this.tweens.add({ targets: unitTarget.unit.sprite, alpha: .35, duration: 80, yoyo: true })
          if (unitTarget.unit.hp <= 0) unitTarget.unit.sprite.destroy()
        }
        else if (turretTarget) {
          turretTarget.turret.hp -= 1
          this.tweens.add({ targets: turretTarget.turret.sprite, alpha: .35, duration: 80, yoyo: true })
          if (turretTarget.turret.hp <= 0) turretTarget.turret.sprite.destroy()
        }
        else if (resolvedBuildingTarget) {
          resolvedBuildingTarget.building.hp -= enemy.damage * (enemy.role === 'brute' ? 1.8 : 1)
          onBuildingHpChangeRef.current(resolvedBuildingTarget.building.id, Math.max(0, resolvedBuildingTarget.building.hp))
          this.tweens.add({ targets: resolvedBuildingTarget.building.sprite, alpha: .35, duration: 80, yoyo: true })
          if (resolvedBuildingTarget.building.hp <= 0) {
            resolvedBuildingTarget.building.sprite.destroy()
            onEntityDestroyedRef.current(resolvedBuildingTarget.building.id, resolvedBuildingTarget.building.item.name, resolvedBuildingTarget.building.item)
          }
        }
        else {
          onBaseDamagedRef.current(enemy.damage)
        }
      }

      private moveToward(sprite: Phaser.GameObjects.Container, targetX: number, targetY: number, delta: number, speed: number) {
        const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, targetX, targetY)
        const distance = Math.min(speed * delta, Phaser.Math.Distance.Between(sprite.x, sprite.y, targetX, targetY))
        sprite.x += Math.cos(angle) * distance
        sprite.y += Math.sin(angle) * distance
      }

      private moveAway(sprite: Phaser.GameObjects.Container, threatX: number, threatY: number, delta: number, speed: number) {
        const angle = Phaser.Math.Angle.Between(threatX, threatY, sprite.x, sprite.y)
        sprite.x += Math.cos(angle) * speed * delta
        sprite.y += Math.sin(angle) * speed * delta
      }

      private moveTextToward(sprite: Phaser.GameObjects.Text, targetX: number, targetY: number, delta: number, speed: number) {
        const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, targetX, targetY)
        const distance = Math.min(speed * delta, Phaser.Math.Distance.Between(sprite.x, sprite.y, targetX, targetY))
        sprite.x += Math.cos(angle) * distance
        sprite.y += Math.sin(angle) * distance
      }

      private defeatEnemy(enemy: ActiveEnemy) {
        if (!enemy.sprite.active) return
        if (enemy.blocker) enemy.blocker.engagedEnemies = Math.max(0, enemy.blocker.engagedEnemies - 1)
        const rewardText = this.add.text(enemy.sprite.x, enemy.sprite.y - 28, '+' + enemy.reward + '🪙', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '11px', color: '#ffe17c', stroke: '#18232a', strokeThickness: 2 }).setOrigin(.5).setDepth(12)
        this.tweens.add({ targets: rewardText, y: rewardText.y - 24, alpha: 0, duration: 650, onComplete: () => rewardText.destroy() })
        enemy.sprite.destroy()
        enemy.detection.destroy()
        enemy.roleTag.destroy()
        enemy.bar.back.destroy()
        enemy.bar.fill.destroy()
        if (enemy.isBoss) { this.bossBar?.back.destroy(); this.bossBar?.fill.destroy(); this.bossLabel?.destroy(); this.boss = undefined; this.bossBar = undefined; this.bossLabel = undefined }
        onEnemyDefeatedRef.current(enemy.reward, enemy.isBoss)
      }
    }

    const viewportWidth = Math.max(parent.current.clientWidth, 320)
    const viewportHeight = Math.max(parent.current.clientHeight, 260)
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: parent.current,
      width: viewportWidth,
      height: viewportHeight,
      audio: { noAudio: true },
      scene: InfiniteFieldScene,
    })
    const toWorldPosition = (clientX: number, clientY: number) => {
      const bounds = parent.current!.getBoundingClientRect()
      const screenX = (clientX - bounds.left) * viewportWidth / bounds.width
      const screenY = (clientY - bounds.top) * viewportHeight / bounds.height
      const camera = getCameraPosition()
      return { x: camera.x + screenX, y: camera.y + screenY }
    }
    movePreviewFromClientRef.current = (clientX, clientY) => {
      const position = toWorldPosition(clientX, clientY)
      movePreview?.(position.x, position.y)
    }
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
      const position = toWorldPosition(event.clientX, event.clientY)
      movePreview?.(position.x, position.y)
    }
    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      const position = toWorldPosition(event.clientX, event.clientY)
      const itemId = event.dataTransfer?.getData('application/x-last-stand-item')
      console.log('[Last Stand] canvas:drop', { itemId, x: Math.round(position.x), y: Math.round(position.y) })
      onMapClickRef.current(position.x, position.y, itemId)
    }
    const canvasParent = parent.current
    const handlePointerUp = (event: PointerEvent) => {
      const item = previewRef.current
      const bounds = canvasParent.getBoundingClientRect()
      if (!item || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return
      const position = toWorldPosition(event.clientX, event.clientY)
      console.log('[Last Stand] canvas:pointer-drop', { itemId: item.id, x: Math.round(position.x), y: Math.round(position.y) })
      onMapClickRef.current(position.x, position.y, item.id)
    }
    canvasParent.addEventListener('dragover', handleDragOver)
    canvasParent.addEventListener('drop', handleDrop)
    window.addEventListener('pointerup', handlePointerUp, true)
    return () => {
      canvasParent.removeEventListener('dragover', handleDragOver)
      canvasParent.removeEventListener('drop', handleDrop)
      window.removeEventListener('pointerup', handlePointerUp, true)
      setPreviewRef.current = null
      movePreviewFromClientRef.current = null
      syncPlacedRef.current = null
      setPhaseRef.current = null
      useEmergencyRef.current = null
      game.destroy(true)
    }
  }, [])

  return <div className="phaser-battlefield" ref={parent} />
}
