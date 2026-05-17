import { clusterEntitiesByGrid } from "./clustering-core";

export const buildWebClusters = (entities, zoom) =>
  clusterEntitiesByGrid(entities, { zoom, cellFactor: 1.2 });

