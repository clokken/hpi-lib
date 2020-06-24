import { IntWrapper, U8, U32 } from "./types";
import * as Stream from 'stream';

// U32 means a each file should be < 4,294,967,295 bytes

export class Field {
    readonly name: string;
    readonly type: IntWrapper;

    constructor(name: string, type: IntWrapper) {
        this.name = name;
        this.type = type;
    }
}

export type VersionField = 'marker' | 'version';
export const VERSION_STRUCT = [
    new Field('marker',         U32), // 4
    new Field('version',        U32), // 4
];
const VERSION_STRUCT_SIZE = 4 + 4; // 8 bytes

export type ChunkField = 'marker' | 'unknown1' | 'compMethod' | 'isEncrypted'
    | 'compressedSize' | 'flatSize' | 'checksum';
export const CHUNK_STRUCT = [
    new Field('marker',         U32),   // 4
    new Field('unknown1',       U8),    // 1
    new Field('compMethod',     U8),    // 1
    new Field('isEncrypted',    U8),    // 1
    new Field('compressedSize', U32),   // 4
    new Field('flatSize',       U32),   // 4
    new Field('checksum',       U32),   // 4
];
const CHUNK_STRUCT_SIZE = 4 + 1 + 1 + 1 + 4 + 4 + 4; // 19 bytes

export type HeaderField = 'dirBlockPtr' | 'dirBlockLen' |'namesBlockPtr'
    | 'namesBlockLen' | 'data' | 'last78';
export const HEADER_STRUCT = [
    new Field('dirBlockPtr',    U32), // 4
    new Field('dirBlockLen',    U32), // 4
    new Field('namesBlockPtr',  U32), // 4
    new Field('namesBlockLen',  U32), // 4
    new Field('data',           U32), // 4
    new Field('last78',         U32), // 4
];
const HEADER_STRUCT_SIZE = 4 + 4 + 4 + 4 + 4 + 4; // 24 bytes

export type DirectoryField = 'namePtr' | 'firstSubDirPtr' | 'subDirCount'
    | 'firstFilePtr' | 'fileCount';
export const DIRECTORY_STRUCT = [
    new Field('namePtr',        U32), // 4
    new Field('firstSubDirPtr', U32), // 4
    new Field('subDirCount',    U32), // 4
    new Field('firstFilePtr',   U32), // 4
    new Field('fileCount',      U32), // 4
];
const DIRECTORY_STRUCT_SIZE = 4 + 4 + 4 + 4 + 4; // 20 bytes

export type EntryField = 'namePtr' | 'dataStartPtr' | 'flatSize'
    | 'compressedSize' | 'date' | 'checksum';
export const ENTRY = [
    new Field('namePtr',        U32), // 4
    new Field('dataStartPtr',   U32), // 4
    new Field('flatSize',       U32), // 4
    new Field('compressedSize', U32), // 4
    new Field('date',           U32), // 4
    new Field('checksum',       U32), // 4
];
const ENTRY_STRUCT_SIZE = 4 + 4 + 4 + 4 + 4 + 4; // 24 bytes

export abstract class ReadonlyStruct<T extends string> {
    protected fields: Field[];
    protected data: { [k: string]: number } = {};

    protected constructor(fields: Field[], bytes: Buffer, offset: number = 0) {
        let totalLength = 0;
        this.fields = fields;
        this.fields.forEach(field => {
            if (bytes === null) {
                this.data[field.name] = 0;
                return;
            }

            let len = field.type.size / 8; // convert from bits to bytes
            let val = field.type.signed ? bytes.readIntLE(offset, len) : bytes.readUIntLE(offset, len);

            offset += len;
            this.data[field.name] = val;
            totalLength += len;
        });
    }

    static get totalLength(): number {
        return 0;
    };

    getField(field: T) {
        return this.data[field];
    }

    debugPrint() {
        let str = '';
        let maxLen = this.fields.reduce((acc, curVal) => {
            return acc.name.length > curVal.name.length ? acc : curVal
        }).name.length;

        let maxLineLen = 0;
        this.fields.forEach(f => {
            let padding = ' '.repeat(maxLen - f.name.length);
            let val = this.data[f.name];
            let hex = val.toString(16);
            let line = `${f.name} ${padding} 0x${hex} (${val})\n`
            str += line;
            maxLineLen = Math.max(maxLineLen, line.length);
        });

        const border = '-'.repeat(maxLineLen);
        str = '\n' + border + '\n' + str + border;
        return str;
    }

    saveToBuffer(output: Buffer, offset = 0): number {
        let written = 0;

        this.fields.forEach(field => {
            let value = this.data[field.name];
            let size = field.type.size / 8; // convert from bits to bytes

            if (field.type.signed)
                output.writeIntLE(value, offset + written, size);
            else
                output.writeUIntLE(value, offset + written, size);

            written += size;
        });

        return written;
    }
}

export abstract class Struct<T extends string> extends ReadonlyStruct<T> {
    setField(field: T, value: number): void {
        this.data[field] = value;
    }
}

export class VersionStruct extends Struct<VersionField> {
    constructor(bytes: Buffer, offset?: number) {
        super(VERSION_STRUCT, bytes, offset);
    }

    static get totalLength() { return VERSION_STRUCT_SIZE }
}

export class ChunkStruct extends Struct<ChunkField> {
    constructor(bytes: Buffer, offset?: number) {
        super(CHUNK_STRUCT, bytes, offset);
    }

    static get totalLength() { return CHUNK_STRUCT_SIZE }
}

export class HeaderStruct extends Struct<HeaderField> {
    constructor(bytes: Buffer, offset?: number) {
        super(HEADER_STRUCT, bytes, offset);
    }

    static get totalLength() { return HEADER_STRUCT_SIZE }
}

export class DirectoryStruct extends Struct<DirectoryField> {
    constructor(bytes: Buffer, offset?: number) {
        super(DIRECTORY_STRUCT, bytes, offset);
    }

    static get totalLength() { return DIRECTORY_STRUCT_SIZE }
}

export class EntryStruct extends Struct<EntryField> {
    constructor(bytes: Buffer, offset?: number) {
        super(ENTRY, bytes, offset);
    }

    static get totalLength() { return ENTRY_STRUCT_SIZE }
}
