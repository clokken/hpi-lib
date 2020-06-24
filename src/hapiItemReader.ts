import { HapiContext } from './hapiContext';
import { Stream } from 'stream';
import { ReadonlyEntryItem } from './entryItem';
import { ChunkStruct } from './structs';
import * as BufferUtils from "./bufferUtils";

export class HapiItemReader extends Stream.Readable {
    private hapi: HapiContext;
    private flatSize: number;
    private cursor: number;
    private progress = 0;

    constructor(hapi: HapiContext, item: ReadonlyEntryItem) {
        super();

        this.hapi = hapi;
        this.flatSize = item.struct.getField('flatSize');
        this.cursor = item.struct.getField('dataStartPtr');
    }

    _read(size: number) {
        if (this.progress < this.flatSize) {
            // read the next Chunk
            let chunkBuffer = this.hapi.file.slice(this.cursor,
                    this.cursor + ChunkStruct.totalLength);
            this.cursor += chunkBuffer.length;

            /* the Chunk struct is just a header that describes
             * the block of data that follows it */
            let chunk = new ChunkStruct(chunkBuffer);
            let sqshBuffer = this.hapi.file.slice(this.cursor,
                this.cursor + chunk.getField('compressedSize'));
            this.cursor += sqshBuffer.length;

            let flatBuffer = BufferUtils.decompress(sqshBuffer, chunk);

            if (flatBuffer.length !== chunk.getField('flatSize'))
                this.destroy(new Error(`Error decompressing chunk. Expected: ${chunk.getField('flatSize')} bytes; Got: ${flatBuffer.length} bytes`));

            this.push(flatBuffer);
            this.progress += flatBuffer.length;
        }
        else {
            if (this.progress !== this.flatSize)
                this.destroy(new Error(`Error extracting item. Expected: ${this.flatSize} bytes; Got: ${this.progress} bytes`));

            this.push(null);
        }
    }
}
