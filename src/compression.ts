import * as pako from 'pako';

export function decompressZLib(source: Buffer) {
    let output = pako.inflate(source);
    return Buffer.from(output);
}

export function compressZLib(source: Buffer) {
    let output = pako.deflate(source);
    return Buffer.from(output);
}
