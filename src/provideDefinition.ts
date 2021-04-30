import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { isFileExisted, isJson } from './utils';

const provideDefinition = async (document: vscode.TextDocument, position: vscode.Position) => {
  try {
    const config = await getConfig();

    const name = getObjectName(document, position);

    if (!name) {
      return null;
    }

    const styleFilePath = getStyleFilePath(name, document, config.alias);

    if (!styleFilePath) {
      return null;
    }

    const word = document.getText(document.getWordRangeAtPosition(position));

    const classname = '.' + word.replace(/([A-Z])/g, '-$1').toLowerCase();

    const { line, column } = getClassnamePosition(classname, styleFilePath);

    let rangeOrPosition: vscode.Position | vscode.Range = new vscode.Position(line, column);
    if (config.selectedClassname) {
      const start = new vscode.Position(line, column);
      const end = new vscode.Position(line, column + classname.length);
      rangeOrPosition = new vscode.Range(start, end);
    }

    return new vscode.Location(vscode.Uri.file(styleFilePath), rangeOrPosition);
  } catch (error) {
    console.log(error);
  }
  return null;
};

/** 获取点前面的对象/属性名称 */
export function getObjectName(document: vscode.TextDocument, position: vscode.Position) {
  const line = document.lineAt(position);
  const lineText = line.text.substring(0, position.character);

  if (!lineText) {
    return null;
  }
  function getWordStart(text: string) {
    let start = text.length - 1;

    if (text[start] === '.') {
      text = text.substring(0, text.length - 1);
    }
    for (let i = text.length - 1; /^\w+$/.test(text[i]) && i > 0; i--) {
      start = i;
    }
    return start;
  }

  let start = getWordStart(lineText);
  let end = lineText.length - 1;

  if (lineText.substring(start - 1, start) === '.') {
    const text = lineText.substring(0, start - 1);
    start = getWordStart(text);
    end = text.length;
  }
  return lineText.substring(start, end);
}

interface IAlias {
  [key: string]: string;
}

/** 获取系统配置信息 */
async function getConfig() {
  let alias: IAlias = {};
  const conf = vscode.workspace.getConfiguration();
  const aliasSetting: IAlias | undefined = conf.get('css-modules-intellisense.alias');
  let selectedClassname: Boolean = conf.get('css-modules-intellisense.selectedClassname') || false;
  const configPath: string = conf.get('css-modules-intellisense.configPath') || '';
  let rootPath = (vscode.workspace.workspaceFolders || [])[0]?.uri?.path;
  if (rootPath[0] === '/') {
    rootPath = rootPath.substring(1);
  }

  function aliasSetAbsolutePath(setting: IAlias, configAbsolutePath?: string) {
    const alias: IAlias = {};
    for (const key in setting) {
      if (setting[key].includes('${workspaceRoot}')) {
        alias[key] = setting[key].replace('${workspaceRoot}', rootPath);
      } else {
        if (configAbsolutePath) {
          const pathNodeArr = configAbsolutePath.split('/');
          const configFolderAbsolutePath = configAbsolutePath.replace(pathNodeArr[pathNodeArr.length - 1], '');
          alias[key] = path.resolve(configFolderAbsolutePath, setting[key]);
        } else {
          alias[key] = setting[key];
        }
      }
    }
    return alias;
  }

  if (aliasSetting) {
    alias = {
      ...aliasSetAbsolutePath(aliasSetting),
    };
  }

  if (configPath) {
    const configAbsolutePath = path.resolve(rootPath, configPath);
    const isExisted = await isFileExisted(configAbsolutePath);
    if (isExisted) {
      const data = fs.readFileSync(configAbsolutePath).toString();
      if (data && isJson(data)) {
        const config = JSON.parse(data);
        if (config.alias) {
          alias = {
            ...alias,
            ...aliasSetAbsolutePath(config.alias, configAbsolutePath),
          };
        }

        if (config.hasOwnProperty('selectedClassname')) {
          selectedClassname = config.selectedClassname;
        }
      }
    }
  }

  return {
    alias,
    selectedClassname,
  };
}

/** 获取样式文件绝对路径 */
function getStyleFilePath(name: string, document: vscode.TextDocument, alias: IAlias) {
  const fileContent = document.getText();
  const impReg = new RegExp('import ' + name + ' from [\'|"]+.*.less');
  const reqReg = new RegExp('const ' + name + ' = require\\([\'|"]+.*.less');
  const importStrArr = fileContent.match(impReg) || fileContent.match(reqReg);
  if (!importStrArr) {
    return null;
  }
  const importStr = importStrArr[0].replace(/\"/g, "'");
  let styleFilePath = importStr.split("'")[1];

  if (JSON.stringify(alias) !== '{}') {
    if (styleFilePath.includes('/')) {
      const pathNode = styleFilePath.split('/');
      const mapPath = alias[pathNode[0]];
      if (mapPath) {
        pathNode[0] = mapPath;
        styleFilePath = pathNode.join('/');
        return styleFilePath;
      }
    }
  }

  const fileName = document.fileName;
  const workDir = path.dirname(fileName);

  return path.resolve(workDir, styleFilePath);
}

/** 根据类名获取所在less文件的坐标 */
function getClassnamePosition(classname: string, filePath: string) {
  let line = 0;
  let column = 0;
  const fileContext = fs.readFileSync(filePath, { encoding: 'utf8' });
  const lineArr = fileContext.split('\n');
  // 加一个空格再匹配，避免有相同前缀的类名
  const matchStr = `${classname} `;
  for (let i = 0; i < lineArr.length; i++) {
    const index = lineArr[i].indexOf(matchStr);
    if (index > -1) {
      line = i;
      column = index;
      break;
    }
  }

  return { line, column };
}

export default provideDefinition;
