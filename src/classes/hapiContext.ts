import { HeaderStruct, VersionStruct, ChunkStruct, DirectoryStruct, EntryStruct } from "./structs";
import { HapiItem } from "./hapiItem";
import { EntryItem } from "./entryItem";
import { DirectoryItem } from "./directoryItem";
import { HapiError } from "./errors/hapiError";
import * as BufferUtils from "./bufferUtils";
import { HapiReader } from "./hapiReader";
import * as Stream from "stream";
import { read } from 'fs';

export class HapiContext {
    static readonly HAPI_MARKER = 0x49504148;
    static readonly HAPI_VERSION = 0x20000;
    static readonly SQSH_MARKER = 0x48535153;

    file: Buffer;
    version: VersionStruct;
    header: HeaderStruct;
    directoryBuffer: Buffer;
    namesBuffer: Buffer;
    rootItem: DirectoryItem;

    private constructor() {}

    static load(file: Buffer): Promise<HapiContext> {
        return new Promise((resolve, reject) => {
            let hapi = new HapiContext;
            hapi.file = file;

            hapi.version = new VersionStruct(file, 0);

            if (hapi.version.get('marker') != HapiContext.HAPI_MARKER)
                return reject(HapiError.invalidMarker(HapiContext.HAPI_MARKER, hapi.version.get('marker')));
            if (hapi.version.get('version') != HapiContext.HAPI_VERSION)
                return reject(HapiError.invalidVersion(HapiContext.HAPI_VERSION, hapi.version.get('version')));

            hapi.header = new HeaderStruct(file, VersionStruct.totalLength);

            hapi.directoryBuffer = BufferUtils.loadBuffer(file, hapi.header.get('dirBlockPtr'), hapi.header.get('dirBlockLen'));
            hapi.namesBuffer = BufferUtils.loadBuffer(file, hapi.header.get('namesBlockPtr'), hapi.header.get('namesBlockLen'));

            let rootBuffer = hapi.directoryBuffer.slice(0, DirectoryStruct.totalLength);
            let rootItem = new DirectoryItem();
            rootItem.struct = new DirectoryStruct(rootBuffer);
            rootItem.name = '';
            rootItem.path = '/';
            rootItem.children = hapi.loadChildren(rootItem);
            rootItem.parent = null;
            rootItem.structOrigin = 0;

            hapi.rootItem = rootItem;

            return resolve(hapi);
        });
    }

    /**
     * Synchronously extract item to buffer. Avoid using this (which was kept for backwards compatibility)
     * and use HapiContext.createItemReadStream or HapiContext.extractAsBuffer instead.
     * @deprecated
     */
    extract(item: EntryItem) {
        if (item.cache)
            return item.cache;

        let flatSize = item.struct.get('flatSize');
        let filePos = item.struct.get('dataStartPtr');

        if (item.struct.get('compressedSize')) {
            let output = Buffer.alloc(flatSize);
            let outSize = 0;

            while (outSize < flatSize) {
                let chunkBuffer = this.file.slice(filePos, filePos + ChunkStruct.totalLength);
                filePos += chunkBuffer.length;

                let chunk = new ChunkStruct(chunkBuffer);
                let sqshBuffer = this.file.slice(filePos, filePos + chunk.get('compressedSize'));
                filePos += sqshBuffer.length;

                let flatBuffer = BufferUtils.decompress(sqshBuffer, chunk);

                if (flatBuffer.length != chunk.get('flatSize'))
                    throw new Error('Decompression Error! Expected: ' + chunk.get('flatSize') + '; Got: ' + flatBuffer.length);

                flatBuffer.copy(output, outSize); // TODO check if Buffer.concat is better
                outSize += flatBuffer.length;
            }

            return output;
        }
        else {
            return this.file.slice(filePos, filePos + flatSize);
        }
    }

    extractAsBuffer(item: EntryItem): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let buffer: Uint8Array[] = [];
            let readStream = this.createItemReadStream(item);

            readStream.on('data', data => buffer.push(data));
            readStream.on('end', () => resolve(Buffer.concat(buffer)));
            readStream.on('error', reject);
        });
    }

    createItemReadStream(item: EntryItem): Stream.Readable {
        if (item.cache) {
            return Stream.Readable.from(item.cache);
        }

        if (!item.struct.get('compressedSize')) {
            let flatSize = item.struct.get('flatSize');
            let filePos = item.struct.get('dataStartPtr');
            let buffer = this.file.slice(filePos, filePos + flatSize);
            return Stream.Readable.from(buffer);
        }

        return new HapiReader(this, item);
    }

    private loadItem(buffer: Buffer, isDirectory: boolean, parentPath: string) {
        let item: DirectoryItem | EntryItem;
        let namePtr: number;

        if (isDirectory) {
            item = new DirectoryItem();
            item.struct = new DirectoryStruct(buffer);
            namePtr = item.struct.get('namePtr');
        }
        else {
            item = new EntryItem();
            item.struct = new EntryStruct(buffer);
            item.size = item.struct.get('flatSize');
            namePtr = item.struct.get('namePtr');
        }

        let nameBuf = this.namesBuffer.slice(namePtr);
        let name = nameBuf.toString('utf8', 0, nameBuf.indexOf(0)); // TODO validate boundary
        let path = parentPath + name;
        if (isDirectory) path += '/';

        item.name = name;
        item.path = path;

        return item;
    }

    private loadChildren(parent: DirectoryItem) {
        let children: HapiItem[] = [];

        let subDirCount = parent.struct.get('subDirCount');
        let firstSubDirPtr = parent.struct.get('firstSubDirPtr');

        for (let index = 0; index < subDirCount; index++) {
            let nextOffset = firstSubDirPtr + (index * DirectoryStruct.totalLength);
            let nextBuffer = this.directoryBuffer.slice(nextOffset, nextOffset + DirectoryStruct.totalLength);
            let nextItem = <DirectoryItem> this.loadItem(nextBuffer, true, parent.path);

            nextItem.structOrigin = nextOffset;
            nextItem.parent = parent;
            nextItem.children = this.loadChildren(nextItem);

            children.push(nextItem);
        }

        let fileCount = parent.struct.get('fileCount');
        let firstFilePtr = parent.struct.get('firstFilePtr');

        for (let index = 0; index < fileCount; index++) {
            let nextOffset = firstFilePtr + (index * EntryStruct.totalLength);
            let nextBuffer = this.directoryBuffer.slice(nextOffset, nextOffset + EntryStruct.totalLength);
            let nextItem = this.loadItem(nextBuffer, false, parent.path);

            nextItem.structOrigin = nextOffset;
            nextItem.parent = parent;
            children.push(nextItem);
        }

        return children;
    }
}
