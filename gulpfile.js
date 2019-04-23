const gulp = require('gulp');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const del = require('del');
const sourcemaps = require('gulp-sourcemaps');
const gulpSequence = require('gulp-sequence');
const exec = require('child_process').exec;
const fs = require('fs');
const timestamp = './dist/timestamp';

gulp.task('ts', (cb) => {
    // return gulp.src(['./src/**/*.ts', '!./src/**/*.test.ts'])
    return gulp.src('./src/**/*.ts')
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .on('error', function (err) {
            this.emit('end');
        })
        .pipe(sourcemaps.write({ sourceRoot: (file) => file.cwd + '/src' }))
        .pipe(gulp.dest('./dist/'));
});

gulp.task('clean', cb => {
    return del(['./dist/*'], cb);
});

gulp.task('mark-dirty', cb => {
    exec('touch ' + timestamp, () => {
        cb();
    });
});

gulp.task('mark-clean', cb => {
    return del([timestamp], cb);
});

gulp.task('watch', () => {
    gulp.watch(['src/**/*.ts', '!src/**/*.test.ts'], ['mark-dirty']);
});

gulp.task('build', (cb) => {
    let isNew = fs.existsSync(timestamp);

    if (isNew) {
        gulpSequence('ts', 'mark-clean')(err => {
            cb(err);
        });
    }
    else {
        cb();
    }
});

gulp.task('live', () => {
    gulp.watch('src/**/*.ts', ['ts']);
});

gulp.task('force-run', (cb) => {
    exec('node ./dist/test.js', (err, stdout, stderr) => {
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
        cb(err);
    });
});

gulp.task('run', gulpSequence('build', 'force-run'));

gulp.task('default', ['build']);
