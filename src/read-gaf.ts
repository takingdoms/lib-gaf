import { ByteUtils } from "./byte-utils";
import { Entry, Frame, FrameData, FrameDataSingleLayer, LayerData } from "./gaf";
import { GAF_HEADER_STRUCT_SIZE, GAF_ENTRY_STRUCT_SIZE, GAF_HEADER_STRUCT, GAF_ENTRY_STRUCT, GAF_FRAME_STRUCT_SIZE, GAF_FRAME_STRUCT, GAF_FRAME_DATA_STRUCT } from "./structs";

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
    const frameData = nextFrameDataStruct['Compressed'] === 0
      ? parseUncompressedLayerData(
        data,
        nextFrameDataStruct['PtrFrameData'],
        nextFrameDataStruct['Width'],
        nextFrameDataStruct['Height'],
      )
      : parseCompressedLayerData(
        data,
        nextFrameDataStruct['PtrFrameData'],
        nextFrameDataStruct['Height'],
      );

    const normalizedFrameData = normalizeLayerData(frameData);

    // TODO do something with the value below:
    nextFrameDataStruct['TransparencyIndex'];

    return {
      kind: 'single',
      width: nextFrameDataStruct['Width'],
      height: nextFrameDataStruct['Height'],
      xOffset: nextFrameDataStruct['XPos'],
      yOffset: nextFrameDataStruct['YPos'],
      data: normalizedFrameData,
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

function parseUncompressedLayerData(
  data: DataView,
  offset: number,
  width: number,
  height: number,
): LayerData {
  const lines: Uint8Array[] = [];

  for (let i = 0; i < height; i++) {
    const lineData = new Uint8Array(data.buffer, offset, width);
    offset += width; // from the lineData's length

    lines.push(lineData);
  }

  return {
    decompressed: false,
    pixelTable: lines,
  };
}

const TRANSPARENCY_MASK = 0x01;
const REPEAT_MASK = 0x02;

function parseCompressedLayerData(
  data: DataView,
  offset: number,
  linesCount: number,
): LayerData {
  const lines: Array<number | undefined>[] = [];

  for (let y = 0; y < linesCount; y++) {
    const nextLine: Array<number | undefined> = [];

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
          nextLine[x++] = data.getUint8(offset + count);
        }
        count++;
      }
      else {
        let read = (mask >> 2) + 1;
        while (read--) {
          nextLine[x++] = data.getUint8(offset + count++);
        }
      }
    }

    offset += bytes;

    lines.push(nextLine);
  }

  return {
    decompressed: true,
    pixelTable: lines,
  };
}

function normalizeLayerData(frameData: LayerData): LayerData {
  if (frameData.pixelTable.length <= 1) {
    return frameData;
  }

  let maxWidth = frameData.pixelTable[0].length;
  let alreadyNormalized = true;

  for (let i = 1; i < frameData.pixelTable.length; i++) {
    if (frameData.pixelTable[i].length !== maxWidth) {
      alreadyNormalized = false;
      maxWidth = Math.max(frameData.pixelTable[i].length, maxWidth);
    }
  }

  if (alreadyNormalized) {
    return frameData;
  }

  // console.error(`This frame possesses pixel lines with different widths!`);

  if (frameData.decompressed) {
    const normalizedPixelTable: Array<number | undefined>[] = [];

    for (let i = 0; i < frameData.pixelTable.length; i++) {
      const srcLine = frameData.pixelTable[i];

      if (srcLine.length === maxWidth) {
        normalizedPixelTable.push(srcLine);
        continue;
      }

      const diff = maxWidth - srcLine.length;
      const outLine = [...srcLine];
      outLine.push(...Array(diff).fill(undefined));
      normalizedPixelTable.push(outLine);
    }

    return {
      ...frameData,
      pixelTable: normalizedPixelTable,
    };
  }

  console.error(`Yeah... something must have gone very wrong... It's looks VERY unusual for` +
    ` non-decompressed pixelTables to have uneven widths.`);

  const normalizedPixelTable: Uint8Array[] = [];

  for (let i = 0; frameData.pixelTable.length; i++) {
    const srcLine = frameData.pixelTable[i];

    if (srcLine.length === maxWidth) {
      normalizedPixelTable.push(srcLine);
      continue;
    }

    const outLine = new Uint8Array(maxWidth);
    outLine.fill(0);
    srcLine.forEach((pixel, idx) => outLine[idx] = pixel);

    normalizedPixelTable.push(outLine);
  }

  return {
    ...frameData,
    pixelTable: normalizedPixelTable,
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
