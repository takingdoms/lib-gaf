type IntegerType = 'U8' | 'I8' | 'U16' | 'I16' | 'U32' | 'I32';
type Endianness = 'LE' | 'BE';

type ExtraType = { 'CHAR': number };

const INTEGER_TYPES: IntegerType[] = ['U8', 'I8', 'U16', 'I16', 'U32', 'I32'];
const ENDIANNESSES: Endianness[] = ['LE', 'BE'];

function readInteger(
  data: DataView,
  pos: number,
  type: IntegerType,
  endianness: Endianness = 'LE',
): number {
  if (type === 'I8') {
    return data.getInt8(pos);
  }

  if (type === 'U8') {
    return data.getUint8(pos);
  }

  if (type === 'I16') {
    return data.getInt16(pos, endianness === 'LE');
  }

  if (type === 'U16') {
    return data.getUint16(pos, endianness === 'LE');
  }

  return data.getInt32(pos, endianness === 'LE');
}

type StructDef<TKeyName extends string = string> = ReadonlyArray<
  readonly [TKeyName, IntegerType]
>;

type StructDefWithExtra<TKeyName extends string = string> = ReadonlyArray<
readonly [TKeyName, IntegerType | ExtraType]
>;

function makeStruct<TKeyName extends string = string>(
  data: DataView,
  offset: number,
  structDef: StructDef<TKeyName>,
  endianness?: Endianness,
): Readonly<Record<TKeyName, number>>;

function makeStruct<TKeyName extends string = string>(
  data: DataView,
  offset: number,
  structDef: StructDefWithExtra<TKeyName>,
  endianness?: Endianness,
): Readonly<Record<TKeyName, number | DataView>>;

function makeStruct<TKeyName extends string = string>(
  data: DataView,
  offset: number,
  structDef: StructDef<TKeyName> | StructDefWithExtra<TKeyName>,
  endianness: Endianness = 'LE',
): Readonly<Record<TKeyName, number>> | Readonly<Record<TKeyName, number | DataView>> {
  let result: Record<string, number | DataView> = {};

  for (const [name, type] of structDef) {
    if (typeof type === 'object') {
      const length = type['CHAR'];
      const buffer = data.buffer.slice(offset, offset + length);
      result[name] = new DataView(buffer);
      continue;
    }

    result[name] = readInteger(data, offset, type, endianness);

    if (type === 'U8' || type === 'I8') {
      offset += 1;
    }
    else if (type === 'U16' || type === 'I16') {
      offset += 2;
    }
    else if (type === 'U32' || type === 'I32') {
      offset += 4;
    }
  }

  return result as Readonly<typeof result>;
}

function calcStructSize(structDef: StructDef | StructDefWithExtra): number {
  let result = 0;

  for (const [_, type] of structDef) {
    if (typeof type === 'object') {
      result += type['CHAR'];
      continue;
    }

    if (type === 'U8' || type === 'I8') {
      result += 1;
    }
    else if (type === 'U16' || type === 'I16') {
      result += 2;
    }
    else if (type === 'U32' || type === 'I32') {
      result += 4;
    }
  }

  return result;
}

export const ByteUtils = {
  makeStruct,
  calcStructSize,
};
