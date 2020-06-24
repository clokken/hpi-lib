import { HapiContextWriter } from './hapiContextWriter';
import { HapiContextReader } from './hapiContextReader';
import { VersionStruct, HeaderStruct, DirectoryStruct, EntryStruct } from './structs';
import { HapiError } from './errors/hapiError';
import { HAPI_MARKER, HAPI_VERSION } from './hapiContext';
import * as BufferUtils from "./bufferUtils";
import { DirectoryItem } from './directoryItem';
import { EntryItem } from './entryItem';
import { HapiItem } from './hapiItem';

export class HapiContextLoader extends HapiContextWriter {
    private constructor() {
        super();
    }

    static load(file: Buffer, writeable?: false): Promise<HapiContextReader>;
    static load(file: Buffer, writeable?: true): Promise<HapiContextWriter>;

    static load(file: Buffer, writeable = false): Promise<HapiContextReader> | Promise<HapiContextWriter> {
        return new Promise((resolve, reject) => {
            let hapi = new HapiContextLoader();
            hapi._file = file;

            hapi._version = new VersionStruct(file, 0);

            if (hapi.version.getField('marker') != HAPI_MARKER)
                return reject(HapiError.invalidMarker(HAPI_MARKER, hapi.version.getField('marker')));
            if (hapi.version.getField('version') != HAPI_VERSION)
                return reject(HapiError.invalidVersion(HAPI_VERSION, hapi.version.getField('version')));

            hapi._header = new HeaderStruct(file, VersionStruct.totalLength);

            hapi._directoryBuffer = BufferUtils.decompressChunkBuffer(file, hapi.header.getField('dirBlockPtr'), hapi.header.getField('dirBlockLen'));
            hapi._namesBuffer = BufferUtils.decompressChunkBuffer(file, hapi.header.getField('namesBlockPtr'), hapi.header.getField('namesBlockLen'));

            let rootBuffer = hapi.directoryBuffer.slice(0, DirectoryStruct.totalLength);
            let rootItem = new DirectoryItem();

            rootItem.setStruct(new DirectoryStruct(rootBuffer));
            rootItem.setName('');
            rootItem.setPath('/');
            rootItem.setChildren(hapi.loadChildren(rootItem));
            rootItem.setParent(null);
            rootItem.setStructOrigin(0);

            hapi._rootItem = rootItem;

            return resolve(hapi);
        });
    }

    private loadChildren(parent: DirectoryItem) {
        let children: HapiItem[] = [];

        let firstSubDirPtr = parent.struct.getField('firstSubDirPtr');
        let subDirCount = parent.struct.getField('subDirCount');

        for (let index = 0; index < subDirCount; index++) {
            let nextOffset = firstSubDirPtr + (index * DirectoryStruct.totalLength);
            let nextBuffer = this.directoryBuffer.slice(nextOffset, nextOffset + DirectoryStruct.totalLength);
            let nextItem = this.loadItem(nextBuffer, true, parent.path);

            nextItem.setStructOrigin(nextOffset);
            nextItem.setParent(parent);
            nextItem.setChildren(this.loadChildren(nextItem));

            children.push(nextItem);
        }

        let firstFilePtr = parent.struct.getField('firstFilePtr');
        let fileCount = parent.struct.getField('fileCount');

        for (let index = 0; index < fileCount; index++) {
            let nextOffset = firstFilePtr + (index * EntryStruct.totalLength);
            let nextBuffer = this.directoryBuffer.slice(nextOffset, nextOffset + EntryStruct.totalLength);
            let nextItem = this.loadItem(nextBuffer, false, parent.path);

            nextItem.setStructOrigin(nextOffset);
            nextItem.setParent(parent);
            children.push(nextItem);
        }

        return children;
    }

    private loadItem(buffer: Buffer, isDirectory: true, parentPath: string): DirectoryItem;
    private loadItem(buffer: Buffer, isDirectory: false, parentPath: string): EntryItem;

    private loadItem(buffer: Buffer, isDirectory: boolean, parentPath: string): DirectoryItem | EntryItem {
        let item: DirectoryItem | EntryItem;

        if (isDirectory) {
            item = new DirectoryItem();
            item.setStruct(new DirectoryStruct(buffer));
        }
        else {
            item = new EntryItem();
            item.setStruct(new EntryStruct(buffer));
            item.setSize(item.struct.getField('flatSize'));
        }

        let namePtr = item.struct.getField('namePtr');
        let nameBuf = this.namesBuffer.slice(namePtr);
        let name = nameBuf.toString('utf8', 0, nameBuf.indexOf(0)); // TODO validate boundary
        let path = parentPath + name;
        if (isDirectory) path += '/';

        item.setName(name);
        item.setPath(path);

        return item;
    }
}
