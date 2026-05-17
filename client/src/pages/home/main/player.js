import * as THREE from "three";
import {
  BALL_RADIUS,
  BALL_SEGMENTS,
  PLAYER_POSITION_Z,
} from "../../../constants/game.constants";

export const createPlayerSphere = () => {
  const material = new THREE.MeshPhongMaterial({
    color: 0x00ff00,
    shininess: 100,
  });
  const geometry = new THREE.SphereGeometry(
    BALL_RADIUS,
    BALL_SEGMENTS,
    BALL_SEGMENTS
  );
  const ball = new THREE.Mesh(geometry, material);
  ball.position.set(0, 0, PLAYER_POSITION_Z - 1);
  return ball;
};

export const createSceneLights = ({ sceneRef }) => {
  const ambientLight = new THREE.AmbientLight(0xf6f8f9, 0.5);
  sceneRef.current.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xf6f8f9, 1);
  directionalLight.position.set(1, 1, 1);
  sceneRef.current.add(directionalLight);
};
