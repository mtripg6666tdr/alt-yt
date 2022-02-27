require("dotenv").config();
import { createServer } from "./server";

const app = createServer();
app
  .listen(8080)
  .on("listening", () => {
    console.log("Server started successfully");
  })