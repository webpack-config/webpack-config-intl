#webpack-config-intl

Add support for intl to your [webpack] build.

[![build status](http://img.shields.io/travis/webpack-config/webpack-config-intl/master.svg?style=flat)](https://travis-ci.org/webpack-config/webpack-config-intl)
[![coverage](http://img.shields.io/coveralls/webpack-config/webpack-config-intl/master.svg?style=flat)](https://coveralls.io/github/webpack-config/webpack-config-intl?branch=master)
[![license](http://img.shields.io/npm/l/webpack-config-intl.svg?style=flat)](https://www.npmjs.com/package/webpack-config-intl)
[![version](http://img.shields.io/npm/v/webpack-config-intl.svg?style=flat)](https://www.npmjs.com/package/webpack-config-intl)
[![downloads](http://img.shields.io/npm/dm/webpack-config-intl.svg?style=flat)](https://www.npmjs.com/package/webpack-config-intl)

## Usage

Install:
```sh
npm install --save webpack-config-intl
```

Add to your `webpack.config.babel.js`:

```js
import intl from `webpack-config-intl`;

// Optional messagesDir config option specifying the location of yaml message
// files.
intl({messagesDir: 'intl/messages'})({
  /* existing webpack configuration */
})
```

Load intl data and messages dynamically in your app:

```js
// intl.action.js
import {loadLocaleData, loadMessages} from 'webpack-config-intl/chunk-loader';

export const loadLocale = (locale) => (dispatch) =>
  Promise.all([loadMessages(locale), loadLocaleData(locale)])
    .then(([messages]) => dispatch({
      type: 'LOCALE_LOADED',
      payload: {locale, messages},
    }));
```

```js
// intl.reducer.js
const initialState = {
  messages: {},
  locale: process.env.DEFAULT_LOCALE,
};

export default (state = initialState, action) => {
  switch (action.type) {
  case 'LOCALE_LOADED':
    return pick(['messages', 'locale'], action.payload);
  default:
    return state;
  }
};
```

Provide the loaded intl data to your components:

```jsx
import {createElement} from 'react';
import setDisplayName from 'recompose/setDisplayName';
import {connect} from 'react-redux';
import {IntlProvider} from 'react-intl';

export const App = ({locale, messages, children, ...props}) =>
  <IntlProvider
    // By default, changes to the locale at runtime may not trigger a re-render
    // of child elements. Adding a `key` prop that changes with the locale
    // pursuades React to re-render the component tree.
    key={locale}
    locale={locale}
    messages={messages}
    defaultLocale={'en'}
    children={children}
    {...props}
  >
    // ...
  </IntlProvider>

const mapState = (state) => ({
  locale: state.intl.locale,
  messages: state.intl.messages,
)};

export default connect(mapState, null)(App);
```

[webpack]: https://webpack.github.io