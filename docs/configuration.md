# 配置与开发参考

## 配置

默认数据目录为 `$DSH_HOME/data/document-evidence`（未设置 DSH_HOME 时为 `~/.dsh/data/document-evidence`）。安装辅助程序创建的 Python 会自动被使用。项目身份从 dsh 当前会话的 sandbox workspace root 推导；上传只接受已提交到该会话的可信附件引用。

可在 `$DSH_HOME/profiles/web/cordis.patch.yml` 添加覆盖配置：

```yaml
- id: document-evidence
  config:
    python: /absolute/path/to/python
    cacheDir: /absolute/path/to/document-evidence
    maxPdfBytes: 104857600
    maxDocumentPages: 2000
    timeoutMs: 120000
```

默认单文件上限 100 MiB、2000 页；图像最长边 2400 像素；项目发现限两层子目录、1000 个目录项、50 份 PDF，跳过隐藏目录、node_modules 和符号链接。超过发现范围时可直接上传或自行加入对应文件。

`python` 与 `cacheDir` 支持 `auto`。每份 patch 的 `config` 替换整份配置，未填写的字段使用默认值。更改 Python 配置后重启 dsh。

## 原生工具

| 工具 | 用途 |
|---|---|
| `library_list` | 当前项目目录、会话范围、上传候选和有界项目 PDF 发现 |
| `library_retrieve` | 一次完成有界候选检索、原页摘录和引用定位 |
| `library_expand` | 补读选定页和可选邻页，返回证据与未读缺口 |
| `library_search` | 检索本会话选中的文档并报告逐文档覆盖 |
| `library_read_page` | 读取原页文本和可选真实图像附件 |
| `library_cite` | 对已读页生成有可靠坐标或明确页级降级的引用 |

开发兼容项 `enableStandaloneTools: true` 可额外启用早期 `pdf_*` 单文件工具及 HTML 导出。这些工具使用独立 `allowedRoots` 配置，默认关闭；正常资料库使用不需要它们。

## 验证与开发

源码测试保留在 `test/`，不进入安装包。验证摘要见 [docs/optimization-beta8.md](optimization-beta8.md)。已验证真实 dsh profile 安装、Web 上传、确认与索引、原生图像附件、模型工具循环及引用高亮；早期协议检查使用本地确定性替身；后续已使用真实视觉模型验证 PDF 问答、表格读取和实际 token 用量。案例存在模型表述错误，不能作为整体准确率保证。

```sh
npm install --ignore-scripts
PDF_EVIDENCE_TEST_PYTHON=/path/to/python npm test
/path/to/python test/worker_test.py -v
npm pack
```

安装包不包含 benchmark、语料、测试替身、用户文档或凭据。Benchmark 仅用于后续开发评测。

## 支持范围与数据流

| 项目 | 状态 |
|---|---|
| dsh Web npm `0.1.3-alpha.2` / macOS arm64 | 已验证 |
| 新版 dsh / 源码构建的 sidebarRight | 未完整验证 |
| Linux / Windows | 尚未完成原生 Web 验证 |
| Python | 3.10+，发布配置固定 PyMuPDF 1.28.2 |

PDF 快照、文字索引与页卡保存在本地。后台摘要、低文本页视觉页卡，以及主 agent 的证据问答会把相应摘录或页面图像发送到 dsh 当前配置的模型服务，并消耗该服务用量。安装 Python 依赖会连接包索引；插件不要求自己的 API Key。

### 卸载

```sh
dsh plugin --profile web remove dsh-document-evidence
```

然后重启 dsh。卸载保留本地资料库和 Python 环境；只有确定不再需要原文及旧引用时，再手动删除配置中的缓存目录。不要删除正在使用的共享资料目录。

