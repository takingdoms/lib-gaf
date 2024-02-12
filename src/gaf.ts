export type Entry = {
  name: string;
  frames: Frame[];
};

export type Frame = {
  duration: number;
  frameData: FrameData;
};

export type FrameData = FrameDataSingleLayer | FrameDataMultiLayer;

/**
 * The frame alone contains all the data.
 * Was created from a GAF_FRAME_DATA_STRUCT where the FramePointers field was not 0.
 */
export type FrameDataSingleLayer = {
  kind: 'single';
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  data: LayerData;
};

/**
 * The frame is composited from multiple sub-frames.
 * Was created from a GAF_FRAME_DATA_STRUCT where the FramePointers field was not 0.
 */
export type FrameDataMultiLayer = {
  kind: 'multi';
  layers: FrameDataSingleLayer[];
};

export type LayerData = {
  decompressed: true;
  /**
   * A 2D array of byte|undefined where undefined = transparency.
   * Dimensions should be defined by the width and height of the GafFrame.
   */
  pixelTable: Array<number | undefined>[];
} | {
  decompressed: false;
  /**
   * A 2D array of bytes.
   * Dimensions should be defined by the width and height of the GafFrame.
   */
  pixelTable: Uint8Array[];
};
