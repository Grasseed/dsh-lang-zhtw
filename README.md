# dsh-lang-zhtw

繁體中文（台灣）language pack for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).
简体中文版本见 [README.zh-TW.md](README.zh-TW.md)（繁中）。

It registers **繁體中文（台灣）** in the client language selector by converting the Simplified Chinese UI dictionaries that ship with DSH, using [OpenCC](https://github.com/BYVoid/OpenCC) (`s2twp`, characters plus Taiwan phrasing) and a small TW-usage polish table. Anything not covered automatically falls back to the built-in Simplified dictionary — installing this pack never breaks anything.

- Current coverage: **63 namespaces / 2,676 strings** extracted from the shipped UI dictionaries of DSH 0.2.1-rc.2.
- Pure language pack: one client module, no Host services, no build step required at runtime.

## Install

### Desktop app

1. `git clone https://github.com/Grasseed/dsh-lang-zhtw`
2. In DSH Desktop: sidebar **Plugins** → **Add plugin** → point at the cloned folder.
3. Open **Settings → General → Language** and choose **繁體中文（台灣）**.

### Open-source CLI (`npx @deepseek-ai/dsh`)

```sh
dsh plugin --profile web add github:Grasseed/dsh-lang-zhtw
```

(The desktop profile is managed by the Electron app itself; use the in-app Plugins panel there.)

### Manual profile patch (advanced)

Add one line to your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: lang-zhtw
      name: '/absolute/path/to/dsh-lang-zhtw/index.js'
```

Absolute-path rows are imported directly as ES modules, and Node cannot import a bare directory — point at `index.js`, not the folder. Removing the block uninstalls the pack.

## How it works

The pack only uses the official language-pack API ([`@deepseek-ai/dsh-client-locale`](https://github.com/deepseek-ai/deepseek-harness)):

```js
ctx.locale.addLanguage({ id: 'zh-TW', label: '繁體中文（台灣）', fallback: 'zh' })
ctx.locale.register(ns, 'zh-TW', dict) // for each namespace
```

Lookups follow `zh-TW → zh → en`, so untranslated keys fall back safely.

## Known limits

- A few strings live in component-inline text maps that don't go through the locale registry (e.g. the long "mode explanation" guide text); those fall back to Simplified Chinese and can only be fixed upstream.
- Terminology comes from OpenCC's Taiwan phrasing plus a maintained polish table (e.g. `权限 → 權限`, `计划 → 計畫`, `扩展 → 擴展`). Tune the table in `tools/build-plugin.mjs` to taste.
- Dictionaries are version-specific; regenerate after a DSH upgrade (see below).

## Regenerating for a new DSH version

```sh
# 1. unpack the installed app (macOS example)
npx -y @electron/asar extract "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" /tmp/dsh-asar-x
# 2. harvest every locale dictionary via its register() call sites
node tools/extract-dicts4.mjs /tmp/dsh-asar-x/dsh
# 3. convert with OpenCC and re-emit client.js (run `npm install` once first)
node tools/build-plugin.mjs
```

## License

MIT © 2026 Grasseed
