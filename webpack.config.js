const path = require('path');
const webpack = require('webpack');
const chalk = require('chalk');
const glob = require('glob-all');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const WebpackChunkHash = require('webpack-chunk-hash');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const getWebpackConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const output = './public';

  const config = {
    mode: isProduction ? 'production' : 'development',
    entry: {
      include: [
        './web/page/**/index.js',
        '!./web/page/**/component/**',
      ],
    },
    devtool: isProduction ? undefined : 'eval',
    output: {
      path: path.join(__dirname, output),
      filename: `js/[name]${isProduction ? '.[chunkhash:8]' : ''}.js`,
      publicPath: '/',
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
          use: ExtractTextPlugin.extract({
            fallback: 'style-loader',
            use: [
              {
                loader: 'css-loader',
                options: {
                  minimize: isProduction,
                },
              },
            ],
          }),
        },
        {
          test: /\.scss$/,
          use: ExtractTextPlugin.extract({
            fallback: 'style-loader',
            use: [
              {
                loader: 'css-loader',
                options: {
                  minimize: isProduction,
                },
              },
              'sass-loader',
            ],
          }),
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif|wav|mp4|ttf|woff)$/,
          use: {
            loader: 'url-loader',
            options: {
              limit: 1024 * 10,
              fallback: 'file-loader',
              // img output path
              name: 'img/[name].[hash:8].[ext]',
            },
          },
        },
      ],
    },
    plugins: [
      new CleanWebpackPlugin([ output ]),
      new WebpackChunkHash(),
      new webpack.EnvironmentPlugin({
        NODE_ENV: 'development',
        DEBUG: false,
      }),
      new webpack.ProgressPlugin((percentage, msg, modules) => {
        const stream = process.stderr;
        if (stream.isTTY && percentage < 0.71) {
          stream.cursorTo(0);
          stream.write(chalk.magenta(`📦 ${(modules || '').split(' ')[0]} ${msg} `));
          stream.clearLine(1);
        }
      }),
      // css output path
      new ExtractTextPlugin(`css/[name]${isProduction ? '.[chunkhash:8]' : ''}.css`),
      isProduction && new UglifyJSPlugin({
        parallel: true,
      }),
      new CopyWebpackPlugin([ 'web/asset' ]),
    ].filter(item => item),
  };

  const setEntry = () => {
    const entry = {};
    glob.sync(config.entry.include).forEach(item => {
      const name = item.split('/').slice(-2)[0];
      entry[name] = [ item ];
    });
    config.entry = entry;
  };

  const setHTMLPlugin = () => {
    Object.keys(config.entry).forEach(chunk => {
      const entries = config.entry[chunk];
      const entry = entries instanceof Array ? entries[entries.length - 1] : entries;

      config.plugins.push(new HtmlWebpackPlugin({
        // html output path
        filename: `${chunk}.html`,
        chunks: [ chunk ],
        // template path
        template: entry.replace(/\.js$/, '.html'),
      }));
    });
  };

  setEntry();
  setHTMLPlugin();

  return config;
};

module.exports = getWebpackConfig();
