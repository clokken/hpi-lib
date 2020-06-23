import { HapiContext } from './hapiContext';
import { Stream } from 'stream';
import { EntryItem } from './entryItem';
import { ChunkStruct } from './structs';
import * as BufferUtils from "./bufferUtils";

export class HapiReader extends Stream.Readable {
    private hapi: HapiContext;
    private flatSize: number;
    private cursor: number;
    private expectedSize: number;
    private progress = 0;

    constructor(hapi: HapiContext, item: EntryItem) {
        super();

        this.hapi = hapi;
        this.flatSize = item.struct.get('flatSize');
        this.cursor = item.struct.get('dataStartPtr');
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
                this.cursor + chunk.get('compressedSize'));
            this.cursor += sqshBuffer.length;

            let flatBuffer = BufferUtils.decompress(sqshBuffer, chunk);

            if (flatBuffer.length !== chunk.get('flatSize'))
                this.destroy(new Error(`Error decompressing chunk. Expected: ${chunk.get('flatSize')} bytes; Got: ${flatBuffer.length} bytes`));

            this.push(flatBuffer);
            this.progress += flatBuffer.length;
        }
        else {
            if (this.progress !== this.flatSize)
                this.destroy(new Error(`Error extracting item. Expected: ${this.expectedSize} bytes; Got: ${this.progress} bytes`));

            this.push(null);
        }
    }
}
