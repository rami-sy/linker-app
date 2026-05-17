import * as THREE from "three";
import {
  REGION_SIZE,
  STARS_COUNT,
  TOTAL_STARS,
  WORLD_SIZE,
} from "../../../constants/game.constants";
import seedrandom from "seedrandom";

export const populateStarsInRegion = (scene, rng, currentRegion) => {
  const STAR_COLORS = [
    0xf6f8f9, 0xaaaaaa, 0x888888, 0x444444, 0x222222, 0x242889, 0xffa500,
  ];

  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const sizes = [];

  let starColor;

  for (let i = 0; i < TOTAL_STARS; i++) {
    starColor = new THREE.Color(STAR_COLORS[i % STAR_COLORS.length]);

    // استخدام الجذر التربيعي لتحقيق توزيع أكثر كثافة في المركز
    const radius = Math.sqrt(rng()) * (REGION_SIZE / 2);
    const theta = rng() * 2 * Math.PI;
    const phi = Math.acos(2 * rng() - 1);

    const x =
      currentRegion.start.x +
      REGION_SIZE / 2 +
      radius * Math.sin(phi) * Math.cos(theta);
    const y =
      currentRegion.start.y +
      REGION_SIZE / 2 +
      radius * Math.sin(phi) * Math.sin(theta);
    const z = currentRegion.start.z + REGION_SIZE / 2 + radius * Math.cos(phi);

    positions.push(x, y, z);
    colors.push(starColor.r, starColor.g, starColor.b);

    sizes.push(0.1 + (0.6 * (REGION_SIZE / 2 - radius)) / (REGION_SIZE / 2));
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

  const starsMaterial = new THREE.PointsMaterial({
    sizeAttenuation: true,
    vertexColors: true,
  });

  const stars = new THREE.Points(geometry, starsMaterial);
  scene.add(stars);
};

export const createStars = (scene, starPosition, bigStarsRefs) => {
  // النجم في المركز
  const centralStarSize = 50;
  const centralStarColor = 0xffa500;
  const centralStarGeometry = new THREE.SphereGeometry(centralStarSize, 16, 16);
  const centralStarMaterial = new THREE.MeshBasicMaterial({
    color: centralStarColor,
  });
  const centralStar = new THREE.Mesh(centralStarGeometry, centralStarMaterial);
  centralStar.position.copy(starPosition);
  scene.add(centralStar);

  // النجوم الكبيرة الأخرى
  const rng = seedrandom("a different seed value");
  for (let i = 0; i < STARS_COUNT; i++) {
    const bigStarSize = 10;
    const bigStarColor = 0xffd700;
    const bigStarGeometry = new THREE.SphereGeometry(bigStarSize, 16, 16);
    const bigStarMaterial = new THREE.MeshBasicMaterial({
      color: bigStarColor,
    });
    const bigStar = new THREE.Mesh(bigStarGeometry, bigStarMaterial);
    const radius = Math.sqrt(rng()) * WORLD_SIZE;
    const theta = rng() * 2 * Math.PI;
    const phi = Math.acos(2 * rng() - 1);
    bigStar.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );
    scene.add(bigStar);
    bigStarsRefs.current.push(bigStar);
  }
};
