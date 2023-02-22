export type GafEntry = {
  name: string;
  frames: GafFrame[];
};

export type GafFrame = {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  data: GafFrameData;
};

export type GafFrameData = {
  decompressed: true;
  // a 2D array of byte|undefined where undefined = transparency
  // dimensions should be defined by the width and height of the GafFrame
  pixelTable: Array<number | undefined>[];
} | {
  decompressed: false;
  // a 2D array of bytes
  // dimensions should be defined by the width and height of the GafFrame
  pixelTable: Uint8Array[];
};
