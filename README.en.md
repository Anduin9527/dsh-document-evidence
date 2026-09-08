# Document Evidence for DeepSeek Harness

[中文](README.md) · English

A native dsh Web plugin for a project PDF library, bounded evidence retrieval, page images and source citations. Select documents per conversation; click citations to open the original page beside the conversation.

## Install

Beta `0.2.0-beta.9`. Tested with the npm release of `@deepseek-ai/dsh@0.1.3-alpha.2` on macOS arm64. Requires a supported Node.js version (`^22.19.0 || >=24.0.0`) and Python 3.10+ with venv. Linux, Windows and other dsh versions have not completed native Web validation.

Obtain the versioned tarball from the maintainer, then run:

```sh
dsh plugin --profile web add /absolute/path/dsh-document-evidence-0.2.0-beta.9.tgz
dsh plugin --profile web exec dsh-document-evidence-setup
dsh web
```

Setup installs PyMuPDF 1.28.2 into a plugin-specific Python environment. It needs package-index access but does not change model settings. The plugin uses the model and credentials already configured in dsh. Page-image reading and visual indexing require a model that declares image input support.

Upload a PDF and send the message. Open the conversation's Document Library, confirm adding the file, and select the documents to query. Indexing progress and coverage remain visible. Click a supplied citation to inspect its physical page and any located text.

## Evidence and privacy

- Reuses local immutable PDF snapshots and lexical page indexes across conversations within a project. Conversation selections remain separate.
- `library_retrieve` combines candidate search, bounded original excerpts and citation location. `library_expand` reads selected pages and optional neighbors; `library_read_page` can supply page images.
- Exact repeated evidence can reference earlier visible text or images. Native session replacements preserve original records; missing references are restored from exact archived content after compaction. Set `reuseVisibleEvidence: false` to disable this optimization.
- PDF snapshots, indexes and model-authored page notes are local. Background summaries/visual notes and agent answers send the relevant excerpts or images to your configured model service and consume its quota.
- Search is lexical, not exhaustive. Page notes are model-authored discovery aids. A citation locates evidence; it does not verify the model's interpretation. Scans without a usable text layer fall back to page-level navigation.
- Single-host cache writes only. Do not run multiple dsh hosts against the same library cache. Citation URLs work inside dsh with this plugin, not as public document links.

## Configuration

Override the plugin in `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: document-evidence
  config:
    python: /absolute/path/to/python
    cacheDir: /absolute/path/to/document-evidence
    reuseVisibleEvidence: true
```

Default storage: `$DSH_HOME/data/document-evidence` (otherwise `~/.dsh/data/document-evidence`). Defaults include 100 MiB and 2,000 pages per PDF. Restart dsh after changes. See the Chinese README for all limits and tools.

## Validation

Protocol checks, real PDF/vision case studies and actual provider token measurements have been performed. A controlled request decreased input from 27,697 to 26,760 tokens (3.38%). Local warm retrieval median decreased from 1,544 to 359 ms with identical evidence. One free-running follow-up finished in 28.5 rather than 41.1 seconds; this is not a general speed guarantee. Cache misses and first-token latency did not improve in that case. Model interpretation errors remain.

## Development and removal

```sh
npm ci --ignore-scripts
PDF_EVIDENCE_TEST_PYTHON=/path/to/python npm test
/path/to/python test/worker_test.py
npm run check:release
npm pack
```

Tests use synthetic documents and do not require model credentials. To uninstall, run `dsh plugin --profile web remove dsh-document-evidence` and restart dsh. Local library data is retained so old evidence is not silently destroyed.

## License

AGPL-3.0-only; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). Dependencies retain their own terms. No commercial PyMuPDF license is granted by this package.
