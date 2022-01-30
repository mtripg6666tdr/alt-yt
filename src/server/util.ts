import * as fs from "fs";
import * as path from "path";
import { Response } from "express";

export const errorTemplate = fs.readFileSync(path.join(__dirname, "../common/error.html"), {encoding:"utf-8"});
export const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36";
export const ytUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36";
export function respondError(res:Response, message:string, status:number = 400){
  res.writeHead(status, {"Content-Type": "text/html; charset=UTF-8"});
  res.end(errorTemplate.replace(/{message}/, message));
}
export function CalcHourMinSec(seconds:number){
  const sec = seconds % 60;
  const min = (seconds - sec) / 60 % 60;
  const hor = ((seconds - sec) / 60 - min) / 60;
  return [hor.toString(), AddZero(min.toString(), 2), AddZero(sec.toString(), 2)];
}
export function AddZero(str:string, length:number){
  if(str.length >= length) return str;
  while(str.length < length){
    str = "0" + str;
  }
  return str;
}
export function generateRandomNumber(){
  return Math.floor(new Date().getTime() * Math.random());
}