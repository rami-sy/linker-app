import { clusterEntitiesByGrid } from "./clustering-core";

export const buildNativeClusters = (entities, zoom) =>
  clusterEntitiesByGrid(entities, { zoom, cellFactor: 0.9 });

