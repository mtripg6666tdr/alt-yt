import * as fs from "fs";
import * as path from "path";
import { Response } from "express";

export const errorTemplate = fs.readFileSync(path.join(__dirname, "../../common/error.html"), {encoding:"utf-8"});

export function respondError(res:Response, message:string, status:number = 500){
  if(res.headersSent){
    res.end();
  }else{
    res.writeHead(status, {"Content-Type": "text/html; charset=UTF-8"});
    res.end(errorTemplate.replace(/{message}/, status + "<br>" + message));
  }
}