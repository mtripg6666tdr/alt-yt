const path = require("path");
const WebpackObfuscator = require("webpack-obfuscator");

module.exports = {
  mode: "production",
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
        use: [
          {
            loader: WebpackObfuscator.loader,
            options: {
              compact: true,
              controlFlowFlattening: false,
              controlFlowFlatteningThreshold: 0.75,
              disableConsoleOutput: true,
              identifierNamesCache: null,
              identifierNamesGenerator: 'mangled',
              optionsPreset: 'medium-obfuscation',
              rotateStringArray: true,
              seed: 0,
              selfDefending: true,
              shuffleStringArray: true,
              simplify: true,
              splitStrings: true,
              stringArray: true,
              stringArrayIndexesType: [
                  'hexadecimal-number'
              ],
              target: 'browser'
            }
          },
          {
            loader: "ts-loader",
            options: {
              configFile: "tsconfig.client.json"
            }
          }
        ]
      }
    ]
  },
  resolve: {
    extensions: [".js", ".ts"]
  }
}