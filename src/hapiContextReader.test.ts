import * as Fs from 'fs'
import * as Path from 'path';
import * as Yauzl from 'yauzl';
import * as Crypto from 'crypto';
import * as del from 'del';
import * as JestHelpers from '../test/jestHelpers';
import { HapiContextReader } from './hapiContextReader';
import { ItemFilter } from './directoryItem';
import { HapiContextLoader } from './hapiContextLoader';

const TEST_PATH = Path.join(process.cwd(), 'test');
const TEMP_PATH = Path.join(TEST_PATH, 'temp', 'hapiContextReader.test.ts');
const HPI_PATH = Path.join(TEST_PATH, 'v3rocket.hpi');
let bytes = Fs.readFileSync(HPI_PATH);
let hapi: HapiContextReader;

beforeAll(async () => {
    await del(TEMP_PATH);
    JestHelpers.mkdirpSync(TEMP_PATH);

    hapi = null;
    return HapiContextLoader.load(Buffer.from(bytes)).then(ctx => {
        hapi = ctx;
    });
});

test('hapi should parse a valid version', () => {
    expect(hapi.version.getField('marker')).toBe(0x49504148);
    expect(hapi.version.getField('version')).toBe(0x20000);
});

test('hapi should have a sactisfatory item structure', () => {
    expect(hapi.rootItem.children).toHaveLength(19);
});

test('checksum of files extracted by hapi should match checksum of files extracted by HPI View', async () => {
    const createHash = () => Crypto.createHash('md5');

    type ChecksumMap = Map<string, string>; // filename => checksum
    let path = Path.join(process.cwd(), 'test/v3rocket-by-hpiview.zip');

    let hpiviewPromise = new Promise<ChecksumMap>(resolve => {
        let checksums: ChecksumMap = new Map();

        Yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
            if (err) throw err;

            zipfile.readEntry();

            zipfile.on('entry', (entry: Yauzl.Entry) => {
                if (/\/$/.test(entry.fileName)) {
                    zipfile.readEntry();
                } else {
                    zipfile.openReadStream(entry, (err, readstream) => {
                        if (err) throw err;

                        let hasher = createHash();
                        hasher.setEncoding('hex');

                        readstream.pipe(hasher).on('finish', () => {
                            checksums.set(entry.fileName, hasher.read());
                        });

                        readstream.on('end', () => zipfile.readEntry());
                    });
                }
            });

            zipfile.once("end", function() {
                zipfile.close();
                resolve(checksums);
            });
        });
    });

    let hpiviewChecksums = await hpiviewPromise;

    let hapiItems = hapi.rootItem.findChildren('*', null, ItemFilter.ENTRY_ONLY, true);

    let modeIdx = 0; // used to alternate between reading from a stream and reading from a buffer
    let hapiChecksums: ChecksumMap = new Map();
    let hapiPromises = hapiItems.map(item => {
        modeIdx++;

        return new Promise(resolve => {
            let hasher = createHash();

            if (modeIdx % 2 === 0) {
                let stream = hapi.createItemReadStream(item);

                stream.pipe(hasher).on('finish', () => {
                    hasher.setEncoding('hex');
                    hapiChecksums.set(item.path, hasher.read());
                    resolve();
                });
            } else {
                let buffer = hapi.extractAsBuffer(item);
                let checksum = createHash().update(buffer).digest('hex');
                hapiChecksums.set(item.path, checksum);
                resolve();
            }
        });
    });

    await Promise.all(hapiPromises);

    hpiviewChecksums.forEach((value, key) => {
        key = key.startsWith('/') ? key : '/' + key;
        let match = hapiChecksums.get(key);

        if (match === undefined)
            throw `File "${key}" is missing from hapi-extracted items.`;

        if (match !== value)
            throw `File "${key}" has different checksums.\nHPI View: ${value}\nhpi-lib: ${match}`;

        hapiChecksums.delete(key);
    });

    if (hapiChecksums.size > 0)
        throw 'Hapi extracted one or more extra files that weren\'t extracted by HPI View:\n' +
            Array.from(hapiChecksums.keys()).join('\n');
});

afterAll(async () => {
    await del(TEMP_PATH);
});
