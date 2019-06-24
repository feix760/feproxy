const path = require('path');
const webpack = require('webpack');
const glob = require('glob-all');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const devMode = mode === 'development';
const outputPath = path.join(__dirname, 'lib/public'); // 输出目录
const publicPath = '/';

const entry = glob.sync([ 'lib/frontend/page/*/index.js' ])
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
    filename: devMode ? 'lib/[name].js' : 'lib/[name].[hash:8].js',
  },
  resolve: {
    extensions: [ '.ts', '.tsx', '.js' ],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              // hmr: devMode,
            },
          },
          'css-loader',
        ],
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              // hmr: devMode,
            },
          },
          'css-loader',
          'sass-loader',
        ],
      },
      {
        test: /\.(png|svg|jpe?g|bmp|gif|ttf|woff)$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1024 * 2,
              fallback: 'file-loader',
              name: 'lib/[name].[hash:8].[ext]',
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(),
    ...Object.keys(entry).map(chunk => {
      const main = entry[chunk];
      return new HtmlWebpackPlugin({
        filename: `${chunk}.html`,
        template: main.replace(/\.(ts|js)$/, '.html'),
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
      filename: devMode ? 'lib/[name].css' : 'lib/[name].[hash:8].css',
    }),
    new webpack.ProgressPlugin(),
    new CopyWebpackPlugin([ 'lib/frontend/asset' ]),
    // new webpack.HotModuleReplacementPlugin(),
  ].filter(item => item),
};
