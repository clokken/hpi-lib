import { VersionField, ReadonlyStruct, HeaderField } from './structs';
import { ReadonlyDirectoryItem } from './directoryItem';

export const HAPI_MARKER  = 0x49504148; // 48 41 50 49
export const HAPI_VERSION = 0x00020000; // 00 00 02 00
export const SQSH_MARKER  = 0x48535153;

export interface HapiContext {
    readonly file: Buffer;
    readonly version: ReadonlyStruct<VersionField>;
    readonly header: ReadonlyStruct<HeaderField>;
    readonly directoryBuffer: Buffer;
    readonly namesBuffer: Buffer;
    readonly rootItem: ReadonlyDirectoryItem;
}
