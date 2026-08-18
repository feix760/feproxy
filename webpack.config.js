const path = require('path');
const webpack = require('webpack');
const glob = require('glob-all');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const devMode = mode === 'development';
const outputPath = path.join(__dirname, 'lib/public');
const publicPath = '/';

const entry = glob.sync([ 'src/frontend/page/*/index.tsx' ])
  .reduce((obj, item) => {
    const chunk = item.split(/[\/\\]/)[3];
    obj[chunk] = path.join(__dirname, item);
    return obj;
  }, {});

module.exports = {
  mode,
  devtool: devMode ? 'source-map' : false,
  entry,
  output: {
    path: outputPath,
    publicPath,
    filename: devMode ? 'lib/[name].js' : 'lib/[name].[contenthash:8].js',
    clean: !devMode,
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
      {
        test: /\.less/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'less-loader',
        ],
      },
      {
        test: /\.(png|svg|jpe?g|bmp|gif|ttf|woff)$/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 1024 * 2,
          },
        },
        generator: {
          filename: 'lib/[name].[contenthash:8][ext]',
        },
      },
    ],
  },
  plugins: [
    ...Object.keys(entry).map(chunk => {
      const main = entry[chunk];
      return new HtmlWebpackPlugin({
        filename: `${chunk}.html`,
        template: main.replace(/\.[jt]sx?$/, '.html'),
        chunks: [ chunk ],
        minify: devMode ? false : {
          minifyJS: true,
          minifyCSS: true,
          collapseWhitespace: true,
          preserveLineBreaks: true,
        },
      });
    }),
    new webpack.EnvironmentPlugin({
      NODE_ENV: mode,
      DEBUG: devMode,
    }),
    new MiniCssExtractPlugin({
      filename: devMode ? 'lib/[name].css' : 'lib/[name].[contenthash:8].css',
    }),
    process.stdout.isTTY && new webpack.ProgressPlugin(),
    new CopyWebpackPlugin({
      patterns: [ { from: 'src/frontend/asset' } ],
    }),
  ].filter(Boolean),
};
