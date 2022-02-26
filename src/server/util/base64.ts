export function encode(data:string):string{
  return Buffer.from(data).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function decode(data:string):string{
  return Buffer.from(
    data
      .replace(/-/g, "+")
      .replace(/_/g, "/")
    , "base64").toString();
}