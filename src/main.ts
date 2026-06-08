import { generateBoard, MapStyle, PortType } from "./board";

import { loadImages, loadPortIcons, loadBuildingImgs, BuildingImgs, DEV_CARD_ART, ACHIEVEMENT_ART, iconVictoryPointUrl } from "./assets/loaders";

import { fitLayout, computeMinZoom, clampView, View } from "./camera/layout";
import { draw } from "./render/scene";
import { CloudOpts, updateCloudWind } from "./render/clouds";
import { VignetteOpts } from "./render/vignette";
import { PortOpts } from "./render/ports";
import { HoverOpts, hover, findHoveredNumberTokenTileIdx } from "./render/hover-icon";
import { BridgeTuning } from "./render/buildings";
import { FogOpts } from "./render/fog";
import {
  reveal,
  rebuildRevealOrders,
  revealAnimationRunning,
  tileRevealProgress,
  buildingScaleAt,
  buildingScaleAnimationRunning,
  applyRevealModeReset,
  refreshFogReveals,
  tileRevealAt,
  getRevealMode,
  setRevealMode,
} from "./animation/reveal";
import {
  dice,
  rollDice,
  matchPopAnimationRunning,
  diceAnimationRunning,
} from "./animation/dice";
import { drawDice } from "./render/dice";
import { tileSheen, tileSheenAnimationRunning } from "./animation/tile-sheen";
import { placementBounce, placementBounceAnimationRunning } from "./animation/placement-bounce";
import { axialToPixel } from "./hex";
import { buildings, bridges, BridgeVariant } from "./game/buildings";
import {
  getPlacementStep,
  setPlacementStep,
  setLastInitialSettlementKey,
  buildPlacementGraph,
  validSettlementVertices,
  validBridgeEdges,
  validCityVertices,
  snapPlacementHover,
  exploredTileIndices,
  visiblePiecesForViewer,
} from "./game/placement";
import {
  ResourceKind,
  RESOURCE_ORDER,
  RESOURCE_ICONS,
  RESOURCE_LABELS,
  RESOURCE_TO_PORT_TYPE,
  resourceCounts,
  resetAllResources,
  mountResourceHud,
  renderResourceHud,
  renderVictoryHud,
  spendForBuild,
  bumpResourceCell,
  bumpResourceCellLoss,
  spawnResourceSteal,
  scheduleRollYields,
  setOnResourcesChanged,
  DEV_CARD_COST,
  canAffordCost,
  spendCost,
} from "./game/resources";
import {
  DevCardType,
  DevCardInstance,
  DEV_CARD_INFO,
  resetDevCards,
  drawDevCard,
  grantDevCard,
  deckRemaining,
  getPlayerCards,
  playedKnights,
  canPlayDevCard,
  isReady,
  markPlayed,
  resetDevCardTurnFlag,
} from "./game/dev-cards";
import { recomputeLargestArmy, recomputeLongestRoad } from "./game/achievements";
import {
  getBankTradeRule,
  setBankTradeRule,
  setRuleGuaranteed68,
  setRuleLinkedOpening,
  getRuleThiefSparesCaster,
  setRuleThiefSparesCaster,
  getRuleThiefStayAllowed,
  setRuleThiefStayAllowed,
  getRuleThiefSkipSteal,
  setRuleThiefSkipSteal,
  reshuffleFor68Rule,
  tradeRateFor,
  ownedPortTypes,
} from "./game/trade-rules";
import { defaultThievesIdx, getThievesTileIdx, setThievesTileIdx, eligibleVictimsFor } from "./game/thieves";
import {
  initPlayers,
  getPlayers,
  getPlayer,
  getActivePlayerId,
  getViewerPlayerId,
  setViewerPlayerId,
  getPlayerColor,
  DEFAULT_COLORS,
  DEFAULT_NAMES,
  MAX_PLAYERS,
} from "./game/players";
import {
  getPhase,
  setPhase,
  setTurnOrder,
  openingAdvance,
  endTurn,
  markDiceRolled,
  resetTurnState,
  currentBuilderId,
  startDiscardPhase,
  getDiscardCurrent,
  discardOne,
  startRobberMovePhase,
  startRobberStealPhase,
  finishRobber,
  getTurnNumber,
} from "./game/turn";
import { POST_DICE_START } from "./animation/dice";
import {
  startPreMatch,
  recordRoll,
  isComplete as preMatchComplete,
  resolveTurnOrder,
  getCurrentRollerId,
  getRolls,
  getRoundWins,
  getRoundWinnerMap,
} from "./game/pre-match";

async function main() {
  const canvas = document.getElementById("board") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  mountResourceHud();
  const seedInput = document.getElementById("seed") as HTMLInputElement;
  const radiusInput = document.getElementById("radius") as HTMLInputElement;
  const mapStyleSelect = document.getElementById("mapStyle") as HTMLSelectElement;
  const imgScaleInput = document.getElementById("imgScale") as HTMLInputElement;
  const restartBtn = document.getElementById("restart-toggle") as HTMLButtonElement;
  const ruleAllVisibleInput = document.getElementById("ruleAllVisible") as HTMLInputElement;
  const ruleFogOfWarInput = document.getElementById("ruleFogOfWar") as HTMLInputElement;
  const ruleGuaranteed68Input = document.getElementById("ruleGuaranteed68") as HTMLInputElement;
  const ruleLinkedOpeningInput = document.getElementById("ruleLinkedOpening") as HTMLInputElement;
  const ruleThiefSparesCasterInput = document.getElementById("ruleThiefSparesCaster") as HTMLInputElement;
  const ruleThiefStayAllowedInput = document.getElementById("ruleThiefStayAllowed") as HTMLInputElement;
  const ruleThiefSkipStealInput = document.getElementById("ruleThiefSkipSteal") as HTMLInputElement;
  const rollBtn = document.getElementById("roll-toggle") as HTMLButtonElement;
  const endTurnBtn = document.getElementById("end-turn-btn") as HTMLButtonElement;
  const startMatchBtn = document.getElementById("start-match-btn") as HTMLButtonElement;
  const matchStatusEl = document.getElementById("match-status") as HTMLDivElement | null;
  const numScaleInput = document.getElementById("numScale") as HTMLInputElement;
  const numOffXInput = document.getElementById("numOffX") as HTMLInputElement;
  const numOffYInput = document.getElementById("numOffY") as HTMLInputElement;
  const glowSpreadInput = document.getElementById("glowSpread") as HTMLInputElement;
  const glowFeatherInput = document.getElementById("glowFeather") as HTMLInputElement;
  const innerGlowSpreadInput = document.getElementById("innerGlowSpread") as HTMLInputElement;
  const innerGlowFeatherInput = document.getElementById("innerGlowFeather") as HTMLInputElement;
  const foamColorInput = document.getElementById("foamColor") as HTMLInputElement;
  const lakeFoamColorInput = document.getElementById("lakeFoamColor") as HTMLInputElement;
  const portGlowColorInput = document.getElementById("portGlowColor") as HTMLInputElement;
  const portGlowSizeInput = document.getElementById("portGlowSize") as HTMLInputElement;
  const portGlowFeatherInput = document.getElementById("portGlowFeather") as HTMLInputElement;
  const portGlowOpacityInput = document.getElementById("portGlowOpacity") as HTMLInputElement;
  const portGlowBlendInput = document.getElementById("portGlowBlend") as HTMLSelectElement;
  const portCenterOffsetInput = document.getElementById("portCenterOffset") as HTMLInputElement;
  const portItemsGapInput = document.getElementById("portItemsGap") as HTMLInputElement;
  const portIconSizeInput = document.getElementById("portIconSize") as HTMLInputElement;
  const portTextSizeInput = document.getElementById("portTextSize") as HTMLInputElement;
  const settlementScaleInput = document.getElementById("settlementScale") as HTMLInputElement;
  const settlementOffYInput = document.getElementById("settlementOffY") as HTMLInputElement;
  const cityScaleInput = document.getElementById("cityScale") as HTMLInputElement;
  const cityOffYInput = document.getElementById("cityOffY") as HTMLInputElement;
  const bridge30ScaleInput = document.getElementById("bridge30Scale") as HTMLInputElement;
  const bridge30OffXInput = document.getElementById("bridge30OffX") as HTMLInputElement;
  const bridge30OffYInput = document.getElementById("bridge30OffY") as HTMLInputElement;
  const bridge30RotInput = document.getElementById("bridge30Rot") as HTMLInputElement;
  const bridgeStraightScaleInput = document.getElementById("bridgeStraightScale") as HTMLInputElement;
  const bridgeStraightOffXInput = document.getElementById("bridgeStraightOffX") as HTMLInputElement;
  const bridgeStraightOffYInput = document.getElementById("bridgeStraightOffY") as HTMLInputElement;
  const bridgeStraightRotInput = document.getElementById("bridgeStraightRot") as HTMLInputElement;
  const thievesScaleInput = document.getElementById("thievesScale") as HTMLInputElement;
  const thievesOffYInput = document.getElementById("thievesOffY") as HTMLInputElement;
  const buildingBlendInput = document.getElementById("buildingBlend") as HTMLSelectElement;
  const pathWidthInput = document.getElementById("pathWidth") as HTMLInputElement;
  const pathBlendInput = document.getElementById("pathBlend") as HTMLSelectElement;
  const shadowBlendInput = document.getElementById("shadowBlend") as HTMLSelectElement;
  const shadowAngleInput = document.getElementById("shadowAngle") as HTMLInputElement;
  const shadowSpreadInput = document.getElementById("shadowSpread") as HTMLInputElement;
  const shadowFeatherInput = document.getElementById("shadowFeather") as HTMLInputElement;
  const shadowOpacityInput = document.getElementById("shadowOpacity") as HTMLInputElement;
  const hoverEnabledInput = document.getElementById("hoverEnabled") as HTMLInputElement;
  const hoverColorInput = document.getElementById("hoverColor") as HTMLInputElement;
  const hoverOffXInput = document.getElementById("hoverOffX") as HTMLInputElement;
  const hoverOffYInput = document.getElementById("hoverOffY") as HTMLInputElement;
  const hoverScaleInput = document.getElementById("hoverScale") as HTMLInputElement;
  const hoverOpacityInput = document.getElementById("hoverOpacity") as HTMLInputElement;
  const hoverFadeInInput = document.getElementById("hoverFadeIn") as HTMLInputElement;
  const hoverFadeOutInput = document.getElementById("hoverFadeOut") as HTMLInputElement;
  const hoverGlowSizeInput = document.getElementById("hoverGlowSize") as HTMLInputElement;
  const hoverFeatherInput = document.getElementById("hoverFeather") as HTMLInputElement;
  const hoverBlendInput = document.getElementById("hoverBlend") as HTMLSelectElement;
  const vignetteEnabledInput = document.getElementById("vignetteEnabled") as HTMLInputElement;
  const vignetteColorInput = document.getElementById("vignetteColor") as HTMLInputElement;
  const vignetteIntensityInput = document.getElementById("vignetteIntensity") as HTMLInputElement;
  const vignetteFeatherInput = document.getElementById("vignetteFeather") as HTMLInputElement;
  const vignetteScaleInput = document.getElementById("vignetteScale") as HTMLInputElement;
  const cloudsEnabledInput = document.getElementById("cloudsEnabled") as HTMLInputElement;
  const cloudColorInput = document.getElementById("cloudColor") as HTMLInputElement;
  const cloudOpacityInput = document.getElementById("cloudOpacity") as HTMLInputElement;
  const cloudDensityInput = document.getElementById("cloudDensity") as HTMLInputElement;
  const cloudScaleInput = document.getElementById("cloudScale") as HTMLInputElement;
  const cloudWindSpeedInput = document.getElementById("cloudWindSpeed") as HTMLInputElement;
  const cloudWindDriftInput = document.getElementById("cloudWindDrift") as HTMLInputElement;
  const cloudMorphSpeedInput = document.getElementById("cloudMorphSpeed") as HTMLInputElement;
  const cloudBlendInput = document.getElementById("cloudBlend") as HTMLSelectElement;
  const ruleMixedTradeInput = document.getElementById("ruleMixedTrade") as HTMLInputElement;
  const fogEnabledInput = document.getElementById("fogEnabled") as HTMLInputElement;
  const fogColorInput = document.getElementById("fogColor") as HTMLInputElement;
  const fogOpacityInput = document.getElementById("fogOpacity") as HTMLInputElement;
  const regenBtn = document.getElementById("regen") as HTMLButtonElement;
  const playerCountSelect = document.getElementById("playerCount") as HTMLSelectElement;
  const playerSlotsDiv = document.getElementById("player-slots") as HTMLDivElement;
  const playersApplyBtn = document.getElementById("players-apply") as HTMLButtonElement;
  const playerStrip = document.getElementById("player-strip") as HTMLDivElement;
  const prematchBackdrop = document.getElementById("prematch-backdrop") as HTMLDivElement;
  const prematchRows = document.getElementById("prematch-rows") as HTMLDivElement;
  const prematchRollBtn = document.getElementById("prematch-roll") as HTMLButtonElement;
  const actionPromptEl = document.getElementById("action-prompt") as HTMLDivElement | null;
  const discardBackdrop = document.getElementById("discard-backdrop") as HTMLDivElement | null;
  const discardHeader = document.getElementById("discard-header") as HTMLDivElement | null;
  const discardSub = document.getElementById("discard-sub") as HTMLDivElement | null;
  const discardRow = document.getElementById("discard-row") as HTMLDivElement | null;
  const discardCounter = document.getElementById("discard-counter") as HTMLDivElement | null;
  const stealBackdrop = document.getElementById("steal-backdrop") as HTMLDivElement | null;
  const stealOptions = document.getElementById("steal-options") as HTMLDivElement | null;
  // Development / achievement card UI.
  const cardHand = document.getElementById("card-hand") as HTMLDivElement | null;
  const buyDevCardBtn = null as HTMLButtonElement | null; // created inside renderCardHand
  const cardDetailBackdrop = document.getElementById("card-detail-backdrop") as HTMLDivElement | null;
  const cardDetailArt = document.getElementById("card-detail-art") as HTMLImageElement | null;
  const cardDetailTitle = document.getElementById("card-detail-title") as HTMLHeadingElement | null;
  const cardDetailKind = document.getElementById("card-detail-kind") as HTMLSpanElement | null;
  const cardDetailVp = document.getElementById("card-detail-vp") as HTMLDivElement | null;
  const cardDetailRule = document.getElementById("card-detail-rule") as HTMLDivElement | null;
  const cardDetailClose = document.getElementById("card-detail-close") as HTMLButtonElement | null;
  const cardDetailPlay = document.getElementById("card-detail-play") as HTMLButtonElement | null;
  const yopBackdrop = document.getElementById("yop-backdrop") as HTMLDivElement | null;
  const yopRow = document.getElementById("yop-row") as HTMLDivElement | null;
  const yopCounter = document.getElementById("yop-counter") as HTMLDivElement | null;
  const yopCancel = document.getElementById("yop-cancel") as HTMLButtonElement | null;
  const yopConfirm = document.getElementById("yop-confirm") as HTMLButtonElement | null;
  const monopolyBackdrop = document.getElementById("monopoly-backdrop") as HTMLDivElement | null;
  const monopolyRow = document.getElementById("monopoly-row") as HTMLDivElement | null;
  const monopolyCounter = document.getElementById("monopoly-counter") as HTMLDivElement | null;
  const monopolyCancel = document.getElementById("monopoly-cancel") as HTMLButtonElement | null;
  const monopolyConfirm = document.getElementById("monopoly-confirm") as HTMLButtonElement | null;
  void buyDevCardBtn;

  const images = await loadImages();
  const portIcons = await loadPortIcons();
  const buildingImgs: BuildingImgs = await loadBuildingImgs();

  // --- Player config UI (slot inputs) ---
  // Local config that gets applied via initPlayers on Apply / regen.
  const slotNames: string[] = DEFAULT_NAMES.slice();
  const slotColors: string[] = DEFAULT_COLORS.slice();
  function renderPlayerSlots() {
    const n = Number(playerCountSelect.value) || 2;
    playerSlotsDiv.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = `P${i + 1}`;
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = slotNames[i];
      nameInput.style.width = "70px";
      nameInput.addEventListener("input", () => { slotNames[i] = nameInput.value; });
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = slotColors[i];
      colorInput.style.width = "30px";
      colorInput.addEventListener("input", () => { slotColors[i] = colorInput.value; });
      row.appendChild(lbl);
      row.appendChild(nameInput);
      row.appendChild(colorInput);
      playerSlotsDiv.appendChild(row);
    }
  }
  renderPlayerSlots();
  playerCountSelect.addEventListener("change", renderPlayerSlots);

  // Default 4 players at startup so resources/reveal indexing has slots.
  initPlayers(2, slotColors, slotNames);

  let board = generateBoard(
    Number(seedInput.value) || 0,
    Number(radiusInput.value) || undefined,
    mapStyleSelect.value as MapStyle
  );
  setThievesTileIdx(defaultThievesIdx(board));
  const view: View = { tx: 0, ty: 0, zoom: 1 };
  let dpr = window.devicePixelRatio || 1;

  // Smooth wheel/pinch zoom: the wheel handler nudges `zoomTarget`, and the
  // tick loop eases `view.zoom` toward it, anchoring on the screen point the
  // cursor was over when the last wheel event arrived.
  const zoomEase = {
    target: 1,
    anchorX: 0,
    anchorY: 0,
    active: false,
  };

  // refreshPassivesAndTrade is local — assigned later from the trade UI block.
  let refreshPassivesAndTrade: () => void = () => {};
  let refreshPlayerStrip: () => void = () => {};
  let refreshTopButtons: () => void = () => {};

  // Dice are drawn to a dedicated overlay canvas so they always sit above
  // modals (pre-match etc.). Same DPR scaling as the main canvas.
  const diceOverlay = document.getElementById("dice-overlay") as HTMLCanvasElement;
  const diceCtx = diceOverlay.getContext("2d")!;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    diceOverlay.width = canvas.width;
    diceOverlay.height = canvas.height;
    render();
  }

  function ownerColor(id: number): string {
    return getPlayerColor(id);
  }

  // Snap a world-space point to the nearest tile whose center it falls within
  // (the hex inradius). Returns -1 when the point is outside every tile.
  // Shared by the robber-move click handler and its hover ghost.
  function tileAtPixel(wx: number, wy: number, layout: ReturnType<typeof fitLayout>): number {
    const r2Limit = (layout.size * Math.sqrt(3) / 2) ** 2;
    let bestIdx = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < board.tiles.length; i++) {
      const { x, y } = axialToPixel(board.tiles[i], layout);
      const dx = wx - x;
      const dy = wy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }
    return bestIdx >= 0 && bestD2 <= r2Limit ? bestIdx : -1;
  }

  function render() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const layout = fitLayout(board, cssW, cssH);
    clampView(board, view, layout, cssW, cssH);
    const imgScale = Number(imgScaleInput.value) || 1;
    const numOpts = {
      scale: Number(numScaleInput.value) || 0,
      offX: Number(numOffXInput.value) || 0,
      offY: Number(numOffYInput.value) || 0,
    };
    const glowOpts = {
      spread: Number(glowSpreadInput.value) || 0,
      feather: Number(glowFeatherInput.value) || 0,
      innerSpread: Number(innerGlowSpreadInput.value) || 0,
      innerFeather: Number(innerGlowFeatherInput.value) || 0,
    };
    const beachOpts = {
      foamColor: foamColorInput.value || "#c5cdd8",
      lakeFoamColor: lakeFoamColorInput.value || "#4a6f8a",
    };
    const cloudOpts: CloudOpts = {
      enabled: cloudsEnabledInput.checked,
      color: cloudColorInput.value || "#000000",
      opacity: Number(cloudOpacityInput.value) || 0,
      density: Math.min(0.99, Math.max(0, Number(cloudDensityInput.value) || 0)),
      scale: Number(cloudScaleInput.value) || 256,
      windSpeed: Number(cloudWindSpeedInput.value) || 0,
      windDrift: Number(cloudWindDriftInput.value) || 0,
      morphSpeed: Number(cloudMorphSpeedInput.value) || 0,
      blend: (cloudBlendInput.value as GlobalCompositeOperation) || "screen",
    };
    const vignetteOpts: VignetteOpts = {
      enabled: vignetteEnabledInput.checked,
      color: vignetteColorInput.value || "#000000",
      intensity: Math.min(1, Math.max(0, Number(vignetteIntensityInput.value) || 0)),
      feather: Math.min(1, Math.max(0, Number(vignetteFeatherInput.value) || 0)),
      scale: Math.max(0.1, Number(vignetteScaleInput.value) || 1),
    };
    const portOpts: PortOpts = {
      glowColor: portGlowColorInput.value || "#fab45a",
      glowSize: Math.max(0.1, Number(portGlowSizeInput.value) || 2.6),
      glowFeather: Math.min(1, Math.max(0, Number(portGlowFeatherInput.value) || 0.55)),
      glowOpacity: Math.min(1, Math.max(0, Number(portGlowOpacityInput.value) || 0.55)),
      glowBlend: (portGlowBlendInput.value as GlobalCompositeOperation) || "source-over",
      centerOffset: Number(portCenterOffsetInput.value) || 0,
      itemsGap: Math.max(0, Number(portItemsGapInput.value) || 0),
      iconSize: Math.max(0, Number(portIconSizeInput.value) || 0),
      textSize: Math.max(0.1, Number(portTextSizeInput.value) || 0.9),
    };
    const hoverOpts: HoverOpts = {
      enabled: hoverEnabledInput.checked,
      color: hoverColorInput.value || "#ffffff",
      offX: Number(hoverOffXInput.value) || 0,
      offY: Number(hoverOffYInput.value) || 0,
      scale: Math.max(0.05, Number(hoverScaleInput.value) || 0.5),
      opacity: Math.min(1, Math.max(0, Number(hoverOpacityInput.value) || 0.9)),
      fadeIn: Math.max(0.001, Number(hoverFadeInInput.value) || 0.15),
      fadeOut: Math.max(0.001, Number(hoverFadeOutInput.value) || 0.25),
      glowSize: Math.max(0.1, Number(hoverGlowSizeInput.value) || 1.5),
      feather: Math.min(1, Math.max(0, Number(hoverFeatherInput.value) || 0.5)),
      blend: (hoverBlendInput.value as GlobalCompositeOperation) || "source-over",
    };
    const thievesTileIdx = getThievesTileIdx();
    // During robber-move, ghost the thief onto whichever tile the cursor is
    // over (a valid, different tile) so the player previews where it'll land —
    // mirroring the settlement/bridge placement ghost.
    let robberMoveHoverPos: { x: number; y: number } | null = null;
    let robberMoveHoverIdx = -1;
    if (getPhase() === "robber-move"
      && currentBuilderId() === getActivePlayerId()
      && getActivePlayerId() === getViewerPlayerId()
      && mouseX >= 0) {
      const wx = (mouseX - view.tx) / view.zoom;
      const wy = (mouseY - view.ty) / view.zoom;
      const hoverIdx = tileAtPixel(wx, wy, layout);
      // Ghost on any tile, including the current one when "thief may stay" is on.
      if (hoverIdx >= 0 && (getRuleThiefStayAllowed() || hoverIdx !== thievesTileIdx)) {
        robberMoveHoverPos = axialToPixel(board.tiles[hoverIdx], layout);
        robberMoveHoverIdx = hoverIdx;
      }
    }
    const buildingOpts = {
      settlementScale: Math.max(0.05, Number(settlementScaleInput.value) || 0.55),
      settlementOffY: Number(settlementOffYInput.value) || 0,
      cityScale: Math.max(0.05, Number(cityScaleInput.value) || 0.65),
      cityOffY: Number(cityOffYInput.value) || 0,
      bridgeTuning: ((): Record<BridgeVariant, BridgeTuning> => {
        // Single 30° tuning auto-mirrors across the vertical axis: 30down is the
        // reflection of 30up (negate X offset and rotation, keep Y/scale).
        const scale30 = Math.max(0.05, Number(bridge30ScaleInput.value) || 0.6);
        const ox = Number(bridge30OffXInput.value) || 0;
        const oy = Number(bridge30OffYInput.value) || 0;
        const rot = Number(bridge30RotInput.value) || 0;
        return {
          "30up": { scale: scale30, offX: ox, offY: oy, rotDeg: rot },
          "30down": { scale: scale30, offX: -ox, offY: oy, rotDeg: -rot },
          straight: {
            scale: Math.max(0.05, Number(bridgeStraightScaleInput.value) || 0.6),
            offX: Number(bridgeStraightOffXInput.value) || 0,
            offY: Number(bridgeStraightOffYInput.value) || 0,
            rotDeg: Number(bridgeStraightRotInput.value) || 0,
          },
        };
      })(),
      getOwnerColor: ownerColor,
      blend: (buildingBlendInput.value as GlobalCompositeOperation) || "overlay",
      pathWidth: Math.max(0, Number(pathWidthInput.value) || 0),
      pathBlend: (pathBlendInput.value as GlobalCompositeOperation) || "source-over",
      shadowBlend: (shadowBlendInput.value as GlobalCompositeOperation) || "source-over",
      shadowAngleDeg: Number(shadowAngleInput.value) || 0,
      shadowSpread: Math.max(0, Number(shadowSpreadInput.value) || 0),
      shadowFeather: Math.max(0, Number(shadowFeatherInput.value) || 0),
      shadowOpacity: Math.max(0, Math.min(1, Number(shadowOpacityInput.value) || 0)),
      buildingScale: buildingScaleAt(performance.now(), board.tiles.length),
      thievesScale: Math.max(0, Number(thievesScaleInput.value) || 0),
      thievesOffY: Number(thievesOffYInput.value) || 0,
      thievesPos: (thievesTileIdx >= 0
        && board.tiles[thievesTileIdx]
        && tileRevealProgress(thievesTileIdx, performance.now(), board.tiles.length) >= 1)
        ? axialToPixel(board.tiles[thievesTileIdx], layout)
        : null,
      thievesTileIdx,
      robberMoveHoverPos,
      robberMoveHoverIdx,
      robberMoveActive: getPhase() === "robber-move",
      robberMoveValidTiles: getPhase() === "robber-move"
        // With "thief may stay" on, the current tile is also a valid target.
        ? new Set(board.tiles.map((_, i) => i).filter((i) => getRuleThiefStayAllowed() || i !== thievesTileIdx))
        : undefined,
      // Fog mode hides opponents' pieces until the viewer has explored a tile
      // they touch. Other modes render every piece.
      ...(getRevealMode() === "fog"
        ? (() => {
            const vis = visiblePiecesForViewer(getViewerPlayerId(), board, layout);
            return { visibleBuildingKeys: vis.buildings, visibleBridgeKeys: vis.bridges };
          })()
        : {}),
    };
    const placementGraph = buildPlacementGraph(board, layout);
    // Hide hints when viewer != current builder (they shouldn't see where
    // someone else can place). During pre-match / roll, no hints either.
    const phase = getPhase();
    const showHints = (phase === "opening" || phase === "main") && currentBuilderId() === getViewerPlayerId();
    const validV = showHints ? validSettlementVertices(placementGraph) : new Set<string>();
    const validC = showHints ? validCityVertices() : new Set<string>();
    const validE = showHints ? validBridgeEdges(placementGraph) : new Set<string>();
    const mouseWX = mouseX < 0 ? -1e9 : (mouseX - view.tx) / view.zoom;
    const mouseWY = mouseY < 0 ? -1e9 : (mouseY - view.ty) / view.zoom;
    const hoverSnap = snapPlacementHover(placementGraph, validV, validC, validE, mouseWX, mouseWY, layout.size);
    const placementOpts = {
      graph: placementGraph,
      hints: {
        step: getPlacementStep(),
        vertices: validV,
        cities: validC,
        edges: validE,
        hover: hoverSnap,
      },
      buildingImgs,
      hintColor: ownerColor(currentBuilderId()),
      blend: buildingOpts.blend,
      bridgeTuning: buildingOpts.bridgeTuning,
      buildingScale: buildingOpts.buildingScale,
      settlementOffY: Number(settlementOffYInput.value) || 0,
    };
    const fogOpts: FogOpts = {
      enabled: fogEnabledInput.checked,
      color: fogColorInput.value || "#3d3d3d",
      opacity: Math.min(1, Math.max(0, Number(fogOpacityInput.value) || 0)),
    };
    draw(ctx, board, layout, images, portIcons, buildingImgs, imgScale, view, dpr, numOpts, glowOpts, beachOpts, portOpts, buildingOpts, hoverOpts, vignetteOpts, cloudOpts, placementOpts, fogOpts, performance.now());
    // Dice are rendered separately to the overlay canvas so they stay on top
    // of modals. Clear every frame so the dice disappear cleanly when their
    // fade-out completes.
    diceCtx.setTransform(1, 0, 0, 1, 0, 0);
    diceCtx.clearRect(0, 0, diceOverlay.width, diceOverlay.height);
    drawDice(diceCtx, dpr, performance.now());
  }

  // Animation loop — drives cloud motion. Cheap to leave running.
  let lastTickT = 0;
  function tick(t: number) {
    const dt = lastTickT === 0 ? 0 : Math.min(0.1, (t - lastTickT) / 1000);
    lastTickT = t;
    let needsRender = false;
    // Ease the live zoom toward the wheel target, re-anchoring on the cursor
    // each frame so the world point under the cursor stays put. Exponential
    // smoothing (frame-rate independent via dt) gives a soft settle.
    if (zoomEase.active) {
      const smooth = 1 - Math.exp(-dt * 16);
      const newZoom = view.zoom + (zoomEase.target - view.zoom) * smooth;
      const k = newZoom / view.zoom;
      view.tx = zoomEase.anchorX - k * (zoomEase.anchorX - view.tx);
      view.ty = zoomEase.anchorY - k * (zoomEase.anchorY - view.ty);
      view.zoom = newZoom;
      if (Math.abs(zoomEase.target - view.zoom) < 1e-4) {
        view.zoom = zoomEase.target;
        zoomEase.active = false;
      }
      needsRender = true;
    }
    if (revealAnimationRunning(t, board.tiles.length)) needsRender = true;
    if (diceAnimationRunning(t)) needsRender = true;
    if (matchPopAnimationRunning(t)) needsRender = true;
    if (tileSheenAnimationRunning()) needsRender = true;
    if (buildingScaleAnimationRunning(t, board.tiles.length)) needsRender = true;
    if (placementBounceAnimationRunning()) needsRender = true;
    // Watch for end-of-dice transition: while dice are visible but animation
    // settled, advance roll → main once.
    if (diceJustFinished(t)) {
      // On a 7 the roll handler owns the transition (discard → robber-move).
      // Skip the auto roll→main flip so the UI doesn't briefly show main.
      if (!sevenPending) markDiceRolled();
      refreshTopButtons();
      needsRender = true;
    }
    // Placement-hint pulse + marching-ant dashes need a steady redraw whenever
    // hints are on-screen: during the forced opening, or while the cursor is
    // over the canvas in free mode.
    if (getPlacementStep() !== "free" || mouseX >= 0) needsRender = true;

    // Hover: only active once the reveal animation has finished.
    const prevHoverIdx = hover.idx;
    const hoverGateOpen = getRevealMode() === "default"
      ? !reveal.hidden && !revealAnimationRunning(t, board.tiles.length)
      : true; // per-tile gate applied below
    if (hoverEnabledInput.checked && hoverGateOpen) {
      const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
      const tickNumOpts = {
        scale: Number(numScaleInput.value) || 0,
        offX: Number(numOffXInput.value) || 0,
        offY: Number(numOffYInput.value) || 0,
      };
      const idx = mouseX < 0 ? -1 : findHoveredNumberTokenTileIdx(board, layout, view, mouseX, mouseY, tickNumOpts);
      // In fog / all-visible modes, don't reveal a tile's resource type via the
      // hover icon if the tile itself hasn't flipped face-up yet.
      const tileVisible = getRevealMode() === "default"
        ? true
        : idx >= 0 && tileRevealProgress(idx, t, board.tiles.length) >= 1;
      const valid = idx >= 0 && board.tiles[idx].type !== "desert" && tileVisible ? idx : -1;
      if (valid === -1) {
        hover.pending = -1;
        hover.target = 0;
      } else if (hover.idx === -1 || hover.alpha === 0) {
        // No icon currently shown — adopt the new tile and fade in.
        hover.idx = valid;
        hover.pending = -1;
        hover.target = 1;
      } else if (valid === hover.idx) {
        // Still on the same tile — continue fading in.
        hover.pending = -1;
        hover.target = 1;
      } else {
        // Moving to a different tile — fade out current, queue the next.
        hover.pending = valid;
        hover.target = 0;
      }
    } else {
      hover.pending = -1;
      hover.target = 0;
    }
    if (hover.idx !== prevHoverIdx) needsRender = true;
    const fadeIn = Math.max(0.001, Number(hoverFadeInInput.value) || 0.15);
    const fadeOut = Math.max(0.001, Number(hoverFadeOutInput.value) || 0.25);
    if (hover.alpha !== hover.target) {
      const rate = hover.target > hover.alpha ? 1 / fadeIn : 1 / fadeOut;
      const step = rate * dt;
      if (hover.target > hover.alpha) hover.alpha = Math.min(hover.target, hover.alpha + step);
      else hover.alpha = Math.max(hover.target, hover.alpha - step);
      needsRender = true;
      if (hover.target === 0 && hover.alpha <= 0) {
        if (hover.pending !== -1) {
          // Finished fading out the previous — swap to the queued tile and fade in.
          hover.idx = hover.pending;
          hover.pending = -1;
          hover.target = 1;
        } else {
          hover.idx = -1;
        }
      }
    }
    if (cloudsEnabledInput.checked) {
      const cloudOpts: CloudOpts = {
        enabled: true,
        color: cloudColorInput.value || "#000000",
        opacity: Number(cloudOpacityInput.value) || 0,
        density: Math.min(0.99, Math.max(0, Number(cloudDensityInput.value) || 0)),
        scale: Number(cloudScaleInput.value) || 256,
        windSpeed: Number(cloudWindSpeedInput.value) || 0,
        windDrift: Number(cloudWindDriftInput.value) || 0,
        morphSpeed: Number(cloudMorphSpeedInput.value) || 0,
        blend: (cloudBlendInput.value as GlobalCompositeOperation) || "screen",
      };
      updateCloudWind(cloudOpts, t);
      needsRender = true;
    }
    if (needsRender) render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Track when the dice animation has just finished so we can phase-shift
  // roll → main exactly once per dice toss. dice.visible flips to false
  // inside diceAnimationRunning() when the panel fully fades out.
  let dicePrevVisible = false;
  function diceJustFinished(_t: number): boolean {
    void _t;
    const visible = dice.visible;
    const finished = dicePrevVisible && !visible;
    dicePrevVisible = visible;
    return finished;
  }

  // ---------- Robber-on-7 sequence ----------
  // sevenPending is true between the dice roll and the post-dice transition;
  // it gates the diceJustFinished hook so the auto roll→main flip is skipped
  // for sevens.
  let sevenPending = false;

  function handTotal(playerId: number): number {
    const hand = resourceCounts[playerId];
    if (!hand) return 0;
    let t = 0;
    for (const r of RESOURCE_ORDER) t += hand[r];
    return t;
  }

  function triggerSevenSequence() {
    // Players (in turn order) holding > 7 cards owe floor(total/2). The
    // "thief spares roller" house rule exempts the active player (the one
    // who rolled the 7) from the discard penalty — they still move the
    // robber and steal as normal.
    const order = getPlayers().map((p) => p.id);
    const rollerId = getActivePlayerId();
    const sparesCaster = getRuleThiefSparesCaster();
    const amounts = new Map<number, number>();
    const owers: number[] = [];
    for (const pid of order) {
      if (sparesCaster && pid === rollerId) continue;
      const total = handTotal(pid);
      if (total > 7) {
        amounts.set(pid, Math.floor(total / 2));
        owers.push(pid);
      }
    }
    if (owers.length) {
      startDiscardPhase(owers, amounts);
      openDiscardModal();
    } else {
      startRobberMovePhase();
    }
    refreshTopButtons();
    render();
  }

  function openDiscardModal() {
    if (!discardBackdrop) return;
    discardBackdrop.classList.remove("hidden");
    renderDiscardModal();
  }
  function closeDiscardModal() {
    if (!discardBackdrop) return;
    discardBackdrop.classList.add("hidden");
  }

  function renderDiscardModal() {
    if (!discardBackdrop || !discardRow || !discardHeader || !discardSub || !discardCounter) return;
    const cur = getDiscardCurrent();
    if (!cur) { closeDiscardModal(); return; }
    const player = getPlayers().find((p) => p.id === cur.playerId);
    const owedTotal = Math.floor(handTotal(cur.playerId) / 2) + 0; // for label fallback
    const initial = cur.remaining; // remaining acts as both target & countdown — display N as current owed
    void owedTotal;
    discardHeader.textContent = `Discard ${cur.remaining} card${cur.remaining === 1 ? "" : "s"}`;
    discardSub.textContent = `${player?.name ?? `P${cur.playerId + 1}`} — pick the cards to lose.`;
    discardCounter.textContent = `Left: ${cur.remaining}`;
    discardRow.innerHTML = "";
    const hand = resourceCounts[cur.playerId];
    for (const k of RESOURCE_ORDER) {
      const btn = document.createElement("button");
      btn.className = "trade-btn";
      btn.type = "button";
      btn.dataset.res = k;
      btn.title = RESOURCE_LABELS[k];
      const img = document.createElement("img");
      img.src = RESOURCE_ICONS[k];
      img.alt = "";
      img.draggable = false;
      btn.appendChild(img);
      const stock = document.createElement("span");
      stock.className = "stock";
      const count = hand ? hand[k] : 0;
      stock.textContent = String(count);
      btn.appendChild(stock);
      btn.disabled = !hand || count <= 0;
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const h = resourceCounts[cur.playerId];
        if (!h || h[k] <= 0) return;
        h[k] = h[k] - 1;
        discardOne();
        if (cur.playerId === getViewerPlayerId()) renderResourceHud(cur.playerId);
        refreshPlayerStrip();
        const next = getDiscardCurrent();
        if (!next) {
          closeDiscardModal();
          // Queue empty — startDiscardPhase already auto-transitioned to
          // robber-move via discardOne, so just refresh the prompt.
          refreshTopButtons();
          render();
        } else {
          renderDiscardModal();
          refreshTopButtons();
          render();
        }
      });
      discardRow.appendChild(btn);
    }
    void initial;
  }

  function openStealModal(victims: number[], onPick: (victimId: number) => void) {
    if (!stealBackdrop || !stealOptions) {
      // Fallback: pick the first victim if the modal isn't present.
      if (victims.length) onPick(victims[0]);
      return;
    }
    stealOptions.innerHTML = "";
    for (const vid of victims) {
      const player = getPlayers().find((p) => p.id === vid);
      const total = handTotal(vid);
      const btn = document.createElement("button");
      btn.className = "steal-option";
      btn.type = "button";
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = player?.color ?? "#888";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = player?.name ?? `P${vid + 1}`;
      const cards = document.createElement("span");
      cards.className = "cards";
      cards.textContent = `${total} card${total === 1 ? "" : "s"}`;
      btn.appendChild(sw);
      btn.appendChild(name);
      btn.appendChild(cards);
      btn.addEventListener("click", () => {
        stealBackdrop.classList.add("hidden");
        onPick(vid);
      });
      stealOptions.appendChild(btn);
    }
    stealBackdrop.classList.remove("hidden");
  }

  // Resolve the steal after the robber moved. Called from canvas click handler.
  function resolveSteal() {
    // "Skip steal" rule: moving the robber ends the sequence with no theft.
    if (getRuleThiefSkipSteal()) {
      finishRobber();
      refreshTopButtons();
      render();
      return;
    }
    const robberId = getActivePlayerId();
    const tileIdx = getThievesTileIdx();
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    const victims = eligibleVictimsFor(tileIdx, robberId, board, layout, (id) => handTotal(id) > 0);
    const robberName = getPlayers().find((p) => p.id === robberId)?.name ?? `P${robberId + 1}`;
    const doSteal = (victimId: number) => {
      const vHand = resourceCounts[victimId];
      const tHand = resourceCounts[robberId];
      if (!vHand || !tHand) { finishRobber(); refreshTopButtons(); render(); return; }
      // Weight by count: expand the victim's hand into a flat list so a card is
      // as likely as its share of the hand, then pick one uniformly.
      const candidates: ResourceKind[] = [];
      for (const k of RESOURCE_ORDER) for (let i = 0; i < vHand[k]; i++) candidates.push(k);
      if (!candidates.length) { finishRobber(); refreshTopButtons(); render(); return; }
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      const victimName = getPlayers().find((p) => p.id === victimId)?.name ?? `P${victimId + 1}`;
      showActionPrompt(`${robberName} stole a ${RESOURCE_LABELS[picked].toLowerCase()} from ${victimName}!`);
      // The fly animation owns the actual debit/credit (and the loss/gain pops)
      // so the count changes land in step with the card's arc.
      spawnResourceSteal(picked, victimId, robberId);
      finishRobber();
      refreshTopButtons();
      render();
    };
    if (victims.length === 0) {
      showActionPrompt("No one to steal from.");
      finishRobber();
      refreshTopButtons();
      render();
      return;
    }
    if (victims.length === 1) {
      doSteal(victims[0]);
      return;
    }
    startRobberStealPhase();
    refreshTopButtons();
    render();
    openStealModal(victims, doSteal);
  }

  function resetSharedReveal() {
    rebuildRevealOrders(board);
    reveal.animStart = performance.now();
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    applyRevealModeReset(board, layout);
  }

  function restartGameState() {
    buildings.clear();
    bridges.clear();
    resetAllResources();
    renderResourceHud();
    setPlacementStep("initial-s1");
    setLastInitialSettlementKey(null);
    placementBounce.clear();
    tileSheen.clear();
    dice.matchOrder = [];
    dice.visible = false;
    setThievesTileIdx(defaultThievesIdx(board));
    resetSharedReveal();
    resetTurnState();
    resetDevCards(); // fresh shuffled deck + empty hands
    // Clear achievement flags + knight-derived state for every player.
    for (const p of getPlayers()) {
      p.hasLargestArmy = false;
      p.hasLongestRoad = false;
      p.longestRoadLength = 0;
    }
    sevenPending = false;
    if (discardBackdrop) discardBackdrop.classList.add("hidden");
    if (stealBackdrop) stealBackdrop.classList.add("hidden");
    if (cardDetailBackdrop) cardDetailBackdrop.classList.add("hidden");
    if (yopBackdrop) yopBackdrop.classList.add("hidden");
    if (monopolyBackdrop) monopolyBackdrop.classList.add("hidden");
    renderVictoryHud(getViewerPlayerId());
    refreshPassivesAndTrade();
    refreshPlayerStrip();
    refreshTopButtons();
    renderCardHand();
  }

  function regen() {
    board = generateBoard(
      Number(seedInput.value) || 0,
      Number(radiusInput.value) || undefined,
      mapStyleSelect.value as MapStyle
    );
    restartGameState();
    render();
  }

  // pan
  let dragging = false;
  let lastX = 0, lastY = 0;
  let dragDist = 0;
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDist = 0;
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    view.tx += dx;
    view.ty += dy;
    dragDist += Math.hypot(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
    render();
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    canvas.style.cursor = "grab";
  });
  canvas.style.cursor = "grab";

  // Track mouse position and the currently-hovered tile. Only effective once
  // the reveal animation has fully completed.
  let mouseX = -1, mouseY = -1;
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener("mouseleave", () => { mouseX = -1; mouseY = -1; });

  // mac trackpad: two-finger drag => pan (wheel without ctrlKey),
  // pinch => zoom (wheel with ctrlKey set by the browser). Also handles mouse wheel zoom.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Resolve min zoom from the current layout so the cursor-anchor math
      // uses the zoom we'll actually end up at (otherwise clamping drifts pan).
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const layout = fitLayout(board, cssW, cssH);
      const minZoom = computeMinZoom(board, layout, cssW, cssH);
      // Smaller per-notch coefficient => finer granularity. Each wheel event
      // nudges the eased target rather than snapping the live zoom, so rapid
      // scrolls accumulate smoothly and the tick loop interpolates the rest.
      const base = zoomEase.active ? zoomEase.target : view.zoom;
      const factor = Math.exp(-e.deltaY * 0.0025);
      zoomEase.target = Math.min(8, Math.max(minZoom, base * factor));
      zoomEase.anchorX = cx;
      zoomEase.anchorY = cy;
      zoomEase.active = true;
    } else {
      view.tx -= e.deltaX;
      view.ty -= e.deltaY;
    }
    render();
  }, { passive: false });

  regenBtn.addEventListener("click", () => {
    seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    regen();
  });
  seedInput.addEventListener("input", regen);
  radiusInput.addEventListener("input", regen);
  mapStyleSelect.addEventListener("change", regen);
  imgScaleInput.addEventListener("input", render);
  rollBtn.addEventListener("click", () => {
    if (getPhase() !== "roll" || rollBtn.disabled) return;
    // Disable the button for the full dice animation. Phase stays "roll" so
    // End Turn / Trade don't appear yet (that flip happens via the tick's
    // diceJustFinished hook when the dice settle and fade). This prevents
    // both spamming rolls AND accidentally clicking End Turn mid-animation.
    rollBtn.disabled = true;
    rollDice(board);
    const sum = dice.dice[0] + dice.dice[1];
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    if (sum === 7) {
      // No yields on a 7. The robber sequence is driven by the roll handler
      // itself (the tick hook skips markDiceRolled while sevenPending is set)
      // so the discard / robber-move transition happens after the dice fade.
      sevenPending = true;
      setTimeout(() => {
        sevenPending = false;
        triggerSevenSequence();
      }, POST_DICE_START * 1000);
    } else {
      // Dice yields credit each building's owner; only the viewer's gains fly.
      scheduleRollYields(board, layout, view, canvas);
    }
    render();
  });
  endTurnBtn.addEventListener("click", () => {
    if (getPhase() !== "main") return;
    endTurn(); // bumps the turn counter → last turn's cards become ready
    resetDevCardTurnFlag(); // new turn: the one-dev-card-per-turn limit resets
    // Snap viewer back to active when ending a turn — debug peeks are reset
    // so the new active player sees their own hand on entry.
    setViewerPlayerId(getActivePlayerId());
    renderResourceHud(getViewerPlayerId());
    refreshPassivesAndTrade();
    refreshPlayerStrip();
    refreshTopButtons();
    renderCardHand();
    render();
  });
  canvas.addEventListener("click", (e) => {
    // Suppress click after a real drag.
    if (dragDist > 4) return;
    if (dice.visible && !diceAnimationRunning(performance.now())) {
      dice.visible = false;
      render();
      return;
    }
    // Default mode: block placement while the global reveal animation is
    // running so clicks can't land on still-flipping cards. Fog and all-visible
    // modes flip individual tiles asynchronously, so don't lock the UI.
    if (getRevealMode() === "default" && revealAnimationRunning(performance.now(), board.tiles.length)) return;
    // Phase gating: only opening + main allow placement, and only when the
    // viewer is the active builder (in opening, the builder follows the snake
    // pointer, not the active id). Robber-move has its own click branch below.
    const phase = getPhase();
    if (phase === "robber-move" && currentBuilderId() === getActivePlayerId() && getActivePlayerId() === getViewerPlayerId()) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - view.tx) / view.zoom;
      const wy = (my - view.ty) / view.zoom;
      const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
      const bestIdx = tileAtPixel(wx, wy, layout);
      if (bestIdx < 0) return;
      // Vanilla forces a move; the "thief may stay" rule allows re-placing on
      // the same tile.
      if (bestIdx === getThievesTileIdx() && !getRuleThiefStayAllowed()) return;
      setThievesTileIdx(bestIdx);
      resolveSteal();
      return;
    }
    if (phase !== "opening" && phase !== "main") return;
    if (currentBuilderId() !== getViewerPlayerId()) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - view.tx) / view.zoom;
    const wy = (my - view.ty) / view.zoom;
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    const graph = buildPlacementGraph(board, layout);
    const validV = validSettlementVertices(graph);
    const validC = validCityVertices();
    const validE = validBridgeEdges(graph);
    const snap = snapPlacementHover(graph, validV, validC, validE, wx, wy, layout.size);
    if (!snap) return;
    const builderId = currentBuilderId();
    if (snap.kind === "vertex") {
      const v = graph.vertices.get(snap.key);
      if (!v) return;
      if (validC.has(snap.key)) {
        // Upgrade settlement → city (free mode only — validCityVertices is
        // empty during the opening sequence).
        buildings.set(snap.key, { kind: "city", ownerId: builderId });
        spendForBuild("city", builderId);
      } else {
        buildings.set(snap.key, { kind: "settlement", ownerId: builderId });
        if (getPlacementStep() === "initial-s1") {
          setLastInitialSettlementKey(snap.key);
          setPlacementStep("initial-b1");
        } else if (getPlacementStep() === "initial-s2") {
          setLastInitialSettlementKey(snap.key);
          setPlacementStep("initial-b2");
        } else {
          spendForBuild("settlement", builderId);
        }
      }
      placementBounce.set(snap.key, performance.now());
    } else {
      const e2 = graph.edges.get(snap.key);
      if (!e2) return;
      bridges.set(snap.key, { variant: e2.variant, a: e2.a, b: e2.b, ownerId: builderId });
      placementBounce.set(snap.key, performance.now());
      if (getPlacementStep() === "initial-b1") {
        setPlacementStep("initial-s2");
        setLastInitialSettlementKey(null);
      } else if (getPlacementStep() === "initial-b2") {
        // End of this player's full opening (S1+B1+S2+B2). Advance to the
        // next player's slot; if opening is done, transition to roll phase.
        if (phase === "opening") openingAdvance();
        const stillOpening = getPhase() === "opening";
        if (stillOpening) {
          // Hot-seat: sync the viewer to whoever's up next so the new
          // player sees their own perspective immediately.
          setViewerPlayerId(currentBuilderId());
          renderResourceHud(getViewerPlayerId());
          // Next player's S1.
          setPlacementStep("initial-s1");
          setLastInitialSettlementKey(null);
        } else {
          setPlacementStep("free");
          setLastInitialSettlementKey(null);
          // Opening just ended — openingAdvance set the active player to
          // turnOrder[0] (first to roll). Snap the viewer to them too so the
          // hot-seat passes the controls correctly: the first roller sees
          // their own hand and the Roll button (which gates on viewer ===
          // active) becomes available.
          setViewerPlayerId(getActivePlayerId());
          renderResourceHud(getViewerPlayerId());
          // Opening complete — reshuffle chance numbers to honour the
          // guaranteed-6/8 rule (no-op if the rule is off). Done before the
          // reveal kicks in so the staggered flip shows the new numbers.
          reshuffleFor68Rule(board, fitLayout(board, canvas.clientWidth, canvas.clientHeight), 0);
          // In default mode flip every tile face-up via the staggered global
          // animation. In fog mode flip the tiles each player has already
          // explored and leave the rest face-down. All-visible has nothing
          // to do.
          if (getRevealMode() === "default") {
            rebuildRevealOrders(board);
            reveal.animStart = performance.now();
            reveal.hidden = false;
          } else if (getRevealMode() === "fog") {
            const layout2 = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
            const t = performance.now();
            for (const p of getPlayers()) {
              let m = tileRevealAt.get(p.id);
              if (!m) { m = new Map(); tileRevealAt.set(p.id, m); }
              for (const i of exploredTileIndices(p.id, board, layout2)) {
                if (!m.has(i)) m.set(i, t);
              }
            }
          }
        }
      } else if (getPlacementStep() === "free") {
        spendForBuild("bridge", builderId);
      } else if (getPlacementStep() === "dev-road") {
        // Road Building dev card: free road, no spend. Decrement the counter
        // and exit the state when both roads are down.
        onDevRoadPlaced();
      }
    }
    refreshFogReveals(board, fitLayout(board, canvas.clientWidth, canvas.clientHeight));
    refreshPassivesAndTrade();
    // A road or settlement just landed — recompute Longest Road for everyone
    // (covers normal roads, not just the Road Building dev card). This also
    // refreshes the VP badge + player strip.
    refreshAchievements();
    refreshTopButtons();
    render();
  });
  restartBtn.addEventListener("click", () => {
    restartGameState();
    render();
  });
  numScaleInput.addEventListener("input", render);
  numOffXInput.addEventListener("input", render);
  numOffYInput.addEventListener("input", render);
  glowSpreadInput.addEventListener("input", render);
  glowFeatherInput.addEventListener("input", render);
  innerGlowSpreadInput.addEventListener("input", render);
  innerGlowFeatherInput.addEventListener("input", render);
  foamColorInput.addEventListener("input", render);
  lakeFoamColorInput.addEventListener("input", render);
  for (const el of [portGlowColorInput, portGlowSizeInput, portGlowFeatherInput, portGlowOpacityInput, portGlowBlendInput, portCenterOffsetInput, portItemsGapInput, portIconSizeInput, portTextSizeInput, settlementScaleInput, settlementOffYInput, cityScaleInput, cityOffYInput, bridge30ScaleInput, bridge30OffXInput, bridge30OffYInput, bridge30RotInput, bridgeStraightScaleInput, bridgeStraightOffXInput, bridgeStraightOffYInput, bridgeStraightRotInput, thievesScaleInput, thievesOffYInput, buildingBlendInput, pathWidthInput, pathBlendInput, shadowBlendInput, shadowAngleInput, shadowSpreadInput, shadowFeatherInput, shadowOpacityInput]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  for (const el of [hoverEnabledInput, hoverColorInput, hoverOffXInput, hoverOffYInput, hoverScaleInput, hoverOpacityInput, hoverFadeInInput, hoverFadeOutInput, hoverGlowSizeInput, hoverFeatherInput, hoverBlendInput]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  for (const el of [vignetteEnabledInput, vignetteColorInput, vignetteIntensityInput, vignetteFeatherInput, vignetteScaleInput, cloudsEnabledInput, cloudColorInput, cloudOpacityInput, cloudDensityInput, cloudScaleInput, cloudWindSpeedInput, cloudWindDriftInput, cloudMorphSpeedInput, cloudBlendInput, fogEnabledInput, fogColorInput, fogOpacityInput]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  window.addEventListener("resize", resize);
  // The card fan's overlap depends on the bar's (viewport-relative) width.
  window.addEventListener("resize", updateCardFanOverlap);

  // --- Bank trade UI + passives badges ---
  const tradeToggleBtn = document.getElementById("trade-toggle") as HTMLButtonElement;
  const tradeBackdrop = document.getElementById("trade-backdrop") as HTMLDivElement;
  const tradeGiveRow = document.getElementById("trade-give") as HTMLDivElement;
  const tradeGetRow = document.getElementById("trade-get") as HTMLDivElement;
  const tradeSummaryEl = document.getElementById("trade-summary") as HTMLDivElement;
  const tradeCancelBtn = document.getElementById("trade-cancel") as HTMLButtonElement;
  const tradeResetBtn = document.getElementById("trade-reset") as HTMLButtonElement;
  const tradeConfirmBtn = document.getElementById("trade-confirm") as HTMLButtonElement;
  const passivesPanel = document.getElementById("passives-panel") as HTMLDivElement;

  // Standard Catan: pick one give resource, give N of it (rate determined by
  // ports), receive 1 of another. Mixed-pile state is also kept so the
  // future house-rule variant can be toggled without a rewrite.
  const emptyPile = (): Record<ResourceKind, number> => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, stone: 0 });
  let tradeGiveSingle: ResourceKind | null = null;
  let tradeGivePile: Record<ResourceKind, number> = emptyPile();
  let tradeGet: ResourceKind | null = null;

  function pileTotal(p: Record<ResourceKind, number>): number {
    let t = 0;
    for (const r of RESOURCE_ORDER) t += p[r];
    return t;
  }
  function pileTypes(p: Record<ResourceKind, number>): ResourceKind[] {
    return RESOURCE_ORDER.filter((r) => p[r] > 0);
  }
  // House-rule helper for the "mixed pile" variant: cheapest rate the pile is
  // compatible with given owned ports. Kept here so the lobby can flip
  // BANK_TRADE_RULE later without a rewrite.
  function pileTargetRate(
    p: Record<ResourceKind, number>,
    ports: Set<PortType>,
  ): { rate: 2 | 3 | 4; label: string } {
    const types = pileTypes(p);
    const total = pileTotal(p);
    if (types.length === 1 && ports.has(RESOURCE_TO_PORT_TYPE[types[0]]) && total <= 2) {
      return { rate: 2, label: `2:1 ${RESOURCE_LABELS[types[0]].toLowerCase()} port` };
    }
    if (ports.has("3:1")) return { rate: 3, label: "3:1 generic port" };
    return { rate: 4, label: "4:1 default" };
  }

  function activeHand(): Record<ResourceKind, number> {
    return resourceCounts[getActivePlayerId()] ?? emptyPile();
  }
  function currentPorts(): Set<PortType> {
    // Bank trade only ever runs for the active player.
    return ownedPortTypes(getActivePlayerId(), board, fitLayout(board, canvas.clientWidth, canvas.clientHeight));
  }

  function makeTradeBtn(k: ResourceKind): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "trade-btn";
    btn.type = "button";
    btn.dataset.res = k;
    btn.title = RESOURCE_LABELS[k];
    const img = document.createElement("img");
    img.src = RESOURCE_ICONS[k];
    img.alt = "";
    img.draggable = false;
    btn.appendChild(img);
    const stock = document.createElement("span");
    stock.className = "stock";
    btn.appendChild(stock);
    return btn;
  }

  function mountGiveRow() {
    tradeGiveRow.innerHTML = "";
    for (const k of RESOURCE_ORDER) {
      const btn = makeTradeBtn(k);
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        if (getBankTradeRule() === "standard") {
          tradeGiveSingle = k;
          if (tradeGet === k) tradeGet = null;
        } else {
          tradeGivePile[k]++;
        }
        refreshTradeUI();
      });
      btn.addEventListener("contextmenu", (e) => {
        // Right-click only meaningful in the mixed-pile house rule.
        if (getBankTradeRule() !== "mixed") return;
        e.preventDefault();
        if (tradeGivePile[k] > 0) {
          tradeGivePile[k]--;
          refreshTradeUI();
        }
      });
      tradeGiveRow.appendChild(btn);
    }
  }
  function mountGetRow() {
    tradeGetRow.innerHTML = "";
    for (const k of RESOURCE_ORDER) {
      const btn = makeTradeBtn(k);
      const stock = btn.querySelector(".stock")!;
      stock.textContent = "";
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        tradeGet = k;
        refreshTradeUI();
      });
      tradeGetRow.appendChild(btn);
    }
  }

  function refreshTradeUI() {
    if (getBankTradeRule() === "standard") refreshStandardTradeUI();
    else refreshMixedTradeUI();
  }

  function refreshStandardTradeUI() {
    const ports = currentPorts();
    const hand = activeHand();
    for (const child of Array.from(tradeGiveRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      const rate = tradeRateFor(res, ports);
      const stock = hand[res];
      const stockSpan = child.querySelector(".stock")!;
      stockSpan.textContent = `${stock} (× ${rate})`;
      // Rate pill — only visible when the player benefits from a port for
      // this resource.
      let pill = child.querySelector(".rate-pill") as HTMLSpanElement | null;
      if (rate < 4) {
        if (!pill) {
          pill = document.createElement("span");
          pill.className = "rate-pill";
          child.appendChild(pill);
        }
        pill.textContent = `${rate}:1`;
        pill.classList.toggle("fav", rate === 2);
        pill.classList.toggle("mid", rate === 3);
      } else if (pill) {
        pill.remove();
      }
      // Strip mixed-mode UI leftovers in case the rule was just flipped.
      child.querySelector(".pile-badge")?.remove();
      child.classList.remove("has-pile");
      child.classList.toggle("selected", tradeGiveSingle === res);
      child.disabled = stock < rate;
      if (child.disabled && tradeGiveSingle === res) tradeGiveSingle = null;
    }
    for (const child of Array.from(tradeGetRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      child.classList.toggle("selected", tradeGet === res);
      // Can't receive the same resource you're giving.
      child.disabled = tradeGiveSingle === res;
      if (child.disabled && tradeGet === res) tradeGet = null;
    }
    if (tradeGiveSingle) {
      const rate = tradeRateFor(tradeGiveSingle, ports);
      tradeSummaryEl.innerHTML = `Give <span class="rate">${rate} × ${RESOURCE_LABELS[tradeGiveSingle].toLowerCase()}</span> for 1 of your choice.`;
    } else {
      tradeSummaryEl.textContent = "Pick what to give.";
    }
    const ok = tradeGiveSingle != null && tradeGet != null && tradeGiveSingle !== tradeGet
      && hand[tradeGiveSingle] >= tradeRateFor(tradeGiveSingle, ports);
    tradeConfirmBtn.disabled = !ok;
    tradeResetBtn.style.display = "none";
  }

  function refreshMixedTradeUI() {
    const ports = currentPorts();
    const hand = activeHand();
    const { rate, label } = pileTargetRate(tradeGivePile, ports);
    const total = pileTotal(tradeGivePile);

    for (const child of Array.from(tradeGiveRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      const pileCount = tradeGivePile[res];
      const stock = hand[res];
      const stockSpan = child.querySelector(".stock")!;
      stockSpan.textContent = String(stock);
      let badge = child.querySelector(".pile-badge") as HTMLSpanElement | null;
      if (pileCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "pile-badge";
          child.appendChild(badge);
        }
        badge.textContent = String(pileCount);
        badge.classList.remove("hidden");
      } else if (badge) {
        badge.classList.add("hidden");
      }
      child.classList.toggle("has-pile", pileCount > 0);
      const wouldExceed = total >= rate;
      child.disabled = pileCount >= stock || wouldExceed;
    }

    for (const child of Array.from(tradeGetRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      child.classList.toggle("selected", tradeGet === res);
      child.disabled = tradeGivePile[res] > 0;
      if (child.disabled && tradeGet === res) tradeGet = null;
    }

    tradeSummaryEl.innerHTML = total === 0
      ? `Best rate available: <span class="rate">${label}</span>.`
      : `Giving <span class="rate">${total} / ${rate}</span> — ${label}`;
    tradeConfirmBtn.disabled = !(total === rate && tradeGet != null);
    tradeResetBtn.style.display = "";
    tradeResetBtn.disabled = total === 0;
  }

  mountGiveRow();
  mountGetRow();

  function openTrade() {
    tradeGiveSingle = null;
    tradeGivePile = emptyPile();
    tradeGet = null;
    tradeBackdrop.classList.remove("hidden");
    refreshTradeUI();
  }
  function closeTrade() {
    tradeBackdrop.classList.add("hidden");
  }

  tradeToggleBtn.addEventListener("click", () => {
    // Bank trade is active-player only.
    if (getPhase() !== "main" || getActivePlayerId() !== getViewerPlayerId()) return;
    openTrade();
  });
  tradeCancelBtn.addEventListener("click", closeTrade);
  tradeBackdrop.addEventListener("click", (e) => {
    if (e.target === tradeBackdrop) closeTrade();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !tradeBackdrop.classList.contains("hidden")) closeTrade();
  });
  tradeResetBtn.addEventListener("click", () => {
    tradeGivePile = emptyPile();
    refreshTradeUI();
  });
  tradeConfirmBtn.addEventListener("click", () => {
    if (!tradeGet) return;
    const ports = currentPorts();
    const hand = activeHand();
    if (getBankTradeRule() === "standard") {
      if (!tradeGiveSingle || tradeGiveSingle === tradeGet) return;
      const rate = tradeRateFor(tradeGiveSingle, ports);
      if (hand[tradeGiveSingle] < rate) return;
      hand[tradeGiveSingle] -= rate;
    } else {
      const { rate } = pileTargetRate(tradeGivePile, ports);
      if (pileTotal(tradeGivePile) !== rate) return;
      for (const r of RESOURCE_ORDER) {
        const give = tradeGivePile[r];
        if (give > 0) hand[r] = Math.max(0, hand[r] - give);
      }
      tradeGivePile = emptyPile();
    }
    hand[tradeGet] += 1;
    const gainedRes = tradeGet;
    tradeGiveSingle = null;
    tradeGet = null;
    renderResourceHud(getViewerPlayerId());
    bumpResourceCell(gainedRes, getActivePlayerId());
    refreshPlayerStrip();
    refreshTradeUI();
  });

  ruleMixedTradeInput.addEventListener("change", () => {
    setBankTradeRule(ruleMixedTradeInput.checked ? "mixed" : "standard");
    // Reset both modes' state to avoid stale selections leaking across rules.
    tradeGiveSingle = null;
    tradeGivePile = emptyPile();
    tradeGet = null;
    refreshTradeUI();
  });

  function applyRevealModeFromInputs() {
    // Fog wins if both checked. The picked mode resets reveal bookkeeping so
    // the new rule kicks in immediately.
    if (ruleFogOfWarInput.checked) setRevealMode("fog");
    else if (ruleAllVisibleInput.checked) setRevealMode("all-visible");
    else setRevealMode("default");
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    applyRevealModeReset(board, layout);
    render();
  }
  ruleAllVisibleInput.addEventListener("change", () => {
    if (ruleAllVisibleInput.checked) ruleFogOfWarInput.checked = false;
    applyRevealModeFromInputs();
  });
  ruleFogOfWarInput.addEventListener("change", () => {
    if (ruleFogOfWarInput.checked) ruleAllVisibleInput.checked = false;
    applyRevealModeFromInputs();
  });
  ruleGuaranteed68Input.addEventListener("change", () => {
    setRuleGuaranteed68(ruleGuaranteed68Input.checked);
    render();
  });
  ruleLinkedOpeningInput.addEventListener("change", () => {
    setRuleLinkedOpening(ruleLinkedOpeningInput.checked);
    render();
  });
  ruleThiefSparesCasterInput.addEventListener("change", () => {
    setRuleThiefSparesCaster(ruleThiefSparesCasterInput.checked);
  });
  ruleThiefStayAllowedInput.addEventListener("change", () => {
    setRuleThiefStayAllowed(ruleThiefStayAllowedInput.checked);
    // Re-render so the current tile's ring/ghost eligibility updates live if
    // toggled mid robber-move.
    render();
  });
  ruleThiefSkipStealInput.addEventListener("change", () => {
    setRuleThiefSkipSteal(ruleThiefSkipStealInput.checked);
  });

  function renderPassives() {
    const ports = currentPorts();
    passivesPanel.innerHTML = "";
    for (const res of RESOURCE_ORDER) {
      if (!ports.has(RESOURCE_TO_PORT_TYPE[res])) continue;
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.title = `${RESOURCE_LABELS[res]} 2:1 port`;
      const img = document.createElement("img");
      img.src = RESOURCE_ICONS[res];
      img.draggable = false;
      badge.appendChild(img);
      const ratio = document.createElement("span");
      ratio.className = "ratio";
      ratio.textContent = "2:1";
      badge.appendChild(ratio);
      passivesPanel.appendChild(badge);
    }
    if (ports.has("3:1")) {
      const badge = document.createElement("div");
      badge.className = "badge generic";
      badge.title = "Generic 3:1 port";
      badge.innerHTML = '<span class="ratio">3:1</span><span>any</span>';
      passivesPanel.appendChild(badge);
    }
    passivesPanel.classList.toggle("hidden", passivesPanel.children.length === 0);
  }
  setOnResourcesChanged(() => { refreshTradeUI(); refreshPlayerStrip(); renderCardHand(); });
  refreshPassivesAndTrade = () => { renderPassives(); refreshTradeUI(); };
  renderPassives();

  // --- Player strip badges + viewer select ---
  refreshPlayerStrip = () => {
    playerStrip.innerHTML = "";
    const phase = getPhase();
    const activeId = phase === "opening" ? currentBuilderId() : getActivePlayerId();
    const viewerId = getViewerPlayerId();
    for (const p of getPlayers()) {
      const chip = document.createElement("div");
      chip.className = "pchip";
      chip.dataset.playerId = String(p.id);
      if (p.id === activeId && phase !== "pre-match") chip.classList.add("active");
      if (p.id === viewerId && p.id !== activeId) chip.classList.add("viewer");
      const stripe = document.createElement("span");
      stripe.className = "stripe";
      stripe.style.background = p.color;
      const name = document.createElement("span");
      name.className = "pname";
      name.textContent = p.name;
      const cards = document.createElement("span");
      cards.className = "pcards";
      const hand = resourceCounts[p.id];
      let total = 0;
      if (hand) for (const r of RESOURCE_ORDER) total += hand[r];
      cards.textContent = String(total);
      chip.appendChild(stripe);
      chip.appendChild(name);
      chip.appendChild(cards);
      // Public badges row: played-knight count (always shown — others know your
      // army size), plus Largest Army / Longest Road chips when held. The total
      // dev-card count stays private (only the resource-card count is public via
      // .pcards), so we deliberately don't surface devCardCount here.
      const achieves = document.createElement("div");
      achieves.className = "pachieves";
      const knights = document.createElement("span");
      knights.className = "knights";
      knights.textContent = String(playedKnights(p.id));
      knights.title = "Knights played";
      achieves.appendChild(knights);
      if (p.hasLargestArmy) {
        const a = document.createElement("span");
        a.className = "ach army";
        a.textContent = "Army +2";
        a.title = "Largest Army";
        achieves.appendChild(a);
      }
      if (p.hasLongestRoad) {
        const a = document.createElement("span");
        a.className = "ach road";
        a.textContent = "Road +2";
        a.title = "Longest Road";
        achieves.appendChild(a);
      }
      chip.appendChild(achieves);
      playerStrip.appendChild(chip);
    }
  };

  // ===================================================================
  // Development & achievement cards
  // ===================================================================

  // Resolve a card instance's art URL (knights have 5 variants).
  function cardArtFor(inst: DevCardInstance): string {
    if (inst.type === "knight") return DEV_CARD_ART.knight[inst.knightArtIdx] ?? DEV_CARD_ART.knight[0];
    return DEV_CARD_ART[inst.type] as string;
  }

  // Card rule text as DOM (the VP card embeds the victory-point icon inline).
  function cardRuleNode(type: DevCardType): Node {
    const span = document.createElement("span");
    if (type === "victoryPoint") {
      span.append("Worth 1 ");
      const img = document.createElement("img");
      img.src = iconVictoryPointUrl;
      img.alt = "victory point";
      span.appendChild(img);
      span.append(" victory point. Counts immediately and stays hidden from opponents until you win.");
    } else {
      span.textContent = DEV_CARD_INFO[type].rule;
    }
    return span;
  }

  // Achievement rule text with the victory-point icon inline (matches the VP
  // dev card's treatment). `which` selects army vs road wording.
  function achievementRuleNode(which: "army" | "road"): Node {
    const span = document.createElement("span");
    const lead = which === "army"
      ? "Awarded to the player with the most played knights (at least 3). Worth 2 "
      : "Awarded to the player with the longest continuous road (at least 5 segments). Worth 2 ";
    span.append(lead);
    const img = document.createElement("img");
    img.src = iconVictoryPointUrl;
    img.alt = "victory points";
    span.appendChild(img);
    span.append(" until another player surpasses you.");
    return span;
  }

  // Recompute achievements + refresh every dependent surface after a card play
  // or road placement changes army/road standings.
  function refreshAchievements() {
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    recomputeLargestArmy(getPlayers());
    recomputeLongestRoad(board, layout, getPlayers());
    renderVictoryHud(getViewerPlayerId());
    refreshPlayerStrip();
  }

  // Build one card element for a stack of `count` identical cards. `repr` is the
  // representative instance; `onClick` opens its detail. Stacks of >1 get a ×N
  // badge. Played cards render grayscale (handled via the .played class).
  function buildStackCard(repr: DevCardInstance, count: number, turn: number, phase: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "game-card";
    const playable = !repr.played && canPlayDevCard(repr, turn, phase);
    if (playable) card.classList.add("playable");
    if (repr.played) card.classList.add("played-card");
    const info = DEV_CARD_INFO[repr.type];

    const art = document.createElement("img");
    art.className = "game-card-art";
    art.src = cardArtFor(repr);
    art.alt = info.title;
    art.draggable = false;
    card.appendChild(art);

    // Status indicator. Ready and played cards carry no label (the gold ring
    // already marks playable ones, and grayscale marks played). Not-ready cards
    // show a sand-timer only; VP cards keep their "+1 VP" passive note.
    if (!repr.played && repr.type === "victoryPoint") {
      const pill = document.createElement("span");
      pill.className = "status-pill passive";
      pill.textContent = "+1 VP";
      card.appendChild(pill);
    } else if (!repr.played && !isReady(repr, turn)) {
      const pill = document.createElement("span");
      pill.className = "status-pill not-ready";
      // Inline SVG hourglass — renders reliably regardless of emoji font support.
      pill.innerHTML =
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M6 2h12M6 22h12M6 2v5l6 5 6-5V2M6 22v-5l6-5 6 5v5"/></svg>';
      pill.title = "Not ready until your next turn";
      card.appendChild(pill);
    }

    // Count badge for stacks of more than one.
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "count-badge";
      badge.textContent = `×${count}`;
      card.appendChild(badge);
    }

    const body = document.createElement("div");
    body.className = "game-card-body";
    const title = document.createElement("div");
    title.className = "game-card-title";
    title.textContent = info.title;
    const rule = document.createElement("div");
    rule.className = "game-card-rule";
    rule.appendChild(cardRuleNode(repr.type));
    body.appendChild(title);
    body.appendChild(rule);
    card.appendChild(body);

    card.addEventListener("click", () => openCardDetail(repr));
    return card;
  }

  // Build the viewer's card-hand. Two rows: played cards (grayscale) on top,
  // active cards + achievements + buy button on the bottom. Identical cards are
  // grouped into a single stack with a ×N badge to tame large hands.
  function renderCardHand() {
    if (!cardHand) return;
    const phase = getPhase();
    if (phase === "pre-match") { cardHand.classList.add("hidden"); return; }
    cardHand.classList.remove("hidden");
    cardHand.innerHTML = "";
    const viewer = getViewerPlayerId();
    const turn = getTurnNumber();

    const playedRow = document.createElement("div");
    playedRow.className = "card-row played-row";
    const activeRow = document.createElement("div");
    activeRow.className = "card-row active-row";

    // Group cards by a stack key so identical ones collapse into one element.
    // Key splits on type + played + ready so a mixed batch (e.g. some ready,
    // one fresh) shows as distinct stacks the player can reason about.
    type Stack = { repr: DevCardInstance; count: number; played: boolean };
    const stacks = new Map<string, Stack>();
    for (const inst of getPlayerCards(viewer)) {
      const ready = inst.played ? true : isReady(inst, turn);
      const key = `${inst.type}|${inst.played ? "p" : ready ? "r" : "n"}`;
      const s = stacks.get(key);
      if (s) s.count++;
      else stacks.set(key, { repr: inst, count: 1, played: inst.played });
    }
    for (const { repr, count, played } of stacks.values()) {
      const card = buildStackCard(repr, count, turn, phase);
      (played ? playedRow : activeRow).appendChild(card);
    }

    // Achievement cards the viewer holds — read-only, clickable for detail.
    const viewerPlayer = getPlayer(viewer);
    const addAchievementCard = (which: "army" | "road", art: string, title: string) => {
      const card = document.createElement("div");
      card.className = "game-card achievement-card";
      const img = document.createElement("img");
      img.className = "game-card-art";
      img.src = art; img.alt = title; img.draggable = false;
      card.appendChild(img);
      const pill = document.createElement("span");
      pill.className = "status-pill passive";
      pill.textContent = "+2 VP";
      card.appendChild(pill);
      const body = document.createElement("div");
      body.className = "game-card-body";
      const t = document.createElement("div");
      t.className = "game-card-title"; t.textContent = title;
      const ru = document.createElement("div");
      ru.className = "game-card-rule"; ru.appendChild(achievementRuleNode(which));
      body.appendChild(t); body.appendChild(ru);
      card.appendChild(body);
      card.addEventListener("click", () => previewCard(which === "army" ? "achievementArmy" : "achievementRoad"));
      activeRow.appendChild(card);
    };
    if (viewerPlayer?.hasLargestArmy) addAchievementCard("army", ACHIEVEMENT_ART.army, "Largest Army");
    if (viewerPlayer?.hasLongestRoad) addAchievementCard("road", ACHIEVEMENT_ART.road, "Longest Road");

    // Buy button (end of the active row). Disabled off-turn / can't afford / deck empty.
    const buy = document.createElement("button");
    buy.id = "buy-dev-card";
    buy.type = "button";
    const myTurn = getActivePlayerId() === viewer;
    const affordable = canAffordCost(DEV_CARD_COST, viewer);
    const deckLeft = deckRemaining();
    buy.disabled = !(phase === "main" && myTurn && affordable && deckLeft > 0);
    const label = document.createElement("span");
    label.textContent = "Buy dev card";
    const cost = document.createElement("span");
    cost.className = "cost";
    for (const r of RESOURCE_ORDER) {
      const n = DEV_CARD_COST[r] ?? 0;
      for (let i = 0; i < n; i++) {
        const img = document.createElement("img");
        img.src = RESOURCE_ICONS[r];
        img.alt = RESOURCE_LABELS[r];
        cost.appendChild(img);
      }
    }
    const deck = document.createElement("span");
    deck.className = "deck-left";
    deck.textContent = deckLeft > 0 ? `${deckLeft} in deck` : "deck empty";
    buy.appendChild(label);
    buy.appendChild(cost);
    buy.appendChild(deck);
    buy.addEventListener("click", buyDevCard);
    activeRow.appendChild(buy);

    // Only mount the played row when it has cards, so the bottom row sits on the
    // resource-bar line when nothing's been played yet.
    if (playedRow.childElementCount > 0) cardHand.appendChild(playedRow);
    cardHand.appendChild(activeRow);

    updateCardFanOverlap();
  }

  // Tighten each row's fan so its cards fit the bar's capped width: per row,
  // compute the negative left-margin each card needs and expose it as
  // --card-overlap on that row. 0 until cards would overflow, then just enough
  // to fit; clamped so a readable sliver always shows. The bottom row reserves
  // space for the buy button.
  const CARD_W = 92; // compact card width (see .game-card in index.html)
  function updateCardFanOverlap() {
    if (!cardHand) return;
    const avail0 = cardHand.clientWidth || 0;
    for (const row of cardHand.querySelectorAll<HTMLElement>(".card-row")) {
      const n = row.querySelectorAll(".game-card").length;
      if (n <= 1) { row.style.setProperty("--card-overlap", "0px"); continue; }
      // The active row carries the buy button (width + its left margin).
      const buyReserve = row.classList.contains("active-row") ? 104 + 16 : 0;
      const avail = Math.max(0, avail0 - buyReserve - 12);
      const flat = n * CARD_W;
      let overlap = 0;
      if (flat > avail) overlap = -Math.min(CARD_W - 34, (flat - avail) / (n - 1));
      row.style.setProperty("--card-overlap", `${Math.round(overlap)}px`);
    }
  }

  function buyDevCard() {
    const viewer = getViewerPlayerId();
    if (getPhase() !== "main" || getActivePlayerId() !== viewer) return;
    if (!canAffordCost(DEV_CARD_COST, viewer)) return;
    if (deckRemaining() <= 0) return;
    spendCost(DEV_CARD_COST, viewer);
    for (const r of RESOURCE_ORDER) if ((DEV_CARD_COST[r] ?? 0) > 0) bumpResourceCellLoss(r, viewer);
    const inst = drawDevCard(viewer, getTurnNumber());
    // VP cards count immediately (exempt from the ready rule).
    if (inst?.type === "victoryPoint") renderVictoryHud(viewer);
    renderCardHand();
    refreshPlayerStrip();
  }

  // --- Card detail / play modal ---
  // Fill the detail card's VP row with `count` large victory-point icons (or
  // hide it when the card grants none).
  function setDetailVp(count: number) {
    if (!cardDetailVp) return;
    cardDetailVp.innerHTML = "";
    cardDetailVp.classList.toggle("has-vp", count > 0);
    for (let i = 0; i < count; i++) {
      const img = document.createElement("img");
      img.src = iconVictoryPointUrl;
      img.alt = "victory point";
      cardDetailVp.appendChild(img);
    }
  }

  let detailInst: DevCardInstance | null = null;
  function openCardDetail(inst: DevCardInstance) {
    if (!cardDetailBackdrop || !cardDetailArt || !cardDetailTitle || !cardDetailRule || !cardDetailPlay) return;
    detailInst = inst;
    cardDetailArt.src = cardArtFor(inst);
    cardDetailTitle.textContent = DEV_CARD_INFO[inst.type].title;
    if (cardDetailKind) cardDetailKind.textContent = "Development Card";
    setDetailVp(inst.type === "victoryPoint" ? 1 : 0);
    cardDetailRule.innerHTML = "";
    cardDetailRule.appendChild(cardRuleNode(inst.type));
    const playable = canPlayDevCard(inst, getTurnNumber(), getPhase());
    cardDetailPlay.style.display = inst.type === "victoryPoint" ? "none" : "";
    cardDetailPlay.disabled = !playable;
    cardDetailBackdrop.classList.remove("hidden");
  }
  function closeCardDetail() {
    if (cardDetailBackdrop) cardDetailBackdrop.classList.add("hidden");
    detailInst = null;
  }

  // Dev: open the detail modal read-only for any card type, with no Play action
  // (detailInst stays null so the Play handler is inert). Used by the dev menu's
  // card-preview entry to inspect every dev + achievement card's art and rules.
  const DEV_PREVIEW_TYPES: DevCardType[] = ["knight", "victoryPoint", "roadBuilding", "yearOfPlenty", "monopoly"];
  type PreviewKey = DevCardType | "achievementArmy" | "achievementRoad";
  const PREVIEW_LABELS: Record<PreviewKey, string> = {
    knight: "Knight (dev)",
    victoryPoint: "Victory Point (dev)",
    roadBuilding: "Road Building (dev)",
    yearOfPlenty: "Year of Plenty (dev)",
    monopoly: "Monopoly (dev)",
    achievementArmy: "Largest Army (achievement)",
    achievementRoad: "Longest Road (achievement)",
  };
  function previewCard(key: PreviewKey) {
    if (!cardDetailBackdrop || !cardDetailArt || !cardDetailTitle || !cardDetailRule || !cardDetailPlay) return;
    detailInst = null; // read-only: Play handler bails on null
    cardDetailPlay.style.display = "none";
    cardDetailRule.innerHTML = "";
    if (key === "achievementArmy") {
      cardDetailArt.src = ACHIEVEMENT_ART.army;
      cardDetailTitle.textContent = "Largest Army";
      if (cardDetailKind) cardDetailKind.textContent = "Achievement";
      setDetailVp(2);
      cardDetailRule.appendChild(achievementRuleNode("army"));
    } else if (key === "achievementRoad") {
      cardDetailArt.src = ACHIEVEMENT_ART.road;
      cardDetailTitle.textContent = "Longest Road";
      if (cardDetailKind) cardDetailKind.textContent = "Achievement";
      setDetailVp(2);
      cardDetailRule.appendChild(achievementRuleNode("road"));
    } else {
      // Knights have 5 artworks — pick a random one each preview so all are
      // reachable by clicking Preview repeatedly (matches how real draws vary).
      const knightArtIdx = key === "knight" ? Math.floor(Math.random() * DEV_CARD_ART.knight.length) : 0;
      const inst: DevCardInstance = { type: key, boughtTurn: 0, knightArtIdx, played: false };
      cardDetailArt.src = cardArtFor(inst);
      cardDetailTitle.textContent = DEV_CARD_INFO[key].title;
      if (cardDetailKind) cardDetailKind.textContent = "Development Card";
      setDetailVp(key === "victoryPoint" ? 1 : 0);
      cardDetailRule.appendChild(cardRuleNode(key));
    }
    cardDetailBackdrop.classList.remove("hidden");
  }
  cardDetailClose?.addEventListener("click", closeCardDetail);
  cardDetailBackdrop?.addEventListener("click", (e) => { if (e.target === cardDetailBackdrop) closeCardDetail(); });
  cardDetailPlay?.addEventListener("click", () => {
    const inst = detailInst;
    if (!inst) return;
    if (!canPlayDevCard(inst, getTurnNumber(), getPhase())) return;
    closeCardDetail();
    playDevCard(inst);
  });

  // Dispatch a card's effect. markPlayed sets the one-per-turn flag (non-VP).
  function playDevCard(inst: DevCardInstance) {
    switch (inst.type) {
      case "knight": {
        markPlayed(inst);
        refreshAchievements(); // played-knight count changed → maybe Largest Army
        startRobberMovePhase();
        refreshTopButtons();
        renderCardHand();
        showActionPrompt("Knight — move the robber");
        render();
        break;
      }
      case "roadBuilding": {
        markPlayed(inst);
        startDevRoadBuilding();
        renderCardHand();
        break;
      }
      case "yearOfPlenty": {
        markPlayed(inst);
        renderCardHand();
        openYearOfPlenty();
        break;
      }
      case "monopoly": {
        markPlayed(inst);
        renderCardHand();
        openMonopoly();
        break;
      }
      case "victoryPoint":
        break; // never actively played
    }
  }

  // --- Road Building: place 2 free roads via the dev-road placement step. ---
  let devRoadsLeft = 0;
  function startDevRoadBuilding() {
    // Cap at how many legal edges actually exist (could be <2 in tight spots).
    devRoadsLeft = 2;
    setPlacementStep("dev-road");
    showActionPrompt("Road Building — place 2 free roads", 4000);
    refreshTopButtons();
    render();
  }
  // Called by the canvas click handler after a dev-road bridge is placed.
  function onDevRoadPlaced() {
    devRoadsLeft--;
    refreshAchievements(); // a new road may change Longest Road
    // Bail out early if no legal edge remains for the next free road (tight
    // boards / out of room) so the player isn't stuck in the placement state.
    let stuck = false;
    if (devRoadsLeft > 0) {
      const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
      stuck = validBridgeEdges(buildPlacementGraph(board, layout)).size === 0;
    }
    if (devRoadsLeft <= 0 || stuck) {
      setPlacementStep("free");
      showActionPrompt("Roads placed", 1600);
    } else {
      showActionPrompt(`Road Building — ${devRoadsLeft} road left`, 3000);
    }
    refreshTopButtons();
  }

  // --- Year of Plenty: pick 2 resources (repeats allowed) from the bank. ---
  let yopPick: ResourceKind[] = [];
  function openYearOfPlenty() {
    if (!yopBackdrop || !yopRow) return;
    yopPick = [];
    yopRow.innerHTML = "";
    for (const r of RESOURCE_ORDER) {
      const btn = document.createElement("button");
      btn.className = "trade-btn";
      btn.type = "button";
      btn.dataset.res = r;
      const img = document.createElement("img");
      img.src = RESOURCE_ICONS[r];
      img.alt = RESOURCE_LABELS[r];
      btn.appendChild(img);
      // Stock badge so the player can see (and live-preview) their hand even
      // though the resource HUD is hidden behind the modal.
      const stock = document.createElement("span");
      stock.className = "stock";
      btn.appendChild(stock);
      btn.title = RESOURCE_LABELS[r];
      btn.addEventListener("click", () => {
        if (yopPick.length >= 2) return;
        yopPick.push(r);
        refreshYop();
      });
      yopRow.appendChild(btn);
    }
    refreshYop();
    yopBackdrop.classList.remove("hidden");
  }
  function refreshYop() {
    if (yopCounter) yopCounter.textContent = yopPick.length === 0
      ? "Pick 2 — 0 chosen"
      : `Chosen: ${yopPick.map((r) => RESOURCE_LABELS[r]).join(", ")}`;
    if (yopConfirm) yopConfirm.disabled = yopPick.length !== 2;
    // Live-preview each button's stock = current hand + picks so far.
    const hand = resourceCounts[getViewerPlayerId()];
    if (yopRow) {
      for (const btn of yopRow.querySelectorAll<HTMLElement>(".trade-btn")) {
        const r = btn.dataset.res as ResourceKind | undefined;
        if (!r) continue;
        const have = hand ? hand[r] : 0;
        const picked = yopPick.filter((p) => p === r).length;
        const stock = btn.querySelector(".stock");
        if (stock) stock.textContent = String(have + picked);
        btn.classList.toggle("selected", picked > 0);
      }
    }
  }
  yopCancel?.addEventListener("click", () => yopBackdrop?.classList.add("hidden"));
  yopConfirm?.addEventListener("click", () => {
    if (yopPick.length !== 2) return;
    const viewer = getViewerPlayerId();
    const hand = resourceCounts[viewer];
    if (hand) for (const r of yopPick) { hand[r] += 1; }
    renderResourceHud(viewer);
    for (const r of new Set(yopPick)) bumpResourceCell(r, viewer);
    refreshPlayerStrip();
    yopBackdrop?.classList.add("hidden");
  });

  // --- Monopoly: name a resource; collect it from every other player. ---
  let monopolyPick: ResourceKind | null = null;
  function openMonopoly() {
    if (!monopolyBackdrop || !monopolyRow) return;
    monopolyPick = null;
    monopolyRow.innerHTML = "";
    for (const r of RESOURCE_ORDER) {
      const btn = document.createElement("button");
      btn.className = "trade-btn";
      btn.type = "button";
      btn.dataset.res = r;
      const img = document.createElement("img");
      img.src = RESOURCE_ICONS[r];
      img.alt = RESOURCE_LABELS[r];
      btn.appendChild(img);
      btn.title = RESOURCE_LABELS[r];
      btn.addEventListener("click", () => {
        monopolyPick = r;
        for (const b of monopolyRow.querySelectorAll(".trade-btn")) b.classList.toggle("selected", (b as HTMLElement).dataset.res === r);
        if (monopolyConfirm) monopolyConfirm.disabled = false;
      });
      monopolyRow.appendChild(btn);
    }
    if (monopolyCounter) monopolyCounter.textContent = "Pick 1 resource";
    if (monopolyConfirm) monopolyConfirm.disabled = true;
    monopolyBackdrop.classList.remove("hidden");
  }
  monopolyCancel?.addEventListener("click", () => monopolyBackdrop?.classList.add("hidden"));
  monopolyConfirm?.addEventListener("click", () => {
    if (!monopolyPick) return;
    const r = monopolyPick;
    const me = getViewerPlayerId();
    const myHand = resourceCounts[me];
    if (!myHand) return;
    let taken = 0;
    for (const p of getPlayers()) {
      if (p.id === me) continue;
      const h = resourceCounts[p.id];
      if (!h) continue;
      taken += h[r];
      h[r] = 0;
    }
    myHand[r] += taken;
    renderResourceHud(me);
    if (taken > 0) bumpResourceCell(r, me);
    refreshPlayerStrip();
    monopolyBackdrop?.classList.add("hidden");
    showActionPrompt(`Monopoly — took ${taken} ${RESOURCE_LABELS[r].toLowerCase()}`, 2600);
  });

  // Guided action prompt — a centered banner that announces phase/turn
  // transitions ("Match started!", "P2 — roll the dice!"). Auto-fades after
  // a few seconds or until the next transition replaces it.
  let promptHideTimer: number | null = null;
  function showActionPrompt(text: string, holdMs: number = 2800) {
    if (!actionPromptEl) return;
    actionPromptEl.textContent = text;
    // Restart the pop-in transition even when text changes back-to-back.
    actionPromptEl.classList.remove("visible");
    // Force reflow so the class removal+re-add re-triggers the transition.
    void actionPromptEl.offsetWidth;
    actionPromptEl.classList.add("visible");
    if (promptHideTimer != null) clearTimeout(promptHideTimer);
    promptHideTimer = window.setTimeout(() => {
      actionPromptEl.classList.remove("visible");
    }, holdMs);
  }

  // Track previous phase/step/active so refreshTopButtons can fire the right
  // prompt only on actual transitions.
  let prevPhase: ReturnType<typeof getPhase> | null = null;
  let prevStep: ReturnType<typeof getPlacementStep> | null = null;
  let prevActiveId: number = -1;

  refreshTopButtons = () => {
    const phase = getPhase();
    const myTurn = getActivePlayerId() === getViewerPlayerId();
    // Keep the card hand in sync with every phase/turn transition (ready state,
    // playability, buy availability all depend on phase + active player).
    renderCardHand();
    // Contextual bottom-bar actions. They share the right-of-HUD slot so the
    // player's eye lands on the same spot every turn. Trade hides during the
    // roll phase (you can't trade before rolling) — Roll takes its place;
    // during main, Trade rejoins End Turn.
    startMatchBtn.style.display = phase === "pre-match" ? "" : "none";
    const rollVisible = phase === "roll" && myTurn;
    rollBtn.style.display = rollVisible ? "" : "none";
    // Reset the disabled flag whenever the button (re)enters the visible
    // state — the click handler flips it true during the dice animation
    // to gate spamming, and we need it cleared for the next turn.
    if (rollVisible) rollBtn.disabled = false;
    // Action buttons hide during all robber sub-phases — the player's only
    // affordance is the modal / canvas click for that flow. Both `display`
    // AND `disabled` are toggled defensively so a stale style can't make
    // the button clickable mid-robber.
    const mainTurn = phase === "main" && myTurn;
    endTurnBtn.style.display = mainTurn ? "" : "none";
    endTurnBtn.disabled = !mainTurn;
    tradeToggleBtn.style.display = mainTurn ? "" : "none";
    tradeToggleBtn.disabled = !mainTurn;
    // Match status pill: derive a human-readable phase + active player label.
    const players = getPlayers();
    const activeId = phase === "opening" ? currentBuilderId() : getActivePlayerId();
    const active = players.find((p) => p.id === activeId);
    const tag = active ? active.name : `P${activeId + 1}`;
    const step = getPlacementStep();
    let statusText = "Sandbox";
    if (phase === "pre-match") {
      statusText = "Pre-match";
    } else if (phase === "opening") {
      if (step === "initial-s1" || step === "initial-s2") statusText = `${tag} placing — settlement`;
      else if (step === "initial-b1" || step === "initial-b2") statusText = `${tag} placing — road`;
      else statusText = `${tag} placing`;
    } else if (phase === "roll") {
      statusText = `${tag} to roll`;
    } else if (phase === "main") {
      statusText = `${tag} — main`;
    } else if (phase === "discard") {
      const cur = getDiscardCurrent();
      const dPlayer = cur ? players.find((p) => p.id === cur.playerId) : undefined;
      statusText = cur ? `${dPlayer?.name ?? `P${cur.playerId + 1}`} discarding (${cur.remaining})` : "Discarding";
    } else if (phase === "robber-move") {
      statusText = `${tag} — move the robber`;
    } else if (phase === "robber-steal") {
      statusText = `${tag} — pick a victim`;
    }
    if (matchStatusEl) matchStatusEl.textContent = statusText;

    // Guided prompts on transitions. The phase change is the strongest cue;
    // step/active changes layer on top during opening.
    const phaseChanged = phase !== prevPhase;
    const stepChanged = step !== prevStep;
    const activeChanged = activeId !== prevActiveId;
    if (phaseChanged && phase === "opening" && prevPhase === "pre-match") {
      showActionPrompt(`Match started! ${tag} — place your settlement`, 3400);
    } else if (phaseChanged && phase === "roll") {
      showActionPrompt(`${tag} — roll the dice!`);
    } else if (phaseChanged && phase === "main") {
      showActionPrompt(`${tag} — trade or build`);
    } else if (phase === "discard") {
      const cur = getDiscardCurrent();
      if (cur) {
        const dp = players.find((p) => p.id === cur.playerId);
        const dn = dp?.name ?? `P${cur.playerId + 1}`;
        if (cur.playerId === getViewerPlayerId()) {
          showActionPrompt(`${dn} — discard ${cur.remaining} card${cur.remaining === 1 ? "" : "s"}`);
        } else {
          showActionPrompt(`${dn} is discarding — waiting...`);
        }
      }
    } else if (phaseChanged && phase === "robber-move") {
      if (activeId === getViewerPlayerId()) showActionPrompt(`${tag} — move the robber`);
      else showActionPrompt(`${tag} is moving the robber...`);
    } else if (phaseChanged && phase === "robber-steal") {
      if (activeId === getViewerPlayerId()) showActionPrompt(`${tag} — pick a victim`);
    } else if (phase === "opening" && (activeChanged || stepChanged)) {
      if (step === "initial-s1") showActionPrompt(`${tag} — place your first settlement`);
      else if (step === "initial-b1") showActionPrompt(`${tag} — place your first road`);
      else if (step === "initial-s2") showActionPrompt(`${tag} — place your second settlement`);
      else if (step === "initial-b2") showActionPrompt(`${tag} — place your second road`);
    }
    prevPhase = phase;
    prevStep = step;
    prevActiveId = activeId;
  };

  startMatchBtn.addEventListener("click", () => {
    openPreMatchModal();
  });

  // --- Pre-match modal ---
  function renderPreMatchRows() {
    prematchRows.innerHTML = "";
    const rolls = getRolls();
    const wins = getRoundWins();
    const winMap = getRoundWinnerMap();
    const currentId = getCurrentRollerId();
    const complete = preMatchComplete();
    for (const p of getPlayers()) {
      const row = document.createElement("div");
      row.className = "row";
      if (p.id === currentId && !complete) row.classList.add("active");
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = p.color;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name;
      // Per-round chips show each roll's sum; the chip is gold if that
      // player strictly won that round.
      const chips = document.createElement("span");
      chips.className = "rolls";
      const myRolls = rolls[p.id] ?? [];
      const myWins = winMap[p.id] ?? [];
      const chipParts: string[] = [];
      for (let r = 0; r < myRolls.length; r++) {
        const cls = myWins[r] ? "rc win" : "rc";
        chipParts.push(`<span class="${cls}">${myRolls[r]}</span>`);
      }
      chips.innerHTML = chipParts.join("");
      const winsEl = document.createElement("span");
      winsEl.className = "sum";
      winsEl.textContent = String(wins[p.id] ?? 0);
      row.appendChild(sw);
      row.appendChild(name);
      row.appendChild(chips);
      row.appendChild(winsEl);
      prematchRows.appendChild(row);
    }
    // The roll button hides once the match has a clear winner. The match
    // auto-starts from inside the roll handler, so no Start / Tiebreak UI.
    prematchRollBtn.style.display = complete ? "none" : "";
  }
  function openPreMatchModal() {
    // 1-player mode skips pre-match — no point rolling against yourself.
    if (getPlayers().length <= 1) {
      setTurnOrder([0]);
      setPhase("opening");
      setViewerPlayerId(0);
      renderResourceHud(0);
      refreshPlayerStrip();
      refreshTopButtons();
      refreshPassivesAndTrade();
      render();
      return;
    }
    startPreMatch(getPlayers().length);
    prematchBackdrop.classList.remove("hidden");
    renderPreMatchRows();
  }
  function closePreMatchModal() {
    prematchBackdrop.classList.add("hidden");
  }
  // Pre-match roll: sequenced animation chain so nothing overlaps —
  //   (1) fade rolls panel out → (2) dice roll+settle+fade out →
  //   (3) panel fades back in → (4) re-enable button (or auto-start match)
  // Each stage waits for the previous one to fully complete.
  const PANEL_FADE_MS = 260;  // matches the CSS .rolling transition
  const DICE_LIFE_MS = (1.5 + 0.4 + 0.9 + 0.45) * 1000; // roll + settle + hold + fade
  function commitPreMatchRoll(sum: number) {
    recordRoll(sum);
    renderPreMatchRows();
    render();
    if (preMatchComplete()) {
      // Brief pause so the player sees the final sum before the modal closes.
      setTimeout(() => {
        const order = resolveTurnOrder();
        setTurnOrder(order);
        setPhase("opening");
        setViewerPlayerId(order[0]);
        renderResourceHud(order[0]);
        closePreMatchModal();
        refreshPlayerStrip();
        refreshTopButtons();
        refreshPassivesAndTrade();
        render();
      }, 600);
    }
  }
  prematchRollBtn.addEventListener("click", () => {
    if (prematchRollBtn.disabled) return;
    prematchRollBtn.disabled = true;
    // Stage 1: fade the rolls panel out completely.
    prematchBackdrop.classList.add("rolling");
    setTimeout(() => {
      // Stage 2: panel is gone — start the dice animation.
      rollDice(board);
      const sum = dice.dice[0] + dice.dice[1];
      render();
      setTimeout(() => {
        // Stage 3: dice fully faded — bring the panel back.
        prematchBackdrop.classList.remove("rolling");
        commitPreMatchRoll(sum);
        // Stage 4: re-enable button only after the panel finishes returning.
        setTimeout(() => { prematchRollBtn.disabled = false; }, PANEL_FADE_MS);
      }, DICE_LIFE_MS);
    }, PANEL_FADE_MS);
  });

  // --- Players section apply ---
  playersApplyBtn.addEventListener("click", () => {
    const n = Number(playerCountSelect.value) || 2;
    initPlayers(n, slotColors, slotNames);
    regen();
  });

  // Dev: mock a robber steal so the fly/loss/gain animation can be triggered
  // without setting up a real 7-roll + robber move. Repopulates the victim /
  // robber selects from the live player list each time the panel is touched.
  const mockStealVictim = document.getElementById("mockStealVictim") as HTMLSelectElement | null;
  const mockStealRobber = document.getElementById("mockStealRobber") as HTMLSelectElement | null;
  const mockStealBtn = document.getElementById("mockStealBtn") as HTMLButtonElement | null;
  function refreshMockStealOptions() {
    if (!mockStealVictim || !mockStealRobber) return;
    const players = getPlayers();
    for (const sel of [mockStealVictim, mockStealRobber]) {
      const prev = sel.value;
      sel.innerHTML = "";
      for (const p of players) {
        const opt = document.createElement("option");
        opt.value = String(p.id);
        opt.textContent = p.name ?? `P${p.id + 1}`;
        sel.appendChild(opt);
      }
      if (players.some((p) => String(p.id) === prev)) sel.value = prev;
    }
    // Default robber to the viewer and victim to someone else so the very first
    // click shows a card flying *into* the on-screen hand.
    if (!mockStealRobber.value || mockStealRobber.value === mockStealVictim.value) {
      mockStealRobber.value = String(getViewerPlayerId());
      const other = players.find((p) => p.id !== getViewerPlayerId());
      if (other) mockStealVictim.value = String(other.id);
    }
  }
  refreshMockStealOptions();
  // Rebuild the lists whenever a select is opened, so changing the player count
  // (Players → Apply) is reflected without needing to click Mock steal first.
  mockStealVictim?.addEventListener("mousedown", refreshMockStealOptions);
  mockStealRobber?.addEventListener("mousedown", refreshMockStealOptions);
  mockStealBtn?.addEventListener("click", () => {
    refreshMockStealOptions();
    const victimId = Number(mockStealVictim?.value ?? 0);
    const robberId = Number(mockStealRobber?.value ?? 0);
    if (victimId === robberId) { showActionPrompt("Mock steal: pick two different players."); return; }
    const vHand = resourceCounts[victimId];
    if (!vHand) return;
    // Seed an empty victim with a small random spread so the mock always has
    // something to fly — and so repeated clicks pull different resources rather
    // than always wood.
    const candidates: ResourceKind[] = [];
    for (const k of RESOURCE_ORDER) for (let i = 0; i < vHand[k]; i++) candidates.push(k);
    if (!candidates.length) {
      const seedCount = 3 + Math.floor(Math.random() * 3); // 3–5 cards
      for (let i = 0; i < seedCount; i++) {
        const seed = RESOURCE_ORDER[Math.floor(Math.random() * RESOURCE_ORDER.length)];
        vHand[seed] = (vHand[seed] ?? 0) + 1;
        candidates.push(seed);
      }
      renderResourceHud(getViewerPlayerId());
    }
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    spawnResourceSteal(picked, victimId, robberId);
  });

  // Dev: open the discard menu without rolling a 7. Stuffs the viewer's hand to
  // 9 cards (so they owe 4) and starts a discard phase scoped to the viewer.
  const mockDiscardBtn = document.getElementById("mockDiscardBtn") as HTMLButtonElement | null;
  mockDiscardBtn?.addEventListener("click", () => {
    const viewerId = getViewerPlayerId();
    const hand = resourceCounts[viewerId];
    if (!hand) return;
    if (handTotal(viewerId) <= 7) {
      // Top up to a spread of 9 so there's plenty to pick from.
      const fill: [ResourceKind, number][] = [["wood", 3], ["brick", 2], ["sheep", 2], ["wheat", 1], ["stone", 1]];
      for (const [k, n] of fill) hand[k] = Math.max(hand[k], n);
      renderResourceHud(viewerId);
      refreshPlayerStrip();
    }
    const owed = Math.floor(handTotal(viewerId) / 2);
    startDiscardPhase([viewerId], new Map([[viewerId, owed]]));
    openDiscardModal();
    refreshTopButtons();
    render();
  });

  // Dev: open the victim-chooser modal with every other player as a candidate,
  // topping up empty hands so each shows a card count. Picking one runs a real
  // steal animation into the viewer's hand.
  const mockVictimChooserBtn = document.getElementById("mockVictimChooserBtn") as HTMLButtonElement | null;
  mockVictimChooserBtn?.addEventListener("click", () => {
    const robberId = getViewerPlayerId();
    const victims = getPlayers().map((p) => p.id).filter((id) => id !== robberId);
    if (victims.length < 2) { showActionPrompt("Mock victim chooser: need 3+ players."); return; }
    for (const vid of victims) {
      const h = resourceCounts[vid];
      if (h && handTotal(vid) === 0) { h.wood += 1; }
    }
    refreshPlayerStrip();
    openStealModal(victims, (victimId) => {
      const vHand = resourceCounts[victimId];
      if (!vHand) return;
      const candidates: ResourceKind[] = [];
      for (const k of RESOURCE_ORDER) for (let i = 0; i < vHand[k]; i++) candidates.push(k);
      if (!candidates.length) return;
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      spawnResourceSteal(picked, victimId, robberId);
    });
  });

  // Dev: preview any card type (dev cards + achievements) in the detail modal.
  const previewCardType = document.getElementById("previewCardType") as HTMLSelectElement | null;
  const previewCardBtn = document.getElementById("previewCardBtn") as HTMLButtonElement | null;
  if (previewCardType) {
    const keys: PreviewKey[] = [...DEV_PREVIEW_TYPES, "achievementArmy", "achievementRoad"];
    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = PREVIEW_LABELS[k];
      previewCardType.appendChild(opt);
    }
  }
  previewCardBtn?.addEventListener("click", () => {
    if (previewCardType) previewCard(previewCardType.value as PreviewKey);
  });

  // Dev: grant the viewer a dev card (no resource cost, doesn't touch the deck).
  // Stamped a turn earlier so it's immediately "ready" to play/test.
  const grantCardType = document.getElementById("grantCardType") as HTMLSelectElement | null;
  const grantCardBtn = document.getElementById("grantCardBtn") as HTMLButtonElement | null;
  if (grantCardType) {
    for (const k of DEV_PREVIEW_TYPES) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = DEV_CARD_INFO[k].title;
      grantCardType.appendChild(opt);
    }
  }
  grantCardBtn?.addEventListener("click", () => {
    if (!grantCardType) return;
    const type = grantCardType.value as DevCardType;
    // boughtTurn = current-1 so the card is ready right away (or turn 1 minimum).
    const readyTurn = Math.max(0, getTurnNumber() - 1);
    const inst = grantDevCard(getViewerPlayerId(), type, readyTurn);
    if (inst.type === "victoryPoint") renderVictoryHud(getViewerPlayerId());
    renderCardHand();
    refreshPlayerStrip();
  });

  resetDevCards(); // build the initial shuffled deck on first load
  refreshPlayerStrip();
  refreshTopButtons();
  renderCardHand();

  // Sandbox by default — user clicks "start match" to begin the pre-match
  // dice roll. resetTurnState() leaves us in "pre-match" phase.

  resize();
  console.log(`board: seed=${board.seed} radius=${board.radius} tiles=${board.tiles.length}`);
  // Touch the import so unused-symbol lints don't strip MAX_PLAYERS / getPlayer.
  void MAX_PLAYERS; void getPlayer;
}

main();
