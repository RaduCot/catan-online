import { generateBoard, MapStyle, PortType } from "./board";

import { loadImages, loadPortIcons, loadBuildingImgs, BuildingImgs } from "./assets/loaders";

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
  spendForBuild,
  bumpResourceCell,
  scheduleRollYields,
  setOnResourcesChanged,
} from "./game/resources";
import {
  getBankTradeRule,
  setBankTradeRule,
  setRuleGuaranteed68,
  reshuffleFor68Rule,
  tradeRateFor,
  ownedPortTypes,
} from "./game/trade-rules";
import { defaultThievesIdx, getThievesTileIdx, setThievesTileIdx } from "./game/thieves";
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
} from "./game/turn";
import {
  startPreMatch,
  recordRoll,
  isComplete as preMatchComplete,
  resolveTurnOrder,
  tiedTopIds,
  startTiebreak,
  getCurrentRollerId,
  getRolls,
  getSums,
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
  const viewerSelect = document.getElementById("viewerSelect") as HTMLSelectElement;
  const playersApplyBtn = document.getElementById("players-apply") as HTMLButtonElement;
  const playerStrip = document.getElementById("player-strip") as HTMLDivElement;
  const prematchBackdrop = document.getElementById("prematch-backdrop") as HTMLDivElement;
  const prematchRows = document.getElementById("prematch-rows") as HTMLDivElement;
  const prematchRollBtn = document.getElementById("prematch-roll") as HTMLButtonElement;
  const prematchTiebreakBtn = document.getElementById("prematch-tiebreak") as HTMLButtonElement;
  const prematchStartBtn = document.getElementById("prematch-start") as HTMLButtonElement;

  const images = await loadImages();
  const portIcons = await loadPortIcons();
  const buildingImgs: BuildingImgs = await loadBuildingImgs();

  // --- Player config UI (slot inputs) ---
  // Local config that gets applied via initPlayers on Apply / regen.
  const slotNames: string[] = DEFAULT_NAMES.slice();
  const slotColors: string[] = DEFAULT_COLORS.slice();
  function renderPlayerSlots() {
    const n = Number(playerCountSelect.value) || 4;
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
  initPlayers(4, slotColors, slotNames);

  let board = generateBoard(
    Number(seedInput.value) || 0,
    Number(radiusInput.value) || undefined,
    mapStyleSelect.value as MapStyle
  );
  setThievesTileIdx(defaultThievesIdx(board));
  const view: View = { tx: 0, ty: 0, zoom: 1 };
  let dpr = window.devicePixelRatio || 1;

  // refreshPassivesAndTrade is local — assigned later from the trade UI block.
  let refreshPassivesAndTrade: () => void = () => {};
  let refreshPlayerStrip: () => void = () => {};
  let refreshTopButtons: () => void = () => {};

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    render();
  }

  function ownerColor(id: number): string {
    return getPlayerColor(id);
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
  }

  // Animation loop — drives cloud motion. Cheap to leave running.
  let lastTickT = 0;
  function tick(t: number) {
    const dt = lastTickT === 0 ? 0 : Math.min(0.1, (t - lastTickT) / 1000);
    lastTickT = t;
    let needsRender = false;
    if (revealAnimationRunning(t, board.tiles.length)) needsRender = true;
    if (diceAnimationRunning(t)) needsRender = true;
    if (matchPopAnimationRunning(t)) needsRender = true;
    if (tileSheenAnimationRunning()) needsRender = true;
    if (buildingScaleAnimationRunning(t, board.tiles.length)) needsRender = true;
    if (placementBounceAnimationRunning()) needsRender = true;
    // Watch for end-of-dice transition: while dice are visible but animation
    // settled, advance roll → main once.
    if (diceJustFinished(t)) {
      markDiceRolled();
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
    refreshPassivesAndTrade();
    refreshPlayerStrip();
    refreshTopButtons();
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
      const factor = Math.exp(-e.deltaY * 0.01);
      const newZoom = Math.min(8, Math.max(minZoom, view.zoom * factor));
      const k = newZoom / view.zoom;
      view.tx = cx - k * (cx - view.tx);
      view.ty = cy - k * (cy - view.ty);
      view.zoom = newZoom;
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
    if (getPhase() !== "roll") return;
    rollDice(board);
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    // Dice yields credit each building's owner; only the viewer's gains fly.
    scheduleRollYields(board, layout, view, canvas);
    refreshTopButtons();
    render();
  });
  endTurnBtn.addEventListener("click", () => {
    if (getPhase() !== "main") return;
    endTurn();
    // Snap viewer back to active when ending a turn — debug peeks are reset
    // so the new active player sees their own hand on entry.
    setViewerPlayerId(getActivePlayerId());
    renderResourceHud(getViewerPlayerId());
    refreshPassivesAndTrade();
    refreshPlayerStrip();
    refreshTopButtons();
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
    // pointer, not the active id).
    const phase = getPhase();
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
          // Next player's S1.
          setPlacementStep("initial-s1");
          setLastInitialSettlementKey(null);
        } else {
          setPlacementStep("free");
          setLastInitialSettlementKey(null);
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
      }
    }
    refreshFogReveals(board, fitLayout(board, canvas.clientWidth, canvas.clientHeight));
    refreshPassivesAndTrade();
    refreshPlayerStrip();
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
  setOnResourcesChanged(() => { refreshTradeUI(); refreshPlayerStrip(); });
  refreshPassivesAndTrade = () => { renderPassives(); refreshTradeUI(); };
  renderPassives();

  // --- Player strip badges + viewer select ---
  function rebuildViewerSelect() {
    viewerSelect.innerHTML = "";
    for (const p of getPlayers()) {
      const opt = document.createElement("option");
      opt.value = String(p.id);
      opt.textContent = `${p.name} (P${p.id + 1})`;
      viewerSelect.appendChild(opt);
    }
    viewerSelect.value = String(getViewerPlayerId());
  }
  viewerSelect.addEventListener("change", () => {
    const id = Number(viewerSelect.value) || 0;
    setViewerPlayerId(id);
    renderResourceHud(id);
    refreshPlayerStrip();
    refreshPassivesAndTrade();
    render();
  });

  refreshPlayerStrip = () => {
    playerStrip.innerHTML = "";
    const activeId = getActivePlayerId();
    const viewerId = getViewerPlayerId();
    for (const p of getPlayers()) {
      const badge = document.createElement("div");
      badge.className = "pbadge";
      if (p.id === activeId) badge.classList.add("active");
      if (p.id === viewerId) badge.classList.add("viewer");
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = p.color;
      const name = document.createElement("span");
      name.className = "pname";
      name.textContent = p.name;
      const cards = document.createElement("span");
      cards.className = "pcards";
      const hand = resourceCounts[p.id];
      let total = 0;
      if (hand) for (const r of RESOURCE_ORDER) total += hand[r];
      cards.textContent = `${total}🂠`;
      badge.appendChild(sw);
      badge.appendChild(name);
      badge.appendChild(cards);
      badge.addEventListener("click", () => {
        setViewerPlayerId(p.id);
        renderResourceHud(p.id);
        refreshPlayerStrip();
        refreshPassivesAndTrade();
        viewerSelect.value = String(p.id);
        render();
      });
      playerStrip.appendChild(badge);
    }
  };

  refreshTopButtons = () => {
    const phase = getPhase();
    rollBtn.disabled = phase !== "roll";
    endTurnBtn.disabled = phase !== "main";
    tradeToggleBtn.disabled = !(phase === "main" && getActivePlayerId() === getViewerPlayerId());
    // Start-match is only available pre-match (sandbox). Once the match is
    // running, hide it so the player can't kick off a duplicate pre-match.
    startMatchBtn.style.display = phase === "pre-match" ? "" : "none";
    // Match status pill: derive a human-readable phase + active player label.
    if (matchStatusEl) {
      const players = getPlayers();
      const activeId = getActivePlayerId();
      const active = players.find((p) => p.id === activeId);
      const tag = active ? active.name : `P${activeId + 1}`;
      let text = "Sandbox";
      if (phase === "pre-match") {
        text = "Pre-match";
      } else if (phase === "opening") {
        const step = getPlacementStep();
        if (step === "initial-s1" || step === "initial-s2") text = `${tag} placing — settlement`;
        else if (step === "initial-b1" || step === "initial-b2") text = `${tag} placing — road`;
        else text = `${tag} placing`;
      } else if (phase === "roll") {
        text = `${tag} to roll`;
      } else if (phase === "main") {
        text = `${tag} — main`;
      }
      matchStatusEl.textContent = text;
    }
  };

  startMatchBtn.addEventListener("click", () => {
    openPreMatchModal();
  });

  // --- Pre-match modal ---
  function renderPreMatchRows() {
    prematchRows.innerHTML = "";
    const rolls = getRolls();
    const sums = getSums();
    const currentId = getCurrentRollerId();
    for (const p of getPlayers()) {
      const row = document.createElement("div");
      row.className = "row";
      if (p.id === currentId && !preMatchComplete()) row.classList.add("active");
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = p.color;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name;
      const r = document.createElement("span");
      r.className = "rolls";
      r.textContent = `Rolls: ${(rolls[p.id] ?? []).length} / 3`;
      const sumEl = document.createElement("span");
      sumEl.className = "sum";
      sumEl.textContent = String(sums.find((s) => s.id === p.id)?.sum ?? 0);
      row.appendChild(sw);
      row.appendChild(name);
      row.appendChild(r);
      row.appendChild(sumEl);
      prematchRows.appendChild(row);
    }
    if (preMatchComplete()) {
      const order = resolveTurnOrder();
      if (order == null) {
        prematchRollBtn.style.display = "none";
        prematchTiebreakBtn.style.display = "";
        prematchStartBtn.style.display = "none";
      } else {
        prematchRollBtn.style.display = "none";
        prematchTiebreakBtn.style.display = "none";
        prematchStartBtn.style.display = "";
      }
    } else {
      prematchRollBtn.style.display = "";
      prematchTiebreakBtn.style.display = "none";
      prematchStartBtn.style.display = "none";
    }
  }
  function openPreMatchModal() {
    // 1-player mode skips pre-match — no point rolling against yourself.
    if (getPlayers().length <= 1) {
      setTurnOrder([0]);
      setPhase("opening");
      setViewerPlayerId(0);
      viewerSelect.value = "0";
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
  prematchRollBtn.addEventListener("click", () => {
    // Roll 2d6 via the existing dice overlay; record the sum into pre-match.
    rollDice(board);
    const sum = dice.dice[0] + dice.dice[1];
    recordRoll(sum);
    renderPreMatchRows();
    render();
  });
  prematchTiebreakBtn.addEventListener("click", () => {
    startTiebreak(tiedTopIds());
    renderPreMatchRows();
  });
  prematchStartBtn.addEventListener("click", () => {
    const order = resolveTurnOrder();
    if (!order) return;
    setTurnOrder(order);
    setPhase("opening");
    // First builder is turnOrder[0]; sync the viewer perspective to them so
    // the placing player sees their hints by default.
    setViewerPlayerId(order[0]);
    viewerSelect.value = String(order[0]);
    renderResourceHud(order[0]);
    closePreMatchModal();
    refreshPlayerStrip();
    refreshTopButtons();
    refreshPassivesAndTrade();
    render();
  });

  // --- Players section apply ---
  playersApplyBtn.addEventListener("click", () => {
    const n = Number(playerCountSelect.value) || 4;
    initPlayers(n, slotColors, slotNames);
    rebuildViewerSelect();
    regen();
  });

  rebuildViewerSelect();
  refreshPlayerStrip();
  refreshTopButtons();

  // Sandbox by default — user clicks "start match" to begin the pre-match
  // dice roll. resetTurnState() leaves us in "pre-match" phase.

  resize();
  console.log(`board: seed=${board.seed} radius=${board.radius} tiles=${board.tiles.length}`);
  // Touch the import so unused-symbol lints don't strip MAX_PLAYERS / getPlayer.
  void MAX_PLAYERS; void getPlayer;
}

main();
