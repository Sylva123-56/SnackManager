# 零食管家

记录零食库存、生产日期与保质期，并在快过期时提醒你的桌面小软件。

Windows 11 单机应用，**完全离线**，一个 JSON 文件就是你的全部数据。

## 它做什么

- **库存与数量**：记录买了多少包、还剩多少包，一键「吃掉一包」扣减，或直接标记吃完。
- **保质期**：填生产日期 + 保质期长度（天 / 月 / 年）自动推算到期日，也可以直接手填到期日。跨月、闰年、月末（1 月 31 日 + 1 个月 = 2 月 28 日）都按日历正确处理。
- **过期判定**：到期当天算「临期」而不是「过期」；剩 0 包算「已吃完」，不再计入警示。临期提醒天数可在设置里改（默认 7 天）。
- **购买统计**：近 7 天 / 近 30 天 / 本月 / 全部四个口径下，看购买包数、总花费、记录条数，以及花费按分类的排行。
- **备份**：导出成带时间戳的 JSON，导入时可选「全部替换」或「合并」（按 id 去重，较新的记录胜出）。导入、清空前都会自动留一份存档。
- **两种记法**：工具栏上并排「记录零食」与「记录整箱」。散包就点「记录零食」，填完即存；一箱好几包就点「记录整箱」，箱内的包默认同一天生产，日期不一样时点「有的包生产日期不一样」再加一批，每批各填生产日期与包数。整箱共用一个保质期，状态按**最早到期的那批**算，扣减时**先吃最早到期的那批**；早批吃光了，整箱到期日会自动挪到下一批。
- **草稿留着**：填到一半点了窗口外面的暗处或按 Esc，窗口关掉但**内容不丢**，下次打开同一类表单接着填；点「取消」才算放弃。
- **外观与字号**：浅色（纸袋奶白）/ 深色 / 跟随系统三选一。字号可在设置里调，单位 px，范围 11–22，默认 14——整套界面是按这个字号等比缩放的，字、间距、按钮高度一起长，放大后不会互相挤。窗口默认 1366×768，最小 900×620。

## 字体

界面用**寒蝉全圆体**（ChillRoundF v3.200，SIL OFL 1.1）——寒蝉圆黑体的全圆角版本，笔画端点本身就是圆的。**全量打包，不做子集裁剪**：14304 个码位 / 15865 个字形，所以你输入什么零食名都不会出现「一半圆一半方」的混排，`蒟蒻`、`鬱` 这类 GBK / 繁体字也照样有。

字体文件在 `src/assets/font/`，两档字重（常规 3.06 MB / 粗体 3.22 MB woff2），授权原文见同目录 `OFL.txt`。从官方 OTF 重新生成：

```bash
python -m pip install fonttools brotli
# 不裁剪字形，只做 woff2 压缩（Brotli）并去掉 hinting
python -m fontTools.subset ChillRoundFRegular.otf \
  --glyphs='*' \
  --flavor=woff2 --layout-features='kern,liga' --no-hinting --desubroutinize \
  --output-file=src/assets/font/chillf-regular.woff2
```

源文件下载自 [Warren2060/ChillRound](https://github.com/Warren2060/ChillRound/releases/tag/v3.200)（v3.200，2024-05-09）。转换后体积约为原 OTF 的一半，中文字形曲线数据本身没法再压，3 MB 就是这套字体的下限。

字重只装两档。CSS 里写的 500/550/600/650 由浏览器就近匹配到常规或粗体，不合成假粗体（圆体被合成加粗后圆角会糊）。

## 为什么这么小

| | |
|---|---|
| 安装包 | **7.58 MB** |
| 主程序 | **9.52 MB** |
| 运行内存 | **约 30 MB** |
| 前端依赖 | 只有 React —— 没有 UI 框架、没有图标库、没有 CSS 预处理器 |
| 字体 | 寒蝉全圆体，全量不裁剪，两档字重共 **6.3 MB** |

用的是 Tauri 2（Rust + 系统自带 WebView2），不是 Electron。界面全部手写 CSS，图标是内联 SVG。

体积比不装字体时大了 6.3 MB，全部花在那套中文字体上。这是有意的取舍：系统雅黑在大字号下偏硬，圆体的圆头笔画更配暖色纸袋的调性；而裁掉字形会让你自己输入的生僻零食名一半圆一半方，所以干脆全量打包——14304 个码位，一个字都不缺。

## 开发

需要 Node 22+、pnpm、Rust stable 与 MSVC 生成工具。

```bash
pnpm install
pnpm app:dev      # 起桌面应用（热更新）
pnpm test         # 领域逻辑单测，191 个用例
pnpm typecheck    # tsc --noEmit
pnpm app:build    # 出安装包，产物在 src-tauri/target/release/bundle/nsis/
```

`pnpm dev` 可以只在浏览器里跑界面（数据退化到 localStorage），调试样式更快。

样式里**除细线、圆角胶囊和媒体查询外，尺寸一律写 rem**，`1rem` 就是设置里的那个字号。这样用户把字号调到 22 px，按钮、行高、间距会一起放大而不是挤在一起。要加新的固定尺寸，写 `2.429rem` 而不是 `34px`；只有 `border-width`、`border-radius: 999px`、`box-shadow` 这类不该随字号变的才留 px。

## 数据在哪

```
%APPDATA%\com.snackmanager.app\
  snacks.json          # 主数据
  snacks.json.bak      # 上一次成功写入的备份
  snacks.pre-import-*.json   # 导入前的自动存档
  images\              # 你贴进去的零食照片
```

写入是「临时文件 → fsync → 备份旧档 → 改名覆盖」，断电或崩溃不会写出半个 JSON。如果主文件真的坏了，启动时会提示你用 `.bak` 恢复或从空白库重来，**不会**默默覆盖掉。

## 目录

```
src/
  domain/     纯函数：日期运算、过期判定、统计、列表筛选排序、导入导出
  state/      reducer、持久化、草稿校验、主题、字号
  components/ 界面组件
  assets/font/ 寒蝉全圆体（woff2）与 OFL 授权
  styles/     设计令牌、字体 @font-face 与布局
src-tauri/    Rust 侧：文件读写（原子写 + 备份）、图片存取、导入导出对话框
```

## 验证

```bash
pnpm test         # 191 个领域单测：日期跨月/闰年、四种状态边界、四档统计、导入去重、坏 JSON 拒绝、字号夹取
cargo test        # Rust 侧重：原子写、.bak 轮转、非法 JSON 不覆盖、图片增删、base64 编码
node scripts/e2e.mjs   # 端到端，驱动真实桌面应用
```

端到端脚本用 CDP 连 WebView2，不需要 Playwright。跑之前先让应用带调试端口启动：

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'
.\src-tauri\target\release\snack-manager.exe
```

覆盖八组：空库引导 → Ctrl+N 建单 → 扣减库存 → 搜索过滤 → 防抖落盘 → 设置持久化 → 重载不丢 → 编辑入口。

批次逻辑另有 `node scripts/check-batches.mjs`：在空白库上建一条两批的记录，验证「先吃早批、早批吃完整箱挪到晚批、批次结构正确落盘」。

界面预览可用 `node scripts/shot.mjs <url> <out.png>`，同样是零依赖 CDP 截图。
