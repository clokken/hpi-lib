import { ChunkStruct } from './structs';
import { decompressZLib } from './compression';
import { HapiContext } from './hapiContext';

export function loadBuffer(source: Buffer, srcOffset: number, srcLength: number) {
    let block = source.slice(srcOffset, srcOffset + srcLength);

    let chunk = new ChunkStruct(block);

    if (chunk.get('marker') == HapiContext.SQSH_MARKER) {
        let output = decompress(block.slice(ChunkStruct.totalLength), chunk);

        if (output.length != chunk.get('flatSize'))
            throw new Error('Decompression Error! Expected: ' + chunk.get('flatSize') + '; Got: ' + output.length);

        return output;
    }
    else {
        return block;
    }
}

export function decompress(buffer: Buffer, chunk: ChunkStruct) {
    let checksum = 0;
    let isEncrypted = chunk.get('isEncrypted');

    for (let x = 0; x < chunk.get('compressedSize'); x++) {
        checksum += buffer[x];

        if (isEncrypted)
            buffer[x] = (buffer[x] - x) ^ x;
    }

    if (chunk.get('checksum') != checksum)
        throw new Error(`Checksum mismatch! Expected: ${chunk.get('checksum')} Got: ${checksum}`);

    let compMethod = chunk.get('compMethod');

    if (compMethod == 1)
        throw new Error('LZ77 decompression is not yet supported');
    else if (compMethod == 2)
        return decompressZLib(buffer);

    throw new Error('Unknown compression method: ' + compMethod);
}
