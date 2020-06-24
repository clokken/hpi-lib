import * as Stream from "stream";
import { ReadonlyEntryItem } from './entryItem';
import { ReadonlyDirectoryItem } from './directoryItem';
import { HapiContextReader } from './hapiContextReader';

export interface HapiContextWriterOptions {
    autoCommit?: boolean; // default: true
}

export class HapiContextWriter extends HapiContextReader {
    commit(): Promise<void> {
        throw 'TODO';
    }

    rollback(): Promise<void> {
        throw 'TODO';
    }

    addFile(file: Stream.Readable | Buffer, parentPath: string, name: string): Promise<ReadonlyEntryItem> {
        throw 'TODO';
    }

    replaceFile(file: Stream.Readable | Buffer, entryPath: string): Promise<ReadonlyEntryItem> {
        throw 'TODO';
    }

    deleteFile(entryPath: string): Promise<void> {
        throw 'TODO';
    }

    makeDirectoryAt(parentPath: string, name: string): Promise<ReadonlyDirectoryItem> {
        throw 'TODO';
    }

    deleteDirectory(dirPath: string, force: boolean): Promise<void> {
        throw 'TODO';
    }

    /** This also allows the "RENAME" functionality */
    moveItem(oldParentPath: string, oldName: string, newParentPath: string, newName?: string): Promise<void> {
        throw 'TODO';
    }
}
