import { EntryStruct, DirectoryStruct } from "./structs";

export abstract class HapiItem {
    parent: HapiItem;
    name: string;
    path: string;

    /**
     * This is relative to the hapi's directoryBuffer.
     * It is NOT relative to hapi.header.dirBlockPtr because
     * that is the compressed part of the file. The hapi's
     * directoryBuffer is the resulting decompressed buffer.
     */
    structOrigin: number;

    protected _struct: EntryStruct | DirectoryStruct;

    abstract get isDirectory(): boolean;

    abstract debugPrint(): string;
}
