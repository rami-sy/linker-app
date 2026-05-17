import {
  CAMERA_POSITION_Z,
  GRAVITY_CONSTANT,
  GRAVITY_RADIUS,
  LERP_AMOUNT,
  PLAYER_MASS,
  STAR_MASS,
} from "../../../constants/game.constants";
import { calculateGravityForce } from "./helpers";

export const createCamera = (gl) => {
  const camera = new THREE.PerspectiveCamera(
    75,
    gl.drawingBufferWidth / gl.drawingBufferHeight,
    0.1,
    1000
  );
  camera.position.z = CAMERA_POSITION_Z;
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  return camera;
};

const updateFrustum = (camera, frustum, projectionMatrix) => {
  projectionMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(projectionMatrix);
};

export const isObjectInView = (camera, object, frustum, projectionMatrix) => {
  updateFrustum(camera, frustum, projectionMatrix);
  return frustum.intersectsObject(object);
};

export const updatePlayerAndCameraPosition = (
  playerSphereRef,
  setPlayerCoords,
  setCurrentRegion,
  getCurrentRegion,
  directionRef,
  currentHorizontalRotation,
  targetHorizontalRotation,
  currentVerticalRotation,
  targetVerticalRotation,
  playerVelocity,
  playerSpeed,
  starPosition,
  bigStarsRefs,
  setSpeed,
  cameraRef
) => {
  const { x, y, z } = playerSphereRef.current.position;
  setPlayerCoords({
    x: parseFloat(x.toFixed(2)),
    y: parseFloat(y.toFixed(2)),
    z: parseFloat(z.toFixed(2)),
  });

  setCurrentRegion(getCurrentRegion({ x, y, z }));

  currentHorizontalRotation.current = THREE.MathUtils.lerp(
    currentHorizontalRotation.current,
    targetHorizontalRotation.current,
    LERP_AMOUNT
  );
  currentVerticalRotation.current = THREE.MathUtils.lerp(
    currentVerticalRotation.current,
    targetVerticalRotation.current,
    LERP_AMOUNT
  );

  directionRef.current = new THREE.Vector3(0, 0, -1)
    .applyEuler(
      new THREE.Euler(
        currentVerticalRotation.current,
        currentHorizontalRotation.current,
        0,
        "YXZ"
      )
    )
    .normalize();

  playerVelocity.current = directionRef.current.multiplyScalar(
    playerSpeed.current
  );
  const gravityForce = calculateGravityForce(
    playerSphereRef.current.position,
    starPosition,
    bigStarsRefs,
    GRAVITY_RADIUS,
    GRAVITY_CONSTANT,
    STAR_MASS,
    PLAYER_MASS
  );
  const acceleration = gravityForce.divideScalar(PLAYER_MASS);
  playerVelocity.current.add(acceleration);
  playerSphereRef.current.position.add(playerVelocity.current);

  // تحديث سرعة اللاعب في حالة الجذب:
  if (!gravityForce.equals(new THREE.Vector3(0, 0, 0))) {
    setSpeed(playerVelocity.current.length());
  }

  const cameraOffset = new THREE.Vector3(0, 0, 5).applyEuler(
    new THREE.Euler(
      currentVerticalRotation.current,
      currentHorizontalRotation.current,
      0,
      "YXZ"
    )
  );
  cameraRef.current.position
    .copy(playerSphereRef.current.position)
    .add(cameraOffset);
  cameraRef.current.lookAt(playerSphereRef.current.position);
};
