# Demo Target Repository

这个目录用于比赛演示中的“目标代码库”。

它现在是一个最小 React/Vite 应用，默认端口为 `5174`。DevFlow 的 `code-generation`
阶段会以受控方式修改这里的页面和测试文件，并在阶段产物中展示真实 diff。

```powershell
npm.cmd --prefix workspace/demo run dev
npm.cmd --prefix workspace/demo run test
npm.cmd --prefix workspace/demo run build
```
