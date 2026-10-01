import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import eyeUrl from "../assets/winged-eye.png";

export type DreamEvent =
  | { type: "signal"; count: number }
  | { type: "dialogue"; speaker: string; text: string }
  | { type: "complete" }
  | { type: "loot"; item: string }
  | { type: "consume"; item: string }
  | { type: "prompt"; text: string | null }
  | { type: "exit"; visible: boolean }
  | { type: "timer"; seconds: number }
  | { type: "level"; name: "jardin" | "poolrooms" }
  | { type: "glare"; value: number };

export type RemotePlayer = { x: number; y: number; z: number; yaw: number; color: string; face: string; name: string; level: string; t: number };

export type Avatar = { name: string; color: string; face: string };

type DreamWorldProps = {
  active: boolean;
  muted: boolean;
  sandbox: boolean;
  onEvent: (event: DreamEvent) => void;
  inventoryRef: MutableRefObject<string[]>;
  remoteRef?: MutableRefObject<Map<string, RemotePlayer>>;
  onPose?: (pose: { x: number; y: number; z: number; yaw: number; level: string }) => void;
};

type Box = { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
type Interactable = { pos: THREE.Vector3; kind: "loot" | "stove" | "fridge" | "bed" | "exit" | "return"; item?: string; mesh?: THREE.Object3D; used?: boolean };
type House = { cx: number; cz: number; w: number; d: number; floorY: number; rooms: number; tall: boolean };

const EXIT_EVERY = 300;
const EXIT_VISIBLE = 10;
const EXIT_FORCE = 3000;
const POOL_X = 1000;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

function textTexture(text: string, fg = "#111", bg = "#fffbd0") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const c = canvas.getContext("2d");
  if (c) {
    c.fillStyle = bg;
    c.fillRect(0, 0, 256, 64);
    c.strokeStyle = fg;
    c.lineWidth = 6;
    c.strokeRect(3, 3, 250, 58);
    c.fillStyle = fg;
    c.font = "bold 30px monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 128, 33);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function baseHeight(x: number, z: number) {
  const h = Math.sin(x * 0.045) * 3.4 + Math.cos(z * 0.038) * 2.8 + Math.sin((x + z) * 0.09) * 1.2 + Math.sin(x * 0.13 - z * 0.07) * 0.45 + 3;
  return h * 0.65 + Math.round(h / 1.1) * 1.1 * 0.35;
}

const LOOT = ["linterna", "manzana", "pan", "leche tibia", "disquete 3½", "cassette sin nombre", "ojo de vidrio", "llave azul", "foto vieja", "caramelo", "linterna"];
const LOOT_COLOR: Record<string, number> = { linterna: 0xffd23f, manzana: 0xd8343c, pan: 0xd9a35b, "leche tibia": 0xf4f4ef, "disquete 3½": 0x2850a8, "cassette sin nombre": 0x333333, "ojo de vidrio": 0x7fd4ff, "llave azul": 0x2a7bff, "foto vieja": 0xe7d7b0, caramelo: 0xff7ac8, "huevo crudo": 0xfff3d6, "huevo frito": 0xffe066 };

export function DreamWorld({ active, sandbox, onEvent, inventoryRef, remoteRef, onPose }: DreamWorldProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef(onEvent);
  const poseRef = useRef(onPose);
  const sandboxRef = useRef(sandbox);
  eventRef.current = onEvent;
  poseRef.current = onPose;
  sandboxRef.current = sandbox;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !active) return;
    const emit = (e: DreamEvent) => eventRef.current(e);
    const rand = rng(1995);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x9fd0d6);
    scene.background = skyColor.clone();
    scene.fog = new THREE.Fog(0x9fd0d6, 20, 120);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 400);
    camera.rotation.order = "YXZ";
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(0.6);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "dream-canvas";
    mount.prepend(renderer.domElement);

    const outdoor = new THREE.Group();
    const pool = new THREE.Group();
    pool.visible = false;
    scene.add(outdoor, pool);
    const hemi = new THREE.HemisphereLight(0xfff4cc, 0x52704a, 2.2);
    const sunLight = new THREE.DirectionalLight(0xffe2a0, 2.4);
    sunLight.position.set(-60, 80, -90);
    outdoor.add(hemi, sunLight);

    const boxes: Box[] = [];
    const interactables: Interactable[] = [];
    const houses: House[] = [];

    // ---------- houses layout ----------
    for (let tries = 0; houses.length < 8 && tries < 400; tries += 1) {
      const ang = rand() * Math.PI * 2;
      const r = 22 + rand() * 80;
      const cx = Math.cos(ang) * r;
      const cz = Math.sin(ang) * r;
      if (houses.some((h) => Math.hypot(h.cx - cx, h.cz - cz) < 28)) continue;
      const rooms = 3 + Math.floor(rand() * 4);
      houses.push({ cx, cz, w: 8 + (rooms > 4 ? 2 : 0), d: 10 + Math.floor(rand() * 3), floorY: baseHeight(cx, cz) + 0.3, rooms, tall: rooms >= 5 });
    }

    const terrainHeight = (x: number, z: number) => {
      let h = baseHeight(x, z);
      for (const house of houses) {
        const dx = Math.max(Math.abs(x - house.cx) - house.w / 2 - 1.5, 0);
        const dz = Math.max(Math.abs(z - house.cz) - house.d / 2 - 1.5, 0);
        const d = Math.hypot(dx, dz);
        if (d < 7) {
          const t = 1 - d / 7;
          const s = t * t * (3 - 2 * t);
          h = h + (house.floorY - 0.12 - h) * s;
        }
      }
      return h;
    };
    const insideHouse = (x: number, z: number) => houses.find((h) => Math.abs(x - h.cx) < h.w / 2 && Math.abs(z - h.cz) < h.d / 2);

    // ---------- terrain ----------
    const groundGeo = new THREE.PlaneGeometry(280, 280, 140, 140);
    groundGeo.rotateX(-Math.PI / 2);
    const gpos = groundGeo.attributes["position"] as THREE.BufferAttribute;
    const colors: number[] = [];
    const tmpColor = new THREE.Color();
    for (let i = 0; i < gpos.count; i += 1) {
      const x = gpos.getX(i);
      const z = gpos.getZ(i);
      const y = terrainHeight(x, z);
      gpos.setY(i, y);
      const n = ((Math.floor(x * 0.5) + Math.floor(z * 0.5)) & 1) * 0.04;
      tmpColor.setHSL(0.24 + Math.sin(x * 0.02) * 0.03, 0.5, 0.42 + y * 0.018 + n);
      colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
    groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    outdoor.add(ground);

    // ---------- swaying grass (one draw call) ----------
    const timeUniform = { value: 0 };
    const bladeGeo = new THREE.BufferGeometry();
    bladeGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, 0, 0.55, 0, 0, 0, -0.05, 0, 0, 0.05, 0, 0.55, 0], 3));
    bladeGeo.computeVertexNormals();
    const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms["uTime"] = timeUniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);\nfloat sway = sin(uTime*2.0 + wp.x*0.4 + wp.z*0.3) * 0.18 * position.y;\ntransformed.x += sway; transformed.z += sway*0.5;",
        );
    };
    const grassCount = reducedMotion ? 7000 : 16000;
    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v3 = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let gi = 0;
    while (gi < grassCount) {
      const x = (rand() - 0.5) * 220;
      const z = (rand() - 0.5) * 220;
      if (insideHouse(x, z) || houses.some((h) => Math.abs(x - h.cx) < h.w / 2 + 0.6 && Math.abs(z - h.cz) < h.d / 2 + 0.6)) continue;
      q.setFromAxisAngle(up, rand() * Math.PI);
      const s = 0.6 + rand() * 0.9;
      m4.compose(v3.set(x, terrainHeight(x, z), z), q, sc.set(s, s, s));
      grass.setMatrixAt(gi, m4);
      grass.setColorAt(gi, tmpColor.setHSL(0.22 + rand() * 0.08, 0.55, 0.32 + rand() * 0.2));
      gi += 1;
    }
    outdoor.add(grass);

    // ---------- pixel flowers ----------
    const flowerTex = canvasTexture(16, (c) => {
      c.clearRect(0, 0, 16, 16);
      c.fillStyle = "#3d7a2a";
      c.fillRect(7, 8, 2, 8);
      c.fillStyle = "#ffffff";
      [[7, 2], [4, 5], [10, 5], [7, 8]].forEach(([x, y]) => c.fillRect(x ?? 0, y ?? 0, 3, 3));
      c.fillStyle = "#ffd23f";
      c.fillRect(7, 5, 3, 3);
    });
    const flowerGeo = new THREE.PlaneGeometry(0.5, 0.5);
    flowerGeo.translate(0, 0.25, 0);
    const flowerMat = new THREE.MeshBasicMaterial({ map: flowerTex, alphaTest: 0.5, side: THREE.DoubleSide });
    const flowerCount = 2200;
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
    const petals = [0xffffff, 0xff9ad5, 0xfff07a, 0xa9c8ff, 0xff8a6b];
    for (let i = 0; i < flowerCount; ) {
      const cx = (rand() - 0.5) * 200;
      const cz = (rand() - 0.5) * 200;
      const color = petals[Math.floor(rand() * petals.length)] ?? 0xffffff;
      for (let k = 0; k < 12 && i < flowerCount; k += 1) {
        const x = cx + (rand() - 0.5) * 6;
        const z = cz + (rand() - 0.5) * 6;
        if (insideHouse(x, z)) continue;
        q.setFromAxisAngle(up, rand() * Math.PI);
        m4.compose(v3.set(x, terrainHeight(x, z), z), q, sc.setScalar(0.7 + rand() * 0.6));
        flowers.setMatrixAt(i, m4);
        flowers.setColorAt(i, tmpColor.set(color));
        i += 1;
      }
    }
    outdoor.add(flowers);

    // ---------- lollipop trees ----------
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 3, 6), new THREE.MeshLambertMaterial({ color: 0x7a5534 }), 60);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.7, 0), new THREE.MeshLambertMaterial({ color: 0x4f9a48, flatShading: true }), 60);
    for (let i = 0; i < 60; ) {
      const x = (rand() - 0.5) * 230;
      const z = (rand() - 0.5) * 230;
      if (houses.some((h) => Math.hypot(x - h.cx, z - h.cz) < 12)) continue;
      const y = terrainHeight(x, z);
      m4.compose(v3.set(x, y + 1.5, z), q.identity(), sc.setScalar(1));
      trunks.setMatrixAt(i, m4);
      m4.compose(v3.set(x, y + 3.6, z), q.identity(), sc.setScalar(0.8 + rand() * 0.6));
      crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, tmpColor.setHSL(0.27 + rand() * 0.1, 0.45, 0.35 + rand() * 0.15));
      boxes.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, minY: y, maxY: y + 3 });
      i += 1;
    }
    outdoor.add(trunks, crowns);

    // ---------- swings ----------
    const swings: THREE.Group[] = [];
    const metal = new THREE.MeshLambertMaterial({ color: 0xd94f4f });
    const rope = new THREE.MeshBasicMaterial({ color: 0x333333 });
    for (let i = 0; i < 5; i += 1) {
      const x = Math.cos(i * 1.3) * (14 + i * 9);
      const z = Math.sin(i * 1.3) * (14 + i * 9);
      if (insideHouse(x, z)) continue;
      const y = terrainHeight(x, z);
      const set = new THREE.Group();
      set.position.set(x, y, z);
      set.rotation.y = i;
      [-1.6, 1.6].forEach((px) => {
        [-0.8, 0.8].forEach((pz) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), metal);
          leg.position.set(px, 1.5, pz * 0.6);
          leg.rotation.x = pz > 0 ? -0.35 : 0.35;
          set.add(leg);
        });
      });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), metal);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 3;
      set.add(bar);
      [-0.7, 0.7].forEach((sx, k) => {
        const pivot = new THREE.Group();
        pivot.position.set(sx, 3, 0);
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.4, 0.03), rope);
        r1.position.set(-0.25, -1.2, 0);
        const r2 = r1.clone();
        r2.position.x = 0.25;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.3), new THREE.MeshLambertMaterial({ color: k ? 0x3c78d8 : 0xffd23f }));
        seat.position.y = -2.4;
        pivot.add(r1, r2, seat);
        pivot.userData["phase"] = rand() * 6;
        swings.push(pivot);
        set.add(pivot);
      });
      outdoor.add(set);
    }

    // ---------- Win95 sun shader ----------
    const sunDir = new THREE.Vector3(-0.45, 0.42, -0.78).normalize();
    const sunMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uLook: { value: 0 }, uTime: timeUniform },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `varying vec2 vUv; uniform float uLook; uniform float uTime;
        float bayer(vec2 p){ int x=int(mod(p.x,4.0)); int y=int(mod(p.y,4.0)); int i=x+y*4;
          float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
          for(int k=0;k<16;k++){ if(k==i) return m[k]/16.; } return 0.; }
        void main(){ vec2 p = floor(vUv*64.0)/64.0 - 0.5; float d = length(p)*2.0;
          float core = step(d, 0.32);
          float ring = floor((1.0 - d) * 6.0) / 6.0;
          float glow = clamp(ring, 0.0, 1.0) * (0.35 + uLook * 0.9);
          float rays = step(0.96, abs(sin(atan(p.y,p.x)*8.0 + uTime*0.3))) * (1.0-d) * uLook;
          float a = max(core, glow + rays);
          if (a < bayer(gl_FragCoord.xy)) discard;
          vec3 col = mix(vec3(1.0,0.55,0.75), vec3(1.0,0.97,0.7), core + ring*0.5);
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sunMat);
    outdoor.add(sun);

    // ---------- materials for houses ----------
    const woodTex = canvasTexture(32, (c, s) => {
      c.fillStyle = "#a0703f";
      c.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 8) {
        c.fillStyle = y % 16 ? "#8a5d33" : "#b07d48";
        c.fillRect(0, y, s, 7);
        c.fillStyle = "#5a3a1e";
        c.fillRect((y * 3) % s, y, 1, 7);
      }
    }, 3);
    const tileTex = canvasTexture(32, (c, s) => {
      c.fillStyle = "#eeeeee";
      c.fillRect(0, 0, s, s);
      c.fillStyle = "#cfd6da";
      c.fillRect(0, 15, s, 2);
      c.fillRect(15, 0, 2, s);
    }, 4);
    const sidingColors = [0xf2e3b3, 0xe8c4cf, 0xc7dcef, 0xd8e8c4, 0xefd2a8, 0xe3e3e3];
    const wallpapers = [0xf6e7a6, 0xd9c3e9, 0xbfe3e0, 0xf3c9b6, 0xe8f0c6, 0xffd9e8];

    const addBox = (group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, collide = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y + h / 2, z);
      group.add(mesh);
      if (collide) boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
      return mesh;
    };

    const spawnLoot = (group: THREE.Group, item: string, x: number, y: number, z: number) => {
      const color = LOOT_COLOR[item] ?? 0xffffff;
      const geo = item === "linterna" ? new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8) : item.includes("disquete") || item.includes("cassette") || item.includes("foto") ? new THREE.BoxGeometry(0.3, 0.05, 0.3) : new THREE.IcosahedronGeometry(0.14, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
      mesh.position.set(x, y, z);
      mesh.userData["baseY"] = y;
      group.add(mesh);
      interactables.push({ pos: mesh.position, kind: "loot", item, mesh });
    };

    // ---------- house builder ----------
    houses.forEach((house, hIndex) => {
      const g = new THREE.Group();
      g.position.set(house.cx, 0, house.cz);
      outdoor.add(g);
      const { w, d, floorY: fy } = house;
      const hw = w / 2;
      const hd = d / 2;
      const wallH = 2.8;
      const siding = new THREE.MeshLambertMaterial({ color: sidingColors[hIndex % sidingColors.length] });
      const paper = new THREE.MeshLambertMaterial({ color: wallpapers[(hIndex * 3) % wallpapers.length] });
      const pushBox = (b: Box) => boxes.push({ minX: b.minX + house.cx, maxX: b.maxX + house.cx, minZ: b.minZ + house.cz, maxZ: b.maxZ + house.cz, minY: b.minY, maxY: b.maxY });
      const wallSeg = (x1: number, z1: number, x2: number, z2: number, mat: THREE.Material, h = wallH, y0 = fy) => {
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 0.05) return;
        const alongX = Math.abs(z2 - z1) < 0.01;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.18, h, alongX ? 0.18 : len), mat);
        mesh.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
        g.add(mesh);
        pushBox({ minX: Math.min(x1, x2) - 0.1, maxX: Math.max(x1, x2) + 0.1, minZ: Math.min(z1, z2) - 0.1, maxZ: Math.max(z1, z2) + 0.1, minY: y0, maxY: y0 + h });
      };
      const wallWithGaps = (fixed: number, a: number, b: number, gaps: Array<[number, number]>, alongX: boolean, mat: THREE.Material) => {
        let cur = a;
        [...gaps].sort((p, q2) => p[0] - q2[0]).forEach(([g1, g2]) => {
          if (alongX) wallSeg(cur, fixed, g1, fixed, mat);
          else wallSeg(fixed, cur, fixed, g1, mat);
          if (alongX) wallSeg(g1, fixed, g2, fixed, mat, 0.6, fy + 2.2);
          else wallSeg(fixed, g1, fixed, g2, mat, 0.6, fy + 2.2);
          cur = g2;
        });
        if (alongX) wallSeg(cur, fixed, b, fixed, mat);
        else wallSeg(fixed, cur, fixed, b, mat);
      };

      // foundation, floor, ceiling
      addBox(g, w + 0.6, 2.5, d + 0.6, 0, fy - 2.5, 0, new THREE.MeshLambertMaterial({ color: 0x8c8c8c }), false);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: woodTex }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = fy + 0.01;
      g.add(floor);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide }));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = fy + wallH;
      g.add(ceil);

      // exterior walls (front door at +z)
      wallWithGaps(hd, -hw, hw, [[-0.6, 0.6]], true, siding);
      wallSeg(-hw, -hd, hw, -hd, siding);
      wallSeg(-hw, -hd, -hw, hd, siding);
      wallSeg(hw, -hd, hw, hd, siding);
      // windows outside
      const winMat = new THREE.MeshBasicMaterial({ color: 0x9ad8ff });
      const frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const levels = house.tall ? [fy + 1.3, fy + 4.1] : [fy + 1.3];
      levels.forEach((wy) => {
        [-hw + 1.6, hw - 1.6].forEach((wx) => {
          const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), frameMat);
          fr.position.set(wx, wy + 0.3, hd + 0.1);
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), winMat);
          pane.position.set(wx, wy + 0.3, hd + 0.11);
          g.add(fr, pane);
        });
      });
      // second storey shell
      let roofBase = fy + wallH;
      if (house.tall) {
        addBox(g, w, 2.8, d, 0, fy + wallH, 0, siding, false);
        roofBase += 2.8;
      }
      // gable roof
      const shape = new THREE.Shape();
      shape.moveTo(-hw - 0.5, 0);
      shape.lineTo(hw + 0.5, 0);
      shape.lineTo(0, 2.6);
      shape.lineTo(-hw - 0.5, 0);
      const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 1, bevelEnabled: false });
      roofGeo.translate(0, 0, -(d + 1) / 2);
      const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: [0xa23d46, 0x3d5aa2, 0x4a7a3d, 0x6b4a8c][hIndex % 4], flatShading: true }));
      roof.position.y = roofBase;
      g.add(roof);
      // chimney + porch + sign
      addBox(g, 0.7, 2.2, 0.7, hw - 1.5, roofBase + 0.4, -1, new THREE.MeshLambertMaterial({ color: 0x9a4a3a }), false);
      addBox(g, 3, 0.2, 1.6, 0, fy - 0.2, hd + 0.8, new THREE.MeshLambertMaterial({ color: 0xb08a5b }), false);
      const label = ["CASA 95", "AYER", "NO ABRIR", "MI CASA?", "1998", "HOGAR.EXE", "ESPERÁ", "VOLVÉ"][hIndex % 8] ?? "CASA";
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: textTexture(label) }));
      sign.position.set(0, fy + 2.5, hd + 0.11);
      g.add(sign);

      // interior: hallway x in [-1,1]; rooms on each side
      const n = house.rooms;
      const left = Math.ceil(n / 2);
      const right = n - left;
      const columns: Array<{ x1: number; x2: number; count: number; side: number }> = [
        { x1: -hw, x2: -1, count: left, side: -1 },
        { x1: 1, x2: hw, count: Math.max(right, 1), side: 1 },
      ];
      let roomIndex = 0;
      columns.forEach((col) => {
        const len = d / col.count;
        const doorGaps: Array<[number, number]> = [];
        for (let k = 0; k < col.count; k += 1) {
          const z1 = -hd + k * len;
          const z2 = z1 + len;
          const mid = (z1 + z2) / 2;
          doorGaps.push([mid - 0.5, mid + 0.5]);
          if (k > 0) wallSeg(col.x1, z1, col.x2, z1, paper);
          const cx = (col.x1 + col.x2) / 2;
          const isKitchen = roomIndex === 0;
          const wy = fy;
          if (isKitchen) {
            const counterMat = new THREE.MeshLambertMaterial({ color: 0xe9e4d4 });
            const wallX = col.side < 0 ? col.x1 + 0.4 : col.x2 - 0.4;
            const counter = addBox(g, 0.7, 0.9, len - 1.2, wallX, wy, mid, counterMat);
            counter.userData["k"] = 1;
            const stove = addBox(g, 0.75, 0.92, 0.9, wallX, wy, z1 + 0.6, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
            for (let b = 0; b < 4; b += 1) {
              const burner = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), new THREE.MeshBasicMaterial({ color: 0x222222 }));
              burner.rotation.x = -Math.PI / 2;
              burner.position.set(wallX + (b % 2 ? 0.15 : -0.15), wy + 0.93, z1 + 0.6 + (b > 1 ? 0.2 : -0.2));
              g.add(burner);
            }
            interactables.push({ pos: new THREE.Vector3(house.cx + wallX, wy + 1, house.cz + z1 + 0.6), kind: "stove", mesh: stove });
            addBox(g, 0.8, 2, 0.8, wallX, wy, z2 - 0.6, new THREE.MeshLambertMaterial({ color: 0xdfe8ee }));
            interactables.push({ pos: new THREE.Vector3(house.cx + wallX, wy + 1, house.cz + z2 - 0.6), kind: "fridge" });
            addBox(g, 1, 0.75, 1, cx + col.side * -0.3, wy, mid, new THREE.MeshLambertMaterial({ color: 0xc98b4f }));
            const tiles = new THREE.Mesh(new THREE.PlaneGeometry(col.x2 - col.x1, len), new THREE.MeshLambertMaterial({ map: tileTex }));
            tiles.rotation.x = -Math.PI / 2;
            tiles.position.set(cx, wy + 0.02, mid);
            g.add(tiles);
            spawnLoot(g, rand() > 0.5 ? "manzana" : "pan", house.cx + cx, wy + 0.95, house.cz + mid);
          } else {
            const wallX = col.side < 0 ? col.x1 + 1.1 : col.x2 - 1.1;
            const bedColor = new THREE.MeshLambertMaterial({ color: [0x3c78d8, 0xd94f8a, 0x5ba85b, 0xe0a030][roomIndex % 4] });
            addBox(g, 1.9, 0.5, 1.2, wallX, wy, z1 + 1, bedColor);
            addBox(g, 0.5, 0.15, 1, wallX + col.side * 0.65, wy + 0.5, z1 + 1, new THREE.MeshLambertMaterial({ color: 0xffffff }), false);
            interactables.push({ pos: new THREE.Vector3(house.cx + wallX, wy + 0.5, house.cz + z1 + 1), kind: "bed" });
            addBox(g, 0.5, 0.55, 0.5, wallX, wy, z2 - 0.5, new THREE.MeshLambertMaterial({ color: 0x8a5d33 }));
            const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
            lamp.position.set(house.cx + wallX, wy + 0.75, house.cz + z2 - 0.5);
            outdoor.add(lamp);
            const rug = new THREE.Mesh(new THREE.CircleGeometry(0.8, 10), new THREE.MeshLambertMaterial({ color: [0xff9ad5, 0x9ad8ff, 0xfff07a][roomIndex % 3] }));
            rug.rotation.x = -Math.PI / 2;
            rug.position.set(cx, wy + 0.03, mid);
            g.add(rug);
            if (rand() > 0.3) spawnLoot(g, LOOT[Math.floor(rand() * LOOT.length)] ?? "caramelo", house.cx + wallX, wy + 0.7, house.cz + z2 - 0.5);
            if (rand() > 0.6) spawnLoot(g, LOOT[Math.floor(rand() * LOOT.length)] ?? "foto vieja", house.cx + cx, wy + 0.3, house.cz + mid);
          }
          roomIndex += 1;
        }
        wallWithGaps(col.side < 0 ? -1 : 1, -hd, hd, doorGaps, false, paper);
      });
      // a ceiling light and hallway framed picture
      const hallLight = new THREE.PointLight(0xfff0c8, 6, 9, 1.6);
      hallLight.position.set(house.cx, fy + 2.4, house.cz);
      outdoor.add(hallLight);
    });

    // ---------- winged eye NPCs ----------
    const eyeTex = new THREE.TextureLoader().load(eyeUrl);
    eyeTex.colorSpace = THREE.SRGBColorSpace;
    eyeTex.magFilter = THREE.NearestFilter;
    const eyes: Array<{ sprite: THREE.Sprite; origin: THREE.Vector3; phase: number; base: number }> = [];
    for (let i = 0; i < 26; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, transparent: true, alphaTest: 0.2 }));
      const base = 1.6 + rand() * 1.4;
      sprite.scale.set(base * 1.6, base, 1);
      const x = (rand() - 0.5) * 180;
      const z = (rand() - 0.5) * 180;
      const origin = new THREE.Vector3(x, terrainHeight(x, z) + 3 + rand() * 6, z);
      sprite.position.copy(origin);
      eyes.push({ sprite, origin, phase: rand() * 10, base });
      outdoor.add(sprite);
    }
    const eyeLines = ["te vimos cerrar los ojos", "la puerta roja aparece cada cinco minutos", "no mires al sol cuadrado", "las casas cambian cuando dormís", "esta computadora sueña con vos", "¿cocinaste algo? huele a 1996", "abajo del agua hay otra habitación"];

    // ---------- watchers ----------
    const watchers: THREE.Group[] = [];
    for (let i = 0; i < 10; i += 1) {
      const wgrp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.2, 4, 8), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xeedfc5 : 0x455b66 }));
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      face.position.set(0, 1.05, 0.5);
      wgrp.add(body, face);
      const x = Math.cos(i * 0.63) * 70;
      const z = Math.sin(i * 0.63) * 70;
      wgrp.position.set(x, terrainHeight(x, z) + 1.6, z);
      watchers.push(wgrp);
      outdoor.add(wgrp);
    }

    // ---------- signals ----------
    const signals: THREE.Mesh[] = [];
    houses.slice(0, 5).forEach((house, index) => {
      const x = house.cx + house.w / 2 + 3;
      const z = house.cz + house.d / 2 + 2;
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshLambertMaterial({ color: index % 2 ? 0xff668e : 0xffe36e, emissive: 0x5c3d17 }));
      s.position.set(x, terrainHeight(x, z) + 1.3, z);
      s.userData["baseY"] = s.position.y;
      signals.push(s);
      outdoor.add(s);
    });

    // ---------- EXIT door ----------
    const exitDoor = new THREE.Group();
    const exitFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 0.3), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    exitFrame.position.y = 1.7;
    const exitPanel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3, 0.35), new THREE.MeshLambertMaterial({ color: 0xb4232c, emissive: 0x400000 }));
    exitPanel.position.y = 1.55;
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), new THREE.MeshBasicMaterial({ map: textTexture("EXIT", "#ffffff", "#0a8a3a") }));
    exitSign.position.set(0, 3.7, 0.2);
    exitDoor.add(exitFrame, exitPanel, exitSign);
    exitDoor.visible = false;
    scene.add(exitDoor);
    const exitInteract: Interactable = { pos: exitDoor.position, kind: "exit" };

    // ---------- POOLROOMS ----------
    const poolTile = canvasTexture(32, (c, s) => {
      c.fillStyle = "#f4f7f6";
      c.fillRect(0, 0, s, s);
      c.fillStyle = "#c9d6d8";
      for (let i = 0; i < s; i += 8) {
        c.fillRect(i, 0, 1, s);
        c.fillRect(0, i, s, 1);
      }
    }, 20);
    const poolTileWall = poolTile.clone();
    poolTileWall.repeat.set(30, 3);
    poolTileWall.needsUpdate = true;
    const tileMat = new THREE.MeshLambertMaterial({ map: poolTile });
    const tileWallMat = new THREE.MeshLambertMaterial({ map: poolTileWall });
    const P = 30;
    const poolFloor = new THREE.Mesh(new THREE.PlaneGeometry(P * 2, P * 2), tileMat);
    poolFloor.rotation.x = -Math.PI / 2;
    poolFloor.position.set(POOL_X, 0, 0);
    pool.add(poolFloor);
    const poolCeil = new THREE.Mesh(new THREE.PlaneGeometry(P * 2, P * 2), new THREE.MeshLambertMaterial({ color: 0xf8fbfb }));
    poolCeil.rotation.x = Math.PI / 2;
    poolCeil.position.set(POOL_X, 5, 0);
    pool.add(poolCeil);
    const pg = new THREE.Group();
    pool.add(pg);
    addBox(pg, P * 2, 5, 0.4, POOL_X, -2, -P, tileWallMat);
    addBox(pg, P * 2, 5, 0.4, POOL_X, -2, P, tileWallMat);
    addBox(pg, 0.4, 5, P * 2, POOL_X - P, -2, 0, tileWallMat);
    addBox(pg, 0.4, 5, P * 2, POOL_X + P, -2, 0, tileWallMat);
    for (let x = -24; x <= 24; x += 8) {
      for (let z = -24; z <= 24; z += 8) {
        if ((x + z) % 16 === 0 && Math.abs(x) < 12 && Math.abs(z) < 12) continue;
        addBox(pg, 0.9, 5, 0.9, POOL_X + x, -1, z, tileWallMat);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        panel.rotation.x = Math.PI / 2;
        panel.position.set(POOL_X + x + 4, 4.98, z + 4);
        pool.add(panel);
      }
    }
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: timeUniform },
      vertexShader: "varying vec2 vUv; uniform float uTime; void main(){ vUv = uv; vec3 p = position; p.z += sin(uv.x*40.0+uTime*1.4)*0.03 + cos(uv.y*36.0+uTime)*0.03; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }",
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        void main(){ vec2 p = floor(vUv*160.0)/160.0*24.0;
          float c = sin(p.x*2.1+uTime*1.3)+sin(p.y*2.7-uTime*1.1)+sin((p.x+p.y)*1.7+uTime*0.7);
          c = floor((c*0.5+0.5)*4.0)/4.0;
          vec3 base = vec3(0.45,0.82,0.86); vec3 hi = vec3(0.92,1.0,1.0);
          gl_FragColor = vec4(mix(base, hi, smoothstep(0.55,1.0,c)), 0.72); }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 40, 60, 60), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(POOL_X, 0.35, 0);
    pool.add(water);
    const poolLight = new THREE.HemisphereLight(0xffffff, 0xbfe9ee, 3);
    pool.add(poolLight);
    const backDoor = new THREE.Group();
    const bdPanel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3, 0.3), new THREE.MeshLambertMaterial({ color: 0x1c4f91 }));
    bdPanel.position.y = 1.5;
    const bdSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), new THREE.MeshBasicMaterial({ map: textTexture("DESPERTAR") }));
    bdSign.position.set(0, 3.4, 0.2);
    backDoor.add(bdPanel, bdSign);
    backDoor.position.set(POOL_X, 0, -P + 0.4);
    pool.add(backDoor);
    interactables.push({ pos: new THREE.Vector3(POOL_X, 1.4, -P + 1), kind: "return" });

    // ---------- flashlight ----------
    const flashlight = new THREE.SpotLight(0xfff6d0, 0, 28, 0.5, 0.5, 1);
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight.target);
    scene.add(camera);

    // ---------- sandbox objects ----------
    const spawned: THREE.Object3D[] = [];
    const spawnAhead = (kind: string) => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const p = camera.position.clone().addScaledVector(dir, 4);
      let obj: THREE.Object3D;
      if (kind === "eye") {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, transparent: true, alphaTest: 0.2 }));
        obj.scale.set(2.4, 1.5, 1);
      } else if (kind === "flower") {
        obj = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), flowerMat);
      } else {
        const hue = Math.random();
        obj = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.6, 0.6) }));
        boxes.push({ minX: p.x - 0.5, maxX: p.x + 0.5, minZ: p.z - 0.5, maxZ: p.z + 0.5, minY: p.y - 0.5, maxY: p.y + 0.5 });
      }
      obj.position.copy(p);
      scene.add(obj);
      spawned.push(obj);
    };

    // ---------- remote avatars ----------
    const avatars = new Map<string, THREE.Group>();
    const makeAvatar = (color: string, face: string, name: string) => {
      const a = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1, 0.4), new THREE.MeshLambertMaterial({ color }));
      body.position.y = 0.9;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.65, 0.65), new THREE.MeshLambertMaterial({ color: 0xe6dcc0 }));
      head.position.y = 1.75;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshBasicMaterial({ map: textTexture(face, "#7dffa0", "#062010") }));
      screen.position.set(0, 1.75, 0.33);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(name.slice(0, 12)) }));
      tag.scale.set(1.6, 0.4, 1);
      tag.position.y = 2.5;
      a.add(body, head, screen, tag);
      scene.add(a);
      return a;
    };

    // ---------- player state ----------
    const keys = new Set<string>();
    const mobile = { forward: false, back: false, left: false, right: false };
    let yaw = 0;
    let pitch = 0;
    let vy = 0;
    let fly = false;
    let level: "jardin" | "poolrooms" = "jardin";
    let collected = 0;
    let lastDialogue = -10;
    let gameTime = 0;
    let nextExit = EXIT_EVERY;
    let exitUntil = -1;
    let lastTimerEmit = -1;
    let lastPrompt: string | null = null;
    let lastGlare = 0;
    let lastPose = 0;
    camera.position.set(0, terrainHeight(0, 6) + 1.7, 6);

    const setLevel = (next: "jardin" | "poolrooms") => {
      level = next;
      outdoor.visible = next === "jardin";
      pool.visible = next === "poolrooms";
      exitDoor.visible = false;
      exitUntil = -1;
      if (next === "poolrooms") {
        (scene.background as THREE.Color).set(0xe8f6f6);
        (scene.fog as THREE.Fog).color.set(0xe8f6f6);
        (scene.fog as THREE.Fog).near = 6;
        (scene.fog as THREE.Fog).far = 48;
        camera.position.set(POOL_X, 1.7, P - 4);
        yaw = 0;
        emit({ type: "dialogue", speaker: "???", text: "el agua está tibia. nadie limpió esto en años." });
      } else {
        (scene.background as THREE.Color).copy(skyColor);
        (scene.fog as THREE.Fog).color.copy(skyColor);
        (scene.fog as THREE.Fog).near = 20;
        (scene.fog as THREE.Fog).far = 120;
        camera.position.set(0, terrainHeight(0, 6) + 1.7, 6);
        emit({ type: "dialogue", speaker: "WINDOWS", text: "volviste al jardín. el pasto siguió creciendo sin vos." });
      }
      emit({ type: "level", name: next });
    };

    const floorAt = (x: number, z: number) => {
      if (level === "poolrooms") return Math.abs(x - POOL_X) < 20 && Math.abs(z) < 20 ? -0.6 : 0;
      const h = insideHouse(x, z);
      return h ? h.floorY : terrainHeight(x, z);
    };

    const interact = () => {
      const list = [...interactables];
      if (exitDoor.visible) list.push(exitInteract);
      let best: Interactable | null = null;
      let bestD = 2.2;
      for (const it of list) {
        if (it.used) continue;
        const d = it.pos.distanceTo(camera.position);
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
      return best;
    };

    const useInteract = () => {
      const it = interact();
      if (!it) return;
      if (it.kind === "loot" && it.item) {
        it.used = true;
        if (it.mesh) it.mesh.visible = false;
        emit({ type: "loot", item: it.item });
        emit({ type: "dialogue", speaker: "INVENTARIO", text: `Descomprimiendo ${it.item}.zip... listo.` });
      } else if (it.kind === "fridge") {
        emit({ type: "loot", item: "huevo crudo" });
        emit({ type: "dialogue", speaker: "HELADERA", text: "hay un huevo. está frío como un domingo." });
      } else if (it.kind === "stove") {
        if (inventoryRef.current.includes("huevo crudo")) {
          emit({ type: "consume", item: "huevo crudo" });
          emit({ type: "loot", item: "huevo frito" });
          emit({ type: "dialogue", speaker: "COCINA", text: "chhhh... el huevo frito huele a tu abuela." });
        } else emit({ type: "dialogue", speaker: "COCINA", text: "la hornalla prende. necesitás algo para cocinar (mirá la heladera)." });
      } else if (it.kind === "bed") {
        emit({ type: "dialogue", speaker: "CAMA", text: "te acostás un segundo. soñás que estás despierto." });
      } else if (it.kind === "exit") {
        setLevel("poolrooms");
      } else if (it.kind === "return") {
        setLevel("jardin");
      }
    };

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = Math.max(width / Math.max(height, 1), 0.5);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const k = event.key.toLowerCase();
      keys.add(k);
      if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) event.preventDefault();
      if (k === "e") useInteract();
      if (k === "f") {
        if (inventoryRef.current.includes("linterna")) flashlight.intensity = flashlight.intensity ? 0 : 40;
        else emit({ type: "dialogue", speaker: "SISTEMA", text: "no tenés linterna. buscá en las habitaciones." });
      }
      if (sandboxRef.current) {
        if (k === "b") spawnAhead("cube");
        if (k === "g") fly = !fly;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= event.movementX * 0.0022;
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0018, -1.2, 1.2);
    };
    let drag: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") renderer.domElement.requestPointerLock?.();
      else drag = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      yaw -= (e.clientX - drag.x) * 0.005;
      pitch = THREE.MathUtils.clamp(pitch - (e.clientY - drag.y) * 0.004, -1.2, 1.2);
      drag = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = () => {
      drag = null;
    };
    const onCmd = (e: Event) => {
      const detail = (e as CustomEvent<{ cmd: string; kind?: string }>).detail;
      if (detail.cmd === "interact") {
        useInteract();
        return;
      }
      if (!sandboxRef.current) return;
      if (detail.cmd === "spawn") spawnAhead(detail.kind ?? "cube");
      if (detail.cmd === "fly") fly = !fly;
      if (detail.cmd === "pool") setLevel(level === "jardin" ? "poolrooms" : "jardin");
      if (detail.cmd === "exit") nextExit = gameTime + 0.1;
      if (detail.cmd === "clear") {
        spawned.forEach((o) => scene.remove(o));
        spawned.length = 0;
      }
    };
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("dream-cmd", onCmd);
    document.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const controls = mount.querySelectorAll<HTMLButtonElement>("[data-move]");
    controls.forEach((button) => {
      const dirName = button.dataset["move"];
      const set = (v: boolean) => {
        if (dirName === "forward" || dirName === "back" || dirName === "left" || dirName === "right") mobile[dirName] = v;
        if (v && dirName === "use") useInteract();
      };
      button.onpointerdown = () => set(true);
      button.onpointerup = () => set(false);
      button.onpointerleave = () => set(false);
    });

    const forwardV = new THREE.Vector3();
    const rightV = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const clock = new THREE.Clock();
    let frame = 0;

    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;
      gameTime += delta;
      timeUniform.value = reducedMotion ? 0 : time;

      // ---- movement (camera-relative, fixes W drifting) ----
      const fwd = Number(keys.has("w") || keys.has("arrowup") || mobile.forward) - Number(keys.has("s") || keys.has("arrowdown") || mobile.back);
      const str = Number(keys.has("d") || keys.has("arrowright") || mobile.right) - Number(keys.has("a") || keys.has("arrowleft") || mobile.left);
      forwardV.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      rightV.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const speed = (keys.has("shift") && !fly ? 9 : 5.5) * delta;
      const move = new THREE.Vector3().addScaledVector(forwardV, fwd).addScaledVector(rightV, str);
      if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * (fly ? 2 : 1));
      const nx = camera.position.x + move.x;
      const nz = camera.position.z + move.z;
      const feet = camera.position.y - 1.6;
      const blocked = (x: number, z: number) => boxes.some((b) => feet + 0.35 < b.maxY && feet + 1.7 > b.minY && x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3);
      if (!blocked(nx, camera.position.z)) camera.position.x = nx;
      if (!blocked(camera.position.x, nz)) camera.position.z = nz;
      if (level === "jardin") {
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -135, 135);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -135, 135);
      } else {
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, POOL_X - P + 0.6, POOL_X + P - 0.6);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -P + 0.6, P - 0.6);
      }
      const floorY = floorAt(camera.position.x, camera.position.z) + 1.6;
      if (fly) {
        const vert = Number(keys.has(" ")) - Number(keys.has("shift"));
        camera.position.y = Math.max(floorY, camera.position.y + vert * delta * 8);
      } else {
        if (keys.has(" ") && camera.position.y <= floorY + 0.01) vy = 5;
        vy -= 14 * delta;
        camera.position.y += vy * delta;
        if (camera.position.y < floorY) {
          camera.position.y = THREE.MathUtils.lerp(camera.position.y, floorY, 0.5);
          if (camera.position.y < floorY - 0.4) camera.position.y = floorY;
          vy = 0;
        }
      }
      const bob = move.lengthSq() > 0 && !fly ? Math.sin(time * 10) * 0.03 : 0;
      camera.rotation.set(pitch, yaw, 0);
      camera.position.y += bob;
      camera.updateMatrixWorld();

      // ---- world animation ----
      if (level === "jardin") {
        sun.position.copy(camera.position).addScaledVector(sunDir, 250);
        sun.lookAt(camera.position);
        camera.getWorldDirection(camDir);
        const look = THREE.MathUtils.clamp((camDir.dot(sunDir) - 0.85) / 0.15, 0, 1);
        sunMat.uniforms["uLook"]!.value = look;
        if (Math.abs(look - lastGlare) > 0.06) {
          lastGlare = look;
          emit({ type: "glare", value: look });
        }
        eyes.forEach((npc, index) => {
          npc.sprite.position.y = npc.origin.y + Math.sin(time * 0.9 + npc.phase) * 0.8;
          npc.sprite.position.x = npc.origin.x + Math.cos(time * 0.3 + npc.phase) * 3;
          npc.sprite.position.z = npc.origin.z + Math.sin(time * 0.25 + npc.phase) * 3;
          const flap = 1 + Math.sin(time * 9 + npc.phase) * 0.14;
          npc.sprite.scale.set(npc.base * 1.6 * flap, npc.base * (2 - flap * 0.9 + 0.0), 1);
          if (npc.sprite.position.distanceTo(camera.position) < 5 && time - lastDialogue > 5) {
            lastDialogue = time;
            emit({ type: "dialogue", speaker: `OJO_${String(index + 1).padStart(2, "0")}`, text: eyeLines[index % eyeLines.length] ?? "..." });
          }
        });
        watchers.forEach((w) => w.lookAt(camera.position.x, w.position.y, camera.position.z));
        swings.forEach((s) => {
          s.rotation.x = Math.sin(time * 1.6 + (s.userData["phase"] as number)) * 0.55;
        });
        signals.forEach((signal, index) => {
          if (!signal.visible) return;
          signal.rotation.y = time * 1.5 + index;
          signal.position.y = (signal.userData["baseY"] as number) + Math.sin(time * 2 + index) * 0.25;
          if (signal.position.distanceTo(camera.position) < 2.4) {
            signal.visible = false;
            collected += 1;
            emit({ type: "signal", count: collected });
            emit({ type: "dialogue", speaker: "SISTEMA", text: `señal recuperada ${collected}/5` });
            if (collected === signals.length) emit({ type: "complete" });
          }
        });

        // ---- EXIT door schedule ----
        if (gameTime >= EXIT_FORCE) setLevel("poolrooms");
        if (exitUntil < 0 && gameTime >= nextExit) {
          const p = camera.position.clone().addScaledVector(forwardV, 9);
          const ex = insideHouse(p.x, p.z) ? camera.position.clone().addScaledVector(forwardV, -6) : p;
          exitDoor.position.set(ex.x, floorAt(ex.x, ex.z), ex.z);
          exitDoor.lookAt(camera.position.x, exitDoor.position.y, camera.position.z);
          exitDoor.visible = true;
          exitUntil = gameTime + EXIT_VISIBLE;
          nextExit += EXIT_EVERY;
          emit({ type: "exit", visible: true });
          emit({ type: "dialogue", speaker: "???", text: "una puerta EXIT apareció. tenés diez segundos." });
        }
        if (exitUntil > 0) {
          exitPanel.material.emissiveIntensity = 0.5 + Math.sin(time * 12) * 0.5;
          if (exitDoor.position.distanceTo(camera.position) < 2.6) setLevel("poolrooms");
          else if (gameTime > exitUntil) {
            exitDoor.visible = false;
            exitUntil = -1;
            emit({ type: "exit", visible: false });
          }
        }
        if (Math.floor(gameTime) !== lastTimerEmit) {
          lastTimerEmit = Math.floor(gameTime);
          emit({ type: "timer", seconds: Math.max(0, Math.ceil(nextExit - gameTime)) });
        }
      }

      interactables.forEach((it) => {
        if (it.kind === "loot" && it.mesh && it.mesh.visible) {
          it.mesh.rotation.y = time * 2;
          it.mesh.position.y = (it.mesh.userData["baseY"] as number) + Math.sin(time * 3) * 0.06;
        }
      });

      const near = interact();
      const prompt = near ? (near.kind === "loot" ? `[E] tomar ${near.item}` : near.kind === "stove" ? "[E] cocinar" : near.kind === "fridge" ? "[E] abrir heladera" : near.kind === "bed" ? "[E] acostarse" : near.kind === "exit" ? "[E] EXIT" : "[E] despertar") : null;
      if (prompt !== lastPrompt) {
        lastPrompt = prompt;
        emit({ type: "prompt", text: prompt });
      }

      // ---- network ----
      if (poseRef.current && time - lastPose > 0.125) {
        lastPose = time;
        poseRef.current({ x: camera.position.x, y: camera.position.y - 1.6, z: camera.position.z, yaw, level });
      }
      if (remoteRef) {
        const now = Date.now();
        remoteRef.current.forEach((p, id) => {
          let a = avatars.get(id);
          if (!a) {
            a = makeAvatar(p.color, p.face, p.name);
            avatars.set(id, a);
          }
          a.visible = p.level === level && now - p.t < 8000;
          const k = 1 - Math.exp(-12 * delta);
          a.position.lerp(v3.set(p.x, p.y, p.z), k);
          a.rotation.y = p.yaw;
        });
        avatars.forEach((a, id) => {
          if (!remoteRef.current.has(id)) {
            scene.remove(a);
            avatars.delete(id);
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("dream-cmd", onCmd);
      document.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: THREE.Material) => {
            const map = "map" in material ? (material as THREE.MeshBasicMaterial).map : null;
            if (map instanceof THREE.Texture) map.dispose();
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [active, inventoryRef, remoteRef]);

  return (
    <div ref={mountRef} className="dream-world" aria-label="Mundo dreamcore tridimensional">
      <div className="dream-crosshair" aria-hidden="true">+</div>
      <div className="mobile-pad" aria-label="Controles de movimiento">
        <button type="button" data-move="forward" aria-label="Avanzar">▲</button>
        <button type="button" data-move="left" aria-label="Izquierda">◀</button>
        <button type="button" data-move="back" aria-label="Retroceder">▼</button>
        <button type="button" data-move="right" aria-label="Derecha">▶</button>
        <button type="button" data-move="use" aria-label="Usar">E</button>
      </div>
    </div>
  );
}
