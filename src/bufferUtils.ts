import { ChunkStruct } from './structs';
import { decompressZLib, compressZLib } from './compression';
import { SQSH_MARKER } from './hapiContext';

export function decompressChunkBuffer(source: Buffer, srcOffset: number, srcLength: number) { // TODO remove srcOffset and srcLenght
    let block = source.slice(srcOffset, srcOffset + srcLength);

    let chunk = new ChunkStruct(block);

    if (chunk.getField('marker') == SQSH_MARKER) {
        let output = decompress(block.slice(ChunkStruct.totalLength), chunk);

        if (output.length != chunk.getField('flatSize'))
            throw new Error('Decompression Error! Expected: ' + chunk.getField('flatSize') + '; Got: ' + output.length);

        return output;
    }
    else {
        return block;
    }
}

export function decompress(buffer: Buffer, chunk: ChunkStruct) {
    let checksum = 0;
    let isEncrypted = chunk.getField('isEncrypted');

    for (let x = 0; x < chunk.getField('compressedSize'); x++) {
        checksum += buffer[x];

        if (isEncrypted)
            buffer[x] = (buffer[x] - x) ^ x;
    }

    if (chunk.getField('checksum') != checksum)
        throw new Error(`Checksum mismatch! Expected: ${chunk.getField('checksum')} Got: ${checksum}`);

    let compMethod = chunk.getField('compMethod');

    if (compMethod == 1)
        throw new Error('LZ77 decompression is not yet supported');
    else if (compMethod == 2)
        return decompressZLib(buffer);

    throw new Error('Unknown compression method: ' + compMethod);
}

// the opposite of decompressChunkBuffer
export function compressChunkBuffer(input: Buffer, encrypt = false): [ChunkStruct, Buffer] {
    let compressedBuffer = compressZLib(input);

    let checksum = 0;

    for (let x = 0; x < compressedBuffer.length; x++) {
        let next = compressedBuffer[x];

        if (encrypt) {
            next = (next ^ x) + x;
            compressedBuffer[x] = next;
        }

        checksum += next;
    }

    let chunk = new ChunkStruct(null);
    chunk.setField('marker', SQSH_MARKER);
    chunk.setField('unknown1', 0);
    chunk.setField('compMethod', 2);
    chunk.setField('isEncrypted', 0);
    chunk.setField('compressedSize', compressedBuffer.length);
    chunk.setField('flatSize', input.length);
    chunk.setField('checksum', checksum);

    return [chunk, compressedBuffer];
}

export function calcChecksum(prevChecksum: number, buffer: Buffer, size?: number): number {
    if (size === null || size === undefined)
        size = buffer.length;

    let bytes = [
        (prevChecksum & 0xff000000) >> 24,
        (prevChecksum & 0x00ff0000) >> 16,
        (prevChecksum & 0x0000ff00) >> 8,
        (prevChecksum & 0x000000ff),
    ];

    for (let count = 0; count < size; count++) {
        let c = buffer[count];

        bytes[0] += c;
        bytes[1] ^= c;
        bytes[2] += (c ^ (count & 0x000000FF));
        bytes[3] ^= (c ^ (count & 0x000000FF));
    }

    return new Uint32Array(bytes)[0];
}
