import { EventEmitter, PassThrough, Readable } from "stream";
import { http, https } from "follow-redirects";
import { Response } from "express";

const httpLibs = {"http:": http, "https:": https} as {[proto:string]:typeof http|typeof https};

export function downloadParallel(url:string, additionalHeaders:{[key:string]:string}, chunkLength:number, res:Response){
  let goalRange = {from: -1, to: -1};
  const respondInvalidRange = () => {
    res.writeHead(416);
    res.end();
  };
  if(additionalHeaders["range"] || additionalHeaders["Range"]){
    const originalRange = additionalHeaders["range"] || additionalHeaders["Range"];
    const match = originalRange.match(/bytes=(?<from>\d+)-(?<to>\d+)?/);
    if(additionalHeaders["range"]) delete additionalHeaders["range"];
    if(additionalHeaders["Range"]) delete additionalHeaders["Range"];
    if(match){
      goalRange.from = Number(match.groups["from"]);
      goalRange.to = Number(match.groups["to"] || -1);
    }else{
      respondInvalidRange();
      return;
    }
  }else{
    goalRange.from = 0;
  }
  if(goalRange.from < 0){
    respondInvalidRange();
    return;
  }
  new ParallelStreamManager(res, url, 3, goalRange.from, goalRange.to, additionalHeaders, chunkLength);
}

function destructURL(url:URL){
  return {
    protocol: url.protocol,
    host: url.host,
    path: url.pathname + url.search + url.hash
  };
}

class ParallelStreamManager extends EventEmitter {
  readonly urlObj:URL;
  readonly contentBuffer:{[key:number]:ParallelPartialStream} = {};
  totalLength = -1;
  totalChunks = -1;
  current = -1;
  piped = 0;
  responseHeaders: {[key:string]:string|string[]};
  private _destroyed = false;
  get destroyed(){return this._destroyed};

  constructor(private res:Response, url:string, parallelCount:number, private rangeBegin:number, private rangeEnd:number, private additionalHeaders:{[key:string]:string}, private chunkLength:number){
    super();
    this.urlObj = new URL(url);
    console.log("manager initialized from", rangeBegin, "to", rangeEnd);
    ["error", "close"].forEach(ev => res.on(ev, () => this.destroy()));
    this.contentBuffer[++this.current] = new ParallelPartialStream(this, "stream", this.urlObj, this.rangeBegin, this.chunkLength, this.current, this.additionalHeaders, rangeEnd)
      .on("finish", (stream:Readable) => {
        if(this.destroyed) return;
        console.log("finish #0");
        res.writeHead(206, Object.assign({
          "Content-Range": `bytes ${rangeBegin}-${rangeEnd === -1 ? this.totalLength - 1 : rangeEnd}/${this.totalLength}`,
        }, this.responseHeaders));
        const pipeNext = () => {
          if(this.destroyed) return;
          this.piped++;
          if(this.piped >= this.totalChunks){
            console.log("All streams were piped (total:", this.totalChunks, ")");
            return;
          }
          this.contentBuffer[this.piped - 1]?.destroy();
          console.log("pipe next #" + this.piped);
          console.log("next stream #" + this.piped + " has finished to be download?", this.contentBuffer[this.piped].isFinished);
          if(this.contentBuffer[this.piped].isFinished){
            console.log("stream should be ended after", this.piped, "?", this.piped + 1 === this.totalChunks);
            this.contentBuffer[this.piped].result
              .on("end", () => console.log("stream export end (normally) #" + this.piped))
              .on("end", () => pipeNext())
              .pipe(res, {end: this.piped + 1 === this.totalChunks})
          }else{
            this.contentBuffer[this.piped].on("finish", ()=>{
              console.log("stream should be ended after", this.piped, "?", this.piped + 1 === this.totalChunks);
              this.contentBuffer[this.piped].result
                .on("end", () => console.log("stream export end (delayed) #" + this.piped))
                .on("end", () => pipeNext())
                .pipe(res, {end: this.piped + 1 === this.totalChunks})
            })
          }
          this.beginRetriveNext();
        };
        stream
          .on("end", () => console.log("stream export end #0"))
          .on("end", () => pipeNext())
          .pipe(res, {end: false});
        for(let i = 0; i < parallelCount - 1; i++)
          this.beginRetriveNext();
      })

    this.on("error", () => this.destroy());
  }

  private beginRetriveNext(){
    console.log("begin retrive next #", this.current + 1);
    if(this.current + 1 < this.totalChunks){
      console.log("begin retrive next approved #", this.current + 1);
      const current = ++this.current
      this.contentBuffer[current] = new ParallelPartialStream(this, "buffer", this.urlObj, this.rangeBegin, this.chunkLength, current, this.additionalHeaders, this.rangeEnd)
    }else{
      console.log("begin retrive next failed (out of range) #", this.current + 1)
    }
  }
  
  destroy(){
    if(this.destroyed) return;
    this.emit("close");
    this.res.end();
    console.log("manager was destroyed");
    this._destroyed = true;
  }
}

type ParallelMode = "buffer"|"stream";

class ParallelPartialStream extends EventEmitter {
  private buf = [] as Buffer[];
  result = null as PassThrough;
  isFinished = false;
  private _destroyed = false;
  get destroyed(){return this._destroyed};
  private destroyListener = ()=>{};
  private _mode:ParallelMode = "buffer";
  get mode(){return this._mode};

  constructor(private parentManager:ParallelStreamManager, mode:ParallelMode = "buffer", url:URL, begin:number, private chunkLength:number, private current:number, additinalHeaders:{[key:string]:string}, private overallRangeEnd:number){
    super();
    this._mode = mode;
    if(this._mode === "stream"){
      console.log("stream", "#" + current, "will be transfer as ALIVE STREAM");
    }
    let start = begin + chunkLength * current;
    let end = begin + chunkLength * (current + 1) - 1;
    console.log("stream", "#" + current, "init range from ", start, "to", end);
    if(parentManager.totalLength !== -1 && begin + parentManager.totalLength < end) {
      end = -1;
      console.log("stream", "#" + current, "is the last stream, end was unset");
    };
    httpLibs[url.protocol].request({
      ...destructURL(url),
      method: "GET",
      headers: {
        ...additinalHeaders,
        "Range": `bytes=${start}-${end === -1 ? "" : end}`
      }
    }, (reqres) => {
      if(this.destroyed){
        reqres.destroy();
        return;
      }
      if(reqres.statusCode !== 206){
        reqres.destroy();
        this.parentManager.emit("error", "the remote server does not support ranged request");
        return;
      }
      if(current === 0){
        const totalLengthStr = reqres.headers["content-range"]?.split("/")[1];
        if(totalLengthStr && totalLengthStr.length > 0){
          this.parentManager.totalLength = Number(totalLengthStr);
          this.parentManager.totalChunks = Math.ceil((overallRangeEnd === -1 ? this.parentManager.totalLength - begin + 1 : overallRangeEnd - begin + 1) / chunkLength);
          console.log("meta", this.parentManager.totalLength, this.parentManager.totalChunks, chunkLength)
        }
        const headers = Object.assign({}, reqres.headers);
        if(headers["set-cookie"]) delete headers["set-cookie"];
        if(headers["content-length"]) delete headers["content-length"];
        if(headers["content-range"]) delete headers["content-range"];
        this.parentManager.responseHeaders = headers;
      }
      if(this.mode === "buffer"){
        reqres
          .on("data", chunk => this.buf.push(Buffer.from(chunk)))
          .on("error", (er) => this.parentManager.emit("error", er))
          .on("end", () => {
            const resultbuf = Buffer.concat(this.buf);
            this.result = new PassThrough({
              highWaterMark: this.chunkLength
            });
            this.result.end(resultbuf);
            this.isFinished = true;
            this.result.on("end", () => this.destroy());
            this.emit("finish", this.result, this.current);
          })
          ;
      }else{
        this.result = new PassThrough({
          highWaterMark: this.chunkLength
        });
        reqres
          .on("error", (er) => this.parentManager.emit("error", er))
          .pipe(this.result)
          .on("end", () => this.destroy());
          ;
        this.isFinished = true;
        this.emit("finish", this.result, this.current);
      }
    })
    .on("error", (er) => this.parentManager.emit("error", er))
    .end();

    this.parentManager.on("close", this.destroyListener = () => this.destroy());
  }

  destroy(){
    if(this.destroyed) return;
    this.buf = [];
    if(this.result) this.result.destroy();
    this.parentManager.off("close", this.destroyListener);
    console.log("parallel fragment #", this.current, "was destroyed");
    this._destroyed = true;
  }
}