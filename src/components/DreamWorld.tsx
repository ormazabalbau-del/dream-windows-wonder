import { useEffect, useRef } from "react";
import * as THREE from "three";

export type DreamEvent =
  | { type: "signal"; count: number }
  | { type: "dialogue"; speaker: string; text: string }
  | { type: "complete" };

type DreamWorldProps = {
  active: boolean;
  muted: boolean;
  onEvent: (event: DreamEvent) => void;
};

type EyeNpc = {
  group: THREE.Group;
  origin: THREE.Vector3;
  phase: number;
};

const WORLD_SIZE = 86;

function makeTextTexture(text: string, foreground = "#111111", background = "#fffbd0") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#111111";
  context.lineWidth = 8;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = foreground;
  context.font = "bold 42px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createEye(index: number): EyeNpc {
  const group = new THREE.Group();
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.7 + (index % 3) * 0.12, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf7e9cb, roughness: 0.85 }),
  );
  eye.scale.set(1.5, 0.72, 0.48);
  const iris = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 16),
    new THREE.MeshBasicMaterial({ color: index % 2 ? 0x4f91a8 : 0x698b4a }),
  );
  iris.position.z = 0.37;
  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.14, 12),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
  );
  pupil.position.z = 0.385;
  const wingMaterial = new THREE.MeshBasicMaterial({ color: 0xe8d9bd, side: THREE.DoubleSide });
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, -1.2, 0.45, 0, -1.05, -0.35, 0], 3),
  );
  const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
  leftWing.position.x = -0.85;
  const rightWing = leftWing.clone();
  rightWing.scale.x = -1;
  rightWing.position.x = 0.85;
  group.add(eye, iris, pupil, leftWing, rightWing);
  const angle = (index / 18) * Math.PI * 2;
  const radius = 9 + (index % 6) * 4.2;
  const origin = new THREE.Vector3(Math.cos(angle) * radius, 3 + (index % 4) * 1.8, Math.sin(angle) * radius);
  group.position.copy(origin);
  return { group, origin, phase: index * 1.71 };
}

function addHouse(scene: THREE.Scene, x: number, z: number, color: number, label: string) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(8, 5.5, 7), material);
  house.position.set(x, 2.75, z);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(6.3, 3.2, 4),
    new THREE.MeshStandardMaterial({ color: 0xa23d46, roughness: 1 }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.set(x, 7, z);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 3.2),
    new THREE.MeshBasicMaterial({ color: 0x173d70 }),
  );
  door.position.set(x, 1.6, z + 3.51);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.3),
    new THREE.MeshBasicMaterial({ map: makeTextTexture(label) }),
  );
  sign.position.set(x, 5.2, z + 3.53);
  scene.add(house, roof, door, sign);
}

export function DreamWorld({ active, muted, onEvent }: DreamWorldProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef(onEvent);
  const mutedRef = useRef(muted);
  eventRef.current = onEvent;
  mutedRef.current = muted;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !active) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x92c7cf);
    scene.fog = new THREE.FogExp2(0x92c7cf, 0.023);
    const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 150);
    camera.position.set(0, 1.7, 23);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !reducedMotion;
    renderer.domElement.className = "dream-canvas";
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff4cc, 0x4b6074, 2.1));
    const sun = new THREE.DirectionalLight(0xffd68a, 2.6);
    sun.position.set(-16, 24, 9);
    sun.castShadow = !reducedMotion;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x9fc76b, roughness: 1, wireframe: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(WORLD_SIZE, 43, 0x376049, 0x70955e);
    grid.position.y = 0.015;
    scene.add(grid);

    const skyShape = new THREE.Mesh(
      new THREE.SphereGeometry(64, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xaed4d4, side: THREE.BackSide }),
    );
    scene.add(skyShape);

    addHouse(scene, -17, -12, 0xffdd7a, "CASA 95");
    addHouse(scene, 18, -18, 0xeaa4b8, "NO ABRIR");
    addHouse(scene, 22, 16, 0xb8d5ed, "AYER");

    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x1c4f91, roughness: 0.75 });
    for (let i = 0; i < 9; i += 1) {
      const door = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 5.3, 0.45), new THREE.MeshStandardMaterial({ color: 0xe4dfd0 }));
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.65, 4.7, 0.32), doorMaterial);
      panel.position.z = 0.3;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe4c660 }));
      knob.position.set(0.92, -0.05, 0.5);
      door.add(frame, panel, knob);
      const angle = (i / 9) * Math.PI * 2;
      door.position.set(Math.cos(angle) * 32, 2.65, Math.sin(angle) * 32);
      door.rotation.y = -angle + Math.PI / 2;
      scene.add(door);
    }

    const eyes: EyeNpc[] = [];
    for (let i = 0; i < 18; i += 1) {
      const npc = createEye(i);
      eyes.push(npc);
      scene.add(npc.group);
    }

    const watchers: THREE.Group[] = [];
    for (let i = 0; i < 8; i += 1) {
      const watcher = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.65, 2.4, 4, 8),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0xeedfc5 : 0x455b66, roughness: 1 }),
      );
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 12),
        new THREE.MeshBasicMaterial({ color: 0x171717 }),
      );
      face.position.set(0, 1.18, 0.59);
      watcher.add(body, face);
      watcher.position.set(-27 + i * 7.5, 1.75, -28 + (i % 2) * 4);
      watchers.push(watcher);
      scene.add(watcher);
    }

    const signalGeometry = new THREE.OctahedronGeometry(0.62, 0);
    const signals: THREE.Mesh[] = [];
    const signalPositions: Array<[number, number, number]> = [
      [-9, 1.4, 9], [13, 1.4, 4], [-22, 1.4, 17], [5, 1.4, -22], [27, 1.4, -3],
    ];
    signalPositions.forEach(([x, y, z], index) => {
      const signal = new THREE.Mesh(
        signalGeometry,
        new THREE.MeshStandardMaterial({ color: index % 2 ? 0xff668e : 0xffe36e, emissive: 0x5c3d17, emissiveIntensity: 0.5 }),
      );
      signal.position.set(x, y, z);
      signal.userData["collected"] = false;
      signals.push(signal);
      scene.add(signal);
    });

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2be }),
    );
    moon.position.set(-30, 32, -48);
    scene.add(moon);

    const keys = new Set<string>();
    const mobile = { forward: false, back: false, left: false, right: false };
    let yaw = 0;
    let pitch = 0;
    let collected = 0;
    let lastDialogue = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = Math.max(width / Math.max(height, 1), 0.5);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();

    const onKeyDown = (event: KeyboardEvent) => {
      keys.add(event.key.toLowerCase());
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key.toLowerCase())) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= event.movementX * 0.0022;
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0018, -0.7, 0.7);
    };
    const onCanvasClick = () => renderer.domElement.requestPointerLock?.();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onCanvasClick);

    const controls = mount.querySelectorAll<HTMLButtonElement>("[data-move]");
    const setMove = (button: HTMLButtonElement, value: boolean) => {
      const direction = button.dataset["move"];
      if (direction === "forward" || direction === "back" || direction === "left" || direction === "right") mobile[direction] = value;
    };
    controls.forEach((button) => {
      button.onpointerdown = () => setMove(button, true);
      button.onpointerup = () => setMove(button, false);
      button.onpointerleave = () => setMove(button, false);
    });

    let frame = 0;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.033);
      const time = clock.elapsedTime;
      const forward = Number(keys.has("w") || keys.has("arrowup") || mobile.forward) - Number(keys.has("s") || keys.has("arrowdown") || mobile.back);
      const side = Number(keys.has("d") || keys.has("arrowright") || mobile.right) - Number(keys.has("a") || keys.has("arrowleft") || mobile.left);
      if (side && document.pointerLockElement !== renderer.domElement) yaw -= side * delta * 1.35;
      const direction = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
      const strafe = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      camera.position.addScaledVector(direction, forward * delta * 7.2);
      if (document.pointerLockElement === renderer.domElement) camera.position.addScaledVector(strafe, side * delta * 5.7);
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -39, 39);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -39, 39);
      camera.position.y = 1.7 + (forward !== 0 ? Math.sin(time * 9) * 0.035 : 0);
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);

      eyes.forEach((npc, index) => {
        npc.group.position.y = npc.origin.y + Math.sin(time * (0.8 + (index % 3) * 0.1) + npc.phase) * 0.65;
        npc.group.position.x = npc.origin.x + Math.cos(time * 0.35 + npc.phase) * 1.5;
        npc.group.lookAt(camera.position);
        const wingPulse = Math.sin(time * 7 + npc.phase) * 0.35;
        const wingA = npc.group.children[3];
        const wingB = npc.group.children[4];
        if (wingA) wingA.rotation.y = wingPulse;
        if (wingB) wingB.rotation.y = -wingPulse;
        if (npc.group.position.distanceTo(camera.position) < 3.4 && time - lastDialogue > 4) {
          lastDialogue = time;
          const lines = ["te vimos cerrar los ojos", "la puerta azul recuerda tu nombre", "no mires al sol cuadrado", "faltan cinco señales", "esta computadora sueña contigo"];
          eventRef.current({ type: "dialogue", speaker: `OJO_${String(index + 1).padStart(2, "0")}`, text: lines[index % lines.length] ?? "te estábamos esperando" });
        }
      });
      watchers.forEach((watcher) => watcher.lookAt(camera.position.x, watcher.position.y, camera.position.z));
      signals.forEach((signal, index) => {
        if (signal.userData["collected"]) return;
        signal.rotation.y = time * 1.5 + index;
        signal.position.y = 1.4 + Math.sin(time * 2 + index) * 0.25;
        if (signal.position.distanceTo(camera.position) < 2.25) {
          signal.userData["collected"] = true;
          signal.visible = false;
          collected += 1;
          eventRef.current({ type: "signal", count: collected });
          eventRef.current({ type: "dialogue", speaker: "SISTEMA", text: `señal recuperada ${collected}/5` });
          if (collected === signals.length) eventRef.current({ type: "complete" });
        }
      });
      if (!reducedMotion) {
        grid.position.x = Math.sin(time * 0.08) * 0.25;
        moon.scale.setScalar(1 + Math.sin(time * 0.6) * 0.025);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            const map = "map" in material ? material.map : null;
            if (map instanceof THREE.Texture) map.dispose();
            material.dispose();
          });
        }
      });
      mount.removeChild(renderer.domElement);
    };
  }, [active]);

  return (
    <div ref={mountRef} className="dream-world" aria-label="Mundo dreamcore tridimensional">
      <div className="dream-crosshair" aria-hidden="true">+</div>
      <div className="mobile-pad" aria-label="Controles de movimiento">
        <button type="button" data-move="forward" aria-label="Avanzar">▲</button>
        <button type="button" data-move="left" aria-label="Girar a la izquierda">◀</button>
        <button type="button" data-move="back" aria-label="Retroceder">▼</button>
        <button type="button" data-move="right" aria-label="Girar a la derecha">▶</button>
      </div>
    </div>
  );
}