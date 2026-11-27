import * as THREE from 'three';
import { InventoryItemId } from './types';

function createCanvasFabricTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5c4d3b';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle woven canvas threads
  for (let y = 0; y < 256; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? 'rgba(255,240,210,0.045)' : 'rgba(18,14,10,0.08)';
    ctx.fillRect(0, y, 256, 2);
  }
  for (let x = 0; x < 256; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? 'rgba(255,240,210,0.04)' : 'rgba(15,12,8,0.07)';
    ctx.fillRect(x, 0, 2, 256);
  }

  // Faint weathered grain specks
  for (let i = 0; i < 450; i++) {
    const px = (i * 73) % 256;
    const py = (i * 137) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(28,22,15,0.12)' : 'rgba(210,190,155,0.06)';
    ctx.fillRect(px, py, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function createEngravedBrassTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, '#c89b49');
  grad.addColorStop(0.5, '#dfba6e');
  grad.addColorStop(1, '#a97d34');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  // Subtle brushed metal lines
  for (let y = 0; y < 128; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(255,245,210,0.08)' : 'rgba(40,25,8,0.08)';
    ctx.fillRect(0, y, 256, 1);
  }

  // Border inset lines + engraved VII
  ctx.strokeStyle = 'rgba(54, 34, 12, 0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 236, 108);

  ctx.fillStyle = '#33200a';
  ctx.font = 'bold 58px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VII', 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function createBrushedMetalTexture(
  renderer: THREE.WebGLRenderer,
  baseHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 256, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function createRoundedBoxGeometry(
  w: number,
  h: number,
  d: number,
  radius: number,
  bevel = 0.03
): THREE.ExtrudeGeometry {
  const hw = w / 2 - bevel;
  const hh = h / 2 - bevel;
  const r = Math.min(radius, hw * 0.45, hh * 0.45);
  const shape = new THREE.Shape();

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const depth = Math.max(0.02, d - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.center();
  return geo;
}

function buildBrassKey(renderer: THREE.WebGLRenderer): THREE.Group {
  const group = new THREE.Group();

  const brassTex = createBrushedMetalTexture(renderer, '#cfa04c');
  const engravedTex = createEngravedBrassTexture(renderer);

  const brassMat = new THREE.MeshStandardMaterial({
    map: brassTex,
    color: 0xd9ad57,
    metalness: 0.88,
    roughness: 0.26,
  });

  const antiqueBrassMat = new THREE.MeshStandardMaterial({
    color: 0x8f6b2f,
    metalness: 0.8,
    roughness: 0.48,
  });

  const engravedMat = new THREE.MeshStandardMaterial({
    map: engravedTex,
    metalness: 0.84,
    roughness: 0.3,
  });

  // 1. Ornate key bow ring
  const bowRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.085, 20, 48), brassMat);
  bowRing.position.set(-1.14, 0, 0);
  group.add(bowRing);

  // Inner cross-medallion bars welded smoothly inside the bow
  const bowVert = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 16), antiqueBrassMat);
  bowVert.position.set(-1.14, 0, 0);
  group.add(bowVert);

  const bowHoriz = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 16), antiqueBrassMat);
  bowHoriz.rotation.z = Math.PI / 2;
  bowHoriz.position.set(-1.14, 0, 0);
  group.add(bowHoriz);

  const bowCenterHub = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), brassMat);
  bowCenterHub.position.set(-1.14, 0, 0);
  group.add(bowCenterHub);

  // Finial pommel at outer end of bow
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), brassMat);
  finial.position.set(-1.63, 0, 0);
  group.add(finial);

  // 2. Stepped collar separating bow & shaft
  const collarRing1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.12, 28),
    antiqueBrassMat
  );
  collarRing1.rotation.z = Math.PI / 2;
  collarRing1.position.set(-0.66, 0, 0);
  group.add(collarRing1);

  const collarRing2 = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.14, 28), brassMat);
  collarRing2.rotation.z = Math.PI / 2;
  collarRing2.position.set(-0.54, 0, 0);
  group.add(collarRing2);

  // 3. Engraved "VII" nameplate collar block (thick enough to sit cleanly proud of shaft)
  const plateBlock = new THREE.Mesh(
    createRoundedBoxGeometry(0.34, 0.21, 0.21, 0.02, 0.015),
    [brassMat, brassMat, brassMat, brassMat, engravedMat, engravedMat]
  );
  plateBlock.position.set(-0.28, 0, 0);
  group.add(plateBlock);

  // 4. Main cylindrical shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.072, 1.72, 28), brassMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(0.68, 0, 0);
  group.add(shaft);

  // Tip cap
  const tipCap = new THREE.Mesh(new THREE.SphereGeometry(0.088, 20, 16), antiqueBrassMat);
  tipCap.position.set(1.54, 0, 0);
  group.add(tipCap);

  // 5. Warded double-bitted teeth welded into shaft underside (-Y)
  const teethBridge = new THREE.Mesh(
    createRoundedBoxGeometry(0.56, 0.14, 0.09, 0.015, 0.01),
    antiqueBrassMat
  );
  teethBridge.position.set(1.12, -0.1, 0);
  group.add(teethBridge);

  const tooth1 = new THREE.Mesh(createRoundedBoxGeometry(0.11, 0.28, 0.085, 0.01, 0.008), brassMat);
  tooth1.position.set(0.91, -0.22, 0);
  group.add(tooth1);

  const tooth2 = new THREE.Mesh(
    createRoundedBoxGeometry(0.09, 0.2, 0.085, 0.01, 0.008),
    antiqueBrassMat
  );
  tooth2.position.set(1.1, -0.18, 0);
  group.add(tooth2);

  const tooth3 = new THREE.Mesh(createRoundedBoxGeometry(0.13, 0.34, 0.085, 0.01, 0.008), brassMat);
  tooth3.position.set(1.31, -0.25, 0);
  group.add(tooth3);

  group.rotation.z = 0.08;
  return group;
}

function buildFlashlight(renderer: THREE.WebGLRenderer): THREE.Group {
  const group = new THREE.Group();

  const gunmetalTex = createBrushedMetalTexture(renderer, '#414a59');
  const brassTex = createBrushedMetalTexture(renderer, '#bf9547');

  const bodyMat = new THREE.MeshStandardMaterial({
    map: gunmetalTex,
    color: 0x485263,
    metalness: 0.72,
    roughness: 0.34,
  });

  const darkGripMat = new THREE.MeshStandardMaterial({
    color: 0x222730,
    metalness: 0.35,
    roughness: 0.78,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    map: brassTex,
    color: 0xc99c4a,
    metalness: 0.88,
    roughness: 0.25,
  });

  const reflectorMat = new THREE.MeshStandardMaterial({
    color: 0xe6e8ee,
    metalness: 0.94,
    roughness: 0.12,
  });

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a8,
    emissive: 0xffc663,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xf7e7be,
    emissive: 0xffd27d,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.42,
    roughness: 0.08,
    metalness: 0.05,
    depthWrite: false,
  });

  // 1. Single continuous turned body (LatheGeometry) with machined grip grooves & flared head
  // Lathe revolves around +Y, so we rotate -PI/2 around Z so Y becomes +X
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -1.46),
    new THREE.Vector2(0.29, -1.46),
    new THREE.Vector2(0.32, -1.41),
    new THREE.Vector2(0.32, -1.16),
    // Recessed barrel handle zone (leaves slight relief for grip sleeve)
    new THREE.Vector2(0.30, -1.14),
    new THREE.Vector2(0.30, 0.38),
    // Transition shoulder
    new THREE.Vector2(0.33, 0.42),
    new THREE.Vector2(0.33, 0.56),
    // Flared head cone
    new THREE.Vector2(0.49, 0.88),
    new THREE.Vector2(0.49, 1.38),
    // Front rim lip turning inward into reflector cone
    new THREE.Vector2(0.45, 1.42),
    new THREE.Vector2(0.42, 1.38),
    new THREE.Vector2(0.16, 1.02),
    new THREE.Vector2(0.0, 1.02),
  ];

  const latheGeo = new THREE.LatheGeometry(profile, 40);
  latheGeo.rotateZ(-Math.PI / 2);
  const latheBody = new THREE.Mesh(latheGeo, bodyMat);
  group.add(latheBody);

  // 2. Non-overlapping rubberized knurled grip rings fitted cleanly onto the recessed handle (r = 0.30 -> 0.335)
  const gripPositions = [-0.92, -0.62, -0.32, -0.02];
  for (const gx of gripPositions) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.332, 0.332, 0.16, 36), darkGripMat);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(gx, 0, 0);
    group.add(ring);
  }

  // 3. Brass tailcap collar & lanyard U-loop at x = -1.46
  const tailCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 36), brassMat);
  tailCollar.rotation.z = Math.PI / 2;
  tailCollar.position.set(-1.3, 0, 0);
  group.add(tailCollar);

  const tailLoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.024, 14, 24, Math.PI),
    brassMat
  );
  tailLoop.rotation.z = Math.PI / 2;
  tailLoop.position.set(-1.45, 0, 0);
  group.add(tailLoop);

  // 4. Front brass bezel ring cleanly wrapping the head lip
  const bezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.465, 0.048, 18, 40), brassMat);
  bezelRing.rotation.y = Math.PI / 2;
  bezelRing.position.set(1.38, 0, 0);
  group.add(bezelRing);

  // 5. Inner chrome reflector cone & warm bulb
  const reflectorCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.41, 0.36, 36, 1, true),
    reflectorMat
  );
  reflectorCone.rotation.z = Math.PI / 2;
  reflectorCone.position.set(1.21, 0, 0);
  group.add(reflectorCone);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), bulbMat);
  bulb.position.set(1.18, 0, 0);
  group.add(bulb);

  // 6. Front glass lens positioned strictly ahead of the cone at x = 1.40
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.43, 36), lensMat);
  lens.rotation.y = Math.PI / 2;
  lens.position.set(1.4, 0, 0);
  lens.renderOrder = 2;
  group.add(lens);

  // 7. Top brass slide switch plate + thumb slider at +Y
  const switchBase = new THREE.Mesh(
    createRoundedBoxGeometry(0.46, 0.08, 0.2, 0.02, 0.012),
    brassMat
  );
  switchBase.position.set(0.32, 0.33, 0);
  group.add(switchBase);

  const switchKnob = new THREE.Mesh(
    createRoundedBoxGeometry(0.16, 0.075, 0.14, 0.015, 0.01),
    darkGripMat
  );
  switchKnob.position.set(0.38, 0.385, 0);
  group.add(switchKnob);

  return group;
}

function buildBackpack(renderer: THREE.WebGLRenderer): THREE.Group {
  const group = new THREE.Group();

  const canvasTex = createCanvasFabricTexture(renderer);

  const canvasMat = new THREE.MeshStandardMaterial({
    map: canvasTex,
    color: 0x6f5d48,
    roughness: 0.9,
    metalness: 0.04,
  });

  const canvasDarkMat = new THREE.MeshStandardMaterial({
    map: canvasTex,
    color: 0x4b3d2f,
    roughness: 0.92,
    metalness: 0.04,
  });

  const canvasTrimMat = new THREE.MeshStandardMaterial({
    map: canvasTex,
    color: 0x877259,
    roughness: 0.86,
    metalness: 0.05,
  });

  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x382419,
    roughness: 0.62,
    metalness: 0.08,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc99c4a,
    metalness: 0.86,
    roughness: 0.28,
  });

  // 1. Main waxed-canvas body (z: -0.42 .. +0.42)
  const mainBody = new THREE.Mesh(
    createRoundedBoxGeometry(1.56, 1.88, 0.84, 0.12, 0.045),
    canvasMat
  );
  mainBody.position.set(0, -0.04, 0);
  group.add(mainBody);

  // 2. Top storm flap overhanging main body cleanly (z: -0.45 .. +0.47)
  const topFlap = new THREE.Mesh(
    createRoundedBoxGeometry(1.66, 0.62, 0.92, 0.1, 0.04),
    canvasTrimMat
  );
  topFlap.position.set(0, 0.64, 0.01);
  group.add(topFlap);

  // 3. Front lower gusset pocket strictly proud of mainBody (+0.42 -> +0.72)
  const frontPocket = new THREE.Mesh(
    createRoundedBoxGeometry(1.16, 0.78, 0.3, 0.07, 0.025),
    canvasDarkMat
  );
  frontPocket.position.set(0, -0.42, 0.56);
  group.add(frontPocket);

  const pocketFlap = new THREE.Mesh(
    createRoundedBoxGeometry(1.22, 0.18, 0.34, 0.05, 0.02),
    canvasTrimMat
  );
  pocketFlap.position.set(0, -0.02, 0.57);
  group.add(pocketFlap);

  // 4. Twin vertical leather straps + buckles strictly outside flap (+0.47) and pocket (+0.74)
  for (const sx of [-0.42, 0.42]) {
    // Upper strap on storm flap
    const upperStrap = new THREE.Mesh(
      createRoundedBoxGeometry(0.18, 0.68, 0.06, 0.02, 0.01),
      leatherMat
    );
    upperStrap.position.set(sx, 0.48, 0.49);
    group.add(upperStrap);

    // Lower keeper strap over pocket flap & pocket
    const lowerStrap = new THREE.Mesh(
      createRoundedBoxGeometry(0.18, 0.62, 0.06, 0.02, 0.01),
      leatherMat
    );
    lowerStrap.position.set(sx, -0.18, 0.75);
    group.add(lowerStrap);

    // Connecting bridge step from upper strap to lower strap
    const bridgeStrap = new THREE.Mesh(
      createRoundedBoxGeometry(0.18, 0.14, 0.3, 0.02, 0.01),
      leatherMat
    );
    bridgeStrap.position.set(sx, 0.14, 0.62);
    group.add(bridgeStrap);

    // Hollow rectangular brass buckle seated cleanly IN FRONT of bridge/lower strap (z = 0.80)
    const buckleFrame = new THREE.Group();
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.05), brassMat);
    topBar.position.y = 0.07;
    const botBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.05), brassMat);
    botBar.position.y = -0.07;
    const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.05), brassMat);
    leftBar.position.x = -0.1;
    const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.05), brassMat);
    rightBar.position.x = 0.1;
    const pinBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.04), brassMat);
    buckleFrame.add(topBar, botBar, leftBar, rightBar, pinBar);
    buckleFrame.position.set(sx, -0.02, 0.8);
    group.add(buckleFrame);
  }

  // 5. Side utility pockets (left & right)
  for (const side of [-1, 1]) {
    const sidePocket = new THREE.Mesh(
      createRoundedBoxGeometry(0.2, 0.86, 0.54, 0.05, 0.02),
      canvasDarkMat
    );
    sidePocket.position.set(side * 0.86, -0.24, 0);
    group.add(sidePocket);
  }

  // 6. Top leather carry handle
  const carryLoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.045, 14, 24, Math.PI),
    leatherMat
  );
  carryLoop.position.set(0, 0.93, -0.08);
  group.add(carryLoop);

  // 7. Back padded leather shoulder straps (-Z)
  for (const sx of [-0.42, 0.42]) {
    const shoulderStrap = new THREE.Mesh(
      createRoundedBoxGeometry(0.22, 1.48, 0.07, 0.03, 0.015),
      leatherMat
    );
    shoulderStrap.position.set(sx, -0.06, -0.46);
    group.add(shoulderStrap);
  }

  return group;
}

export function createInspectItemGroup(
  id: InventoryItemId,
  renderer: THREE.WebGLRenderer
): THREE.Group {
  if (id === 'brass_key') return buildBrassKey(renderer);
  if (id === 'flashlight') return buildFlashlight(renderer);
  return buildBackpack(renderer);
}
