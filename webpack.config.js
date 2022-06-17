const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  entry: "./src/plugin/index.js",
  mode: "production",
  output: {
    filename: "canvas-draw-table.js",
    path: path.resolve(__dirname, "lib"),
    library: "$DrawTable",
    libraryTarget: 'umd'
  },
  plugins: [new CleanWebpackPlugin()],
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
