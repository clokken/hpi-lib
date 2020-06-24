import { ReadonlyStruct, EntryField, DirectoryField } from "./structs";
import { DirectoryItem } from './directoryItem';

export abstract class ReadonlyHapiItem {
    protected _parent: DirectoryItem;
    protected _name: string;
    protected _path: string;
    protected _struct: ReadonlyStruct<EntryField> | ReadonlyStruct<DirectoryField>;

    /**
     * This is relative to the hapi's directoryBuffer.
     * It is NOT relative to hapi.header.dirBlockPtr because
     * that is the compressed part of the file. The hapi's
     * directoryBuffer is the resulting decompressed buffer.
     */
    protected _structOrigin: number;

    get parent() { return this._parent; }
    get name() { return this._name; }
    get path() { return this._path; }
    get struct() { return this._struct };
    get structOrigin() { return this._structOrigin; }

    abstract get isDirectory(): boolean;
    abstract debugPrint(): string;
}

export abstract class HapiItem extends ReadonlyHapiItem {
    abstract setParent(parent: DirectoryItem): void;
    abstract setName(name: string): void;
    abstract setPath(path: string): void;
    abstract setStructOrigin(structOrigin: number): void;
}
