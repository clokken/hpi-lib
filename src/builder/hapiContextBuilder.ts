import * as Stream from 'stream';
import { HapiContext, HAPI_MARKER, HAPI_VERSION, SQSH_MARKER } from '../hapiContext';
import {  VersionStruct, HeaderStruct, EntryStruct, ChunkStruct, DirectoryStruct } from '../structs';
import { HapiContextWriter } from '../hapiContextWriter';
import * as Path from 'path';
import * as BufferUtils from '../bufferUtils';
import { compressZLib } from '../compression';
import { EntryItem, ReadonlyEntryItem } from '../entryItem';
import { NamesSection, MappedName } from './namesSection';
import { DirectoryItem, ReadonlyDirectoryItem } from '../directoryItem';
import { HapiItem, ReadonlyHapiItem } from '../hapiItem';

export interface File {
    name: string;
    input: Stream.Readable | Buffer;
    size: number;
}

export interface Directory {
    name: string;
    children: FileOrDirectory[];
}

export type FileOrDirectory = File | Directory;

interface ProcessedFile {
    file: File;
    checksum: number;

    uncompressed: {
        data: Buffer;
        size: number; // same as data.length
    };

    // size is CHUNK_STRUCT_SIZE * 1 because the whole file goes into a single chunk.
    // if the file was split into multiple chunks the it would be CHUNK_STRUCT_SIZE * chunkCount
    compressed?: {
        data: Buffer;
        size: number; // same as (CHUNK_STRUCT_SIZE * 1) + data.length
        chunk: ChunkStruct; // the whole file goes into a single chunk!
    };
}

interface Indexer<T> {
    item: T;
    data: () => Buffer;
    position: number;
    length: number;
}

interface ChunkAndBuffer {
    buffer: Buffer; // aka Block (old hpi-lib), aka compressedBuffer
    chunk: ChunkStruct; // TODO maybe replace ChunkStruct with ChunkBuffer
}

function isFile(item: FileOrDirectory): item is File {
    return (item as File).input !== undefined;
}

function isDirectory(item: FileOrDirectory): item is Directory {
    return (item as Directory).children !== undefined;
}

export interface HapiContextBuilderOptions {
    //
}

export class HapiContextBuilder {
    static async buildBuffer(rootItems: FileOrDirectory[], options?: HapiContextBuilderOptions): Promise<Buffer> {
        let versionIdx: Indexer<VersionStruct>;
        let headerIdx: Indexer<HeaderStruct>;
        let processedFileIdxList: Indexer<ProcessedFile>[];
        let filesIdx: Indexer<Buffer[]>;
        let namesIdx: Indexer<ChunkStruct>;
        let dirsIdx: Indexer<ChunkStruct>;

        //:: Write the version buffer
        let versionBuffer = Buffer.alloc(VersionStruct.totalLength);
        let versionStruct = new VersionStruct(null);
        versionStruct.setField('marker', HAPI_MARKER);
        versionStruct.setField('version', HAPI_VERSION);
        versionStruct.saveToBuffer(versionBuffer);

        versionIdx = {
            item: versionStruct,
            data: () => versionBuffer,
            position: 0,
            length: VersionStruct.totalLength,
        };

        //:: Make a draft for the Header
        let headerBuffer = Buffer.alloc(HeaderStruct.totalLength);
        let headerStruct = new HeaderStruct(null); // will be filled later

        headerIdx = {
            item: headerStruct,
            data: () => headerBuffer,
            position: versionIdx.position + versionIdx.length,
            length: HeaderStruct.totalLength,
        };

        //:: Create the files data buffers
        let processedFiles: ProcessedFile[] = [];
        for await (let child of rootItems) {
            let childProcessedFiles = await HapiContextBuilder.compressFilesAndDirectories(child);
            processedFiles.push(...childProcessedFiles);
        }

        let _fileOffset = headerIdx.position + headerIdx.length;
        processedFileIdxList = processedFiles.map(processedFile => {
            let data = processedFile.compressed
                ? processedFile.compressed.data
                : processedFile.uncompressed.data;

            let size = processedFile.compressed
                ? processedFile.compressed.size
                : processedFile.uncompressed.size;

            let result: Indexer<ProcessedFile> = {
                item: processedFile,
                data: () => data,
                position: _fileOffset,
                length: size,
            };

            _fileOffset += size;
            return result;
        });

        //:: Flatten the array of files and get their buffers (and their chunks if compressed)
        let fileBuffers: Buffer[] = [];
        processedFiles.forEach(next => {
            if (next.compressed) {
                let chunkAsBuffer = Buffer.alloc(ChunkStruct.totalLength);
                next.compressed.chunk.saveToBuffer(chunkAsBuffer);
                fileBuffers.push(chunkAsBuffer);
                fileBuffers.push(next.compressed.data);
            }
            else {
                fileBuffers.push(next.uncompressed.data);
            }
        });

        if (processedFileIdxList.length > 0) {
            let first = processedFileIdxList[0];
            let last = processedFileIdxList[processedFileIdxList.length - 1];

            filesIdx = {
                item: fileBuffers,
                data: () => Buffer.concat(fileBuffers),
                position: first.position,
                length: (last.position - first.position) + last.length,
            };
        }
        else {
            filesIdx = null;
        }

        //:: Create the NamesSection (class for managing name positioning)
        let namesSection = new NamesSection();

        //:: Create the entry structs
        function nextEntryItem(file: File, parent: DirectoryItem): EntryItem {
            let indexer: Indexer<ProcessedFile> = processedFileIdxList
                .find(fileIdx => fileIdx.item.file === file);

            if (!indexer)
                throw new Error('Impossible');

            let struct = new EntryStruct(null);
            let name = namesSection.pushName(indexer.item.file.name);

            struct.setField('namePtr', name.position);
            struct.setField('dataStartPtr', indexer.position);
            struct.setField('flatSize', indexer.item.uncompressed.size);
            struct.setField('compressedSize', indexer.item.compressed?.size ?? 0);
            struct.setField('date', 0); // TODO!
            struct.setField('checksum', indexer.item.checksum);

            let entryItem = new EntryItem();
            entryItem.setStruct(struct);
            entryItem.setStructOrigin(undefined); // filled later (when !dirsPass)
            entryItem.setParent(parent);
            entryItem.setName(name.name);
            entryItem.setPath(Path.join(parent.path, file.name));
            entryItem.setCache(indexer.item.uncompressed.data);
            entryItem.setSize(indexer.item.uncompressed.size);

            return entryItem;
        }

        //:: Create the directory structs

        const INIT_PASS = 0, SUBDIR_PASS = 1, FILES_PASS = 2;
        function doNextOrderPass(dirItem: DirectoryItem, dirRef: Directory, cursor: number, path: string, pass: number): number {
            let subDirs = dirRef.children.filter(isDirectory);
            let subFiles = dirRef.children.filter(isFile);

            if (pass === INIT_PASS) {
                let dirStruct = new DirectoryStruct(null);

                let nameMap = namesSection.pushName(dirRef.name);

                dirStruct.setField('namePtr', nameMap.position);
                dirStruct.setField('subDirCount', subDirs.length);
                dirStruct.setField('fileCount', subFiles.length);

                dirItem.setPath(Path.join(path, nameMap.name));
                dirItem.setChildren([]);
                dirItem.setStructOrigin(cursor);
                dirItem.setStruct(dirStruct);

                cursor += DirectoryStruct.totalLength;
            }
            else if (pass === SUBDIR_PASS) {
                if (subDirs.length > 0)
                    dirItem.struct.setField('firstSubDirPtr', cursor);

                subDirs.forEach(subDir => {
                    let subDirItem = new DirectoryItem();
                    subDirItem.setParent(dirItem);
                    dirItem.children.push(subDirItem);

                    cursor = doNextOrderPass(subDirItem, subDir, cursor, dirItem.path, INIT_PASS);
                });

                subDirs.forEach((subDir, idx) => {
                    let subDirItem = dirItem.children[idx] as DirectoryItem;
                    cursor = doNextOrderPass(subDirItem, subDir, cursor, dirItem.path, SUBDIR_PASS);
                });
            }
            else if (pass === FILES_PASS) {
                if (subFiles.length > 0)
                    dirItem.struct.setField('firstFilePtr', cursor);

                subFiles.forEach(subFile => {
                    let subFileItem = nextEntryItem(subFile, dirItem);
                    subFileItem.setParent(dirItem);
                    subFileItem.setStructOrigin(cursor);
                    cursor += EntryStruct.totalLength;
                    dirItem.children.push(subFileItem);
                });

                subDirs.forEach((subDir, idx) => {
                    let subDirItem = dirItem.children[idx] as DirectoryItem;
                    cursor = doNextOrderPass(subDirItem, subDir, cursor, dirItem.path, FILES_PASS);
                });
            }

            return cursor;
        }

        let theRootDirectory: Directory = { name: '', children: rootItems };
        let theRootItem = new DirectoryItem();

        let cursor = doNextOrderPass(theRootItem, theRootDirectory, 0, '/', INIT_PASS);
        cursor = doNextOrderPass(theRootItem, theRootDirectory, cursor, '/', SUBDIR_PASS);
        cursor = doNextOrderPass(theRootItem, theRootDirectory, cursor, '/', FILES_PASS);
        let dirsBufferSize = cursor;

        //:: Create the flat namesBuffer
        let flatNamesBuffer: Buffer = namesSection.compile();

        //:: Compress the namesBuffer and create a Chunk to describe it
        let [namesChunk, namesBuffer] = BufferUtils.compressChunkBuffer(flatNamesBuffer);

        //:: Create the flat directoryBuffer (which uses the entryStructs and the directoryStructs)
        let flatDirsBuffer = Buffer.alloc(dirsBufferSize);

        function writeItemsToBuffer(nextItem: ReadonlyHapiItem) {
            let cursor = nextItem.structOrigin;
            nextItem.struct.saveToBuffer(flatDirsBuffer, cursor);

            if (nextItem.isDirectory) {
                (<ReadonlyDirectoryItem> nextItem).children.forEach(child => {
                    writeItemsToBuffer(child);
                });
            }
        }

        writeItemsToBuffer(theRootItem);

        /*console.log('Flat Dir Buffer Size: ' + flatDirsBuffer.length);
        console.log('DIRECTORY SIZE: ' + DirectoryStruct.totalLength);
        console.log('FILE SIZE:      ' + EntryStruct.totalLength);
        (function debugPrint(item: DirectoryItem) {
            console.log('---');
            console.log(item.path);
            console.log(`Location:     ${item.structOrigin} ~ ${item.structOrigin + DirectoryStruct.totalLength}`)
            console.log(`SubFiles:     ${item.struct.getField('fileCount')}`);
            console.log(`SubDirs:      ${item.struct.getField('subDirCount')}`);
            console.log(`firstSubFile: ${item.struct.getField('firstFilePtr')}`);
            console.log(`firstSubDir:  ${item.struct.getField('firstSubDirPtr')}`);

            item.children.filter(child => !child.isDirectory).forEach((child: EntryItem) => {
                console.log('. ' + child.path);
                console.log('origin: ' + child.structOrigin);
            });

            item.children.filter(child => child.isDirectory).forEach(debugPrint);
            console.log('');
        }
        (theRootItem));*/

        //:: Compress the directoryBuffer and create a Chunk to describe it
        let [dirsChunk, dirsBuffer] = BufferUtils.compressChunkBuffer(flatDirsBuffer);

        //:: Turn the chunks into actual buffers (and map them to the indexers)
        let nameChunkAsBuffer = Buffer.alloc(ChunkStruct.totalLength);
        let dirsChunkAsBuffer = Buffer.alloc(ChunkStruct.totalLength);

        namesChunk.saveToBuffer(nameChunkAsBuffer);
        dirsChunk.saveToBuffer(dirsChunkAsBuffer);

        namesIdx = {
            item: namesChunk,
            data: () => namesBuffer,
            position: filesIdx.position + filesIdx.length,
            length: ChunkStruct.totalLength + namesBuffer.length,
        };

        dirsIdx = {
            item: dirsChunk,
            data: () => dirsBuffer,
            position: namesIdx.position + namesIdx.length,
            length: ChunkStruct.totalLength + dirsBuffer.length,
        };

        //:: Fill up the Header using the draft made earlier on
        headerStruct.setField('namesBlockPtr', namesIdx.position);
        headerStruct.setField('namesBlockLen', namesIdx.length);
        headerStruct.setField('dirBlockPtr', dirsIdx.position);
        headerStruct.setField('dirBlockLen', dirsIdx.length);
        headerStruct.setField('data', filesIdx?.position ?? (headerIdx.position + headerIdx.length));
        headerStruct.setField('last78', 0);
        headerStruct.saveToBuffer(headerBuffer);

        function writeAll(buffer: Buffer, val: number) {
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] = val;
            }
        }

        //:: Finish and return the complete buffer
        let resultBuffer = Buffer.concat([
            versionBuffer,
            headerBuffer,
            ...fileBuffers,
            nameChunkAsBuffer,
            namesBuffer,
            dirsChunkAsBuffer,
            dirsBuffer,
        ]);

        return Promise.resolve(resultBuffer);
    }

    private static async compressFilesAndDirectories(next: FileOrDirectory): Promise<ProcessedFile[]> {
        let resultList: ProcessedFile[] = [];

        if (isDirectory(next)) {
            for await (let child of next.children) {
                let childResultList = await HapiContextBuilder.compressFilesAndDirectories(child);
                // resultList = resultList.concat(childResultList);
                resultList.push(...childResultList);
            }
        }
        else {
            let buffer: Buffer;

            if (next.input instanceof Buffer) {
                buffer = next.input;
            }
            else {
                let input = next.input;

                let bufferPromise = new Promise<Buffer>((resolve, reject) => {
                    let buffer = Buffer.alloc(next.size);
                    let written = 0;

                    input.once('end', () => resolve(buffer));
                    input.once('error', reject);

                    input.on('data', (data: Buffer) => {
                        data.copy(buffer, written);
                        written += data.length;
                    });
                });

                buffer = await bufferPromise;
            }

            let nextResult = HapiContextBuilder.compressFile(buffer, next);
            resultList.push(nextResult);
        }

        return resultList;
    }

    private static compressFile(fileBuffer: Buffer, fileRef: File): ProcessedFile {
        let fileChecksum = BufferUtils.calcChecksum(0, fileBuffer); // what's the point of this?

        if (fileBuffer.length > ChunkStruct.totalLength) {
            let chunk = new ChunkStruct(null);
            chunk.setField('marker', SQSH_MARKER);
            chunk.setField('unknown1', 0x02);
            chunk.setField('compMethod', 2);
            chunk.setField('isEncrypted', 0); // why bother encrypting
            chunk.setField('compressedSize', undefined); // will be filled later
            chunk.setField('flatSize', fileBuffer.length); // put the whole file inside a single chunk because why not
            chunk.setField('checksum', undefined); // will be filled later

            let compressedBuffer = compressZLib(fileBuffer);

            if (compressedBuffer.length <= 0)
                throw new Error('Error compressing file with ZLib');

            if (compressedBuffer.length > fileBuffer.length) {
                // if the compressed result is somohow larger than the original decompressed data
                // ... then there is no point compressing at all
                return {
                    file: fileRef,
                    checksum: fileChecksum,
                    uncompressed: {
                        data: fileBuffer,
                        size: fileBuffer.length,
                    },
                };
            }

            chunk.setField('compressedSize', compressedBuffer.length);

            let chunkChecksum = 0;
            for (let x = 0; x < compressedBuffer.length; x++) {
                let n = compressedBuffer[x];
                if (chunk.getField('isEncrypted')) {
                    n = (n ^ x) + x;
                    compressedBuffer[x] = n;
                }
                chunkChecksum += n;
            }
            chunk.setField('checksum', chunkChecksum);

            return {
                file: fileRef,
                checksum: fileChecksum,
                uncompressed: {
                    data: fileBuffer,
                    size: fileBuffer.length,
                },
                compressed: {
                    data: compressedBuffer,
                    size: ChunkStruct.totalLength + compressedBuffer.length,
                    chunk: chunk,
                }
            };
        }

        return {
            file: fileRef,
            checksum: fileChecksum,
            uncompressed: {
                data: fileBuffer,
                size: fileBuffer.length,
            },
        };
    }

    private static mapNames(next: FileOrDirectory, map: Map<FileOrDirectory, MappedName>, section: NamesSection): void {
        let nextName = section.pushName(next.name);
        map.set(next, nextName);

        if (isDirectory(next)) {
            for (let child of next.children) {
                HapiContextBuilder.mapNames(child, map, section);
            }
        }
    }
}
