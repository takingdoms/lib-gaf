import { ByteUtils } from "./byte-utils";
import { GAF_HEADER_STRUCT_SIZE, GAF_ENTRY_STRUCT_SIZE, GAF_HEADER_STRUCT, GAF_ENTRY_STRUCT, GAF_FRAME_STRUCT_SIZE, GAF_FRAME_STRUCT, GAF_FRAME_DATA_STRUCT } from "./structs";
import { GafEntry, GafFrame, GafFrameData } from './gaf';

function fromBuffer(data: DataView) {
  return {
    foo: foo(data),
  };
}

function foo(data: DataView) {
  const header = ByteUtils.makeStruct(data, 0, GAF_HEADER_STRUCT);
  // debugPrintStruct(header);

  const entries = parseEntries(data, GAF_HEADER_STRUCT_SIZE, header['Entries']);

  return entries; // TODO return an actual structure
}

function parseEntries(data: DataView, offset: number, entryCount: number): GafEntry[] {
  const results: GafEntry[] = [];

  for (let i = 0; i < entryCount/* && i < 1*/; i++) {
    // (i * 4) because each integer is 4 bytes (aka Uint32)
    const nextEntryPointer = data.getUint32(offset + (i * 4), true);
    const nextEntryStruct = ByteUtils.makeStruct(data, nextEntryPointer, GAF_ENTRY_STRUCT);
    const name = parseName(nextEntryStruct.NAME as DataView, 0);

    // console.log(name);
    // debugPrintStruct(nextEntryGaf);

    const nextFramePointer = nextEntryPointer + GAF_ENTRY_STRUCT_SIZE;
    const frames = parseFrames(data, nextFramePointer, nextEntryStruct['FRAMES'] as number);

    results.push({
      name,
      frames,
    });
  }

  return results;
}

function parseFrames(data: DataView, offset: number, frameCount: number): GafFrame[] {
  const results: GafFrame[] = [];

  for (let i = 0; i < frameCount; i++) {
    const nextFrameStruct = ByteUtils.makeStruct(
      data,
      offset + (i * GAF_FRAME_STRUCT_SIZE),
      GAF_FRAME_STRUCT,
    );

    // debugPrintStruct(nextFrameStruct);

    const nextFrameDataStruct = ByteUtils.makeStruct(
      data,
      nextFrameStruct['PtrFrameTable'],
      GAF_FRAME_DATA_STRUCT,
    );

    // debugPrintStruct(nextFrameDataStruct);

    if (nextFrameDataStruct['FramePointers'] === 0) { // then PtrFrameData points to pixel data
      const frameData = nextFrameDataStruct['Compressed'] === 0
        ? parseUncompressedFrameData(
          data,
          nextFrameDataStruct['PtrFrameData'],
          nextFrameDataStruct['Width'],
          nextFrameDataStruct['Height'],
        )
        : parseCompressedFrameData(
          data,
          nextFrameDataStruct['PtrFrameData'],
          nextFrameDataStruct['Height'],
        );

      const normalizedFrameData = normalizeFrameData(frameData);

      results.push({
        width: nextFrameDataStruct['Width'],
        height: nextFrameDataStruct['Height'],
        xOffset: nextFrameDataStruct['XPos'],
        yOffset: nextFrameDataStruct['YPos'],
        data: normalizedFrameData,
      });
    }
    else { // then PtrFrameData points to a list of 'FramePointers' pointers to (sub) frameDatas
      throw new Error(`Sorry but lib-gaf doesn't yet support reading gaf files with entries` +
        ` containing subFrames because I couldn't find a file that is structured like this` +
        ` to test how it should work. Looks like you have one such file in hands so please` +
        ` mail it to me (c1000@protonmail.com) or on discord (spagg#2962) so that I can` +
        ` implement this functionalty thanks.`);
    }
  }

  return results;
}

function parseUncompressedFrameData(
  data: DataView,
  offset: number,
  width: number,
  height: number,
): GafFrameData {
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

function parseCompressedFrameData(
  data: DataView,
  offset: number,
  linesCount: number,
): GafFrameData {
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

function normalizeFrameData(frameData: GafFrameData): GafFrameData {
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

  console.error(`This frame possesses pixel lines with different widths!`);

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

export const ParseGaf = {
  fromBuffer,
};
