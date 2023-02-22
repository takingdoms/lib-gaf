import { ByteUtils } from "./byte-utils";

export const GAF_HEADER_STRUCT = [
  ['IDVersion',    'U32'],
  ['Entries',      'U32'],
  ['Unknown1',     'U32'],
] as const;

export const GAF_HEADER_STRUCT_SIZE = ByteUtils.calcStructSize(GAF_HEADER_STRUCT);

export const GAF_ENTRY_STRUCT = [
  ['FRAMES',   'U16'],
  ['UNKNOWN1', 'U16'],
  ['UNKNOWN2', 'U32'],
  ['NAME',     { 'CHAR': 32 }],
] as const;

export const GAF_ENTRY_STRUCT_SIZE = ByteUtils.calcStructSize(GAF_ENTRY_STRUCT);

export const GAF_FRAME_STRUCT = [
  ['PtrFrameTable', 'U32'],
  ['Unknown1',      'U32'],
] as const;

export const GAF_FRAME_STRUCT_SIZE = ByteUtils.calcStructSize(GAF_FRAME_STRUCT);

export const GAF_FRAME_DATA_STRUCT = [
  ['Width',           'U16'],
  ['Height',          'U16'],
  ['XPos',            'U16'],
  ['YPos',            'U16'],
  ['Unknown1',        'U8'],
  ['Compressed',      'U8'],
  ['FramePointers',   'U16'],
  ['Unknown2',        'U32'],
  ['PtrFrameData',    'U32'],
  ['Unknown3',        'U32'],
] as const;

export const GAF_FRAME_DATA_STRUCT_SIZE = ByteUtils.calcStructSize(GAF_FRAME_DATA_STRUCT);
