import seedrandom from "seedrandom";
import * as THREE from "three";
import { TOTAL_OBSTACLES, WORLD_SIZE } from "../../../constants/game.constants";
import { isObjectInView } from "./camera";

export const createObstacles = ({ sceneRef, obstaclesRefs }) => {
  const rng = seedrandom("obstacles_seed");
  const obstacleGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const obstacleMaterial = new THREE.MeshBasicMaterial({ color: 0x#ef233c }); // لون أحمر للعوائق

  for (let i = 0; i < TOTAL_OBSTACLES; i++) {
    const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
    const x = rng() * WORLD_SIZE - WORLD_SIZE / 2;
    const y = rng() * WORLD_SIZE - WORLD_SIZE / 2;
    const z = rng() * WORLD_SIZE - WORLD_SIZE / 2;

    obstacle.position.set(x, y, z);
    sceneRef.current.add(obstacle);
    obstaclesRefs.current.push(obstacle);
  }
};

export const highlightClosestObstacle = ({
  obstaclesRefs,
  cameraRef,
  frustum,
  projectionMatrix,
  playerSphereRef,
  closestObstacleRef,
  highlightBox,
  setDistance,
}) => {
  let closestDistance = Infinity;
  closestObstacleRef.current = null;

  for (const obstacle of obstaclesRefs.current) {
    if (
      isObjectInView(cameraRef.current, obstacle, frustum, projectionMatrix)
    ) {
      const distance = playerSphereRef.current.position.distanceTo(
        obstacle.position
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestObstacleRef.current = obstacle;
      }
    }
  }

  if (closestObstacleRef.current) {
    highlightBox.position.set(
      closestObstacleRef.current.position.x,
      closestObstacleRef.current.position.y,
      closestObstacleRef.current.position.z
    );
    highlightBox.visible = true;
    setDistance(closestDistance.toFixed(2));
  } else {
    highlightBox.visible = false;
    setDistance(null);
  }
};

export const handleShakeEffect = ({
  playerSphereRef,
  directionRef,
  shakeTimeRef,
}) => {
  if (shakeTimeRef.current > 0) {
    const shakeAmount = (Math.random() - 0.5) * shakeTimeRef.current;
    playerSphereRef.current.position.add(
      directionRef.current.multiplyScalar(shakeAmount)
    );
    shakeTimeRef.current = Math.max(0, shakeTimeRef.current - 0.01);
  }
};

export const handleCollisions = ({
  obstaclesRefs,
  playerSphereRef,
  setShield,
  playerSpeed,
  setSpeed,
  shakeTimeRef,
}) => {
  for (let obstacle of obstaclesRefs.current) {
    const distance = playerSphereRef.current.position.distanceTo(
      obstacle.position
    );
    if (distance < 0.8) {
      setShield((prevShield) => {
        const newShield = Math.max(0, prevShield - 0.05);
        if (newShield < 60) {
          const speedReductionFactor = 1 - newShield * 0.01;
          playerSpeed.current = playerSpeed.current * speedReductionFactor;
          setSpeed(playerSpeed.current);
        }
        if (newShield < 25) {
          playerSpeed.current = playerSpeed.current * 0.5;
          setSpeed(playerSpeed.current);
        }
        return newShield;
      });

      // تطبيق تأثير الاهتزاز
      setTimeout(() => {
        shakeTimeRef.current = 5;
      }, 2000);
    }
  }
};
