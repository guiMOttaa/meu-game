import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createInspectItemGroup } from '../game/inspectModels';
import { InventoryItem } from '../game/types';

interface ItemInspectOverlayProps {
  item: InventoryItem;
  onClose: () => void;
}

const DEFAULT_CAM_POS = new THREE.Vector3(1.15, 0.72, 3.65);

function disposeGroup(group: THREE.Group): void {
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat || disposedMaterials.has(mat)) continue;
      disposedMaterials.add(mat);

      const std = mat as THREE.MeshStandardMaterial;
      const maps = [std.map, std.roughnessMap, std.metalnessMap, std.normalMap, std.emissiveMap];
      for (const tex of maps) {
        if (tex && !disposedTextures.has(tex)) {
          disposedTextures.add(tex);
          tex.dispose();
        }
      }
      mat.dispose();
    }
  });
}

export function ItemInspectOverlay({ item, onClose }: ItemInspectOverlayProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlsApiRef = useRef<{
    zoomBy: (factor: number) => void;
    nudge: (dAzimuth: number, dPolar: number) => void;
    resetView: () => void;
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyR') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        controlsApiRef.current?.nudge(0.22, 0);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        controlsApiRef.current?.nudge(-0.22, 0);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        controlsApiRef.current?.nudge(0, -0.18);
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        controlsApiRef.current?.nudge(0, 0.18);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(300, container.clientWidth);
    const height = Math.max(240, container.clientHeight);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.copy(DEFAULT_CAM_POS);

    // 3-point noir studio lighting: warm key, cool hemisphere fill, subtle cold rim
    const keyLight = new THREE.DirectionalLight(0xffe6bd, 2.2);
    keyLight.position.set(3.2, 4.4, 4.0);
    scene.add(keyLight);

    const hemiFill = new THREE.HemisphereLight(0x88a4cc, 0x241d18, 0.95);
    scene.add(hemiFill);

    const rimLight = new THREE.DirectionalLight(0x9ab8e6, 1.15);
    rimLight.position.set(-3.8, 1.5, -3.5);
    scene.add(rimLight);

    const itemGroup = createInspectItemGroup(item.id, renderer);
    scene.add(itemGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.autoRotate = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.09;
    controls.minDistance = 2.25;
    controls.maxDistance = 6.2;
    controls.target.set(0, 0, 0);
    controls.update();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    const prevCamPos = new THREE.Vector3().copy(camera.position);

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        prevCamPos.copy(camera.position);
        controls.update();
        const stillDamping =
          controls.enableDamping && camera.position.distanceToSquared(prevCamPos) > 1e-6;
        renderDirty = stillDamping;

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && renderDirty) {
            requestRender();
          }
        };
        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    controls.addEventListener('change', requestRender);
    requestRender();

    const offsetVec = new THREE.Vector3();
    const spherical = new THREE.Spherical();

    controlsApiRef.current = {
      zoomBy: (factor: number) => {
        offsetVec.copy(camera.position).sub(controls.target);
        const nextLen = THREE.MathUtils.clamp(
          offsetVec.length() * factor,
          controls.minDistance,
          controls.maxDistance
        );
        offsetVec.setLength(nextLen);
        camera.position.copy(controls.target).add(offsetVec);
        controls.update();
        requestRender();
      },
      nudge: (dAzimuth: number, dPolar: number) => {
        offsetVec.copy(camera.position).sub(controls.target);
        spherical.setFromVector3(offsetVec);
        spherical.theta += dAzimuth;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + dPolar, 0.12, Math.PI - 0.12);
        offsetVec.setFromSpherical(spherical);
        camera.position.copy(controls.target).add(offsetVec);
        controls.update();
        requestRender();
      },
      resetView: () => {
        camera.position.copy(DEFAULT_CAM_POS);
        controls.target.set(0, 0, 0);
        controls.update();
        requestRender();
      },
    };

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(300, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      controlsApiRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      disposeGroup(itemGroup);
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [item.id]);

  const handleZoomOut = useCallback(() => {
    controlsApiRef.current?.zoomBy(1.18);
  }, []);

  const handleZoomIn = useCallback(() => {
    controlsApiRef.current?.zoomBy(0.84);
  }, []);

  const handleReset = useCallback(() => {
    controlsApiRef.current?.resetView();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#05070c]/96"
    >
      {/* POV Eye-Focus Vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(218,178,108,0.08)_0%,rgba(4,6,10,0.45)_46%,rgba(2,3,6,0.96)_92%)]"
      />

      {/* Top Header */}
      <div className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-6 pt-6">
        <div>
          <span className="font-mono text-[10px] tracking-widest text-[#d8a24a] uppercase">
            Visão do Investigador • Inspeção
          </span>
          <h2 className="mt-0.5 font-display text-xl font-semibold tracking-wide text-[#efe5d4] sm:text-2xl">
            {item.name}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer border border-white/18 bg-[#11151f] px-4 py-1.5 font-mono text-xs text-[#d6dde8] transition-colors hover:border-[#d8a24a] hover:text-[#f5e6c8]"
        >
          Voltar
        </button>
      </div>

      {/* Center Interactive 3D Viewport */}
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4"
      >
        <div className="relative h-[320px] w-full sm:h-[380px]">
          <div
            ref={mountRef}
            className="h-full w-full cursor-grab active:cursor-grabbing"
          />

          {/* Subtle first-person coat cuffs framing the lower corners */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-2 left-4 h-14 w-28 rotate-[-14deg] rounded-t-sm border-t border-white/8 bg-[#12161f]/80 sm:left-14"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-2 right-4 h-14 w-28 rotate-[14deg] rounded-t-sm border-t border-white/8 bg-[#12161f]/80 sm:right-14"
          />
        </div>

        {/* Camera / Object Rotation Controls */}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleZoomOut}
            title="Afastar"
            className="cursor-pointer border border-white/12 bg-[#0e121a] p-1.5 text-[#aeb7c6] hover:border-[#d8a24a]/60 hover:text-[#f0dfc0]"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Centralizar objeto"
            className="flex cursor-pointer items-center gap-1.5 border border-white/12 bg-[#0e121a] px-2.5 py-1 font-mono text-[11px] text-[#aeb7c6] hover:border-[#d8a24a]/60 hover:text-[#f0dfc0]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Centralizar</span>
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            title="Aproximar"
            className="cursor-pointer border border-white/12 bg-[#0e121a] p-1.5 text-[#aeb7c6] hover:border-[#d8a24a]/60 hover:text-[#f0dfc0]"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>

      {/* Bottom Clue & Interaction Prompt */}
      <div className="relative z-10 mx-auto mb-6 w-full max-w-2xl px-6 text-center">
        <div className="border border-white/12 bg-[#090c12] px-5 py-3.5 shadow-xl">
          <p className="text-sm leading-relaxed text-[#e8dfd0]">
            {item.inspectDetail ?? item.description}
          </p>
          <p className="mt-1.5 font-mono text-[10px] tracking-wide text-[#858e9e]">
            Arraste com o mouse ou use as setas para girar • Roda do mouse para aproximar
          </p>
        </div>
      </div>
    </motion.div>
  );
}
