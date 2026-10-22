# dsh-lang-zhtw

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的繁體中文（台灣）語言包。English version: [README.md](README.md)。

用 [OpenCC](https://github.com/BYVoid/OpenCC)（`s2twp`：字元＋台灣用詞轉換）加上小規模用詞校正表，把 DSH 內建的簡體中文介面字典轉換成繁體，並在客戶端語言選單註冊 **繁體中文（台灣）**。沒有覆蓋的字串會自動退回內建的簡體字典——安裝這個語言包不會弄壞任何東西。

- 目前涵蓋：從 DSH 0.2.1-rc.2 內建介面字典抽出的 **63 個命名空間／2,676 條字串**。
- 純語言包：只有一個客戶端模組，不需要 Host 服務、不需要建置步驟。

## 安裝

### Desktop 應用程式

1. `git clone https://github.com/Grasseed/dsh-lang-zhtw`
2. 在 DSH Desktop：側欄 **外掛／插件** → **新增外掛** → 選擇 clone 下來的資料夾。
3. 打開 **設定 → 一般 → 語言**，選擇 **繁體中文（台灣）**。

### 開源 CLI（`npx @deepseek-ai/dsh`）

```sh
dsh plugin --profile web add github:Grasseed/dsh-lang-zhtw
```

（desktop profile 由 Electron 應用程式自己管理，請改用應用內的外掛面板。）

### 手動 patch（進階）

在你的 profile `cordis.patch.yml` 加一段：

```yaml
- insert:
    - id: lang-zhtw
      name: '/絕對路徑/dsh-lang-zhtw/index.js'
```

絕對路徑的列會被直接以 ES module import，而 Node 不能 import 裸目錄——所以要指到 `index.js`，不能只指資料夾。刪掉這段即解除安裝。

## 運作原理

只使用官方語言包 API（[`@deepseek-ai/dsh-client-locale`](https://github.com/deepseek-ai/deepseek-harness)）：

```js
ctx.locale.addLanguage({ id: 'zh-TW', label: '繁體中文（台灣）', fallback: 'zh' })
ctx.locale.register(ns, 'zh-TW', dict) // 每個命名空間
```

查詢鏈為 `zh-TW → zh → en`，未翻的字串安全退回。

## 已知限制

- 少數字串放在元件內嵌的 text map、不走語言註冊系統（例如「模式說明」的長篇指南文字）；這些會退回簡體，只能由上游修正。
- 用詞來自 OpenCC 的台灣用詞慣例加上一張可維護的校正表（如 `权限 → 權限`、`计划 → 計畫`、`扩展 → 擴展`）。想改用語請調整 `tools/build-plugin.mjs` 的校正表。
- 字典與版本綁定；升級 DSH 後請重新生成（見下方）。

## 為新版 DSH 重新生成

```sh
# 1. 解開已安裝的 app（macOS 例）
npx -y @electron/asar extract "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" /tmp/dsh-asar-x
# 2. 由每個 register() 呼叫點抽出全部語言字典
node tools/extract-dicts4.mjs /tmp/dsh-asar-x/dsh
# 3. OpenCC 轉換並重新產出 client.js（先跑一次 `npm install`）
node tools/build-plugin.mjs
```

## 授權

MIT © 2026 Grasseed
