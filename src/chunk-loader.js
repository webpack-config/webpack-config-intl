/* global require */
import {addLocaleData} from 'react-intl';
import memoize from 'lodash/fp/memoize';

// Remove the country code from a locale identifier.
export const parseLanguage = (locale) => locale.split('-')[0];

/**
 * Load a locale data set for `react-intl`. The loaded data is automatically
 * provided to `react-intl` through `addLocaleData`. No additional action is
 * necessary.
 *
 * Locale data is hosted in async webpack chunks. Webpack's `require.ensure` is
 * used to universally handle the request for both client and server.
 *
 * This function is memoized to return the same Promise instance for any given
 * language string.
 *
 * This function is defined separately from `loadReactIntlLocaleData` to allow
 * memoization based on a parsed language value.
 *
 * @param   {String} language - A languauge string, without country, e.x. `en`.
 * @returns {Promise} - A Promise.
 */
export const loadReactIntlLocaleDataForLanguage = memoize(
  (language) => new Promise((resolve, reject) => {
    if (language === 'en') {
      // react-intl bundles the locale data for 'en' by default.
      return resolve();
    }

    let req;
    try {
      req = require(/* adana-no-instrument */ `${
        process.env.BUILD_TARGET === 'web'
        // If we are in a web targeted build, use the bundle loader. This will
        // create a new chunk that allows async loading of each module that
        // matches in the context.
          ? 'bundle-loader'
        // Defer loading each new chunk until it is referenced.
          + '?lazy'
        // Extract the languange identifier from the matched module name.
          + '&regExp=([a-z]+)\.js$'
        // Assign a chunk name using the languange identifier.
          + '&name=[1].react-intl-data!'
        // If this is not a web build, don't use any additional loaders. Each
        // module that matches in the context will be added to the current
        // chunk.
          : ''
        // Create a require context for `react-intl/locale-data/**/*.js` files.
        // The files within this context are further filtred by the
        // ContextReplacementPlugin in the webpack config partial to match only
        // the current included set of locales for the build.
        }react-intl/locale-data/${language}.js`
      );
    } catch (e) {
      return reject(e);
    }

    if (typeof req === 'function') {
      return req((data) => {
        addLocaleData(data);
        return resolve(data);
      });
    }

    addLocaleData(req);
    return resolve(req);
  })
);

/**
 * Load a locale data set for `react-intl`. The loaded data is automatically
 * provided to `react-intl` through `addLocaleData`. No additional action is
 * necessary.
 *
 * Locale data is hosted in async webpack chunks. Webpack's `require.ensure` is
 * used to universally handle the request for both client and server.
 *
 * @param   {String} locale - A locale string, e.x. `en-US`.
 * @returns {Promise} - A Promise.
 */
export const loadReactIntlLocaleData = (locale) => {
  // react-intl categorizes locale data by language only, the country code  of
  // the locale string is not considered.
  return loadReactIntlLocaleDataForLanguage(parseLanguage(locale));
};

/**
 * Load a locale data set for the `Intl` polyfill. The loaded data self-injects
 * into the global `Intl` instance provided by the polyfill. No additional
 * action is necessary.
 *
 * This function is memoized to return the same Promise instance for any given
 * locale string.
 *
 * @param   {String} locale - A locale string, e.x. `en-US`.
 * @returns {Promise} - A Promise.
 */
export const loadPolyfillLocaleData = memoize(
  (locale) => new Promise((resolve, reject) => {
    if (!global.IntlPolyfill) {
      // The environment has a built in `Intl` object. Or we are in a server
      // build. It is not necessary to load additional locale data.
      // (The Intl polyfill bundles all locale data for node-targeded builds.)
      return resolve();
    }

    let req;

    try {
      req = require(/* adana-no-instrument */ `${
        process.env.BUILD_TARGET === 'web'
        // If we are in a web targeted build, use the bundle loader. This will
        // create a new chunk that allows async loading of each module that
        // matches in the context.
          ? 'bundle-loader'
        // Defer loading each new chunk until it is referenced.
          + '?lazy'
        // Extract the locale identifier from the matched module name.
          + '&regExp=([a-z]+(-[a-zA-Z0-9]+)?)\.js$'
        // Assign a chunk name using the locale identifier.
          + '&name=[1].intl-data!'
        // If this is not a web build, don't use any additional loaders. Each
        // module that matches in the context will be added to the current
        // chunk.
          : ''
        // Create a require context for `intl/locale-data/jsonp/**/*.js` files.
        // The files within this context are further filtred by the
        // ContextReplacementPlugin in the webpack config partial to match only
        // the current included set of locales for the build.
        }intl/locale-data/jsonp/${locale}.js`
      );
    } catch (e) {
      return reject(e);
    }

    // The result may be a function, depending on if bundle loader was used.
    return typeof req === 'function' ? req(resolve) : resolve(req);
  })
);

/**
 * Load any initial locale data required for the current locale.
 *
 * @param   {String} locale - A locale string, e.x. `en-US`.
 * @returns {Promise} - A Promise.
 */
export const loadLocaleData = (locale) => Promise.all([
  loadReactIntlLocaleData(locale),
  loadPolyfillLocaleData(locale),
]);

/**
 * Load a set of translated messages for a specific locale. The new message
 * data is fulfilled with the promise. It can then be supplied to a react-intl
 * `<IntlProvider>` instance.
 *
 * This function is memoized to return the same Promise instance for any given
 * locale string.
 *
 * @param   {String} locale - A locale string, e.x. `en-US`.
 * @returns {Promise} - A Promise.
 */
export const loadMessages = memoize(
  (locale) => new Promise((resolve, reject) => {
    // The app default messages are defined in `en`. There is no external
    // translation for these messages.
    if (locale === 'en') {
      return resolve();
    }

    let req;

    try {
      req = require(/* adana-no-instrument */ `${
        process.env.BUILD_TARGET === 'web'
        // If we are in a web targeted build, use the bundle loader. This will
        // create a new chunk that allows async loading of each module that
        // matches in the context.
          ? 'bundle-loader'
        // Defer loading each new chunk until it is referenced.
          + '?lazy'
        // Extract the locale identifier from the matched module name.
          + '&regExp=([a-z]+(-[a-zA-Z0-9]+)?)\.yml$'
        // Assign a chunk name using the locale identifier.
          + '&name=[1].messages!'
        // If this is not a web build, don't use any additional loaders. Each
        // module that matches in the context will be added to the current
        // chunk.
          : ''
        // Create a require context for `MESSAGES_DIR_PATH/**/*.yml` files.
        // The files within this context are further filtred by the
        // ContextReplacementPlugin in the webpack config partial to match only
        // the current included set of locales for the build.
        }${process.env.MESSAGES_DIR_PATH}/${locale}.yml`
      );
    } catch (e) {
      return reject(e);
    }

    // The result may be a function depending, on if bundle loader was used.
    return typeof req === 'function' ? req(resolve) : resolve(req);
  })
);
