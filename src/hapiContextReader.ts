import { HapiContext } from "./hapiContext";
import { HeaderStruct, VersionStruct, ChunkStruct } from "./structs";
import { ReadonlyHapiItem } from "./hapiItem";
import { ReadonlyEntryItem } from "./entryItem";
import { ReadonlyDirectoryItem } from "./directoryItem";
import { HapiItemReader } from "./hapiItemReader";
import * as BufferUtils from "./bufferUtils";
import * as Stream from "stream";

export interface HapiContextReaderOptions {
    // TODO
}

export class HapiContextReader implements HapiContext {
    protected _file: Buffer;
    protected _version: VersionStruct;
    protected _header: HeaderStruct;
    protected _directoryBuffer: Buffer;
    protected _namesBuffer: Buffer;
    protected _rootItem: ReadonlyDirectoryItem;

    protected constructor() {}

    get file() { return this._file; }
    get version() { return this._version; }
    get header() { return this._header; }
    get directoryBuffer() { return this._directoryBuffer; }
    get namesBuffer() { return this._namesBuffer; }
    get rootItem() { return this._rootItem; }

    extractAsBuffer(item: ReadonlyEntryItem): Buffer {
        if (item.cache) {
            return item.cache;
        }

        let resultBuffer: Buffer;
        let checksum: number;

        if (item.struct.getField('compressedSize')) {
            let written = 0;
            let offset = item.struct.getField('dataStartPtr');
            let buffer = Buffer.alloc(item.struct.getField('flatSize'));
            checksum = 0;

            while (written < buffer.length) {
                let chunkBuffer = this.file.slice(offset, offset + ChunkStruct.totalLength);
                offset += chunkBuffer.length;

                /* the Chunk struct is just a header that describes
                * the block of data that follows it */
                let chunk = new ChunkStruct(chunkBuffer);
                let sqshBuffer = this.file.slice(offset, offset + chunk.getField('compressedSize'));
                offset += sqshBuffer.length;

                let flatBuffer = BufferUtils.decompress(sqshBuffer, chunk);

                if (flatBuffer.length !== chunk.getField('flatSize'))
                    throw new Error(`Error decompressing chunk. Expected: ${chunk.getField('flatSize')} bytes; Got: ${flatBuffer.length} bytes`);

                flatBuffer.copy(buffer, written);
                checksum = BufferUtils.calcChecksum(checksum, buffer, flatBuffer.length);
                written += flatBuffer.length;
            }

            resultBuffer = buffer;
        }
        else {
            let flatSize = item.struct.getField('flatSize');
            let filePos = item.struct.getField('dataStartPtr');

            resultBuffer = this.file.slice(filePos, filePos + flatSize);
            checksum = BufferUtils.calcChecksum(0, resultBuffer, flatSize);
        }

        let expectedChecksum = item.struct.getField('checksum');

        // TODO
        /*if (checksum !== expectedChecksum)
            throw new Error(`Checksum mismatch when extracting. Expected: ${expectedChecksum}; Got: ${checksum}`);*/

        return resultBuffer;
    }

    /**
     *
     * @deprecated OH HOW THE TABLES TURN (this was deprecated because it doesn't contain checksum validation)
     */
    createItemReadStream(item: ReadonlyEntryItem): Stream.Readable {
        if (item.cache) {
            return Stream.Readable.from(item.cache);
        }

        if (!item.struct.getField('compressedSize')) {
            let flatSize = item.struct.getField('flatSize');
            let filePos = item.struct.getField('dataStartPtr');
            let buffer = this.file.slice(filePos, filePos + flatSize);
            return Stream.Readable.from(buffer);
        }

        return new HapiItemReader(this, item);
    }

    updateChecksumVerification(prevChecksum: number, buffer: Buffer, written: number) {
        return BufferUtils.calcChecksum(prevChecksum, buffer, written);
    }

    getItemParent(item: ReadonlyHapiItem): ReadonlyDirectoryItem {
        throw 'TODO'; // iterate this.rootItem in search for the item's parent
    }
}
