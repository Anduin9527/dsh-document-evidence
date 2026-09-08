# Document Library for DeepSeek Harness

Ask questions about your PDFs and follow each citation back to the source page, right inside dsh Web.

[中文](README.md) · [Configuration](docs/configuration.md) · [Changelog](CHANGELOG.md)

![Citation opening the original PDF page beside the conversation](docs/assets/citation.png)

*Actual UI capture using a sample manual and a local protocol test model.*

## Features

- A project PDF library shared across sessions, with a separate document selection for each conversation.
- Background indexing with progress, page coverage, stop and resume controls.
- Source retrieval, neighboring-page reading and clickable page citations.
- Page images for charts and scanned content through your existing dsh vision model.
- Native tool cards showing candidates, excerpts, timing and status.

## Install

Requires dsh Web, Node.js 22.19+ on the 22.x line or 24+, and Python 3.10+ with venv. Verified with `@deepseek-ai/dsh@0.1.3-alpha.2` on macOS arm64.

```sh
dsh plugin --profile web add dsh-document-evidence@beta
dsh plugin --profile web exec dsh-document-evidence-setup
dsh web
```

Restart dsh if it is already running. Setup creates a dedicated Python environment and installs PyMuPDF. The plugin uses your existing dsh model configuration; no additional API key is needed. Image reading requires a model with image input support.

## Use

1. Upload a PDF in a project conversation and open **资料库** (Library).
2. Confirm that it should be added and indexed, or choose a project PDF.
3. Select the documents to search and ask your question.
4. Click a citation to open the original page and highlight its text.

Try: “Compare revenue for the same year across these two reports. Check the units and cite each source.”

<img src="docs/assets/library.png" alt="Sample manual in the document library with index progress" width="358">

The library supports filename search, document selection and index progress. Page citations support navigation and zoom; scanned pages use page-level navigation when no text coordinates are available.

## Data and models

PDF snapshots and indexes stay local. Summaries, visual page cards and answers send the required excerpts or page images to your configured dsh model service and consume its usage. The default data directory is `~/.dsh/data/document-evidence`, or under `DSH_HOME` when set.

## More

[Configuration and development](docs/configuration.md) · [Performance measurements](docs/optimization-beta8.md) · [Issues](https://github.com/Anduin9527/dsh-document-evidence/issues) · [Contributing](CONTRIBUTING.md)

## License

[AGPL-3.0-only](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md).
