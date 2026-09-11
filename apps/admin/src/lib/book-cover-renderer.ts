import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { CoverDesign, CoverFace } from "@ttokttok/shared/cover-design";
import { deriveCoverColors } from "@ttokttok/shared/cover-colors";

const WIDTH = 800;
const HEIGHT = 1200;

/** 면별로 디코드된 이미지. 편집기가 만들고 소유한다 (cover-face-image.ts). */
export type CoverBitmaps = Partial<Record<CoverFace, ImageBitmap>>;

/** 텍스처 3장·판·머리띠가 함께 읽는 색. 전부 CSS 색 문자열. */
export type CoverColors = { base: string; ink: string; accent: string };

// 1 model unit = 100 mm; the reference hardcover is about 131 x 220 mm.
const BOOK_WIDTH = 1.31;
const BOOK_HEIGHT = 2.2;
// 앞·뒤 그림면은 판보다 3.25mm씩 안쪽이다. 책등 그림면은 두께에 따른다.
const ARTWORK_WIDTH = BOOK_WIDTH - 0.065;
const ARTWORK_HEIGHT = BOOK_HEIGHT - 0.065;
/** 표시 두께(mm)에서 판 두 장을 뺀 속 두께. */
const innerDepth = (thickness: number) => thickness / 100 - 0.034;
const spineArtworkWidth = (thickness: number) => innerDepth(thickness) - 0.02;
const SPINE_ARTWORK_HEIGHT = BOOK_HEIGHT - 0.04;

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

/**
 * 그림면 비율로 중앙을 잘라 캔버스를 채운다.
 *
 * 텍스처 캔버스(800×1200)는 그림면(124.5×213.5mm)보다 넓어서 붙을 때
 * 가로로 약 12% 눌린다 — 글자는 티가 안 나지만 사진은 난다. 그래서
 * 잘라낼 영역을 캔버스가 아니라 **그림면** 비율로 잡는다: 캔버스에
 * 넣을 때 한 번 늘어나고 그림면에 붙을 때 되돌아와 원본 비율이 된다.
 */
function drawCropped(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  planeAspect: number,
) {
  const sourceAspect = bitmap.width / bitmap.height;
  const sh = sourceAspect > planeAspect ? bitmap.height : bitmap.width / planeAspect;
  const sw = sh * planeAspect;
  ctx.drawImage(
    bitmap,
    (bitmap.width - sw) / 2,
    (bitmap.height - sh) / 2,
    sw,
    sh,
    0,
    0,
    width,
    height,
  );
}

/**
 * 이미지 템플릿의 이음새 색 — 앞표지에서 **실제로 보이는 크롭**의 바깥
 * 테두리에서 뽑는다. 원본 전체의 테두리를 쓰면 잘려 나간 부분의 색이
 * 섞여 그림면과 판이 맞닿는 자리에서 어긋난다.
 */
function imageColors(front: ImageBitmap, style: CSSStyleDeclaration): CoverColors {
  const { context } = canvas(64, 110);
  drawCropped(context, front, 64, 110, ARTWORK_WIDTH / ARTWORK_HEIGHT);
  const { data } = context.getImageData(0, 0, 64, 110);
  const derived = deriveCoverColors(data, 64, 110);
  return {
    base: derived.base,
    ink: style.getPropertyValue(`--book-cover-image-ink-${derived.ink}`).trim(),
    accent: derived.accent,
  };
}

function coverTexture(
  design: CoverDesign,
  style: CSSStyleDeclaration,
  colors: CoverColors,
  side: CoverFace,
  image?: ImageBitmap,
) {
  const spine = side === "spine";
  const { element, context: ctx } = canvas(spine ? 180 : 800, 1200);
  const font = style.getPropertyValue("--font-sans").trim() || "sans-serif";
  if (image) {
    // 이미지는 완성된 제작물이다 — 글자·테두리·질감을 얹지 않는다.
    drawCropped(
      ctx,
      image,
      element.width,
      element.height,
      spine
        ? spineArtworkWidth(design.thickness) / SPINE_ARTWORK_HEIGHT
        : ARTWORK_WIDTH / ARTWORK_HEIGHT,
    );
  } else {
    ctx.fillStyle = colors.base;
    ctx.fillRect(0, 0, element.width, element.height);
    ctx.fillStyle = colors.ink;
    ctx.strokeStyle = colors.accent;
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
      ctx.fillStyle = colors.accent;
      ctx.fillRect(354, 900, 92, 3);
      ctx.fillStyle = colors.ink;
      textBlock(ctx, design.author, font, 400, 980, 580, 120, 32, true);
    } else if (design.template === "classic") {
      ctx.lineWidth = 3;
      ctx.strokeRect(48, 48, 704, 1104);
      ctx.lineWidth = 1;
      ctx.strokeRect(60, 60, 680, 1080);
      textBlock(ctx, design.title, font, 400, 240, 600, 500, 96, true);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(354, 840, 92, 4);
      ctx.fillStyle = colors.ink;
      textBlock(ctx, design.author, font, 400, 910, 580, 160, 36, true);
    } else if (design.template === "modern") {
      ctx.fillStyle = colors.ink;
      ctx.fillRect(0, 0, 800, 770);
      ctx.fillStyle = colors.base;
      textBlock(ctx, design.title, font, 72, 110, 650, 560, 112);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(72, 835, 64, 10);
      ctx.fillStyle = colors.ink;
      textBlock(ctx, design.author, font, 72, 910, 650, 180, 40);
    } else {
      // 문학 — 그리고 앞표지 이미지가 아직 준비되지 않은 이미지 템플릿도
      // 여기로 온다 (앞표지는 필수라 저장까지는 가지 않는다).
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(400, 340, 230, Math.PI, 0);
      ctx.lineTo(630, 1030);
      ctx.lineTo(170, 1030);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = colors.base;
      ctx.fillRect(0, 470, 800, 430);
      ctx.fillStyle = colors.ink;
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
      ctx.fillStyle = random() > 0.5 ? colors.ink : colors.base;
      const size = 0.5 + random() * 2;
      ctx.fillRect(
        random() * element.width,
        random() * element.height,
        size,
        size,
      );
    }
    ctx.globalAlpha = 1;
  }
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
  const width = BOOK_WIDTH;
  const height = BOOK_HEIGHT;
  const boardGeometry = new RoundedBoxGeometry(width, height, 0.034, 4, 0.025);
  const artworkGeometry = new THREE.PlaneGeometry(
    ARTWORK_WIDTH,
    ARTWORK_HEIGHT,
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
  let colors: CoverColors = { base: "", ink: "", accent: "" };
  const bounds = new THREE.Box3();
  const extent = new THREE.Vector3();
  // 비트맵에는 이름이 없다 — 같은 면에 다른 이미지가 와도 키가 바뀌도록 번호를 붙인다.
  const bitmapIds = new WeakMap<ImageBitmap, number>();
  let nextBitmapId = 1;
  const bitmapId = (bitmap?: ImageBitmap) => {
    if (!bitmap) return 0;
    const known = bitmapIds.get(bitmap);
    if (known) return known;
    bitmapIds.set(bitmap, nextBitmapId);
    return nextBitmapId++;
  };

  /**
   * 색을 정하는 곳은 여기 하나다. 그린 템플릿은 팔레트 토큰, 이미지
   * 템플릿은 앞표지 픽셀 — 어느 쪽이든 텍스처 3장과 판·광택·머리띠가
   * 같은 객체를 읽어 이음새 색이 한 값에서 나온다.
   */
  function resolveColors(design: CoverDesign, images: CoverBitmaps): CoverColors {
    if (design.template === "image" && images.front)
      return imageColors(images.front, style);
    return {
      base: token(`${design.palette}-base`),
      ink: token(`${design.palette}-ink`),
      accent: token(`${design.palette}-accent`),
    };
  }

  function render(design: CoverDesign, images: CoverBitmaps = {}) {
    const image = design.template === "image";
    const nextTextureKey = JSON.stringify([
      design.template,
      design.palette,
      design.title,
      design.author,
      // 이미지 템플릿은 면별 비트맵과 두께 — 책등 그림면 비율이 두께를
      // 따르므로 책등 이미지를 다시 잘라야 한다.
      image
        ? [
            bitmapId(images.front),
            bitmapId(images.spine),
            bitmapId(images.back),
            design.thickness,
          ]
        : null,
    ]);
    if (textureKey !== nextTextureKey) {
      colors = resolveColors(design, images);
      front.map?.dispose();
      back.map?.dispose();
      spine.map?.dispose();
      const faceImage = (face: CoverFace) => (image ? images[face] : undefined);
      front.map = coverTexture(design, style, colors, "front", faceImage("front"));
      back.map = coverTexture(design, style, colors, "back", faceImage("back"));
      spine.map = coverTexture(design, style, colors, "spine", faceImage("spine"));
      front.needsUpdate = back.needsUpdate = spine.needsUpdate = true;
      binding.color.set(colors.base);
      binding.sheenColor.set(colors.ink);
      headband.color.set(colors.accent);
      textureKey = nextTextureKey;
    }
    if (previousThickness !== design.thickness) {
      // The displayed thickness includes both cover boards.
      const depth = innerDepth(design.thickness);
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
        spineArtworkWidth(design.thickness),
        SPINE_ARTWORK_HEIGHT,
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
    return colors;
  }

  return {
    render,
    async exportImage(design: CoverDesign, images: CoverBitmaps = {}) {
      render(design, images); // WebGL은 다음 프레임 전에 비워질 수 있어 캡처 직전에 그린다.
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
