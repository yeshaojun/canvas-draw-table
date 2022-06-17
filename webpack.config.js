const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  entry: "./src/plugin/index.js",
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
  plugins: [new CleanWebpackPlugin()],
};
