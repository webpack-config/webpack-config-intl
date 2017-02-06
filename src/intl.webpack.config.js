/* eslint-disable no-console */
import {dirname, join, sep, relative, isAbsolute} from 'path';
import fs from 'fs';

import compact from 'lodash/fp/compact';
import concat from 'lodash/fp/concat';
import eq from 'lodash/fp/eq';
import filter from 'lodash/fp/filter';
import find from 'lodash/fp/find';
import flow from 'lodash/fp/flow';
import identity from 'lodash/fp/identity';
import intersectionBy from 'lodash/fp/intersectionBy';
import map from 'lodash/fp/map';
import reject from 'lodash/fp/reject';
import toLower from 'lodash/fp/toLower';
import uniq from 'lodash/fp/uniq';

import chalk from 'chalk';
import webpack from 'webpack';
import {plugin, alias} from 'webpack-partial';
import nearest from 'find-nearest-file';
import localeEmoji from 'locale-emoji';

// Escape a string for injection within in regular expression.
const escapeRegExp = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

// Create a regular expression from a path.
const regexFromPath = (path, endRegExp) =>
  new RegExp(`${escapeRegExp(path)}${endRegExp || ''}$`, 'i');

const root = dirname(nearest('package.json'));

// Get the absolute path to the `/intl` directory containing message
// translation files.
const defaultMessgesDir = join(root, 'intl', 'messages');

// Get the absolute path to the `intl` package.
const intlPath = dirname(require.resolve('intl/package.json'));
const intlLocaleDataPath = join(intlPath, 'locale-data', 'jsonp');

// Get the absolute path to the `react-intl` package.
const reactIntlPath = dirname(require.resolve('react-intl/package.json'));
const reactIntlLocaleDataPath = join(reactIntlPath, 'locale-data');

/**
 * Instrument the webpack context module filtering process so that we can print
 * fancy emojis in the cosole as webpack dynamically adds files to the build.
 *
 * Several webpack plugins use a set of regexes to filter modules, a context
 * regex to match a directory and a module regex to match files within the
 * directory.
 *
 * A created instrumenter provides functions to wrap regexes provided to these
 * plugins to allow responding of processed module matches.
 *
 * The `handleContext` function is called for the first module match within
 * a context. It receives as arguments in order:
 *  - The path of the context.
 *  - The regular expression that matched the context.
 *  - The regular expression that matched the module.
 *
 * The `handleModule` function is called for every module match. It receives as
 * arguments in order:
 *  - The require path of the module, this may be relative to the context.
 *  - The path of the context.
 *  - The regular expression that matched the context.
 *  - The regular expression that matched the module.
 *
 * @param {Function} handleContext Log a context match.
 * @param {Function} handleModule Log a module match.
 * @returns {Object} An object with `context` and `module` regex wrapper funcs.
 */
const instrumentContextModule = (handleContext, handleModule) => {
  let contextRegex;
  let moduleRegex;
  let lastContext = null;
  let lastModule = null;
  let reportedContext = false;

  const report = () => {
    if (handleContext && lastContext && lastModule && !reportedContext) {
      handleContext(lastContext, contextRegex, moduleRegex);
      reportedContext = true;
    }

    if (handleModule && lastContext && lastModule) {
      handleModule(lastModule, lastContext, contextRegex, moduleRegex);
      lastModule = null;
    }
  };

  return {
    context: (regex) => {
      if (contextRegex) {
        throw new Error('`context` can only be called once');
      }
      contextRegex = regex;
      const test = contextRegex.test;

      contextRegex.test = function() {
        const result = test.apply(contextRegex, arguments);

        if (result && arguments[0] !== lastContext) {
          lastContext = arguments[0];
          report();
        }

        return result;
      };

      return contextRegex;
    },
    module: (regex) => {
      if (moduleRegex) {
        throw new Error('`module` can only be called once');
      }
      moduleRegex = regex;
      const test = moduleRegex.test;

      moduleRegex.test = function() {
        const result = test.apply(moduleRegex, arguments);

        if (result && arguments[0] !== lastModule) {
          lastModule = arguments[0];
          report();
        }

        return result;
      };

      return moduleRegex;
    },
  };
};

/*
 * Create an instrumented webpack `ContextReplacementPlugin.
 *
 * Matches the interface of the `ContextReplacementPlugin` constructor.
 */
const createContextReplacementPlugin = (contextRegex, moduleRegex, ...args) => {
  const logger = instrumentContextModule(
    (context, contextRegex, moduleRegex) => console.log(
      `🗃  ${chalk.bold('Context')} ${
        chalk.yellow(moduleRegex)
      } in ${
        chalk.bold(relative(root, context))
      }`
    ),
    (module, context) =>
      console.log(`   ${relative(root, join(context, module))}`),
  );
  return new webpack.ContextReplacementPlugin(
    logger.context(contextRegex),
    logger.module(moduleRegex),
    ...args,
  );
};

export default ({messagesDir = 'intl/messages'} = {}) => (config) => {
  const messagesDirPath = isAbsolute(messagesDir)
    ? messagesDir
    : join(config.context, messagesDir);

  console.log('messagesDirPath', messagesDirPath);
  // Infer the current available locales from the names of the files within the
  // `/locale` directory. This way the current locales are automatically parsed
  // and can be referenced from within the build.
  const locales = flow(
    // Remove the '.yml' extension.
    map((name) => name.slice(0, -4)),

    // Include the locale in which the app default messages are defined. This
    // locale may not have a mathing tranlation file in the `/locale` directory.
    // This will be the first locale in the array and will become the default
    // locale unless the `DEFAULT_LOCALE` env var defines otherwise.
    concat('en'),

    process.env.DEFAULT_LOCALE
      ? concat(process.env.DEFAULT_LOCALE)
      : identity,

    // If the `LOCALES` env variable is defined, include only locales which are
    // defined there.
    process.env.LOCALES
      ? intersectionBy(toLower, process.env.LOCALES.split(/\s+/))
      : identity,

    // Include only locales that match `lang` or `lang-COUNTRY` format.
    filter((name) => /^[a-z]+(-[a-z0-9]+)?$/i.test(name)),

    // Remove any duplicate locales.
    uniq,
  )(fs.readdirSync(messagesDirPath));

  // Define a default locale, use the env `DEFAULT_LOCALE` if it is among the
  // parsed available locales, otherwise fall back to the default `en`.
  const defaultLocale = find(eq(process.env.DEFAULT_LOCALE), locales)
    || locales[0];

  // Parse the current languages from the current locales by removing the
  // country codes from the locale identifiers. React intl locale-data polyfill
  // modules are defined only by language, not country as well.
  const languages = flow(map((locale) => locale.split('-')[0]), uniq)(locales);

  // React intl bundles `en` language data by default, so we never want to
  // include id separately.
  const reactIntlLanguages = reject(eq('en'), languages);

  console.log(`🌐  ${chalk.bold('Build Locales')}\n${flow(
    map((locale) => `   ${locale} ${localeEmoji(locale)}`),
    compact,
    uniq,
  )(locales).join('\n')}`);

  return flow(
    plugin(new webpack.DefinePlugin({
      'process.env.MESSAGES_DIR_PATH': JSON.stringify(messagesDirPath),
      'process.env.BUILD_TARGET': JSON.stringify(config.target),
      'process.env.BUILD_LOCALES': JSON.stringify(locales),
      'process.env.DEFAULT_LOCALE': JSON.stringify(defaultLocale),
    })),
    // Webpack naturally uses a regex similar to `/^.*\.js$/` to match
    // individual files in a requir context directory. We can use the context
    // replacement plugin to replace the default regex with our own. This
    // allows us to place stricter requirements on which files are matched
    // within a context.
    //
    // The current available translations are inferred from the message
    // translation files that exist in `/locale` directory. Additionally, a
    // smaller set of locales can be defined with the `LOCALES` env variables
    // if not all available translations should be included in the current
    // build.
    //
    // The modules within each context are then tested against the current
    // locales by a regular expression compiled from the names of the current
    // locales.

    // Filter Intl polyfill local data modules.
    plugin(createContextReplacementPlugin(
      // Define a regex that matches the context generated by
      // `require('intl/locale-data/jsonp' + locale + '.js')`
      regexFromPath(intlLocaleDataPath),
      // Define a regex that tests modules returned in the above context
      // against the current list of available locales.
      new RegExp(`\.\\${sep}(${locales.join('|')})\.js$`, 'i'),
    )),

    // Filter react-intl language data modules.
    plugin(createContextReplacementPlugin(
      // Define a regex that matches the context generated by
      // `require('react-intl/locale-data/' + language + '.js')`
      regexFromPath(reactIntlLocaleDataPath),
      // Define a regex that tests modules returned in the above context
      // against the current list of available langauges.
      new RegExp(`\.\\${sep}(${reactIntlLanguages.join('|')})\.js$`, 'i')
    )),

    // Filter translation files.
    plugin(createContextReplacementPlugin(
      // Define a regex that matches the context generated by
      // `require('../../locale' + locale + '.yml')`
      regexFromPath(messagesDirPath),
      // Define a regex that tests modules returned in the above context
      // against the current list of available locales.
      new RegExp(`\.\\${sep}(${locales.join('|')})\.yml$`, 'i')
    )),

    // Alias React Intl and Intl to versions that do not bundle all locale
    // data by default.
    alias('react-intl$', require.resolve('react-intl/dist/react-intl.js')),
    alias('intl$', require.resolve('intl/lib/core.js'))
  )(config);
};
