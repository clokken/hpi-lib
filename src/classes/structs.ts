import { IntWrapper, U8, U32 } from "./types";
import { access } from "fs";

export class Field {
    readonly name: string;
    readonly type: IntWrapper;

    constructor(name: string, type: IntWrapper) {
        this.name = name;
        this.type = type;
    }
}

export type VersionField = 'marker' | 'version';
const VERSION = [
    new Field('marker',         U32), // 4
    new Field('version',        U32), // 4
];
const VERSION_SIZE = 4 + 4; // 8 bytes

export type ChunkField = 'marker' | 'unknown1' | 'compMethod' | 'isEncrypted'
    | 'compressedSize' | 'flatSize' | 'checksum';
const CHUNK = [
    new Field('marker',         U32),   // 4
    new Field('unknown1',       U8),    // 1
    new Field('compMethod',     U8),    // 1
    new Field('isEncrypted',    U8),    // 1
    new Field('compressedSize', U32),   // 4
    new Field('flatSize',       U32),   // 4
    new Field('checksum',       U32),   // 4
];
const CHUNK_SIZE = 4 + 1 + 1 + 1 + 4 + 4 + 4; // 19 bytes

export type HeaderField = 'dirBlockPtr' | 'dirBlockLen' |'namesBlockPtr'
    | 'namesBlockLen' | 'data' | 'last78';
const HEADER = [
    new Field('dirBlockPtr',    U32), // 4
    new Field('dirBlockLen',    U32), // 4
    new Field('namesBlockPtr',  U32), // 4
    new Field('namesBlockLen',  U32), // 4
    new Field('data',           U32), // 4
    new Field('last78',         U32), // 4
];
const HEADER_SIZE = 4 + 4 + 4 + 4 + 4 + 4; // 24 bytes

export type DirectoryField = 'namePtr' | 'firstSubDirPtr' | 'subDirCount'
    | 'firstFilePtr' | 'fileCount';
const DIRECTORY = [
    new Field('namePtr',        U32), // 4
    new Field('firstSubDirPtr', U32), // 4
    new Field('subDirCount',    U32), // 4
    new Field('firstFilePtr',   U32), // 4
    new Field('fileCount',      U32), // 4
];
const DIRECTORY_SIZE = 4 + 4 + 4 + 4 + 4; // 20 bytes

export type EntryField = 'namePtr' | 'dataStartPtr' | 'flatSize'
    | 'compressedSize' | 'date' | 'checksum';
const ENTRY = [
    new Field('namePtr',        U32), // 4
    new Field('dataStartPtr',   U32), // 4
    new Field('flatSize',       U32), // 4
    new Field('compressedSize', U32), // 4
    new Field('date',           U32), // 4
    new Field('checksum',       U32), // 4
];
const ENTRY_SIZE = 4 + 4 + 4 + 4 + 4 + 4; // 24 bytes

export abstract class BinaryStructure<FieldNames extends string> {
    private fields: Field[];
    private data: { [k: string]: number } = {};

    constructor(fields: Field[], bytes: Buffer, offset: number = 0) {
        let totalLength = 0;
        this.fields = fields;
        this.fields.forEach(field => {
            let len = field.type.size / 8;
            let val = field.type.signed ? bytes.readIntLE(offset, len) : bytes.readUIntLE(offset, len);

            offset += len;
            this.data[field.name] = val;
            totalLength += len;
        });
    }

    static get totalLength(): number {
        return 0;
    };

    get(field: FieldNames) {
        return this.data[field];
    }

    set(field: FieldNames, value: number) {
        this.data[field] = value;
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
}

export class VersionStruct extends BinaryStructure<VersionField> {
    constructor(bytes: Buffer, offset?: number) {
        super(VERSION, bytes, offset);
    }

    static get totalLength() { return VERSION_SIZE }
}

export class ChunkStruct extends BinaryStructure<ChunkField> {
    constructor(bytes: Buffer, offset?: number) {
        super(CHUNK, bytes, offset);
    }

    static get totalLength() { return CHUNK_SIZE }
}

export class HeaderStruct extends BinaryStructure<HeaderField> {
    constructor(bytes: Buffer, offset?: number) {
        super(HEADER, bytes, offset);
    }

    static get totalLength() { return HEADER_SIZE }
}

export class DirectoryStruct extends BinaryStructure<DirectoryField> {
    constructor(bytes: Buffer, offset?: number) {
        super(DIRECTORY, bytes, offset);
    }

    static get totalLength() { return DIRECTORY_SIZE }
}

export class EntryStruct extends BinaryStructure<EntryField> {
    constructor(bytes: Buffer, offset?: number) {
        super(ENTRY, bytes, offset);
    }

    static get totalLength() { return ENTRY_SIZE }
}
