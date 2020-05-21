import { HapiItem } from "./hapiItem";
import { DirectoryStruct } from "./structs";
import { EntryItem } from './entryItem';

export enum ItemFilter {
    ANY,
    ENTRY_ONLY,
    DIRECTORY_ONLY,
};

interface IndexedDirectory {
    dir: DirectoryItem,
    idx: number
};

export class DirectoryItem extends HapiItem {
    children: HapiItem[];

    get struct() {
        return <DirectoryStruct> this._struct;
    }

    set struct(struct: DirectoryStruct) {
        this._struct = struct;
    }

    get isDirectory() {
        return true;
    }

    debugPrint() {
        let me = `${this.path}\n`;
        let children = this.children.map(child => child.debugPrint()).join('');
        return me + children;
    }

    findChildren(name: string, limit?: number, filter?: ItemFilter.ENTRY_ONLY, recurseDown?: boolean): EntryItem[];
    findChildren(name: string, limit?: number, filter?: ItemFilter.DIRECTORY_ONLY, recurseDown?: boolean): DirectoryItem[];
    findChildren(name: string, limit?: number, filter?: ItemFilter, recurseDown?: boolean): HapiItem[];

    findChildren(name: string, limit: number = -1, filter = ItemFilter.ANY, recurseDown = true): HapiItem[] {
        let result: HapiItem[] = [];

        name = name.toLowerCase();
        let regexp: RegExp = null;

        if (name.indexOf('*') > -1)
            regexp = wildcardToRegExp(name);

        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            let match = false;

            if (filter == ItemFilter.DIRECTORY_ONLY && !child.isDirectory)
                continue;
            if (filter == ItemFilter.ENTRY_ONLY && child.isDirectory)
                continue;

            if (regexp)
                match = regexp.exec(child.name.toLowerCase()) != null;
            else
                match = name == child.name.toLowerCase();

            if (match)
                result.push(child);

            if (result.length == limit)
                return result;
        }

        if (!recurseDown)
            return result;

        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            if (!child.isDirectory)
                continue;

            let remainder = limit == -1 ? -1 : (limit - result.length);
            let recursedChildren = (<DirectoryItem> child).findChildren(name, remainder, filter, true);

            if (recursedChildren.length)
                result = result.concat(recursedChildren);

            if (result.length == limit)
                break;
        }

        return result;
    }

    findChild(name: string, filter?: ItemFilter.ENTRY_ONLY, recurseDown?: boolean): EntryItem;
    findChild(name: string, filter?: ItemFilter.DIRECTORY_ONLY, recurseDown?: boolean): DirectoryItem;
    findChild(name: string, filter?: ItemFilter, recurseDown?: boolean): HapiItem;

    findChild(name: string, filter = ItemFilter.ANY, recurseDown = true): HapiItem {
        let result = this.findChildren(name, 1, filter, recurseDown);
        return result.length ? result[0] : null;
    }

    private findChildrenAtNodes(nodes: string[], nodePos: number, limit: number, filter = ItemFilter.ANY): HapiItem[] {
        let result: HapiItem[] = [];

        let currentNode = nodes[nodePos];
        let isLast = nodePos == nodes.length - 1;
        let nextFilter = isLast ? filter : ItemFilter.DIRECTORY_ONLY;
        let nextLimit = isLast ? limit : -1;

        let find = this.findChildren(currentNode, nextLimit, nextFilter, false);

        if (isLast) {
            result = result.concat(find);
            return result;
        }

        for (let i = 0; i < find.length; i++) {
            let child = find[i];
            if (child.isDirectory) {
                let remainder = limit == -1 ? -1 : (limit - result.length);
                let subResult = (<DirectoryItem> child).findChildrenAtNodes(nodes, nodePos + 1, remainder, filter);

                if (subResult.length)
                    result = result.concat(subResult);

                if (result.length == limit)
                    break;
            }
        }

        return result;
    }

    findChildrenAt(fullpath: string, limit: number = -1): HapiItem[] {
        let expectDirectory = fullpath.endsWith('/');
        if (expectDirectory)
            fullpath = fullpath.substr(0, fullpath.length - 1);

        let nodes = fullpath.split('/'); // [ '', 'unitscb', 'arabow.fbi' ]
        if (nodes[0] == '')
            nodes = nodes.slice(1);

        return this.findChildrenAtNodes(nodes, 0, limit, expectDirectory ? ItemFilter.DIRECTORY_ONLY : ItemFilter.ANY);
    }

    findChildAt(fullpath: string) {
        let result = this.findChildrenAt(fullpath, 1);
        return result.length ? result[0] : null;
    }
}

function wildcardToRegExp (s: string) {
    return new RegExp('^' + s.split(/\*+/).map(regExpEscape).join('.*') + '$');
}

function regExpEscape (s: string) {
    return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}
