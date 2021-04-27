import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { isFileExisted, isJson } from './utils';

/**
 * 输入点 . 后触发的方法，计算并返回需要出现的提示内容
 */
const provideCompletionItems = async (document: vscode.TextDocument, position: vscode.Position) => {
  try {
    // 获取系统配置信息
    const config = await getConfig();

    // 获取点前面的对象/属性名称
    const name = getObjectName(document, position);
    if (!name) {
      return null;
    }
    // 查找当前名称变量的引入文件地址，如果没有就不是一个可用的css modules对象
    const styleFilePath = getStyleFilePath(name, document, config.alias);

    if (!styleFilePath) {
      return null;
    }

    const isExisted = await isFileExisted(styleFilePath);
    if (!isExisted) {
      return null;
    }

    // 获取样式文件中的类名
    const classNameArr = getClassNameArr(styleFilePath);

    if (!classNameArr) {
      return null;
    }

    // 将类名转换成驼峰式
    const camelClassNameArr = convertToCamel(classNameArr);

    // 构建输出智能提示内容列表
    const completionArr = camelClassNameArr.map((classname: string, index: number) => {
      const item = new vscode.CompletionItem(classname, vscode.CompletionItemKind.Variable);
      // 统一放在一组01并排序
      item.sortText = '01';
      // 添加对应样式文件类名
      item.detail = classNameArr[index];
      return item;
    });
    return completionArr;
  } catch (error) {
    console.log(error);
  }
  return null;
};

interface IAlias {
  [key: string]: string;
}

/** 获取系统配置信息 */
async function getConfig() {
  let alias: IAlias = {};
  const conf = vscode.workspace.getConfiguration();
  const aliasSetting: IAlias | undefined = conf.get('css-modules-intellisense.alias');
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
      }
    }
  }

  return {
    alias,
  };
}

/** 获取点前面的对象/属性名称 */
function getObjectName(document: vscode.TextDocument, position: vscode.Position) {
  const line = document.lineAt(position);
  const lineText = line.text.substring(0, position.character);
  const { length } = lineText;

  if (!lineText || lineText === '.') {
    return null;
  }

  let start = 0;
  for (let i = length - 2; /^\w+$/.test(lineText[i]) && i > 0; i--) {
    start = i;
  }
  return lineText.substring(start, length - 1);
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

  let currentFilePath = document.uri.path;
  // 兼容 windows document.uri.path返回路径不规范问题
  if (currentFilePath[0] === '/') {
    currentFilePath = currentFilePath.substring(1);
  }
  const currentFolderPath = getCurrentFolderPath(currentFilePath);

  return path.resolve(currentFolderPath, styleFilePath);
}

/** 根据当前文件路径获取上级文件夹路径 */
function getCurrentFolderPath(currentFilePath: string) {
  const pathNodeArr = currentFilePath.split('/');
  const pathLastNode = pathNodeArr[pathNodeArr.length - 1];
  return currentFilePath.replace(`/${pathLastNode}`, '');
}

/** 获取样式文件中的类名集合 */
function getClassNameArr(styleFilePath: string) {
  const data = fs.readFileSync(styleFilePath).toString();
  const reg = /\.\w+([-]*[\w]*)*/g;
  let classnameArr = data.match(reg);
  if (!classnameArr) {
    return null;
  }
  // 去重复
  classnameArr = unique(classnameArr);
  // 去除“.”
  classnameArr = classnameArr.map((classname) => classname.replace('.', ''));
  return classnameArr;
}

/** 数组去重 */
function unique(arr: string[]) {
  return arr.filter(function (item, index, arr) {
    return arr.indexOf(item, 0) === index;
  });
}

/** 将破折号链接的类名转为驼峰式 */
function convertToCamel(strArr: string[]) {
  return strArr.map((str) => {
    if (!str.includes('-')) {
      return str;
    }
    const wordArr = str.split('-');
    wordArr.forEach((word: string, index) => {
      if (index) {
        wordArr[index] = word[0].toUpperCase() + word.slice(1);
      }
    });
    return wordArr.join('');
  });
}

export default provideCompletionItems;
