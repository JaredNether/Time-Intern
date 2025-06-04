module.exports = function override(config, env) {
  // Disable source maps for node_modules
  config.module.rules.push({
    test: /\.js$/,
    enforce: 'pre',
    exclude: /node_modules/,
    use: ['source-map-loader'],
  });

  return config;
};
