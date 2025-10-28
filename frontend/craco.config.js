const path = require('path');

module.exports = {
  babel: {
    presets: [
      ['@babel/preset-react', { runtime: 'automatic' }],
      '@babel/preset-env'
    ],
    plugins: []
  },
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.extensions = ['.js', '.jsx', '.json'];
      return webpackConfig;
    },
  },
  style: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
};
