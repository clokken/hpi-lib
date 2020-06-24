import * as Yauzl from "yauzl";
import * as Path from "path";
import * as Fs from "fs";
import { Transform } from "stream";

export function yauzlExtract(zipFilePath: string, zipDestPath: string, verbose: boolean) {
    return new Promise((resolve, reject) => {
        Yauzl.open(zipFilePath, {lazyEntries: true}, (err, zipfile) => {
            handleZipFile(err, zipfile, zipDestPath, verbose, resolve, reject);
        });
    });
}

function handleZipFile(err: Error, zipfile: Yauzl.ZipFile, zipdest: string, verbose: boolean,
    resolve: (a?: any) => void, reject: (e?: any) => void)
{
    if (err) throw err;

    // track when we've closed all our file handles
    var handleCount = 0;
    function incrementHandleCount() {
        handleCount++;
    }
    function decrementHandleCount() {
        handleCount--;
        if (handleCount === 0) {
            // console.log("all input and output handles closed");
            resolve();
        }
    }

    incrementHandleCount();
    zipfile.on("close", function() {
        // console.log("closed input file");
        decrementHandleCount();
    });

    zipfile.readEntry();
    zipfile.on("entry", function(entry) {
        if (/\/$/.test(entry.fileName)) {
            // directory file names end with '/'
            mkdirp(Path.join(zipdest, entry.fileName), function() {
                if (err) throw err;
                zipfile.readEntry();
            });
        } else {
            // ensure parent directory exists
            mkdirp(Path.join(zipdest, Path.dirname(entry.fileName)), function() {
                zipfile.openReadStream(entry, function(err, readStream) {
                    if (err) throw err;
                    // report progress through large files
                    var byteCount = 0;
                    var totalBytes = entry.uncompressedSize;
                    var lastReportedString = byteCount + "/" + totalBytes + "  0%";
                    // process.stdout.write(entry.fileName + "..." + lastReportedString);

                    var filter = new Transform();
                    filter._transform = function(chunk, encoding, cb) {
                        byteCount += chunk.length;
                        cb(null, chunk);
                    };
                    filter._flush = function(cb) {
                        cb();
                        zipfile.readEntry();
                    };

                    // pump file contents
                    var writeStream = Fs.createWriteStream(Path.join(zipdest, entry.fileName));
                    incrementHandleCount();
                    writeStream.on("close", decrementHandleCount);
                    readStream.pipe(filter).pipe(writeStream);
                });
            });
        }
    });
}

export function mkdirp(dir: string, cb?: (err?: NodeJS.ErrnoException | null) => void) {
    if (dir === ".") return cb();
    Fs.stat(dir, function(err) {
        if (err == null) return cb(); // already exists

        var parent = Path.dirname(dir);
        mkdirp(parent, function() {
            // process.stdout.write(dir.replace(/\/$/, "") + "/\n");
            Fs.mkdir(dir, cb);
        });
    });
}

export function mkdirpSync(dir: string) {
    Fs.mkdirSync(dir, { recursive: true });
}
