import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { CoverDesign } from "@ttokttok/shared/cover-design";

const WIDTH = 800;
const HEIGHT = 1200;

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context)
    throw new Error(
      "표지를 그릴 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.",
    );
  return { element, context };
}

// 한글·긴 어절을 글자 경계에서 나누고, 정해진 영역에 들어갈 때까지 축소한다.
function textBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  x: number,
  y: number,
  width: number,
  height: number,
  maxSize: number,
  centered = false,
) {
  let lines: string[] = [];
  let size = maxSize;
  for (; size >= 12; size -= 2) {
    ctx.font = `700 ${size}px ${font}`;
    lines = [];
    let line = "";
    for (const character of Array.from(text)) {
      if (ctx.measureText(line + character).width > width && line) {
        lines.push(line.trim());
        line = character;
      } else line += character;
    }
    if (line) lines.push(line.trim());
    if (lines.length * size * 1.4 <= height) break;
  }
  ctx.textAlign = centered ? "center" : "left";
  ctx.textBaseline = "top";
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * size * 1.4));
}

function coverTexture(
  design: CoverDesign,
  style: CSSStyleDeclaration,
  side: "front" | "spine" | "back" = "front",
) {
  const spine = side === "spine";
  const { element, context: ctx } = canvas(spine ? 180 : 800, 1200);
  const color = (part: string) =>
    style.getPropertyValue(`--book-cover-${design.palette}-${part}`).trim();
  const font = style.getPropertyValue("--font-sans").trim() || "sans-serif";
  ctx.fillStyle = color("base");
  ctx.fillRect(0, 0, element.width, element.height);
  ctx.fillStyle = color("ink");
  ctx.strokeStyle = color("accent");
  if (spine) {
    ctx.save();
    ctx.translate(90, 100);
    ctx.rotate(Math.PI / 2);
    textBlock(ctx, design.title, font, 0, -30, 970, 70, 42);
    ctx.restore();
  } else if (side === "back") {
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 48, 704, 1104);
    textBlock(ctx, design.title, font, 400, 380, 580, 420, 54, true);
    ctx.fillStyle = color("accent");
    ctx.fillRect(354, 900, 92, 3);
    ctx.fillStyle = color("ink");
    textBlock(ctx, design.author, font, 400, 980, 580, 120, 32, true);
  } else if (design.template === "classic") {
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, 704, 1104);
    ctx.lineWidth = 1;
    ctx.strokeRect(60, 60, 680, 1080);
    textBlock(ctx, design.title, font, 400, 240, 600, 500, 96, true);
    ctx.fillStyle = color("accent");
    ctx.fillRect(354, 840, 92, 4);
    ctx.fillStyle = color("ink");
    textBlock(ctx, design.author, font, 400, 910, 580, 160, 36, true);
  } else if (design.template === "modern") {
    ctx.fillStyle = color("ink");
    ctx.fillRect(0, 0, 800, 770);
    ctx.fillStyle = color("base");
    textBlock(ctx, design.title, font, 72, 110, 650, 560, 112);
    ctx.fillStyle = color("accent");
    ctx.fillRect(72, 835, 64, 10);
    ctx.fillStyle = color("ink");
    textBlock(ctx, design.author, font, 72, 910, 650, 180, 40);
  } else {
    ctx.fillStyle = color("accent");
    ctx.beginPath();
    ctx.arc(400, 340, 230, Math.PI, 0);
    ctx.lineTo(630, 1030);
    ctx.lineTo(170, 1030);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color("base");
    ctx.fillRect(0, 470, 800, 430);
    ctx.fillStyle = color("ink");
    textBlock(ctx, design.title, font, 400, 520, 640, 310, 86, true);
    textBlock(ctx, design.author, font, 400, 1080, 650, 90, 32, true);
  }
  // Fixed grain keeps exports identical when only the viewing angle changes.
  let seed = 317;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < (spine ? 1400 : 6400); i++) {
    ctx.globalAlpha = 0.018 + random() * 0.03;
    ctx.fillStyle = random() > 0.5 ? color("ink") : color("base");
    const size = 0.5 + random() * 2;
    ctx.fillRect(
      random() * element.width,
      random() * element.height,
      size,
      size,
    );
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createBookCoverRenderer(element: HTMLCanvasElement) {
  const context = element.getContext("webgl2", {
    alpha: true,
    antialias: true,
  });
  if (!context)
    throw new Error("이 브라우저에서는 3D 그래픽을 사용할 수 없습니다.");
  const renderer = new THREE.WebGLRenderer({
    canvas: element,
    context,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  // Keep the full book in frame, including side views and vertical tilts.
  const camera = new THREE.PerspectiveCamera(27, WIDTH / HEIGHT, 0.08, 80);
  camera.position.set(0, 0, 8.4);
  const style = getComputedStyle(element);
  const token = (name: string) =>
    style.getPropertyValue(`--book-cover-${name}`).trim();

  // Hardcover geometry and light/material values adapted from Mint (MIT).
  // Full attribution: docs/licenses/mint-complete-shelf.txt.
  const hemisphere = new THREE.HemisphereLight(
    token("light-sky"),
    token("light-ground"),
    2.4,
  );
  const key = new THREE.DirectionalLight(token("light-key"), 4.6);
  key.position.set(-4.2, 7.4, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -2,
    right: 2,
    top: 2,
    bottom: -2,
    near: 0.5,
    far: 22,
  });
  key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(token("light-rim"), 2.1);
  rim.position.set(5, 3, -4);
  const bounce = new THREE.PointLight(token("light-bounce"), 1.2, 10, 2);
  bounce.position.set(-3, 0.4, 3.2);
  scene.add(hemisphere, key, rim, bounce);
  const book = new THREE.Group();
  scene.add(book);
  const binding = new THREE.MeshPhysicalMaterial({
    roughness: 0.78,
    metalness: 0,
    sheen: 0.36,
    sheenRoughness: 0.82,
    clearcoat: 0.03,
    clearcoatRoughness: 0.7,
  });
  const front = new THREE.MeshPhysicalMaterial({
    roughness: 0.66,
    metalness: 0.02,
    clearcoat: 0.05,
    clearcoatRoughness: 0.48,
  });
  const back = new THREE.MeshStandardMaterial({ roughness: 0.72 });
  const spine = new THREE.MeshPhysicalMaterial({
    roughness: 0.68,
    metalness: 0.015,
  });
  const paper = new THREE.MeshStandardMaterial({
    color: token("paper"),
    roughness: 0.88,
  });
  const headband = new THREE.MeshPhysicalMaterial({
    roughness: 0.62,
    metalness: 0.2,
  });
  // 1 model unit = 100 mm; the reference hardcover is about 131 x 220 mm.
  const width = 1.31;
  const height = 2.2;
  const boardGeometry = new RoundedBoxGeometry(width, height, 0.034, 4, 0.025);
  const artworkGeometry = new THREE.PlaneGeometry(
    width - 0.065,
    height - 0.065,
  );
  const frontBoard = new THREE.Mesh(boardGeometry, binding);
  const backBoard = new THREE.Mesh(boardGeometry, binding);
  const frontSurface = new THREE.Mesh(artworkGeometry, front);
  const backSurface = new THREE.Mesh(artworkGeometry, back);
  backSurface.rotation.y = Math.PI;
  const pageBlock = new THREE.Mesh(new THREE.BufferGeometry(), paper);
  const spineBoard = new THREE.Mesh(new THREE.BufferGeometry(), binding);
  const spineSurface = new THREE.Mesh(new THREE.BufferGeometry(), spine);
  spineBoard.position.x = -width * 0.5 + 0.022;
  spineSurface.position.x = -width * 0.5 - 0.019;
  spineSurface.rotation.y = -Math.PI / 2;
  const headbandGeometry = new THREE.CylinderGeometry(
    0.017,
    0.017,
    width - 0.1,
    10,
  );
  headbandGeometry.rotateZ(Math.PI / 2);
  const headbandTop = new THREE.Mesh(headbandGeometry, headband);
  const headbandBottom = new THREE.Mesh(headbandGeometry, headband);
  headbandTop.position.y = height * 0.5 - 0.045;
  headbandBottom.position.y = -height * 0.5 + 0.045;
  [pageBlock, frontBoard, backBoard, spineBoard].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  book.add(
    pageBlock,
    frontBoard,
    backBoard,
    spineBoard,
    frontSurface,
    backSurface,
    spineSurface,
    headbandTop,
    headbandBottom,
  );
  let textureKey = "";
  let previousThickness = 0;
  const bounds = new THREE.Box3();
  const extent = new THREE.Vector3();

  function render(design: CoverDesign) {
    const nextTextureKey = JSON.stringify([
      design.template,
      design.palette,
      design.title,
      design.author,
    ]);
    if (textureKey !== nextTextureKey) {
      front.map?.dispose();
      back.map?.dispose();
      spine.map?.dispose();
      front.map = coverTexture(design, style);
      back.map = coverTexture(design, style, "back");
      spine.map = coverTexture(design, style, "spine");
      front.needsUpdate = back.needsUpdate = spine.needsUpdate = true;
      binding.color.set(token(`${design.palette}-base`));
      binding.sheenColor.set(token(`${design.palette}-ink`));
      headband.color.set(token(`${design.palette}-accent`));
      textureKey = nextTextureKey;
    }
    if (previousThickness !== design.thickness) {
      // The displayed thickness includes both cover boards.
      const depth = design.thickness / 100 - 0.034;
      pageBlock.geometry.dispose();
      spineBoard.geometry.dispose();
      spineSurface.geometry.dispose();
      pageBlock.geometry = new RoundedBoxGeometry(
        width - 0.075,
        height - 0.105,
        Math.max(0.025, depth - 0.052),
        3,
        0.012,
      );
      spineBoard.geometry = new RoundedBoxGeometry(
        0.055,
        height - 0.01,
        depth + 0.012,
        3,
        0.018,
      );
      spineSurface.geometry = new THREE.PlaneGeometry(
        depth - 0.02,
        height - 0.04,
      );
      frontBoard.position.z = depth * 0.5;
      backBoard.position.z = -depth * 0.5;
      frontSurface.position.z = depth * 0.5 + 0.019;
      backSurface.position.z = -depth * 0.5 - 0.019;
      previousThickness = design.thickness;
    }
    book.rotation.set(
      THREE.MathUtils.degToRad(design.tilt),
      THREE.MathUtils.degToRad(design.angle),
      0,
      "YXZ",
    );
    bounds.setFromObject(book).getSize(extent);
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.z = Math.max(
      5.8,
      (Math.max(extent.y, extent.x / camera.aspect) / (2 * halfFov)) * 1.12 +
        extent.z / 2,
    );
    renderer.render(scene, camera);
  }

  return {
    render,
    async exportImage(design: CoverDesign) {
      render(design); // WebGL은 다음 프레임 전에 비워질 수 있어 캡처 직전에 그린다.
      return new Promise<Blob>((resolve, reject) => {
        element.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(
                  new Error("이미지를 만들지 못했습니다. 다시 시도해 주세요."),
                ),
          "image/png",
        );
      });
    },
    dispose() {
      front.map?.dispose();
      back.map?.dispose();
      spine.map?.dispose();
      [paper, front, back, spine, binding, headband].forEach((material) =>
        material.dispose(),
      );
      [
        boardGeometry,
        artworkGeometry,
        headbandGeometry,
        pageBlock.geometry,
        spineBoard.geometry,
        spineSurface.geometry,
      ].forEach((geometry) => geometry.dispose());
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
