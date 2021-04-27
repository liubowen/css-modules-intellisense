import * as fs from 'fs';

export async function isFileExisted(filePath: string) {
  function access(path: string) {
    return new Promise((resolve, reject) => {
      fs.access(path, (err) => {
        if (err) {
          reject(err.message);
        } else {
          resolve(true);
        }
      });
    });
  }

  try {
    const res = await access(filePath);
    return res;
  } catch (error) {
    return false;
  }
}

export function isJson(str: string) {
  try {
    JSON.parse(str);
    return true;
  } catch (error) {
    return false;
  }
}
