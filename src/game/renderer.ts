import { LevelDefinition } from './levelData';
import { DEFAULT_KEY_BINDINGS, formatKeyCode } from './settings';
import {
  FacingDir,
  getDeskCutsceneFrames,
  getNpcSpriteFrames,
  getPlayerHandGridPos,
  getPlayerSpriteSheet,
  PlayerPoseCategory,
} from './sprites';
import { getEnvironmentPatterns } from './textures';
import {
  DustMote,
  FloorRegion,
  Interactable,
  INTRO_SLEEP_END,
  INTRO_STARTLE_END,
  INTRO_TOTAL_DURATION,
  IntroCutsceneState,
  KeyBindings,
  LevelProgress,
  PlayerState,
  PropEntity,
  SecondaryInteractTarget,
  Vec2,
  WallBlock,
} from './types';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  shadowCanvas: HTMLCanvasElement;
  shadowCtx: CanvasRenderingContext2D;
  width: number;
  height: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
  time: number;
  level: LevelDefinition;
  player: PlayerState;
  progress: LevelProgress;
  wallVisibilityPoly: Vec2[];
  interiorVisibilityPoly: Vec2[];
  nearestInteractable: Interactable | null;
  nearestSecondaryTarget?: SecondaryInteractTarget | null;
  dustMotes: DustMote[];
  introCutscene?: IntroCutsceneState;
  keyBindings?: KeyBindings;
}

function tracePolygon(ctx: CanvasRenderingContext2D, poly: Vec2[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(poly[i].x, poly[i].y);
  }
  ctx.closePath();
}

export function renderScene(rc: RenderContext): void {
  const {
    ctx,
    lightCanvas,
    lightCtx,
    shadowCanvas,
    shadowCtx,
    width,
    height,
    cameraX,
    cameraY,
    zoom,
    time,
    level,
    player,
    progress,
    wallVisibilityPoly,
    interiorVisibilityPoly,
    nearestInteractable,
    nearestSecondaryTarget,
    dustMotes,
    introCutscene,
  } = rc;

  // 1. Pitch-dark void background
  ctx.fillStyle = '#040508';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-cameraX, -cameraY);

  for (const floor of level.floors) {
    drawFloor(ctx, floor);
  }

  // Flat floor-level props (rugs, loose papers)
  for (const prop of level.props) {
    if (prop.kind === 'rug' || prop.kind === 'loose_papers') {
      drawProp(ctx, prop, progress, time, false);
    }
  }

  // Y-Sorted 2.5D Walls, Props, NPC, and Pixel-Art Protagonist
  type DrawItem =
    | { kind: 'wall'; sortY: number; wall: WallBlock }
    | { kind: 'prop'; sortY: number; prop: PropEntity }
    | { kind: 'player'; sortY: number };

  const items: DrawItem[] = [];

  for (const wall of level.walls) {
    items.push({ kind: 'wall', sortY: wall.y + wall.h, wall });
  }
  for (const prop of level.props) {
    if (prop.kind !== 'rug' && prop.kind !== 'loose_papers') {
      items.push({ kind: 'prop', sortY: prop.sortY, prop });
    }
  }
  const isSeatedCutscene = Boolean(
    introCutscene?.active &&
      (introCutscene.phase === 'sleeping' || introCutscene.phase === 'startled')
  );
  items.push({ kind: 'player', sortY: isSeatedCutscene ? 178 : player.y + 8 });

  items.sort((a, b) => a.sortY - b.sortY);

  for (const item of items) {
    if (item.kind === 'wall') {
      drawWall(ctx, item.wall);
    } else if (item.kind === 'prop') {
      const isHighlighted =
        Boolean(nearestInteractable) && item.prop.interactableId === nearestInteractable?.id;
      drawProp(ctx, item.prop, progress, time, isHighlighted);
    } else {
      drawPixelPlayer(ctx, player, time, introCutscene, progress.activeHandItemId);
    }
  }

  // Cutscene cartoon Zzz bubble while sleeping or startle burst on waking up
  if (introCutscene?.active) {
    if (introCutscene.phase === 'sleeping') {
      drawSleepBubbleZzz(ctx, player.x + 22, player.y - 68, introCutscene.timer);
    } else if (introCutscene.phase === 'startled') {
      const shockElapsed = introCutscene.timer - INTRO_SLEEP_END;
      if (shockElapsed >= 0 && shockElapsed < 0.6) {
        drawStartleEffect(ctx, player.x, player.y - 54, shockElapsed);
      }
    }
  }

  // NPC floating speech bubble in world space when speaking
  if (progress.npcSpeechBubble && progress.npcSpeechTimer > 0 && progress.doorUnlocked) {
    const npcProp = level.props.find((p) => p.kind === 'npc_watcher');
    if (npcProp) {
      drawNpcSpeechBubble(
        ctx,
        npcProp.x + npcProp.w / 2,
        npcProp.y - 14,
        progress.npcSpeechBubble,
        Math.min(1, progress.npcSpeechTimer * 2)
      );
    }
  }

  // Ambient dust motes inside lit zones
  drawDustMotes(ctx, dustMotes, progress, time);

  // Warm / eerie additive light blooms clipped to structural wall visibility
  ctx.save();
  if (wallVisibilityPoly.length >= 3) {
    tracePolygon(ctx, wallVisibilityPoly);
    ctx.clip();
  }

  const surge = computeLightingSurge(progress, time);

  ctx.globalCompositeOperation = 'screen';
  for (const light of level.lights) {
    if (light.zone === 'corridor' && !progress.doorUnlocked) continue;
    if (light.id === 'desk_lamp_light' && !progress.deskLampOn) continue;
    if (light.id === 'tv_screen_light' && !progress.tvOn) continue;
    const flickerMod =
      light.id === 'desk_lamp_light'
        ? surge.deskLampFactor
        : (light.flicker
            ? 0.94 + Math.sin(time * 7.3 + light.x) * 0.03 + Math.sin(time * 19.1) * 0.02
            : 1) *
          (light.id === 'tv_screen_light' ? 1 : surge.roomFactor);
    if (flickerMod <= 0.005) continue;
    const r = light.radius * (0.72 + 0.28 * flickerMod);
    const effIntensity = light.intensity * flickerMod;
    const grad = ctx.createRadialGradient(light.x, light.y, 4, light.x, light.y, r);
    grad.addColorStop(0, `rgba(${light.color}, ${0.34 * effIntensity})`);
    grad.addColorStop(0.42, `rgba(${light.color}, ${0.14 * effIntensity})`);
    grad.addColorStop(1, `rgba(${light.color}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(light.x, light.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Directional flashlight cone originating directly from the handheld flashlight lens tip
  if (progress.flashlightOn && surge.flashlightFactor > 0.01) {
    const pose = getFlashlightPose(player, time, introCutscene);
    const dirLen = Math.hypot(player.facingX, player.facingY) || 1;
    const fx = player.facingX / dirLen;
    const fy = player.facingY / dirLen;
    const px0 = pose.tipX;
    const py0 = pose.tipY;
    const fMod = surge.flashlightFactor;
    const beamLen = 170 * (0.72 + 0.28 * Math.min(1, fMod));
    const angle = Math.atan2(fy, fx);
    const spread = 0.36;

    // Bright focal glow right at the flashlight lens
    const tipGlow = ctx.createRadialGradient(px0, py0, 0.5, px0, py0, 12);
    tipGlow.addColorStop(0, `rgba(255, 240, 198, ${0.72 * fMod})`);
    tipGlow.addColorStop(0.5, `rgba(235, 205, 145, ${0.25 * fMod})`);
    tipGlow.addColorStop(1, 'rgba(210, 180, 120, 0)');
    ctx.fillStyle = tipGlow;
    ctx.beginPath();
    ctx.arc(px0, py0, 12, 0, Math.PI * 2);
    ctx.fill();

    const beamGrad = ctx.createRadialGradient(px0, py0, 2, px0, py0, beamLen);
    beamGrad.addColorStop(0, `rgba(242, 218, 165, ${0.34 * fMod})`);
    beamGrad.addColorStop(0.4, `rgba(222, 194, 140, ${0.14 * fMod})`);
    beamGrad.addColorStop(1, 'rgba(200, 175, 130, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.arc(px0, py0, beamLen, angle - spread, angle + spread);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Soft, blurred, see-through interior furniture shadows (bookshelves inside the room)
  if (wallVisibilityPoly.length >= 3 && interiorVisibilityPoly.length >= 3) {
    const shadowW = Math.max(1, Math.floor(width * 0.5));
    const shadowH = Math.max(1, Math.floor(height * 0.5));
    if (shadowCanvas.width !== shadowW || shadowCanvas.height !== shadowH) {
      shadowCanvas.width = shadowW;
      shadowCanvas.height = shadowH;
    }

    shadowCtx.setTransform(1, 0, 0, 1, 0, 0);
    shadowCtx.clearRect(0, 0, shadowW, shadowH);
    shadowCtx.save();
    shadowCtx.scale(0.5, 0.5);
    shadowCtx.translate(width / 2, height / 2);
    shadowCtx.scale(zoom, zoom);
    shadowCtx.translate(-cameraX, -cameraY);

    // Translucent shadow tone inside room bounds
    shadowCtx.fillStyle = 'rgba(3, 5, 9, 0.38)';
    tracePolygon(shadowCtx, wallVisibilityPoly);
    shadowCtx.fill();

    // Carve out unobstructed sightline + shelf silhouettes + soft player halo
    shadowCtx.globalCompositeOperation = 'destination-out';
    shadowCtx.fillStyle = 'rgba(0, 0, 0, 1)';
    tracePolygon(shadowCtx, interiorVisibilityPoly);
    shadowCtx.fill();

    for (const prop of level.props) {
      if (prop.blocksSight && prop.id !== 'study_door') {
        shadowCtx.fillRect(prop.x + 1, prop.y + 1, prop.w - 2, prop.h - 2);
      }
    }

    const playerHalo = shadowCtx.createRadialGradient(
      player.x,
      player.y,
      6,
      player.x,
      player.y,
      28
    );
    playerHalo.addColorStop(0, 'rgba(0, 0, 0, 1)');
    playerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    shadowCtx.fillStyle = playerHalo;
    shadowCtx.beginPath();
    shadowCtx.arc(player.x, player.y, 28, 0, Math.PI * 2);
    shadowCtx.fill();
    shadowCtx.restore();

    // Composite blurred soft shadows strictly clipped to wallVisibilityPoly
    ctx.save();
    tracePolygon(ctx, wallVisibilityPoly);
    ctx.clip();
    // Temporarily undo world camera transform while keeping the world clip active
    ctx.translate(cameraX, cameraY);
    ctx.scale(1 / zoom, 1 / zoom);
    ctx.translate(-width / 2, -height / 2);
    ctx.filter = 'blur(7px)';
    ctx.drawImage(shadowCanvas, 0, 0, width, height);
    ctx.filter = 'none';
    ctx.restore();
  }

  // World-space interaction prompt cue(s)
  if ((nearestInteractable || nearestSecondaryTarget) && !progress.gateTriggered) {
    drawInteractCue(
      ctx,
      nearestInteractable,
      nearestSecondaryTarget ?? null,
      time,
      rc.keyBindings ?? DEFAULT_KEY_BINDINGS
    );
  }

  ctx.restore();

  // 2. Raycast Outer Wall & Locked Door Fog-of-War Darkness Mask
  if (lightCanvas.width !== width || lightCanvas.height !== height) {
    lightCanvas.width = width;
    lightCanvas.height = height;
  }

  lightCtx.clearRect(0, 0, width, height);
  lightCtx.fillStyle = 'rgba(3, 4, 7, 0.99)';
  lightCtx.fillRect(0, 0, width, height);

  if (wallVisibilityPoly.length >= 3) {
    lightCtx.save();
    lightCtx.translate(width / 2, height / 2);
    lightCtx.scale(zoom, zoom);
    lightCtx.translate(-cameraX, -cameraY);

    tracePolygon(lightCtx, wallVisibilityPoly);
    lightCtx.clip();

    lightCtx.globalCompositeOperation = 'destination-out';

    // Personal sight aura keeping distant room corners atmospheric
    const baseSightRadius = progress.flashlightOn && surge.flashlightFactor > 0.2 ? 340 : 250;
    const sightRadius = Math.max(58, baseSightRadius * surge.sightScale);
    const sightGrad = lightCtx.createRadialGradient(
      player.x,
      player.y,
      14,
      player.x,
      player.y,
      sightRadius
    );
    const innerSightAlpha =
      (progress.flashlightOn && surge.flashlightFactor > 0.2 ? 0.94 : 0.86) * surge.sightInnerAlpha;
    const midSightAlpha =
      (progress.flashlightOn && surge.flashlightFactor > 0.2 ? 0.7 : 0.56) * surge.sightInnerAlpha;
    sightGrad.addColorStop(0, `rgba(0, 0, 0, ${innerSightAlpha})`);
    sightGrad.addColorStop(0.42, `rgba(0, 0, 0, ${midSightAlpha})`);
    sightGrad.addColorStop(0.76, `rgba(0, 0, 0, ${0.28 * surge.sightInnerAlpha})`);
    sightGrad.addColorStop(1, `rgba(0, 0, 0, ${0.04 * surge.sightInnerAlpha})`);
    lightCtx.fillStyle = sightGrad;
    lightCtx.beginPath();
    lightCtx.arc(player.x, player.y, sightRadius, 0, Math.PI * 2);
    lightCtx.fill();

    // Directional flashlight carve anchored to the handheld flashlight tip
    if (progress.flashlightOn && surge.flashlightFactor > 0.01) {
      const pose = getFlashlightPose(player, time, introCutscene);
      const dirLen = Math.hypot(player.facingX, player.facingY) || 1;
      const fx = player.facingX / dirLen;
      const fy = player.facingY / dirLen;
      const px0 = pose.tipX;
      const py0 = pose.tipY;
      const fMod = surge.flashlightFactor;
      const beamLen = 220 * (0.65 + 0.35 * Math.min(1, fMod));
      const angle = Math.atan2(fy, fx);
      const spread = 0.4;

      const coneCarve = lightCtx.createRadialGradient(px0, py0, 4, px0, py0, beamLen);
      coneCarve.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.98, 0.98 * fMod)})`);
      coneCarve.addColorStop(0.55, `rgba(0, 0, 0, ${0.64 * fMod})`);
      coneCarve.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lightCtx.fillStyle = coneCarve;
      lightCtx.beginPath();
      lightCtx.moveTo(px0, py0);
      lightCtx.arc(px0, py0, beamLen, angle - spread, angle + spread);
      lightCtx.closePath();
      lightCtx.fill();
    }

    // Carve warm focal lights inside visible room
    for (const light of level.lights) {
      if (light.zone === 'corridor' && !progress.doorUnlocked) continue;
      if (light.id === 'desk_lamp_light' && !progress.deskLampOn) continue;
      if (light.id === 'tv_screen_light' && !progress.tvOn) continue;
      const flickerMod =
        light.id === 'desk_lamp_light'
          ? surge.deskLampFactor
          : (light.flicker ? 0.95 + Math.sin(time * 7.3 + light.x) * 0.03 : 1) *
            (light.id === 'tv_screen_light' ? 1 : surge.roomFactor);
      if (flickerMod <= 0.005) continue;
      const r = light.radius * (0.72 + 0.28 * flickerMod);
      const effIntensity = light.intensity * flickerMod;
      const lGrad = lightCtx.createRadialGradient(light.x, light.y, 6, light.x, light.y, r);
      lGrad.addColorStop(0, `rgba(0, 0, 0, ${Math.min(1, effIntensity * 1.05)})`);
      lGrad.addColorStop(0.5, `rgba(0, 0, 0, ${effIntensity * 0.5})`);
      lGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lightCtx.fillStyle = lGrad;
      lightCtx.beginPath();
      lightCtx.arc(light.x, light.y, r, 0, Math.PI * 2);
      lightCtx.fill();
    }

    lightCtx.restore();
  }

  ctx.drawImage(lightCanvas, 0, 0);

  // 2b. Soft smoky dream-mist clouds outside the corridor only after exiting the study
  drawDreamVoidClouds(ctx, width, height, cameraX, cameraY, zoom, time, player, progress);

  // 3. Heavy atmospheric dark vignette
  const vig = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.26,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(2, 3, 6, 0.68)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // 4. Opening cutscene cinematic letterbox bars & fade-in from black
  if (introCutscene?.active) {
    const retractStart = INTRO_STARTLE_END + 0.2;
    let barRetract = 0;
    if (introCutscene.timer > retractStart) {
      barRetract = Math.min(
        1,
        (introCutscene.timer - retractStart) / Math.max(0.1, INTRO_TOTAL_DURATION - retractStart)
      );
    }
    const barHeight = Math.round((1 - barRetract * barRetract) * Math.min(34, height * 0.065));
    if (barHeight > 0) {
      ctx.fillStyle = '#040508';
      ctx.fillRect(0, 0, width, barHeight);
      ctx.fillRect(0, height - barHeight, width, barHeight);
    }

    if (introCutscene.timer < 0.55) {
      const fadeAlpha = 1 - Math.min(1, introCutscene.timer / 0.55);
      ctx.fillStyle = `rgba(3, 4, 7, ${fadeAlpha * fadeAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}

interface LightingSurgeFactors {
  deskLampFactor: number;
  roomFactor: number;
  flashlightFactor: number;
  sightScale: number;
  sightInnerAlpha: number;
}

function computeLightingSurge(progress: LevelProgress, time: number): LightingSurgeFactors {
  const baseLamp = computeDeskLampMod(time);
  const phase = progress.tvLightSurgePhase;
  const st = progress.tvLightSurgeTimer;

  if (phase === 'flickering') {
    const rapidWave =
      Math.sin(st * 44.0) * 0.45 +
      Math.sin(st * 73.5 + 1.1) * 0.35 +
      Math.cos(st * 119.0) * 0.2;
    const deskLampFactor =
      rapidWave > 0.14 ? 0.92 + Math.abs(rapidWave) * 0.25 : rapidWave > -0.25 ? 0.16 : 0.02;

    const flashWave =
      Math.sin(st * 37.0 + 0.7) * 0.48 +
      Math.cos(st * 64.0 + 2.3) * 0.32 +
      Math.sin(st * 103.0) * 0.2;
    const flashlightFactor =
      flashWave > 0.18 ? 0.95 : flashWave > -0.2 ? 0.14 : 0.02;

    const roomFactor = rapidWave > 0 ? 0.85 : 0.32;
    return {
      deskLampFactor,
      roomFactor,
      flashlightFactor,
      sightScale: 0.72 + 0.28 * Math.min(1, deskLampFactor),
      sightInnerAlpha: 0.78 + 0.16 * roomFactor,
    };
  }

  if (phase === 'blackout') {
    return {
      deskLampFactor: 0,
      roomFactor: 0,
      flashlightFactor: 0,
      sightScale: 0.24,
      sightInnerAlpha: 0.32,
    };
  }

  if (phase === 'recovering') {
    const p = Math.min(1, Math.max(0, st / 3.25));
    let lampPulse = 1;
    let flashPulse = 1;

    if (p < 0.16) {
      lampPulse = 0.22;
      flashPulse = 0.12;
    } else if (p < 0.26) {
      lampPulse = 0.06;
      flashPulse = 0.48;
    } else if (p < 0.44) {
      lampPulse = 0.56;
      flashPulse = 0.18;
    } else if (p < 0.55) {
      lampPulse = 0.24;
      flashPulse = 0.76;
    } else if (p < 0.72) {
      lampPulse = 0.82;
      flashPulse = 0.38;
    } else if (p < 0.82) {
      lampPulse = 0.48;
      flashPulse = 0.88;
    } else {
      const settle = (p - 0.82) / 0.18;
      lampPulse = 0.65 + 0.35 * settle;
      flashPulse = 0.72 + 0.28 * settle;
    }

    const roomEase = Math.min(1, p * 1.15);
    const roomFactor = Math.max(0.15, roomEase * (0.65 + 0.35 * lampPulse));
    return {
      deskLampFactor: baseLamp * lampPulse,
      roomFactor,
      flashlightFactor: flashPulse,
      sightScale: 0.32 + 0.68 * roomEase,
      sightInnerAlpha: 0.42 + 0.58 * roomEase,
    };
  }

  return {
    deskLampFactor: baseLamp,
    roomFactor: 1,
    flashlightFactor: 1,
    sightScale: 1,
    sightInnerAlpha: 1,
  };
}

function computeDeskLampMod(t: number): number {
  const cycle = t % 7.4;
  let power = 0.94 + Math.sin(t * 4.2) * 0.04;
  if (cycle > 2.1 && cycle < 2.9) {
    const local = cycle - 2.1;
    if (local < 0.14) power = 0.32;
    else if (local < 0.24) power = 0.85;
    else if (local < 0.48) power = 0.2;
    else if (local < 0.58) power = 0.72;
    else if (local < 0.7) power = 0.36;
  }
  if (cycle > 5.3 && cycle < 6.5) {
    const local = cycle - 5.3;
    if (local < 0.35) power = 0.9 - (local / 0.35) * 0.65;
    else if (local < 0.65) power = 0.22 + Math.sin(local * 42) * 0.06;
    else if (local < 0.82) power = 0.72;
    else if (local < 0.95) power = 0.28;
    else power = 0.28 + ((local - 0.95) / 0.25) * 0.68;
  }
  return Math.max(0.18, Math.min(1.04, power));
}

function drawFloor(ctx: CanvasRenderingContext2D, floor: FloorRegion): void {
  const patterns = getEnvironmentPatterns(ctx);

  if (floor.material === 'wood') {
    ctx.fillStyle = patterns.woodPattern ?? '#221812';
    ctx.fillRect(floor.x, floor.y, floor.w, floor.h);

    // Subtle board-by-board tonal patina & wear tracks
    ctx.fillStyle = 'rgba(10, 7, 5, 0.16)';
    for (let px = floor.x + 64; px < floor.x + floor.w; px += 128) {
      ctx.fillRect(px, floor.y, 2, floor.h);
    }

    // Wall perimeter ambient shadow bleed on floorboards
    const topShadow = ctx.createLinearGradient(0, floor.y, 0, floor.y + 38);
    topShadow.addColorStop(0, 'rgba(3, 4, 7, 0.72)');
    topShadow.addColorStop(1, 'rgba(3, 4, 7, 0)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(floor.x, floor.y, floor.w, 38);

    const botShadow = ctx.createLinearGradient(0, floor.y + floor.h - 24, 0, floor.y + floor.h);
    botShadow.addColorStop(0, 'rgba(3, 4, 7, 0)');
    botShadow.addColorStop(1, 'rgba(3, 4, 7, 0.56)');
    ctx.fillStyle = botShadow;
    ctx.fillRect(floor.x, floor.y + floor.h - 24, floor.w, 24);

    const leftShadow = ctx.createLinearGradient(floor.x, 0, floor.x + 22, 0);
    leftShadow.addColorStop(0, 'rgba(3, 4, 7, 0.55)');
    leftShadow.addColorStop(1, 'rgba(3, 4, 7, 0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(floor.x, floor.y, 22, floor.h);
  } else {
    ctx.fillStyle = patterns.stonePattern ?? '#151a22';
    ctx.fillRect(floor.x, floor.y, floor.w, floor.h);

    // Damp grime shadow along stone corridor perimeter
    const topShadow = ctx.createLinearGradient(0, floor.y, 0, floor.y + 24);
    topShadow.addColorStop(0, 'rgba(4, 5, 9, 0.62)');
    topShadow.addColorStop(1, 'rgba(4, 5, 9, 0)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(floor.x, floor.y, floor.w, 24);

    const leftShadow = ctx.createLinearGradient(floor.x, 0, floor.x + 16, 0);
    leftShadow.addColorStop(0, 'rgba(4, 5, 9, 0.45)');
    leftShadow.addColorStop(1, 'rgba(4, 5, 9, 0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(floor.x, floor.y, 16, floor.h);
  }
}

function drawWall(ctx: CanvasRenderingContext2D, wall: WallBlock): void {
  const isStudy = wall.style === 'study_slate';
  const patterns = getEnvironmentPatterns(ctx);

  if (wall.showSouthFace) {
    const faceH = Math.min(32, wall.h * 0.65);
    const capH = wall.h - faceH;

    // Void cap top
    ctx.fillStyle = '#06080c';
    ctx.fillRect(wall.x, wall.y, wall.w, capH);

    // Crisp architectural cornice ledge
    ctx.fillStyle = isStudy ? '#2c3543' : '#252c38';
    ctx.fillRect(wall.x, wall.y + capH - 3, wall.w, 2);
    ctx.fillStyle = '#11151d';
    ctx.fillRect(wall.x, wall.y + capH - 1, wall.w, 1);

    if (isStudy) {
      // Upper aged slate plaster
      const upperH = Math.floor(faceH * 0.48);
      const wainsY = wall.y + capH + upperH;
      const wainsH = faceH - upperH;

      ctx.fillStyle = patterns.plasterPattern ?? '#1b222e';
      ctx.fillRect(wall.x, wall.y + capH, wall.w, upperH);

      // Subtle damp streaks on plaster
      ctx.fillStyle = 'rgba(7, 10, 15, 0.34)';
      for (let sx = wall.x + 18; sx < wall.x + wall.w - 14; sx += 58) {
        ctx.fillRect(sx, wall.y + capH + 1, 2, upperH - 2);
        ctx.fillRect(sx + 24, wall.y + capH + 3, 1, upperH - 4);
      }

      // Dark wainscot wood paneling + dado rail + recessed frames
      ctx.fillStyle = '#261a12';
      ctx.fillRect(wall.x, wainsY, wall.w, wainsH);
      ctx.fillStyle = '#3d2b1e';
      ctx.fillRect(wall.x, wainsY, wall.w, 2);
      ctx.fillStyle = '#120c08';
      ctx.fillRect(wall.x, wainsY + wainsH - 2, wall.w, 2);

      for (let px = wall.x + 6; px < wall.x + wall.w - 18; px += 30) {
        const pw = Math.min(24, wall.x + wall.w - px - 6);
        if (pw < 10) break;
        ctx.fillStyle = '#1a110c';
        ctx.fillRect(px, wainsY + 4, pw, wainsH - 8);
        ctx.fillStyle = '#332419';
        ctx.fillRect(px + 1, wainsY + 5, pw - 2, Math.max(1, wainsH - 10));
        ctx.fillStyle = '#221710';
        ctx.fillRect(px + 2, wainsY + 6, pw - 4, Math.max(1, wainsH - 12));
      }
    } else {
      // Exposed damp corridor brickwork with peeling plaster patches
      ctx.fillStyle = patterns.brickPattern ?? '#171c25';
      ctx.fillRect(wall.x, wall.y + capH, wall.w, faceH);

      // Irregular plaster patches clinging to the old brick
      for (let px = wall.x + 12; px < wall.x + wall.w - 22; px += 64) {
        ctx.fillStyle = '#10141c';
        ctx.fillRect(px - 1, wall.y + capH + 3, 24, 15);
        ctx.fillStyle = patterns.plasterPattern ?? '#202734';
        ctx.fillRect(px, wall.y + capH + 4, 22, 13);
        ctx.fillStyle = 'rgba(130, 148, 175, 0.08)';
        ctx.fillRect(px, wall.y + capH + 4, 22, 1);
      }

      // Base damp mortar wash
      ctx.fillStyle = 'rgba(7, 9, 14, 0.55)';
      ctx.fillRect(wall.x, wall.y + wall.h - 5, wall.w, 5);
    }

    // Contact shadow cast onto the floor
    const floorShadow = ctx.createLinearGradient(0, wall.y + wall.h, 0, wall.y + wall.h + 11);
    floorShadow.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
    floorShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = floorShadow;
    ctx.fillRect(wall.x, wall.y + wall.h, wall.w, 11);
  } else {
    ctx.fillStyle = '#06080c';
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeStyle = isStudy ? '#262e3b' : '#1e242f';
    ctx.lineWidth = 1;
    ctx.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);
    ctx.strokeStyle = '#11151d';
    ctx.strokeRect(wall.x + 2.5, wall.y + 2.5, Math.max(0, wall.w - 5), Math.max(0, wall.h - 5));
  }
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  prop: PropEntity,
  progress: LevelProgress,
  time: number,
  highlighted: boolean
): void {
  ctx.save();

  switch (prop.kind) {
    case 'rug': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillRect(prop.x + 3, prop.y + 3, prop.w, prop.h);
      // Faded dark burgundy/umber woven carpet
      ctx.fillStyle = '#291618';
      ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
      ctx.fillStyle = '#331c1f';
      ctx.fillRect(prop.x + 4, prop.y + 4, prop.w - 8, prop.h - 8);

      // Subtle worn weft stripes
      ctx.fillStyle = 'rgba(18, 10, 12, 0.34)';
      for (let ry = prop.y + 8; ry < prop.y + prop.h - 8; ry += 6) {
        ctx.fillRect(prop.x + 6, ry, prop.w - 12, 1);
      }

      // Ornate double borders + corner medallions
      ctx.strokeStyle = '#5a4531';
      ctx.lineWidth = 2;
      ctx.strokeRect(prop.x + 10, prop.y + 10, prop.w - 20, prop.h - 20);
      ctx.strokeStyle = '#472c2b';
      ctx.lineWidth = 1;
      ctx.strokeRect(prop.x + 17, prop.y + 17, prop.w - 34, prop.h - 34);

      const cx = prop.x + prop.w / 2;
      const cy = prop.y + prop.h / 2;
      ctx.strokeStyle = 'rgba(122, 94, 62, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 22);
      ctx.lineTo(cx + 30, cy);
      ctx.lineTo(cx, cy + 22);
      ctx.lineTo(cx - 30, cy);
      ctx.closePath();
      ctx.stroke();

      // Worn cream fringe
      ctx.fillStyle = '#6c5d49';
      for (let fy = prop.y + 6; fy < prop.y + prop.h - 4; fy += 7) {
        ctx.fillRect(prop.x - 4, fy, 4, 2);
        ctx.fillRect(prop.x + prop.w, fy, 4, 2);
      }
      break;
    }

    case 'loose_papers': {
      const sheets = prop.variant === 1 ? 3 : 2;
      for (let i = 0; i < sheets; i++) {
        ctx.save();
        ctx.translate(prop.x + i * 9 + 10, prop.y + i * 5 + 10);
        ctx.rotate((i - 1) * 0.28 + (prop.variant || 0) * 0.22);
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(-7, -8, 15, 19);
        ctx.fillStyle = '#181410';
        ctx.fillRect(-9, -10, 16, 20);
        ctx.fillStyle = i % 2 === 0 ? '#a89d86' : '#8c826d';
        ctx.fillRect(-8, -9, 14, 18);
        // Curled highlight edge
        ctx.fillStyle = '#bfb49b';
        ctx.fillRect(2, -9, 4, 3);
        // Manuscript ink lines
        ctx.fillStyle = 'rgba(34, 29, 24, 0.56)';
        ctx.fillRect(-6, -6, 9, 1);
        ctx.fillRect(-6, -3, 7, 1);
        ctx.fillRect(-6, 0, 10, 1);
        ctx.fillRect(-6, 3, 8, 1);
        ctx.fillRect(-6, 6, 5, 1);
        ctx.restore();
      }
      break;
    }

    case 'bookshelf_h': {
      // Floor contact shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
      ctx.fillRect(prop.x - 2, prop.y + prop.h - 4, prop.w + 4, 15);

      // Outer dark frame outline
      ctx.fillStyle = '#0e0a07';
      ctx.fillRect(prop.x - 1, prop.y - 1, prop.w + 2, prop.h + 2);

      // Molded top wood cornice
      ctx.fillStyle = '#241911';
      ctx.fillRect(prop.x, prop.y, prop.w, 16);
      ctx.fillStyle = '#3b291d';
      ctx.fillRect(prop.x + 2, prop.y + 2, prop.w - 4, 12);
      ctx.fillStyle = '#4c3626';
      ctx.fillRect(prop.x + 3, prop.y + 3, prop.w - 6, 2);

      // Recessed dark cabinet face
      ctx.fillStyle = '#120c09';
      ctx.fillRect(prop.x, prop.y + 16, prop.w, prop.h - 16);
      ctx.strokeStyle = '#38271b';
      ctx.lineWidth = 2;
      ctx.strokeRect(prop.x + 1, prop.y + 16, prop.w - 2, prop.h - 17);

      const spineColors = ['#542825', '#343e4a', '#634d2e', '#2b3a32', '#473326', '#3a2c36'];
      for (let row = 0; row < 2; row++) {
        const sy = prop.y + 19 + row * 13;
        // Shelf plank + bevel
        ctx.fillStyle = '#3b2a1d';
        ctx.fillRect(prop.x + 3, sy + 10, prop.w - 6, 2);
        ctx.fillStyle = '#1f150f';
        ctx.fillRect(prop.x + 3, sy + 12, prop.w - 6, 1);

        let bx = prop.x + 6;
        let idx = row * 7;
        while (bx < prop.x + prop.w - 11) {
          const bw = 4 + ((idx * 3) % 4);
          const bh = 8 + ((idx * 5) % 3);
          if ((idx + row) % 10 === 0) {
            // Small curio bottle / ceramic skull / brass ornament in gap
            ctx.fillStyle = idx % 2 === 0 ? '#7c6540' : '#4f5d57';
            ctx.fillRect(bx + 1, sy + 4, 4, 6);
            ctx.fillStyle = '#a89368';
            ctx.fillRect(bx + 2, sy + 3, 2, 1);
          } else if ((idx + row) % 9 !== 0) {
            ctx.fillStyle = spineColors[idx % spineColors.length];
            ctx.fillRect(bx, sy + (10 - bh), bw, bh);
            ctx.fillStyle = 'rgba(255, 240, 210, 0.14)';
            ctx.fillRect(bx, sy + (10 - bh), 1, bh);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.fillRect(bx + bw - 1, sy + (10 - bh), 1, bh);
          }
          bx += bw + 1;
          idx++;
        }
      }
      break;
    }

    case 'bookshelf_v': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
      ctx.fillRect(prop.x + 4, prop.y + 4, prop.w + 8, prop.h);
      ctx.fillStyle = '#0e0a07';
      ctx.fillRect(prop.x - 1, prop.y - 1, prop.w + 2, prop.h + 2);
      ctx.fillStyle = '#241911';
      ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
      ctx.fillStyle = '#3b2a1e';
      ctx.fillRect(prop.x + 2, prop.y + 2, prop.w - 14, prop.h - 4);
      ctx.fillStyle = '#4a3425';
      ctx.fillRect(prop.x + 3, prop.y + 3, 2, prop.h - 6);

      // East-facing shelf recess & books
      ctx.fillStyle = '#120c09';
      ctx.fillRect(prop.x + prop.w - 13, prop.y + 4, 11, prop.h - 8);
      const colors = ['#552826', '#39434f', '#654f30', '#2e3b33', '#493426'];
      for (let by = prop.y + 8; by < prop.y + prop.h - 12; by += 7) {
        if ((by % 28) === 0) {
          ctx.fillStyle = '#3d2b1e';
          ctx.fillRect(prop.x + prop.w - 13, by, 11, 2);
        } else {
          ctx.fillStyle = colors[(by >> 2) % colors.length];
          ctx.fillRect(prop.x + prop.w - 12, by, 9, 5);
          ctx.fillStyle = 'rgba(255, 240, 210, 0.12)';
          ctx.fillRect(prop.x + prop.w - 12, by, 9, 1);
        }
      }
      break;
    }

    case 'corner_desk': {
      const lampFlicker = computeLightingSurge(progress, time).deskLampFactor;

      // Floor contact shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
      ctx.fillRect(prop.x + 2, prop.y + prop.h - 4, prop.w + 4, 14);
      ctx.fillStyle = '#0e0a07';
      ctx.fillRect(prop.x - 1, prop.y - 1, prop.w + 2, prop.h + 2);

      // Main desktop slab
      ctx.fillStyle = '#39271b';
      ctx.fillRect(prop.x, prop.y, prop.w, prop.h - 20);
      ctx.strokeStyle = '#523927';
      ctx.lineWidth = 2;
      ctx.strokeRect(prop.x + 1, prop.y + 1, prop.w - 2, prop.h - 22);

      // Upper roll-top / hutch shelf tier at back of desk (inspired by study desk)
      ctx.fillStyle = '#241810';
      ctx.fillRect(prop.x + 2, prop.y + 2, prop.w - 4, 14);
      ctx.fillStyle = '#473122';
      ctx.fillRect(prop.x + 3, prop.y + 3, prop.w - 6, 3);
      // Small pigeonholes & stacked volumes on hutch top
      ctx.fillStyle = '#140d09';
      ctx.fillRect(prop.x + 42, prop.y + 8, 28, 7);
      ctx.fillRect(prop.x + 76, prop.y + 8, 34, 7);
      ctx.fillStyle = '#542a26';
      ctx.fillRect(prop.x + 92, prop.y + 1, 14, 7);
      ctx.fillStyle = '#35404d';
      ctx.fillRect(prop.x + 94, prop.y - 3, 12, 4);

      // Dark forest-green leather writing blotter
      ctx.fillStyle = '#18241e';
      ctx.fillRect(prop.x + 36, prop.y + 18, 54, 24);
      ctx.strokeStyle = '#25352c';
      ctx.lineWidth = 1;
      ctx.strokeRect(prop.x + 36.5, prop.y + 18.5, 53, 23);

      // Open manuscript notebook + ink lines + quill/inkwell
      ctx.fillStyle = '#b4a78d';
      ctx.fillRect(prop.x + 44, prop.y + 20, 32, 19);
      ctx.fillStyle = '#6c604e';
      ctx.fillRect(prop.x + 59, prop.y + 20, 1, 19);
      ctx.fillRect(prop.x + 47, prop.y + 24, 9, 1);
      ctx.fillRect(prop.x + 47, prop.y + 28, 8, 1);
      ctx.fillRect(prop.x + 47, prop.y + 32, 9, 1);
      ctx.fillRect(prop.x + 63, prop.y + 24, 9, 1);
      ctx.fillRect(prop.x + 63, prop.y + 28, 7, 1);
      // Inkwell & brass pen tray
      ctx.fillStyle = '#161b22';
      ctx.fillRect(prop.x + 81, prop.y + 22, 5, 5);
      ctx.fillStyle = '#8b7a58';
      ctx.fillRect(prop.x + 83, prop.y + 19, 2, 4);

      // Front pedestal & drawer bays facing chair (south side)
      ctx.fillStyle = '#251810';
      ctx.fillRect(prop.x + 2, prop.y + prop.h - 20, prop.w - 4, 20);

      // Left searchable drawer (slides open/closed freely)
      const pullLeft = progress.leftDrawerOpen ? 9 : 0;
      if (progress.leftDrawerOpen) {
        ctx.fillStyle = '#100a07';
        ctx.fillRect(prop.x + 8, prop.y + prop.h - 17, 38, 14);
      }
      ctx.fillStyle = '#342318';
      ctx.fillRect(prop.x + 8, prop.y + prop.h - 17 + pullLeft, 38, 13);
      ctx.strokeStyle = '#523a28';
      ctx.lineWidth = 1;
      ctx.strokeRect(prop.x + 8.5, prop.y + prop.h - 16.5 + pullLeft, 37, 12);
      ctx.fillStyle = '#b99247';
      ctx.fillRect(prop.x + 23, prop.y + prop.h - 11 + pullLeft, 8, 2);

      // Right searchable drawer (slides open/closed freely)
      const pullRight = progress.rightDrawerOpen ? 9 : 0;
      if (progress.rightDrawerOpen) {
        ctx.fillStyle = '#100a07';
        ctx.fillRect(prop.x + 74, prop.y + prop.h - 17, 40, 14);
      }
      ctx.fillStyle = '#38261a';
      ctx.fillRect(prop.x + 74, prop.y + prop.h - 17 + pullRight, 40, 13);
      ctx.strokeStyle = '#543b29';
      ctx.lineWidth = 1;
      ctx.strokeRect(prop.x + 74.5, prop.y + prop.h - 16.5 + pullRight, 39, 12);
      ctx.fillStyle = '#c49a4c';
      ctx.fillRect(prop.x + 90, prop.y + prop.h - 11 + pullRight, 8, 2);

      // Warm brass desk lamp synced with flicker power (toggleable via secondary interact)
      const lampX = prop.x + 22;
      const lampY = prop.y + 26;
      ctx.fillStyle = '#5e4621';
      ctx.beginPath();
      ctx.arc(lampX, lampY + 4, 7, 0, Math.PI * 2);
      ctx.fill();
      if (progress.deskLampOn && lampFlicker > 0.01) {
        ctx.fillStyle = `rgba(232, 174, 78, ${0.42 + 0.58 * lampFlicker})`;
        ctx.beginPath();
        ctx.ellipse(lampX, lampY - 2, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 229, 163, ${0.35 + 0.65 * lampFlicker})`;
        ctx.beginPath();
        ctx.ellipse(lampX, lampY - 3, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#3c301c';
        ctx.beginPath();
        ctx.ellipse(lampX, lampY - 2, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#261e12';
        ctx.beginPath();
        ctx.ellipse(lampX, lampY - 3, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'desk_chair': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(prop.x + prop.w / 2, prop.y + prop.h - 3, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Carved wood frame + dark leather seat
      ctx.fillStyle = '#120d09';
      ctx.fillRect(prop.x + 5, prop.y + 5, 26, 20);
      ctx.fillStyle = '#332419';
      ctx.fillRect(prop.x + 6, prop.y + 6, 24, 18);
      ctx.fillStyle = '#473324';
      ctx.fillRect(prop.x + 8, prop.y + 7, 20, 4);
      // Tufted leather seat
      ctx.fillStyle = '#241812';
      ctx.fillRect(prop.x + 8, prop.y + 20, 20, 9);
      ctx.fillStyle = '#3a271c';
      ctx.fillRect(prop.x + 9, prop.y + 21, 18, 6);
      break;
    }

    case 'tv_stand': {
      // Floor shadow under raised stand legs
      ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
      ctx.fillRect(prop.x + 3, prop.y + prop.h - 7, prop.w - 6, 11);

      // Visible dark hollow gap underneath the TV stand (for crouching peek with [E])
      ctx.fillStyle = '#090807';
      ctx.fillRect(prop.x + 8, prop.y + prop.h - 14, prop.w - 16, 10);

      // Stand wooden legs
      ctx.fillStyle = '#241810';
      ctx.fillRect(prop.x + 4, prop.y + prop.h - 15, 5, 13);
      ctx.fillRect(prop.x + prop.w - 9, prop.y + prop.h - 15, 5, 13);

      // Wooden TV console shelf
      ctx.fillStyle = '#0e0a07';
      ctx.fillRect(prop.x + 1, prop.y + prop.h - 25, prop.w - 2, 13);
      ctx.fillStyle = '#38261a';
      ctx.fillRect(prop.x + 2, prop.y + prop.h - 24, prop.w - 4, 11);
      ctx.fillStyle = '#4e3626';
      ctx.fillRect(prop.x + 2, prop.y + prop.h - 24, prop.w - 4, 3);

      // CRT TV facing straight NORTH (upward toward the main desk in the study)
      const tvCenterX = prop.x + prop.w / 2;

      // Subtle CRT static or broadcast glow spilling straight NORTH when TV is turned ON
      const isStatic = progress.tvMode === 'static';
      const staticFlicker = progress.tvOn
        ? isStatic
          ? 0.08 + ((Math.sin(time * 47.3) * 0.5 + 0.5) * 0.14 + Math.random() * 0.08)
          : 0.14 + Math.sin(time * 9.5) * 0.04
        : 0;
      if (progress.tvOn) {
        const tvGlow = ctx.createLinearGradient(
          tvCenterX,
          prop.y + 8,
          tvCenterX,
          prop.y - 38
        );
        const glowColor = isStatic ? '210, 224, 238' : '148, 192, 228';
        tvGlow.addColorStop(0, `rgba(${glowColor}, ${staticFlicker + 0.14})`);
        tvGlow.addColorStop(1, `rgba(${glowColor}, 0)`);
        ctx.fillStyle = tvGlow;
        ctx.beginPath();
        ctx.moveTo(tvCenterX - 13, prop.y + 7);
        ctx.lineTo(tvCenterX - 28, prop.y - 36);
        ctx.lineTo(tvCenterX + 28, prop.y - 36);
        ctx.lineTo(tvCenterX + 13, prop.y + 7);
        ctx.closePath();
        ctx.fill();
      }

      // North-facing glowing glass screen edge (top rim facing main desk)
      ctx.fillStyle = '#12161e';
      ctx.fillRect(tvCenterX - 15, prop.y + 5, 30, 5);
      if (progress.tvOn) {
        ctx.fillStyle = isStatic
          ? `rgba(218, 228, 238, ${staticFlicker + 0.34})`
          : `rgba(165, 210, 242, ${staticFlicker + 0.35})`;
        ctx.fillRect(tvCenterX - 13, prop.y + 4, 26, 3);
      } else {
        ctx.fillStyle = '#0e131a';
        ctx.fillRect(tvCenterX - 13, prop.y + 4, 26, 2.5);
      }

      // Main straight upright CRT cabinet top
      ctx.fillStyle = '#0c0f14';
      ctx.fillRect(tvCenterX - 17, prop.y + 8, 34, 21);
      ctx.fillStyle = '#212732';
      ctx.fillRect(tvCenterX - 16, prop.y + 9, 32, 19);
      ctx.strokeStyle = '#333d4d';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(tvCenterX - 15.5, prop.y + 9.5, 31, 18);

      // Tapered CRT cathode rear housing on SOUTH (viewer) side
      ctx.fillStyle = '#13171f';
      ctx.beginPath();
      ctx.moveTo(tvCenterX - 11, prop.y + 28);
      ctx.lineTo(tvCenterX + 11, prop.y + 28);
      ctx.lineTo(tvCenterX + 7, prop.y + 35);
      ctx.lineTo(tvCenterX - 7, prop.y + 35);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#252c38';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Rear ventilation slits facing south
      ctx.fillStyle = '#090b10';
      ctx.fillRect(tvCenterX - 5, prop.y + 30, 10, 2);
      ctx.fillRect(tvCenterX - 4, prop.y + 33, 8, 1.5);

      // Top control dials & power indicator dot on right edge
      ctx.fillStyle = '#6b7482';
      ctx.fillRect(tvCenterX + 10, prop.y + 12, 3, 2);
      ctx.fillRect(tvCenterX + 10, prop.y + 16, 3, 2);
      ctx.fillStyle = progress.tvOn ? '#7cc4a0' : '#4a2b2b';
      ctx.fillRect(tvCenterX + 11, prop.y + 21, 2, 2);

      // Symmetrical rabbit-ear V antenna pointing straight up
      ctx.strokeStyle = '#6c7684';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tvCenterX - 1, prop.y + 16);
      ctx.lineTo(tvCenterX - 10, prop.y + 3);
      ctx.moveTo(tvCenterX + 1, prop.y + 16);
      ctx.lineTo(tvCenterX + 10, prop.y + 3);
      ctx.stroke();
      break;
    }

    case 'side_table': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(prop.x + prop.w / 2, prop.y + prop.h - 4, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120d09';
      ctx.beginPath();
      ctx.ellipse(prop.x + prop.w / 2, prop.y + 15, 17, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a281c';
      ctx.beginPath();
      ctx.ellipse(prop.x + prop.w / 2, prop.y + 14, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#533a28';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Ceramic mug & folded scrap paper on side table
      ctx.fillStyle = '#8b8a82';
      ctx.beginPath();
      ctx.arc(prop.x + 15, prop.y + 12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#241a15';
      ctx.beginPath();
      ctx.arc(prop.x + 15, prop.y + 12, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#aba18c';
      ctx.fillRect(prop.x + 23, prop.y + 12, 6, 7);
      ctx.fillStyle = 'rgba(40, 34, 28, 0.5)';
      ctx.fillRect(prop.x + 24, prop.y + 14, 4, 1);
      break;
    }

    case 'book_pile': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(prop.x + prop.w / 2, prop.y + prop.h - 5, prop.w * 0.45, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      const stackCount = prop.variant === 1 ? 5 : 4;
      const covers = ['#4f2623', '#2e3947', '#5c462b', '#2b3b34', '#402e24'];
      for (let i = 0; i < stackCount; i++) {
        const bw = 22 - i * 1.4;
        const bh = 15 - i * 0.8;
        const bx = prop.x + 8 + ((i * 5 + (prop.variant || 0) * 3) % 7);
        const by = prop.y + prop.h - 16 - i * 5;
        // Crisp dark outline around each book
        ctx.fillStyle = '#0d0a08';
        ctx.fillRect(bx - 2, by - 1, bw + 3, 10);
        // Aged page block
        ctx.fillStyle = '#9e9278';
        ctx.fillRect(bx, by + 4, bw, 5);
        ctx.fillStyle = '#756b56';
        ctx.fillRect(bx, by + 6, bw, 1);
        // Leather cover
        ctx.fillStyle = covers[(i + (prop.variant || 0)) % covers.length];
        ctx.fillRect(bx - 1, by, bw + 1, bh * 0.52);
        ctx.fillStyle = 'rgba(255, 240, 210, 0.14)';
        ctx.fillRect(bx, by + 1, bw - 2, 1);
      }
      break;
    }

    case 'crate': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.54)';
      ctx.fillRect(prop.x + 2, prop.y + prop.h - 4, prop.w + 2, 10);
      ctx.fillStyle = '#0e0a07';
      ctx.fillRect(prop.x - 1, prop.y - 1, prop.w + 2, prop.h + 2);
      ctx.fillStyle = '#332419';
      ctx.fillRect(prop.x, prop.y, prop.w, prop.h - 14);
      ctx.fillStyle = '#22170f';
      ctx.fillRect(prop.x, prop.y + prop.h - 14, prop.w, 14);
      ctx.strokeStyle = '#4a3626';
      ctx.lineWidth = 2;
      ctx.strokeRect(prop.x + 1, prop.y + 1, prop.w - 2, prop.h - 3);
      // Plank lines & diagonal brace
      ctx.fillStyle = '#18100a';
      ctx.fillRect(prop.x + 3, prop.y + 10, prop.w - 6, 1);
      ctx.fillRect(prop.x + 3, prop.y + 19, prop.w - 6, 1);
      ctx.beginPath();
      ctx.moveTo(prop.x + 3, prop.y + 3);
      ctx.lineTo(prop.x + prop.w - 3, prop.y + prop.h - 15);
      ctx.stroke();
      // Iron corner rivets
      ctx.fillStyle = '#555d69';
      ctx.fillRect(prop.x + 2, prop.y + 2, 2, 2);
      ctx.fillRect(prop.x + prop.w - 4, prop.y + 2, 2, 2);
      break;
    }

    case 'wall_sconce': {
      // Forged wrought-iron bracket + flickering lantern glass
      ctx.fillStyle = '#0c0e13';
      ctx.fillRect(prop.x + 2, prop.y - 1, 12, 16);
      ctx.fillStyle = '#282e38';
      ctx.fillRect(prop.x + 3, prop.y, 10, 14);
      ctx.fillStyle = '#3b4351';
      ctx.fillRect(prop.x + 4, prop.y, 8, 2);
      const glow = 0.78 + Math.sin(time * 8.2 + prop.x) * 0.14;
      ctx.fillStyle = `rgba(235, 165, 78, ${glow})`;
      ctx.fillRect(prop.x + 5, prop.y + 3, 6, 8);
      ctx.fillStyle = `rgba(255, 224, 156, ${glow})`;
      ctx.fillRect(prop.x + 6, prop.y + 4, 4, 5);
      break;
    }

    case 'backpack_pickup': {
      if (progress.hasBackpack) break;
      // Floor contact shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.ellipse(prop.x + prop.w / 2, prop.y + prop.h - 3, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dark outline
      ctx.fillStyle = '#0a0b0f';
      ctx.fillRect(prop.x + 5, prop.y + 4, 22, 22);
      ctx.fillRect(prop.x + 11, prop.y + 1, 10, 4);

      // Carry handle
      ctx.fillStyle = '#2a1c13';
      ctx.fillRect(prop.x + 12, prop.y + 2, 8, 2);

      // Weathered canvas body & front flap
      ctx.fillStyle = '#3e3429';
      ctx.fillRect(prop.x + 6, prop.y + 5, 20, 20);
      ctx.fillStyle = '#5c4e3d';
      ctx.fillRect(prop.x + 7, prop.y + 6, 18, 9);
      ctx.fillStyle = '#4c3f31';
      ctx.fillRect(prop.x + 8, prop.y + 16, 16, 7);

      // Leather straps & brass buckles
      ctx.fillStyle = '#261810';
      ctx.fillRect(prop.x + 9, prop.y + 6, 3, 11);
      ctx.fillRect(prop.x + 20, prop.y + 6, 3, 11);
      ctx.fillStyle = '#c59c4d';
      ctx.fillRect(prop.x + 9, prop.y + 13, 3, 2);
      ctx.fillRect(prop.x + 20, prop.y + 13, 3, 2);
      break;
    }

    case 'npc_watcher': {
      if (!progress.doorUnlocked) break;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(prop.x + prop.w / 2, prop.y + prop.h - 4, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      const npcFrames = getNpcSpriteFrames();
      const frame = Math.floor(time * 1.6) % npcFrames.length;
      const sprite = npcFrames[frame];
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, Math.round(prop.x - 3), Math.round(prop.y - 6), 40, 50);
      break;
    }

    case 'study_door': {
      const shakeX =
        progress.doorShakeTimer > 0 ? Math.sin(progress.doorShakeTimer * 48) * 2.5 : 0;

      if (!progress.doorUnlocked) {
        // Normal residential home door frame & trim while inside the locked study
        ctx.fillStyle = '#20160f';
        ctx.fillRect(prop.x + 8, prop.y - 4, 32, 8);
        ctx.fillRect(prop.x + 8, prop.y + prop.h - 4, 32, 8);
        ctx.fillStyle = '#4e3726';
        ctx.fillRect(prop.x + 10, prop.y - 2, 28, 4);
        ctx.fillRect(prop.x + 10, prop.y + prop.h - 2, 28, 4);

        ctx.save();
        const hingeX = prop.x + 20 + shakeX;
        const hingeY = prop.y + 4;
        ctx.translate(hingeX, hingeY);
        const angle = -progress.doorOpenAmount * (Math.PI * 0.48);
        ctx.rotate(angle);

        // Soft floor shadow & clean residential door leaf
        ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
        ctx.fillRect(-1, 0, 13, prop.h - 8);
        ctx.fillStyle = '#1b120b';
        ctx.fillRect(-5, -1, 11, prop.h - 6);
        ctx.fillStyle = '#5c3d27';
        ctx.fillRect(-4, 0, 9, prop.h - 8);
        ctx.strokeStyle = '#785237';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-3.5, 0.5, 8, prop.h - 9);

        // Inset wooden residential door panels
        ctx.fillStyle = '#472e1d';
        ctx.fillRect(-2, 10, 5, (prop.h - 32) * 0.42);
        ctx.fillRect(-2, prop.h * 0.48, 5, (prop.h - 32) * 0.42);

        // Small domestic brass hinges & warm residential round doorknob
        ctx.fillStyle = '#8b6f3d';
        ctx.fillRect(-4, 12, 3, 4);
        ctx.fillRect(-4, prop.h - 24, 3, 4);
        ctx.fillStyle = '#523c1d';
        ctx.fillRect(-5, (prop.h - 8) / 2 - 4, 2, 8);
        ctx.fillStyle = '#dfb55c';
        ctx.beginPath();
        ctx.arc(-5.5, (prop.h - 8) / 2, 2.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      } else {
        // Heavy timber doorframe jambs & iron-strapped corridor door once unlocked
        ctx.fillStyle = '#18110c';
        ctx.fillRect(prop.x + 7, prop.y - 5, 34, 9);
        ctx.fillRect(prop.x + 7, prop.y + prop.h - 4, 34, 9);
        ctx.fillStyle = '#332318';
        ctx.fillRect(prop.x + 9, prop.y - 3, 30, 5);
        ctx.fillRect(prop.x + 9, prop.y + prop.h - 2, 30, 5);

        ctx.save();
        const hingeX = prop.x + 20 + shakeX;
        const hingeY = prop.y + 4;
        ctx.translate(hingeX, hingeY);
        const angle = -progress.doorOpenAmount * (Math.PI * 0.48);
        ctx.rotate(angle);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(-2, 0, 15, prop.h - 8);
        ctx.fillStyle = '#140e0a';
        ctx.fillRect(-6, -1, 13, prop.h - 6);
        ctx.fillStyle = '#412b1d';
        ctx.fillRect(-5, 0, 11, prop.h - 8);
        ctx.strokeStyle = '#5c3f2b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-4.5, 0.5, 10, prop.h - 9);

        // Wrought iron hinges & lockplate
        ctx.fillStyle = '#1d2229';
        ctx.fillRect(-5, 10, 11, 5);
        ctx.fillRect(-5, prop.h - 24, 11, 5);
        ctx.fillStyle = '#7a8a68';
        ctx.fillRect(-6, (prop.h - 8) / 2 - 4, 3, 8);

        ctx.restore();
      }
      break;
    }

    case 'large_gate': {
      const gx = prop.x;
      const gy = prop.y;
      const gw = prop.w;
      const gh = prop.h;

      const pulse = 0.72 + Math.sin(time * 2.1) * 0.1;

      // Pale threshold glow bleeding onto flagstones
      const seamGrad = ctx.createLinearGradient(gx, gy + gh - 8, gx, gy + gh + 54);
      seamGrad.addColorStop(0, `rgba(218, 192, 138, ${0.36 * pulse})`);
      seamGrad.addColorStop(1, 'rgba(218, 192, 138, 0)');
      ctx.fillStyle = seamGrad;
      ctx.fillRect(gx + 10, gy + gh - 6, gw - 20, 60);

      // Monumental carved stone archway frame
      ctx.fillStyle = '#0d1016';
      ctx.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
      ctx.fillStyle = '#1e242f';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = '#2d3545';
      ctx.fillRect(gx + 2, gy + 2, 14, gh - 2);
      ctx.fillRect(gx + gw - 16, gy + 2, 14, gh - 2);
      ctx.fillRect(gx + 2, gy + 2, gw - 4, 12);

      const innerX = gx + 16;
      const innerW = gw - 32;
      const innerY = gy + 14;
      const innerH = gh - 14;
      const transomH = 14;

      // Upper iron transom grille bars
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(innerX, innerY, innerW, transomH);
      ctx.fillStyle = '#343d4d';
      for (let bx = innerX + 6; bx < innerX + innerW - 4; bx += 9) {
        ctx.fillRect(bx, innerY + 1, 2, transomH - 2);
      }
      ctx.fillStyle = '#222935';
      ctx.fillRect(innerX, innerY + transomH - 2, innerW, 3);

      const doorY = innerY + transomH;
      const doorH = innerH - transomH;
      const halfW = innerW / 2 - 2;

      // Eerie warm-pale vertical seam glow between the twin oak gates
      ctx.fillStyle = `rgba(235, 206, 148, ${0.65 * pulse})`;
      ctx.fillRect(gx + gw / 2 - 1.5, doorY, 3, doorH);

      // Twin heavy planked dark oak leaves
      for (const leafX of [innerX, gx + gw / 2 + 2]) {
        ctx.fillStyle = '#2a1d14';
        ctx.fillRect(leafX, doorY, halfW, doorH);
        ctx.strokeStyle = '#3f2c1f';
        ctx.lineWidth = 1;
        ctx.strokeRect(leafX + 0.5, doorY + 0.5, halfW - 1, doorH - 1);

        // Vertical timber plank lines
        ctx.fillStyle = '#170f0a';
        for (let px = leafX + 9; px < leafX + halfW - 4; px += 9) {
          ctx.fillRect(px, doorY + 1, 1, doorH - 2);
        }

        // Forged iron horizontal strap bands & rivets
        for (const bandY of [doorY + 6, doorY + doorH - 9]) {
          ctx.fillStyle = '#1c222c';
          ctx.fillRect(leafX, bandY, halfW, 4);
          ctx.fillStyle = '#3a4454';
          ctx.fillRect(leafX + 1, bandY, halfW - 2, 1);
          for (let rx = leafX + 5; rx < leafX + halfW - 3; rx += 10) {
            ctx.fillStyle = '#5c687d';
            ctx.fillRect(rx, bandY + 1, 2, 2);
          }
        }
      }

      // Twin wrought-iron ring knockers near center seam
      const cy = doorY + doorH * 0.52;
      for (const ringX of [gx + gw / 2 - 9, gx + gw / 2 + 9]) {
        ctx.fillStyle = '#151921';
        ctx.fillRect(ringX - 3, cy - 5, 6, 4);
        ctx.strokeStyle = '#6c778a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ringX, cy + 2, 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      break;
    }
  }

  if (highlighted && !progress.gateTriggered) {
    const pulse = 0.45 + Math.sin(time * 4.5) * 0.2;
    ctx.strokeStyle = `rgba(232, 168, 72, ${pulse})`;
    ctx.lineWidth = 1.75;
    ctx.strokeRect(prop.x - 2, prop.y - 2, prop.w + 4, prop.h + 4);
  }

  ctx.restore();
}

function getFacingDir(fx: number, fy: number): FacingDir {
  if (Math.abs(fx) > Math.abs(fy) * 1.1) {
    return fx >= 0 ? 'right' : 'left';
  }
  return fy >= 0 ? 'down' : 'up';
}

interface FlashlightPose {
  dir: FacingDir;
  handX: number;
  handY: number;
  tipX: number;
  tipY: number;
}

interface ResolvedPlayerPose {
  category: PlayerPoseCategory;
  dir: FacingDir;
  frameIdx: number;
  isCrouching: boolean;
}

function resolvePlayerPoseFrame(player: PlayerState): ResolvedPlayerPose {
  const dir = getFacingDir(player.facingX, player.facingY);
  const { interactAnim, interactKind, isMoving, walkCycle } = player;

  if (interactAnim > 0 && interactKind !== 'none') {
    const p = 1 - interactAnim;
    if (interactKind === 'tv_crouch') {
      if (p < 0.16) return { category: 'tv_crouch', dir, frameIdx: 0, isCrouching: true };
      if (p < 0.36) return { category: 'tv_crouch', dir, frameIdx: 1, isCrouching: true };
      if (p < 0.72) return { category: 'tv_crouch', dir, frameIdx: 2, isCrouching: true };
      if (p < 0.88) return { category: 'tv_crouch', dir, frameIdx: 0, isCrouching: true };
      return { category: 'walk', dir, frameIdx: 0, isCrouching: false };
    }
    const frameIdx = p < 0.2 || p > 0.78 ? 0 : 1;
    return { category: interactKind, dir, frameIdx, isCrouching: false };
  }

  if (isMoving) {
    const frameIdx = Math.floor(walkCycle * 6.5) % 4;
    return { category: 'walk', dir, frameIdx, isCrouching: false };
  }

  return { category: 'walk', dir, frameIdx: 0, isCrouching: false };
}

function getFlashlightPose(
  player: PlayerState,
  time: number,
  introCutscene?: IntroCutsceneState
): FlashlightPose {
  if (
    introCutscene?.active &&
    (introCutscene.phase === 'sleeping' || introCutscene.phase === 'startled')
  ) {
    return { dir: 'down', handX: player.x + 8, handY: player.y - 6, tipX: player.x + 8, tipY: player.y - 1 };
  }

  const resolved = resolvePlayerPoseFrame(player);
  const idleBreath =
    !player.isMoving && player.interactAnim <= 0 ? Math.sin(time * 2.2) * 0.6 : 0;
  const drawW = 40;
  const drawH = 50;
  const drawX = Math.round(player.x - drawW / 2);
  const drawY = Math.round(player.y - drawH + 12 - idleBreath);
  const { gx, gy } = getPlayerHandGridPos(resolved.category, resolved.dir, resolved.frameIdx);
  const handX = drawX + gx * 2 + 1;
  const handY = drawY + gy * 2 + 1;

  switch (resolved.dir) {
    case 'right':
      return { dir: 'right', handX, handY, tipX: handX + 7, tipY: handY };
    case 'left':
      return { dir: 'left', handX, handY, tipX: handX - 7, tipY: handY };
    case 'up':
      return { dir: 'up', handX, handY, tipX: handX, tipY: handY - 6 };
    case 'down':
    default:
      return { dir: 'down', handX, handY, tipX: handX, tipY: handY + 5 };
  }
}

function drawHandheldFlashlight(ctx: CanvasRenderingContext2D, pose: FlashlightPose): void {
  const hx = pose.handX;
  const hy = pose.handY;

  ctx.save();
  if (pose.dir === 'right') {
    // Outstretched metal body + brass bezel + warm lit lens, gripped directly by hand
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 1, hy - 2, 9, 4);
    ctx.fillStyle = '#1f2633';
    ctx.fillRect(hx, hy - 1, 4, 2);
    ctx.fillStyle = '#404b5e';
    ctx.fillRect(hx, hy - 1, 4, 1);
    ctx.fillStyle = '#c89b4b';
    ctx.fillRect(hx + 4, hy - 1, 2, 2);
    ctx.fillStyle = '#fff0c4';
    ctx.fillRect(hx + 6, hy - 1, 2, 2);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  } else if (pose.dir === 'left') {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 8, hy - 2, 9, 4);
    ctx.fillStyle = '#1f2633';
    ctx.fillRect(hx - 4, hy - 1, 4, 2);
    ctx.fillStyle = '#404b5e';
    ctx.fillRect(hx - 4, hy - 1, 4, 1);
    ctx.fillStyle = '#c89b4b';
    ctx.fillRect(hx - 6, hy - 1, 2, 2);
    ctx.fillStyle = '#fff0c4';
    ctx.fillRect(hx - 8, hy - 1, 2, 2);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  } else if (pose.dir === 'up') {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 2, hy - 7, 4, 8);
    ctx.fillStyle = '#1f2633';
    ctx.fillRect(hx - 1, hy - 3, 2, 3);
    ctx.fillStyle = '#c89b4b';
    ctx.fillRect(hx - 1, hy - 5, 2, 2);
    ctx.fillStyle = '#fff0c4';
    ctx.fillRect(hx - 1, hy - 7, 2, 2);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  } else {
    // Facing down: held in right-side hand pointing downward/forward
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 2, hy - 1, 4, 7);
    ctx.fillStyle = '#1f2633';
    ctx.fillRect(hx - 1, hy, 2, 3);
    ctx.fillStyle = '#404b5e';
    ctx.fillRect(hx - 1, hy, 1, 3);
    ctx.fillStyle = '#c89b4b';
    ctx.fillRect(hx - 1, hy + 3, 2, 1);
    ctx.fillStyle = '#fff0c4';
    ctx.fillRect(hx - 1, hy + 4, 2, 2);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  }
  ctx.restore();
}

function drawHandheldBrassKey(ctx: CanvasRenderingContext2D, pose: FlashlightPose): void {
  const hx = pose.handX;
  const hy = pose.handY;

  ctx.save();
  if (pose.dir === 'right') {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 1, hy - 2, 8, 4);
    ctx.fillStyle = '#cfa048';
    ctx.fillRect(hx + 1, hy - 1, 2, 2);
    ctx.fillStyle = '#e8c474';
    ctx.fillRect(hx + 3, hy - 1, 3, 1);
    ctx.fillRect(hx + 5, hy, 1, 1);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  } else if (pose.dir === 'left') {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 7, hy - 2, 8, 4);
    ctx.fillStyle = '#cfa048';
    ctx.fillRect(hx - 3, hy - 1, 2, 2);
    ctx.fillStyle = '#e8c474';
    ctx.fillRect(hx - 6, hy - 1, 3, 1);
    ctx.fillRect(hx - 6, hy, 1, 1);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  } else if (pose.dir === 'up') {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 2, hy - 7, 4, 8);
    ctx.fillStyle = '#cfa048';
    ctx.fillRect(hx - 1, hy - 3, 2, 2);
    ctx.fillStyle = '#e8c474';
    ctx.fillRect(hx - 1, hy - 6, 1, 3);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  } else {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(hx - 2, hy - 1, 4, 7);
    ctx.fillStyle = '#cfa048';
    ctx.fillRect(hx - 1, hy + 1, 2, 2);
    ctx.fillStyle = '#e8c474';
    ctx.fillRect(hx - 1, hy + 3, 1, 2);
    ctx.fillRect(hx, hy + 4, 1, 1);
    ctx.fillStyle = '#ccb69f';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  }
  ctx.restore();
}

function drawPixelPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  time: number,
  introCutscene?: IntroCutsceneState,
  activeHandItemId: LevelProgress['activeHandItemId'] = null
): void {
  const { x, y, isMoving, interactAnim } = player;

  if (
    introCutscene?.active &&
    (introCutscene.phase === 'sleeping' || introCutscene.phase === 'startled')
  ) {
    const deskFrames = getDeskCutsceneFrames();
    let sprite: HTMLCanvasElement;
    let bounceY = 0;

    if (introCutscene.phase === 'sleeping') {
      const breathPhase = (Math.sin(introCutscene.timer * 2.3) + 1) * 0.5;
      sprite = breathPhase > 0.52 ? deskFrames.sleep[1] : deskFrames.sleep[0];
    } else {
      const shockElapsed = introCutscene.timer - INTRO_SLEEP_END;
      if (shockElapsed < 0.3) {
        sprite = deskFrames.startleJolt;
        bounceY = Math.sin((shockElapsed / 0.3) * Math.PI) * 2.8;
      } else if (shockElapsed < 0.96) {
        sprite = deskFrames.startleLeft;
      } else {
        sprite = deskFrames.startleRight;
      }
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2x scale of the 20x30 desk cutscene canvas -> 40x60 world px
    const drawW = 40;
    const drawH = 60;
    const drawX = Math.round(x - drawW / 2);
    const drawY = Math.round(y - drawH + 12 - bounceY);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
    ctx.restore();
    return;
  }

  const sheet = getPlayerSpriteSheet();
  const resolved = resolvePlayerPoseFrame(player);
  const frames = sheet[resolved.category][resolved.dir];
  const sprite = frames[Math.min(frames.length - 1, Math.max(0, resolved.frameIdx))];

  ctx.save();

  // Contact shadow right under boots (stays anchored while character acts or crouches)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.beginPath();
  ctx.ellipse(
    x,
    y + 10,
    resolved.isCrouching ? 12 : 10,
    resolved.isCrouching ? 5.2 : 4.5,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  const idleBreath = !isMoving && interactAnim <= 0 ? Math.sin(time * 2.2) * 0.6 : 0;

  // Exact 2x scale of the 20x25 canvas (with classic 16x22 investigator centered inside at 32x44)
  const drawW = 40;
  const drawH = 50;
  const drawX = Math.round(x - drawW / 2);
  const drawY = Math.round(y - drawH + 12 - idleBreath);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, drawX, drawY, drawW, drawH);

  if (activeHandItemId === 'flashlight') {
    const pose = getFlashlightPose(player, time, introCutscene);
    drawHandheldFlashlight(ctx, pose);
  } else if (activeHandItemId === 'brass_key') {
    const pose = getFlashlightPose(player, time, introCutscene);
    drawHandheldBrassKey(ctx, pose);
  }

  ctx.restore();
}

function drawSleepBubbleZzz(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  t: number
): void {
  const bob = Math.sin(t * 2.3) * 1.4;
  const cx = bx;
  const cy = by + bob;
  const fadeIn = Math.min(1, t / 0.45);

  ctx.save();
  ctx.globalAlpha = fadeIn;

  // Trailing cartoon thought-bubble dots leading up from head
  const dots = [
    { dx: -15, dy: 19, r: 2.1 },
    { dx: -10, dy: 13, r: 3.3 },
  ];
  for (const d of dots) {
    ctx.fillStyle = '#0e1118';
    ctx.beginPath();
    ctx.arc(bx + d.dx, by + d.dy + bob * 0.45, d.r + 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4cbb8';
    ctx.beginPath();
    ctx.arc(bx + d.dx, by + d.dy + bob * 0.45, d.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scalloped cartoon sleep cloud bubble
  const lobes = [
    { dx: -9, dy: 2, r: 6.8 },
    { dx: 0, dy: -3, r: 8.2 },
    { dx: 9, dy: 1, r: 6.8 },
    { dx: -4, dy: 5, r: 6.2 },
    { dx: 5, dy: 5, r: 6.0 },
  ];

  // Dark cartoon ink outline pass
  ctx.fillStyle = '#0e1118';
  for (const l of lobes) {
    ctx.beginPath();
    ctx.arc(cx + l.dx, cy + l.dy, l.r + 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Subtle underside shadow
  ctx.fillStyle = '#afa491';
  for (const l of lobes) {
    ctx.beginPath();
    ctx.arc(cx + l.dx, cy + l.dy + 0.8, l.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Warm parchment cartoon fill
  ctx.fillStyle = '#dfd7c6';
  for (const l of lobes) {
    ctx.beginPath();
    ctx.arc(cx + l.dx, cy + l.dy - 0.3, l.r * 0.94, 0, Math.PI * 2);
    ctx.fill();
  }

  // Animated staggered Zzz letters inside & drifting upward
  const zSpecs = [
    { offset: 0, x: cx - 7, y: cy + 3, size: 7.5 },
    { offset: 0.33, x: cx, y: cy + 0.5, size: 9 },
    { offset: 0.66, x: cx + 7.5, y: cy - 2.5, size: 10.5 },
  ];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const zs of zSpecs) {
    const cycle = (t * 1.15 + zs.offset) % 1;
    const pulse = Math.sin(cycle * Math.PI);
    const driftY = -cycle * 2.4;
    const scale = 0.82 + 0.24 * pulse;

    ctx.save();
    ctx.translate(zs.x, zs.y + driftY);
    ctx.scale(scale, scale);
    ctx.font = `800 ${zs.size}px "JetBrains Mono", monospace`;
    ctx.fillStyle = `rgba(22, 26, 36, ${0.42 + 0.58 * pulse})`;
    ctx.fillText('Z', 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawStartleEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  elapsed: number
): void {
  const fade = elapsed < 0.08 ? elapsed / 0.08 : Math.max(0, 1 - (elapsed - 0.18) / 0.36);
  if (fade <= 0) return;

  const pop = elapsed < 0.14 ? 0.7 + (elapsed / 0.14) * 0.45 : 1.05;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.globalAlpha = fade;

  // Cartoon shock action lines fanning above head
  const rays = [-0.62, 0, 0.62];
  for (const ang of rays) {
    const r0 = 12 + elapsed * 10;
    const r1 = 19 + elapsed * 16;
    const sx = Math.sin(ang);
    const sy = -Math.cos(ang);

    ctx.strokeStyle = '#0e1118';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx * r0, sy * r0);
    ctx.lineTo(sx * r1, sy * r1);
    ctx.stroke();

    ctx.strokeStyle = '#f2d492';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx * r0, sy * r0);
    ctx.lineTo(sx * r1, sy * r1);
    ctx.stroke();
  }

  // Sharp exclamation cue
  ctx.font = '900 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0e1118';
  ctx.strokeText('!', 0, -4);
  ctx.fillStyle = '#f5dc9f';
  ctx.fillText('!', 0, -4);

  ctx.restore();
}

function drawNpcSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '500 10.5px "Plus Jakarta Sans", sans-serif';
  const paddingX = 10;
  const maxWidth = 220;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth - paddingX * 2) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const lineH = 14;
  const boxW = Math.min(
    maxWidth,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + paddingX * 2
  );
  const boxH = lines.length * lineH + 12;
  const bx = Math.round(x - boxW / 2);
  const by = Math.round(y - boxH);

  ctx.fillStyle = 'rgba(10, 12, 18, 0.94)';
  ctx.strokeStyle = 'rgba(216, 162, 74, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 4);
  ctx.fill();
  ctx.stroke();

  // Speech pointer
  ctx.fillStyle = 'rgba(10, 12, 18, 0.94)';
  ctx.beginPath();
  ctx.moveTo(x - 5, by + boxH);
  ctx.lineTo(x + 5, by + boxH);
  ctx.lineTo(x, by + boxH + 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ece3d3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, x, by + 6 + i * lineH);
  });
  ctx.restore();
}

function drawDustMotes(
  ctx: CanvasRenderingContext2D,
  motes: DustMote[],
  progress: LevelProgress,
  time: number
): void {
  for (const m of motes) {
    if (m.x > 670 && !progress.doorUnlocked) continue;
    const alpha = m.alpha * (0.55 + 0.45 * Math.sin(time * 1.4 + m.phase));
    ctx.fillStyle = `rgba(232, 210, 168, ${alpha})`;
    ctx.fillRect(m.x, m.y, m.size, m.size);
  }
}

function drawCircularKeyBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  label: string,
  secondary = false
): void {
  ctx.fillStyle = 'rgba(11, 14, 20, 0.92)';
  ctx.strokeStyle = secondary ? 'rgba(156, 178, 204, 0.8)' : 'rgba(232, 168, 72, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = secondary ? '#d4e2f2' : '#f3d8a3';
  ctx.font = '700 10.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 0.5);
}

function drawInteractCue(
  ctx: CanvasRenderingContext2D,
  target: Interactable | null,
  secondaryTarget: SecondaryInteractTarget | null,
  time: number,
  keyBindings: KeyBindings
): void {
  const bob = Math.sin(time * 4) * 2;
  const primaryLabel = formatKeyCode(keyBindings.interact, true);
  const secondaryLabel = formatKeyCode(keyBindings.secondaryInteract, true);

  ctx.save();
  if (target && secondaryTarget && target.id === 'examine_tv' && secondaryTarget.id === 'tv_power') {
    const cx = target.x;
    const cy = target.y - 36 + bob;
    drawCircularKeyBadge(ctx, cx - 13, cy, primaryLabel, false);
    drawCircularKeyBadge(ctx, cx + 13, cy, secondaryLabel, true);
  } else {
    if (target) {
      drawCircularKeyBadge(ctx, target.x, target.y - 36 + bob, primaryLabel, false);
    }
    if (secondaryTarget) {
      drawCircularKeyBadge(
        ctx,
        secondaryTarget.cueX,
        secondaryTarget.cueY + bob,
        secondaryLabel,
        true
      );
    }
  }
  ctx.restore();
}

interface DreamCloudSeed {
  bx: number;
  by: number;
  scale: number;
  speed: number;
  parallax: number;
  alpha: number;
  variant: 0 | 1 | 2;
}

const DREAM_CLOUD_SEEDS: DreamCloudSeed[] = [
  // Evenly staggered across wrapW=1360 so left and right sides of the corridor always balance
  { bx: -620, by: -290, scale: 1.35, speed: 6.2, parallax: 0.55, alpha: 0.72, variant: 0 },
  { bx: -460, by: -95, scale: 1.15, speed: 8.8, parallax: 0.72, alpha: 0.82, variant: 2 },
  { bx: -310, by: 60, scale: 1.45, speed: 5.4, parallax: 0.5, alpha: 0.7, variant: 1 },
  { bx: -210, by: -220, scale: 1.08, speed: 9.4, parallax: 0.74, alpha: 0.84, variant: 0 },
  { bx: -110, by: -360, scale: 1.5, speed: 4.8, parallax: 0.46, alpha: 0.66, variant: 1 },
  { bx: 30, by: 250, scale: 1.4, speed: 5.6, parallax: 0.5, alpha: 0.68, variant: 2 },
  { bx: 150, by: -170, scale: 1.12, speed: 9.0, parallax: 0.72, alpha: 0.82, variant: 1 },
  { bx: 240, by: 80, scale: 1.38, speed: 6.0, parallax: 0.54, alpha: 0.74, variant: 0 },
  { bx: 350, by: -300, scale: 1.15, speed: 9.8, parallax: 0.75, alpha: 0.84, variant: 2 },
  { bx: 450, by: -30, scale: 1.05, speed: 8.4, parallax: 0.7, alpha: 0.8, variant: 1 },
  { bx: 540, by: 210, scale: 1.45, speed: 5.2, parallax: 0.48, alpha: 0.72, variant: 0 },
  { bx: 630, by: -200, scale: 1.25, speed: 7.4, parallax: 0.62, alpha: 0.76, variant: 2 },
  // Extra mid-corridor banks so both flanks stay lush even while scrolling north
  { bx: -520, by: -380, scale: 1.25, speed: 7.2, parallax: 0.64, alpha: 0.75, variant: 2 },
  { bx: -370, by: 280, scale: 1.2, speed: 7.8, parallax: 0.66, alpha: 0.7, variant: 0 },
  { bx: 290, by: 360, scale: 1.3, speed: 6.4, parallax: 0.58, alpha: 0.72, variant: 1 },
  { bx: -80, by: -440, scale: 1.35, speed: 6.8, parallax: 0.6, alpha: 0.7, variant: 2 },
];

function wrapCentered(val: number, center: number, span: number): number {
  const half = span * 0.5;
  return ((((val - center + half) % span) + span) % span) - half + center;
}

function drawDreamVoidClouds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  time: number,
  player: PlayerState,
  progress: LevelProgress
): void {
  if (!progress.doorUnlocked) return;
  const exitedRoom = Math.max(0, Math.min(1, (player.x - 692) / 62));
  const dreamReveal = exitedRoom * progress.doorOpenAmount;
  if (dreamReveal <= 0.01) return;

  const halfW = width / (2 * zoom) + 120;
  const halfH = height / (2 * zoom) + 120;
  const viewLeft = cameraX - halfW;
  const viewRight = cameraX + halfW;
  const viewTop = cameraY - halfH;
  const viewBottom = cameraY + halfH;
  const viewW = halfW * 2;
  const viewH = halfH * 2;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-cameraX, -cameraY);

  // When still near the east doorway (y > 160), keep the entire study side (x < 708) excluded;
  // once walking north up the corridor, expose the left void down to y = 156 so BOTH sides match!
  const northCorridorMix = Math.max(0, Math.min(1, (220 - player.y) / 90));
  const leftSplitY = 12 + northCorridorMix * 144; // 12 (above study) -> 156 (corridor corner)
  const studyLeft = Math.min(viewLeft - 10, 700);
  const studyBottom = Math.max(viewBottom + 10, 560);

  ctx.beginPath();
  ctx.rect(viewLeft, viewTop, viewW, viewH);
  ctx.moveTo(studyLeft, leftSplitY);
  ctx.lineTo(708, leftSplitY);
  ctx.lineTo(708, 156);
  ctx.lineTo(798, 156);
  ctx.lineTo(798, -368);
  ctx.lineTo(1038, -368);
  ctx.lineTo(1038, 384);
  ctx.lineTo(708, 384);
  ctx.lineTo(708, studyBottom);
  ctx.lineTo(studyLeft, studyBottom);
  ctx.closePath();
  ctx.clip('evenodd');

  const wrapW = 1360;
  const wrapH = 980;
  const anchorX = Math.max(918, cameraX);

  // Soft smoky mist clouds curling on both sides of the outer corridor abyss
  for (const seed of DREAM_CLOUD_SEEDS) {
    const driftX = seed.bx + time * seed.speed + anchorX - cameraX * (1 - seed.parallax);
    const driftY =
      seed.by +
      Math.sin(time * 0.36 + seed.bx * 0.03) * 6 +
      cameraY * (1 - seed.parallax);

    const cx = wrapCentered(driftX, anchorX, wrapW);
    const cy = wrapCentered(driftY, cameraY, wrapH);

    if (
      cx < viewLeft - 220 ||
      cx > viewRight + 220 ||
      cy < viewTop - 160 ||
      cy > viewBottom + 160
    ) {
      continue;
    }

    drawStylizedDreamCloud(ctx, cx, cy, seed.scale, seed.alpha * dreamReveal, seed.variant, time);
  }

  // Smooth gradient fade along the lower study boundary (never a hard horizontal/vertical seam)
  if (viewBottom > leftSplitY) {
    const vertEdgeFade = ctx.createLinearGradient(708, 0, 774, 0);
    vertEdgeFade.addColorStop(0, 'rgba(3, 4, 7, 1)');
    vertEdgeFade.addColorStop(1, 'rgba(3, 4, 7, 0)');
    ctx.fillStyle = vertEdgeFade;
    ctx.fillRect(708, leftSplitY, 66, viewBottom - leftSplitY);
  }

  if (viewLeft < 708) {
    const horizEdgeFade = ctx.createLinearGradient(0, leftSplitY, 0, leftSplitY - 58);
    horizEdgeFade.addColorStop(0, 'rgba(3, 4, 7, 1)');
    horizEdgeFade.addColorStop(1, 'rgba(3, 4, 7, 0)');
    ctx.fillStyle = horizEdgeFade;
    ctx.fillRect(viewLeft, leftSplitY - 58, 708 - viewLeft, 58);
  }

  ctx.restore();
}

function drawSmokyPuff(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  innerAlpha: number,
  midAlpha: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const grad = ctx.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx);
  grad.addColorStop(0, `rgba(112, 126, 148, ${innerAlpha})`);
  grad.addColorStop(0.45, `rgba(62, 72, 90, ${midAlpha})`);
  grad.addColorStop(0.8, `rgba(24, 30, 42, ${midAlpha * 0.38})`);
  grad.addColorStop(1, 'rgba(10, 12, 18, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStylizedDreamCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
  variant: 0 | 1 | 2,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const breathe = 0.88 + Math.sin(time * 0.65 + cx * 0.015) * 0.12;
  const a = alpha * breathe;

  // Soft layered smoke/fog cloud wisps matching the corridor abyss mist
  if (variant === 0) {
    drawSmokyPuff(ctx, -46, 8, 68, 28, 0.3 * a, 0.2 * a);
    drawSmokyPuff(ctx, 10, -4, 82, 36, 0.36 * a, 0.24 * a);
    drawSmokyPuff(ctx, 56, 10, 58, 24, 0.26 * a, 0.17 * a);
    drawSmokyPuff(ctx, -12, -16, 50, 24, 0.3 * a, 0.18 * a);
  } else if (variant === 1) {
    drawSmokyPuff(ctx, -38, 4, 74, 26, 0.32 * a, 0.21 * a);
    drawSmokyPuff(ctx, 22, -6, 70, 30, 0.34 * a, 0.22 * a);
    drawSmokyPuff(ctx, 74, 6, 54, 20, 0.24 * a, 0.15 * a);
  } else {
    drawSmokyPuff(ctx, -22, 6, 62, 26, 0.34 * a, 0.22 * a);
    drawSmokyPuff(ctx, 24, -8, 66, 28, 0.36 * a, 0.24 * a);
    drawSmokyPuff(ctx, -56, 14, 46, 18, 0.22 * a, 0.14 * a);
  }

  ctx.restore();
}
