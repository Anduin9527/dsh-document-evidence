# Third-party components

This plugin's own source is licensed under AGPL-3.0-only. The package ships readable JavaScript and Python source; it does not bundle the dsh runtime, a Python interpreter, PyMuPDF wheels, model weights, or user PDFs.

| Component | Use | License / source |
|---|---|---|
| PyMuPDF 1.28.2 / MuPDF | PDF extraction, rendering and text geometry; installed separately by setup | AGPL or Artifex commercial license; [official licensing](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright), [source](https://github.com/pymupdf/PyMuPDF) |
| DeepSeek Harness packages (`dsh-tools`, `dsh-llm`, test/runtime host packages) | Native tools, messages, model service and UI integration | MIT; [source and notices](https://github.com/deepseek-ai/deepseek-harness) |
| `@deepseek-ai/cordis` | Plugin context and lifecycle | MIT; installed package contains its own LICENSE |
| `@deepseek-ai/schemastery` | Configuration schema | MIT; installed package contains its own LICENSE |

The selected release route is AGPL open source. Installing PyMuPDF separately does not remove its license conditions, and this package does not provide a commercial license or a general exemption for proprietary deployment. Consult the upstream terms for your distribution or deployment.

Transitive dependencies are installed by the package managers and retain their own license files. The npm lockfile records the JavaScript versions and available license metadata. If distributing a combined runtime, retain those notices and applicable source/redistribution materials as well; this short inventory is not a replacement for them.
