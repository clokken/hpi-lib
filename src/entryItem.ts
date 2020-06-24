import { ReadonlyHapiItem, HapiItem } from "./hapiItem";
import { EntryField, ReadonlyStruct, Struct } from "./structs";
import { DirectoryItem } from './directoryItem';

export class ReadonlyEntryItem extends ReadonlyHapiItem {
    readonly isDirectory = false;

    protected _size: number;
    protected _cache: Buffer;
    protected _struct: ReadonlyStruct<EntryField>;

    get size() { return this._size; }
    get cache() { return this._cache; }
    get struct() { return this._struct; }

    debugPrint() {
        return `${this._path} (${this._size})\n`;
    }
}

export class EntryItem extends ReadonlyEntryItem {
    get struct() {
        return this._struct as Struct<EntryField>;
    }

    // Make ReadonlyEntryItem's fields writeable:
    setStruct(struct: Struct<EntryField>) { this._struct = struct; }
    setSize(size: number) { this._size = size; }
    setCache(cache: Buffer) { this._cache = cache; }

    // Make ReadonlyHapiItem's fields writeable:
    setParent(parent: DirectoryItem) { this._parent = parent; }
    setName(name: string) { this._name = name; }
    setPath(path: string) { this._path = path; }
    setStructOrigin(structOrigin: number) { this._structOrigin = structOrigin; }
}
