var gulp = require('gulp');
var paths = require('../paths');
var browserSync = require('browser-sync');
var path = require('path');

// outputs changes to files to the console
function reportChange(event) {
	console.log('File ' + event.path + ' was ' + event.type + ', running tasks...');
}

// this task wil watch for changes
// to js, html, and css files and call the
// reportChange method. Also, by depending on the
// serve task, it will instantiate a browserSync session
gulp.task('watch', ['serve'], function () {
	gulp.watch(path.join(__dirname, '../../' + paths.source), ['build-system','eslint', browserSync.reload]).on('change', reportChange);
	gulp.watch(path.join(__dirname, '../../' + paths.html), ['build-html', browserSync.reload]).on('change', reportChange);
	gulp.watch(path.join(__dirname, '../../' + paths.appLess), ['less', browserSync.reload]).on('change', reportChange);
	gulp.watch('../theme.js', ['less', browserSync.reload]).on('change', reportChange);
    gulp.watch(path.join(__dirname, '../../' + paths.theme + '/*.less'), ['theme-generate', browserSync.reload]).on('change', reportChange);
});
