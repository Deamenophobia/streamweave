# Third-party notices

The MIT license in this repository covers Streamweave's own source. Dependencies retain their upstream copyrights and licenses. They are installed through npm or pip; their source and license files are not replaced by Streamweave's license.

## Browser application

| Component                                                                                                           | Role                                                | Upstream license               |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------ |
| [React and React DOM](https://github.com/facebook/react)                                                            | UI rendering, scheduler, and external-store support | MIT                            |
| [React Flow / xyflow](https://github.com/xyflow/xyflow)                                                             | Canvas nodes, connections, and editing              | MIT                            |
| [Zustand](https://github.com/pmndrs/zustand)                                                                        | State support used by React Flow                    | MIT                            |
| [classcat](https://github.com/jorgebucaran/classcat)                                                                | Class-name composition                              | MIT                            |
| [D3 modules](https://github.com/d3)                                                                                 | Canvas interaction and interpolation dependencies   | ISC; d3-ease uses BSD-3-Clause |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped), [CSSType](https://github.com/frenic/csstype) | Type declarations                                   | MIT                            |

Exact JavaScript versions and package license identifiers are recorded in `package-lock.json`. Original notices are in each installed package's license file. React Flow's visible attribution remains in the canvas.

## Optional Python engine

| Component                                                                                       | Role                                                         | Upstream license                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| [NumPy](https://github.com/numpy/numpy), [SciPy](https://github.com/scipy/scipy)                | Numerical arrays and least squares                           | BSD-3-Clause, with additional notices for bundled components |
| [FastAPI](https://github.com/fastapi/fastapi), [Pydantic](https://github.com/pydantic/pydantic) | Local API and boundary models                                | MIT                                                          |
| [Starlette](https://github.com/Kludex/starlette), [Uvicorn](https://github.com/Kludex/uvicorn)  | ASGI service infrastructure                                  | BSD-3-Clause                                                 |
| [AnyIO](https://github.com/agronholm/anyio), [h11](https://github.com/python-hyper/h11)         | Async and HTTP support                                       | MIT                                                          |
| [OpenTelemetry API](https://github.com/open-telemetry/opentelemetry-python)                     | Installed dependency API; Streamweave configures no exporter | Apache-2.0                                                   |
| [certifi](https://github.com/certifi/python-certifi)                                            | Certificate bundle used by development HTTP tooling          | MPL-2.0                                                      |

Exact Python versions are pinned in `services/engine/requirements.txt` and `requirements.lock`. Package metadata and installed `.dist-info/licenses` directories contain the complete notices. Numerical wheels can include native libraries such as BLAS/LAPACK with additional license texts and exceptions; preserve those notices when redistributing an environment or binary bundle.

Development tools also retain their licenses, including TypeScript, Vite, Prettier, tsx, Ruff, Mypy, pytest, psutil, and HTTPX. This summary is a navigation aid rather than a replacement for the complete upstream terms. Public release assets contain Streamweave source; npm and Python environments are not vendored into the repository.

## Earlier project patterns

Earlier projects supplied architectural ideas for adapters, registries, and reproducible artifacts. The workbench's implementation is described in [architecture and reuse decisions](docs/architecture.md#reuse-after-reviewing-earlier-assets). Private inventory notes and external service code are not part of the published repository.
