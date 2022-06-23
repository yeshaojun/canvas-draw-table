const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
module.exports = {
  entry: "./src/plugin/index.js",
<<<<<<< HEAD
  mode: "development",
=======
  mode: "production",
>>>>>>> 497e9084ceeabedfd184c1fd50d2eb6764da8324
  output: {
    filename: "canvas-draw-table.js",
    path: path.resolve(__dirname, "lib"),
    library: "$DrawTable",
    libraryTarget: 'umd'
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: "./public/index.html",
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "public",
          globOptions: {
            gitignore: true,
            ignore: ["**/public/index.html"],
          },
        },
      ],
    }),
  ],
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
