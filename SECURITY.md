# Security policy

## Report a vulnerability privately

Use GitHub's [Report a vulnerability](https://github.com/Deamenophobia/streamweave/security/advisories/new) form. Reports are visible to the maintainers rather than posted as public issues. Do not include credentials or personal datasets; use a small synthetic reproduction where possible.

Include the affected version or commit, steps to reproduce, expected and actual behavior, and the potential impact. Ordinary bugs and feature requests belong in [Issues](https://github.com/Deamenophobia/streamweave/issues).

This is an early project maintained on a best-effort basis, with no guaranteed response time. Security fixes target the latest release and `main`; there is no long-term support branch yet.

## Supported use

The workbench is a local, file-based application. Browser calculations run in a Web Worker. The optional Python service binds to `127.0.0.1:5191` and accepts the documented local workbench origins. It has no authentication suitable for remote access; do not expose it through a public interface or tunnel.

The service accepts dataset and graph JSON, not scripts, file paths, or remote source URLs. It does not fetch data from third-party services or include application telemetry. Graph, input, and cache limits are described in the [engine guide](docs/wiki/local-engine.md). These bounds are not a complete process-memory limit, and Python cancellation is cooperative.

Project and result JSON files embed source datasets. Review their contents before sharing them. See the [file format guide](docs/wiki/file-formats.md).
