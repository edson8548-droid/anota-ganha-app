const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Configurar resolução de extensões explicitamente
      webpackConfig.resolve.extensions = ['.js', '.jsx', '.json', '.ts', '.tsx'];
      
      // Configurar fallback para extensões
      webpackConfig.resolve.extensionAlias = {
        '.js': ['.js', '.jsx'],
      };
      
      // Garantir que paths sejam case-sensitive
      webpackConfig.resolve.symlinks = false;
      
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
