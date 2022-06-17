const path = require("path");
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  entry: "./src/plugin/index.js",
  mode: "production",
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "lib"),
    library: "$DrawTable",
    libraryTarget: "umd",
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    compress: true,
    port: 9000,
    hot: true,
  },
  plugins: [new CleanWebpackPlugin(), new UglifyJsPlugin({
    test: /\.js($|\?)/i
  })],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            cacheDirectory: true,
          },
        },
      },
    ],
  },
};
