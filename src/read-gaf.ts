import { ByteUtils } from "./byte-utils";
import { Entry, Frame, FrameData, FrameDataSingleLayer, LayerData, LayerDataPaletteIndices, LayerDataRawColors } from "./gaf";
import { GAF_ENTRY_STRUCT, GAF_ENTRY_STRUCT_SIZE, GAF_FRAME_DATA_STRUCT, GAF_FRAME_STRUCT, GAF_FRAME_STRUCT_SIZE, GAF_HEADER_STRUCT, GAF_HEADER_STRUCT_SIZE } from "./structs";

export function fromBuffer(data: DataView) {
  return readEntries(data);
}

function readEntries(data: DataView): Entry[] {
  const header = ByteUtils.makeStruct(data, 0, GAF_HEADER_STRUCT);

  const entries: Entry[] = [];

  for (let i = 0; i < header['Entries']; i++) {
    const nextEntryPointer = data.getUint32(GAF_HEADER_STRUCT_SIZE + (i * 4), true); // * 4 = Uint32
    const entry = parseEntry(data, nextEntryPointer);

    entries.push(entry);
  }

  return entries;
}

function parseEntry(data: DataView, offset: number): Entry {
  const nextEntryStruct = ByteUtils.makeStruct(data, offset, GAF_ENTRY_STRUCT);
  const name = parseName(nextEntryStruct.NAME as DataView, 0);
  const frameCount = nextEntryStruct['FRAMES'] as number;

  const frames: Frame[] = [];
  const framesStartOffset = offset + GAF_ENTRY_STRUCT_SIZE;

  for (let i = 0; i < frameCount; i++) {
    const nextFrame = ByteUtils.makeStruct(
      data,
      framesStartOffset + (i * GAF_FRAME_STRUCT_SIZE),
      GAF_FRAME_STRUCT,
    );

    const frameData = parseFrameData(data, nextFrame['PtrFrameData']);

    frames.push({
      duration: nextFrame['Duration'],
      frameData,
    });
  }

  return {
    name,
    frames,
  };
}

function parseFrameData(data: DataView, offset: number): FrameData {
  const nextFrameDataStruct = ByteUtils.makeStruct(data, offset, GAF_FRAME_DATA_STRUCT);

  if (nextFrameDataStruct['FramePointers'] === 0) { // then PtrFrameData points to pixel data
    const layerData = parseLayerData(
      data,
      nextFrameDataStruct['Compressed'],
      nextFrameDataStruct['TransparencyIndex'],
      nextFrameDataStruct['PtrFrameData'],
      nextFrameDataStruct['Width'],
      nextFrameDataStruct['Height'],
    );

    return {
      kind: 'single',
      width: nextFrameDataStruct['Width'],
      height: nextFrameDataStruct['Height'],
      xOffset: nextFrameDataStruct['XPos'],
      yOffset: nextFrameDataStruct['YPos'],
      transparencyIndex: nextFrameDataStruct['TransparencyIndex'],
      data: layerData,
    };
  }

  // else... then nextFrameDataStruct['FramePointers'] !== 0
  // then PtrFrameData points to a list of pointers each pointing to a GAF_FRAME_DATA_STRUCT
  // which end up composing the subFrames (layers) of the current frame

  const layers: FrameDataSingleLayer[] = [];

  // where the list of pointers begin
  const pointersStartOffset = nextFrameDataStruct['PtrFrameData'];

  for (let i = 0; i < nextFrameDataStruct['FramePointers']; i++) {
    // read the next pointer in the list
    const nextPointer = data.getUint32(pointersStartOffset + (i * 4), true);

    // read the frameData that the pointer above points to
    const nextFrameData = parseFrameData(data, nextPointer);

    if (nextFrameData.kind === 'multi') {
      throw new Error(`MultiLayer frames cannot contain other MultiLayer frames inside of it.`);
    }

    layers.push(nextFrameData);
  }

  return {
    kind: 'multi',
    layers,
  };
}

// TODO turn all these parameters into an object
function parseLayerData(
  data: DataView,
  compressionFlag: number,
  transparencyIndex: number,
  offset: number,
  width: number,
  height: number,
): LayerData {
  const frameData
    = compressionFlag === 0 ? parseUncompressedLayerData(data, offset, width, height,)
    : compressionFlag === 1 ? parseCompressedLayerData(data, offset, width, height, transparencyIndex)
    : compressionFlag === 4 ? parseRawColors(data, offset, width, height, 'argb4444')
    : compressionFlag === 5 ? parseRawColors(data, offset, width, height, 'argb1555')
    : undefined;

  if (frameData === undefined) {
    throw new Error(`Unknown compression flag: ${compressionFlag}`);
  }

  return frameData;
}

// TODO turn all these parameters into an object
function parseUncompressedLayerData(
  data: DataView,
  offset: number,
  width: number,
  height: number,
): LayerDataPaletteIndices {
  const indices = new Uint8Array(data.buffer, offset, width * height);

  return {
    kind: 'palette-idx',
    indices,
  };
}

const TRANSPARENCY_MASK = 0x01;
const REPEAT_MASK = 0x02;

// TODO turn all these parameters into an object
function parseCompressedLayerData(
  data: DataView,
  offset: number,
  width: number,
  height: number,
  transparencyIndex: number,
): LayerDataPaletteIndices {
  const indices = new Uint8Array(width * height);
  indices.fill(transparencyIndex);

  const putPixel = (px: number, py: number, color: number) => {
    indices[px + py * width] = color;
  };

  for (let y = 0; y < height; y++) {
    const bytes = data.getUint16(offset, true); // aka lineLength
    offset += 2; // sizeof Uint16

    let count = 0;
    let x = 0;

    while (count < bytes) {
      const mask = data.getUint8(offset + count++);

      if ((mask & TRANSPARENCY_MASK) === TRANSPARENCY_MASK) {
        x += (mask >> 1);
      }
      else if ((mask & REPEAT_MASK) === REPEAT_MASK) {
        let repeat = (mask >> 2) + 1;
        while (repeat--) {
          putPixel(x++, y, data.getUint8(offset + count));
        }
        count++;
      }
      else {
        let read = (mask >> 2) + 1;
        while (read--) {
          putPixel(x++, y, data.getUint8(offset + count++));
        }
      }
    }

    offset += bytes;
  }

  return {
    kind: 'palette-idx',
    indices,
  };
}

// TODO turn all these parameters into an object
function parseRawColors(
  data: DataView,
  offset: number,
  width: number,
  height: number,
  format: LayerDataRawColors['format'],
): LayerDataRawColors {
  const colors = new Uint16Array(data.buffer, offset, width * height);

  return {
    kind: 'raw',
    colors,
    format,
  };
}

const textDecoder = new TextDecoder('ascii');
const NAME_LIMIT = 256;
function parseName(data: DataView, offset: number): string {
  let size = 0;

  for (let i = 0; i < NAME_LIMIT; i++) {
    size = i;
    const nextByte = data.getUint8(offset + i);
    if (nextByte === 0)
      break;
  }

  const slice = new Uint8Array(data.buffer, offset, size);
  return textDecoder.decode(slice);
}

function debugPrintStruct(struct: Record<string, number | DataView>) {
  for (const [field, value] of Object.entries(struct)) {
    if (typeof value === 'number') {
      const hex = '0x' + value.toString(16).toUpperCase().padStart(4, '0');
      console.log(`${field}: ${value} (${hex})`);
    }
    else { // DataView
      console.log(`${field}: [${value.byteLength}]`);
    }
  }
  console.log();
}
