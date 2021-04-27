import * as vscode from 'vscode';
import provideCompletionItems from './provideCompletionItems';

/**
 * 功能适用文档类型
 * 即：当前功能在什么类型的文档才启动
 * 配置的内容是文档对应使用的语言，并非文件格式
 * javascript -> *.js
 * javascriptreact -> *.jsx
 * typescript -> *.ts
 * typescriptreact -> *.tsx
 */
const documentSelector = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'];
/**
 * 触发器
 * 当前智能提示在什么时候触发
 * 下面设置在输入点 . 后触发
 */
const triggerCharacters = '.';

export function activate(context: vscode.ExtensionContext) {
  // 光标选中当前自动补全item时触发动作，一般情况下无需处理
  const resolveCompletionItem = () => null;

  // 注册代码建议提示，只有当按下“.”时才触发
  const disposable = vscode.languages.registerCompletionItemProvider(
    documentSelector,
    {
      provideCompletionItems,
      resolveCompletionItem,
    },
    triggerCharacters
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
