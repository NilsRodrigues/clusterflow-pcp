//
// Brunch configuration file.
//
exports.config = {
    sourceMaps: false,
    paths: {
        watched: ['app']
    },
    files: {
        javascripts: {
            joinTo: {
                'js/app.js': /^app/,
                'js/vendor.js': /^(?!(app|vsbuild))/
            }
        },
        stylesheets: {
            joinTo: {
                'css/app.css': /^app/,
                'css/vendor.css': /^(?!app)/
            },
        },
        templates: {
            joinTo: 'js/app.js'
        }
    },
    plugins: {
        brunchTypescript: {
            /* ScriptTarget in TS source is 'const'.
             * Typescript-brunch 2.3.0 has been built against TS from 2017.
             * Therefore, TS-brunch doesn't know newer targets supported by TS.
             * Workaround: use numbers instead of strings, because they are passed through without enum-resolution.
             * 
             * From TS 3.8.3 source:
             * 
             * ES3 = 0,
             * ES5 = 1,
             * ES2015 = 2,
             * ES2016 = 3,
             * ES2017 = 4,
             * ES2018 = 5,
             * ES2019 = 6,
             * ES2020 = 7,
             * ESNext = 99,
             * JSON = 100,
             * Latest = ESNext
             */
            target: 6,
            lib: ["ES2019"],
            ignoreErrors: true,
            typeRoots: [
                "./node_modules/@types"
            ],
            types: [
                "core-js"
            ],
            sourceMap: false
        }
    },
    server: {
        port: 9000
        ,hostname: "0.0.0.0" // listen to connections from any computer (for example when using RDP connections)
    }
};
