import * as Fs from 'fs'
import * as Path from 'path';
import * as Crypto from 'crypto';
import * as del from 'del';
import * as Glob from 'glob';
import * as JestHelpers from '../../test/jestHelpers';
import { jest } from '@jest/globals'
import { ItemFilter } from '../directoryItem';
import { HapiContextLoader } from '../hapiContextLoader';
import { FileOrDirectory, HapiContextBuilder, Directory } from './hapiContextBuilder';

const TEST_PATH = Path.join(process.cwd(), 'test');
const TEMP_PATH = Path.join(TEST_PATH, 'temp', 'hapiContextBuilder.test.ts');
const VERBOSE = process.argv.find(arg => arg === '--verbose') ? true : false;
const DEFAULT_TIMEOUT = 5000;

beforeAll(async () => {
    await del(TEMP_PATH);
    JestHelpers.mkdirpSync(TEMP_PATH);
    jest.setTimeout(DEFAULT_TIMEOUT);
});

test('checksum of files packed by hapi should match checksum of files extracted by hapi', async () => {
    let globsList = [
        ['src', 'test'], // both dirs go into the same HPI
        ['src/*'], // everything inside src goes into the HPI, but not the 'src' dir itself
        ['src/*', 'src/*'], // this should NOT add any redundant files! (TODO put in another test, possibly cli.test.ts when cli exists)
        ['src', 'src/*'], // this SHOULD add redundant files! (TODO put in another test, possibly cli.test.ts when cli exists)
    ];

    jest.setTimeout(globsList.length * DEFAULT_TIMEOUT);

    for await (let globs of globsList) {
        await testGlobs(globs);
        flushlog();
    }
});

test('checksum of files packed by hapi should match checksum of files extracted by hapi (v3rocket.zip test)', async () => {
    let zipFile = Path.join(TEST_PATH, 'v3rocket-by-hpiview.zip');
    let zipDest = Path.join(TEMP_PATH, 'v3rocket-by-hpiview');

    jest.setTimeout(20000);
    await JestHelpers.yauzlExtract(zipFile, zipDest, VERBOSE);
    jest.setTimeout(10000);
    await testGlobs([zipDest]);
});

afterAll(async () => {
    await del(TEMP_PATH);
    flushlog();
});

//:: Utility Functions
let _unilog = '';
function unilog(...what: any[]) {
    if (VERBOSE) {
        _unilog += what;
        _unilog += '\n';
    }
}

function flushlog() {
    if (VERBOSE && _unilog) {
        console.log(_unilog);
        _unilog = '';
    }
}

async function testGlobs(globs: string[]) {
    let pathlist: string[] = [];

    globs.forEach(nextGlob => {
        Glob.sync(nextGlob).forEach(nextMatch => {
            let realPath = Path.resolve(nextMatch);

            if (!Fs.existsSync(realPath))
                console.log(`File doesn't exist: ${realPath}`);

            if (!pathlist.includes(realPath))
                pathlist.push(realPath);
        });
    });

    if (pathlist.length === 0)
        throw `Empty pathlist generated for globs: ${globs.join(', ')}`;

    await testItems(pathlist);
}

async function testItems(rootPaths: string[]) {
    type ChecksumMap = Map<string, string>; // filename => checksum
    const createHash = () => Crypto.createHash('md5');
    let filesChecksums: ChecksumMap = new Map();

    function nextFileChecksum(realPath: string, relativePath: string) {
        if (Fs.statSync(realPath).isDirectory()) {
            Fs.readdirSync(realPath).forEach(subFile => {
                let nextRealPath = Path.join(realPath, subFile);
                let nextRelativePath = Path.join(relativePath, subFile);
                nextFileChecksum(nextRealPath, nextRelativePath);
            });
        }
        else {
            let checksum = createHash();
            let buf = Fs.readFileSync(realPath);
            let result = checksum.update(buf).digest('hex');
            filesChecksums.set(relativePath, result);
        }
    }

    rootPaths.forEach(rootPath => {
        nextFileChecksum(rootPath, Path.basename(rootPath));
    });

    let toClose: Fs.ReadStream[] = [];
    function nextHapiItem(nextPath: string) {
        let resultList: FileOrDirectory[] = [];
        let stats = Fs.statSync(nextPath);

        if (stats.isFile()) {
            let rs = Fs.createReadStream(nextPath);
            resultList.push({
                name: Path.basename(nextPath),
                input: rs,
                size: stats.size,
            });
            toClose.push(rs);
        }
        else {
            let children: FileOrDirectory[] = [];

            Fs.readdirSync(nextPath)
                .map(n => Path.join(nextPath, n))
                .forEach(child => {
                    children.push(...nextHapiItem(child));
                });

            resultList.push({
                name: Path.basename(nextPath),
                children: children,
            });
        }

        return resultList;
    };

    let rootItems: FileOrDirectory[] = [];
    rootPaths.map(nextHapiItem).forEach(items => {
        rootItems.push(...items);
    });

    function isDirectory(item: FileOrDirectory): item is Directory {
        return (item as Directory).children !== undefined;
    }
    function foo(next: FileOrDirectory, parent: string) {
        if (isDirectory(next)) {
            next.children.forEach(i => foo(i, Path.join(parent, next.name)));
        }
    };
    rootItems.forEach(i => foo(i, '/'));

    let hapiPackerBuffer = await HapiContextBuilder.buildBuffer(rootItems);

    toClose.forEach(rs => rs.close());

    let hapi = await HapiContextLoader.load(hapiPackerBuffer);
    let hapiItems = hapi.rootItem.findChildren('*', null, ItemFilter.ENTRY_ONLY, true);

    let hapiChecksums: ChecksumMap = new Map(
        hapiItems.map(item => {
            let buffer = hapi.extractAsBuffer(item);
            let checksum = createHash().update(buffer).digest('hex');
            return [item.path, checksum];
        })
    );

    filesChecksums.forEach((value, key) => {
        key = key.startsWith('/') ? key : '/' + key;
        let match = hapiChecksums.get(key);

        if (match === undefined) {
            // console.log(hapiChecksums);
            throw `File "${key}" is missing from hapi-packed items.`;
        }

        if (match !== value)
            throw `File "${key}" has different checksums.\nOriginal: ${value}\nhpi-lib: ${match}`;

        if (VERBOSE)
            unilog(`[OK] ${key} ${match}`);

        hapiChecksums.delete(key);
    });

    if (hapiChecksums.size > 0)
        throw 'Hapi packed one or more extra files that weren\'t in the original files:\n' +
            Array.from(hapiChecksums.keys()).join('\n');
}
