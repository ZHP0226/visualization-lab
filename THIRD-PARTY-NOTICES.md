# 第三方组件与素材声明

自行编写的代码与自制资产采用根目录 MIT。以下第三方内容保留自己的许可，MIT 不会替代它们。

| 内容 | 来源和用途 | 许可 |
| --- | --- | --- |
| Electron 45.2.1 | [上游](https://github.com/electron/electron)，桌面运行库 | MIT，`licenses/Electron-MIT.txt` |
| Chromium / Electron 子组件 | Electron 二进制附带 | 便携版 `LICENSES.chromium.html` 与运行库声明 |
| Three.js 0.187.0 | [上游](https://github.com/mrdoob/three.js)，三维预览和示例生成 | MIT，`licenses/Three.js-MIT.txt` |
| Draco | [上游](https://github.com/google/draco)，构建后的 `dist/decoders/draco` | Apache-2.0，`licenses/Draco-Apache-2.0.txt` |
| Basis Universal | [上游](https://github.com/BinomialLLC/basis_universal)，构建后的 `dist/decoders/basis` | Apache-2.0，`licenses/Basis-Universal-Apache-2.0.txt` |
| Inter | [上游](https://github.com/rsms/inter)，拉丁字体 | SIL OFL，`licenses/Inter-OFL.txt` |
| Noto Sans SC | [上游](https://github.com/notofonts/noto-cjk)，中文字体 | SIL OFL，`licenses/NotoSansSC-OFL.txt` |
| esbuild / Playwright / npm 间接依赖 | 构建与验证工具 | 锁定版本见 `package-lock.json`；来源、许可见 `licenses/dependency-inventory.json`，安装后保留各组件原许可 |

Apache 通用正文在 `licenses/Apache-2.0.txt`。便携包保留 Electron 的运行库原声明。软件不附带 Blender、Cinema 4D、商业插件、付费账户或第三方论文图片。

## 自制资产

- VL 图标、开场动画代码和界面为本项目制作；字体轮廓相关内容保留字体许可。
- `assets/library/示例模型` 由本项目 `scripts/create-samples.mjs` 生成。
- 材质、布光预览和建模框架为本项目自制，生成记录见相应目录说明与 provenance 文件。

重新分发时请保留项目 MIT、第三方声明、字体与所用运行库原许可，不要把第三方组件标为本项目独占创作。

- `examples/dark-metal-chip` 使用本项目第三期的自写芯片程序与自制纹理，先生成参考，再在 Cinema 4D 中新建、重开并渲染。自有代码与资产按 MIT；C4D 本体不在分发范围内。
