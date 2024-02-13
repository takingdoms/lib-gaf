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
  transparencyIndex: number; // used only when LayerData is of type LayerDataPaletteIndices
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

export type LayerData =
  | LayerDataPaletteIndices
  | LayerDataRawColors;

export type LayerDataPaletteIndices = {
  kind: 'palette-idx';

  /**
   * Each value represents an index into a palette (usually from .pcx files).
   * Length should always be width * height of the FrameData it belongs to.
   * This is packed as a sequence of ROWS of the image, so, given an index into the array:
   * x = index % width
   * y = index / width
   */
  indices: Uint8Array;
};

export type LayerDataRawColors = {
  kind: 'raw';
  format: 'argb1555' | 'argb4444';

  /**
   * Each value represents a 16-bit color in either argb1555 or argb444 format.
   * Length should always be width * height of the FrameData it belongs to.
   * This is packed as a sequence of ROWS of the image, so, given an index into the array:
   * x = index % width
   * y = index / width
   */
  colors: Uint16Array;
};
