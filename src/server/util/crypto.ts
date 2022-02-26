import { SHA256 } from "crypto-js";

export function generateRandomNumber(){
  return Math.floor(new Date().getTime() * Math.random());
}

export function generateHash(text:string){
  return SHA256(SHA256(text).toString()).toString();
}
