const path = require("path");

module.exports = {
  entry: path.join(__dirname, "./src/client/index.ts"),
  output: {
    path: path.join(__dirname, "./common"),
    filename: "common.js"
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.client.json"
          }
        }
      }
    ]
  },
  resolve: {
    extensions: [".js", ".ts"]
  },
  mode: "development",
  devtool: "inline-source-map",
}