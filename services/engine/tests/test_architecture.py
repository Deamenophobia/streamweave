"""Keep numerical modules free of service/job dependencies and reject import cycles."""

import ast
from pathlib import Path


def test_dependency_boundaries_and_cycles():
    root = Path(__file__).resolve().parents[1] / "streamweave_engine"
    modules = {p.stem: p for p in root.glob("*.py")}
    pure = {
        "alignment",
        "statistics",
        "tables",
        "transforms",
        "pressure",
        "context",
        "models",
        "catalogue",
        "registry",
        "graph",
        "cache",
    }
    dependencies = {}
    for name, path in modules.items():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        imports = [node for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)]
        local = {node.module.split(".")[0] for node in imports if node.level and node.module}
        if name in pure:
            assert not local & {"server", "jobs", "executor", "cli", "__main__"}, name
            assert not any(
                node.module and node.module.split(".")[0] in {"fastapi", "uvicorn"}
                for node in imports
            ), name
        dependencies[name] = local & modules.keys()

    def visit(name, stack):
        assert name not in stack, f"Dependency cycle: {stack} -> {name}"
        for target in dependencies[name]:
            visit(target, [*stack, name])

    for name in modules:
        visit(name, [])
