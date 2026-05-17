import {
  GRAVITY_CONSTANT,
  GRAVITY_RADIUS,
  PLAYER_MASS,
  STAR_MASS,
} from "../../../constants/game.constants";

export const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

export const calculateGravityForce = (
  objectPosition,
  starPosition,
  bigStarsRefs
) => {
  let totalGravityForce = new THREE.Vector3(0, 0, 0);

  // جاذبية الشمس
  const distanceToSun = objectPosition.distanceTo(starPosition);
  if (distanceToSun <= GRAVITY_RADIUS && distanceToSun >= 0.1) {
    const gravityDirectionSun = starPosition
      .clone()
      .sub(objectPosition)
      .normalize();
    const gravityMagnitudeSun =
      (GRAVITY_CONSTANT * STAR_MASS * PLAYER_MASS) /
      (distanceToSun * distanceToSun);
    totalGravityForce.add(
      gravityDirectionSun.multiplyScalar(gravityMagnitudeSun)
    );
  }

  // جاذبية النجوم الكبيرة
  for (let bigStar of bigStarsRefs.current) {
    const distanceToBigStar = objectPosition.distanceTo(bigStar.position);
    if (distanceToBigStar < 0.1) continue;

    const gravityDirectionStar = bigStar.position
      .clone()
      .sub(objectPosition)
      .normalize();
    const gravityMagnitudeStar =
      (GRAVITY_CONSTANT * STAR_MASS * PLAYER_MASS) /
      (distanceToBigStar * distanceToBigStar);
    const forceForThisStar = gravityDirectionStar.multiplyScalar(
      gravityMagnitudeStar * 0.1
    );
    totalGravityForce.add(forceForThisStar);
  }

  return totalGravityForce;
};
