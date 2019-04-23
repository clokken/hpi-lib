import * as fs from "fs";

export interface DataSource {
    read(position: number, length: number, buffer?: Buffer): Buffer;
}

export class BufferSource implements DataSource {
    private buffer: Buffer;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    read(position: number, length: number) {
        // return Buffer.from(this.buffer, position, length);
        return this.buffer.slice(position, position + length);
    }
}

/*export class FileSource implements DataSource {
    read(position: number, length: number, buffer: Buffer) {
        let out = buffer ? buffer : Buffer.alloc(length);

        fs.readSync(0, out, 0, length, position);
        return out;
    }
}*/
