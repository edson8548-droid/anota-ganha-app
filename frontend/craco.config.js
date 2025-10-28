const path = require('path');

module.exports = {
  eslint: {
    configure: {
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  },
  webpack: {
    configure: (webpackConfig) => {
      // Configurar resolução de extensões
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
