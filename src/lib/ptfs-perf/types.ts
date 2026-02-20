export type AircraftData = {
  type: string;
  flaps: { name?: string; setting: number; reduction: number }[];
  speeds: {
    rotate: number;
    landing: number;
    stall: number;
    max: number;
  };
  deceleration: {
    noReversers: number;
    idleReversers?: number;
    maxReversers?: number;
  };
  accelerationData: LinearData;
  speedData: QuadraticData;
};

export type LinearData = {
  base: number;
  slope: number;
};

export type QuadraticData = {
  base: number;
  linear: number;
  quadratic: number;
};

export type AirportData = {
  name: string;
  icao: string;
  runways: RunwayData[];
};

export type RunwayData = {
  name: string;
  heading: number;
  lda: number;
  tora: number;
  asda: number;
  intersections: {
    name: string;
    shift: number;
  }[];
};
