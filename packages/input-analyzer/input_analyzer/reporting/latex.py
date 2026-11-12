"""Plain-text formatting and LaTeX table fragments."""

from pathlib import Path


def escape_latex(value: object) -> str:
    """Escape plain text without re-escaping inserted commands."""
    mapping = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }

    escaped_characters = []
    for character in str(value):
        escaped_character = mapping.get(character, character)
        escaped_characters.append(escaped_character)
    return "".join(escaped_characters)


def format_number(value: float | None, scale: float = 1.0) -> str:
    """Scale a measurement to two decimals, using '--' for missing values."""
    if value is None:
        return "--"
    scaled_value = value / scale
    return f"{scaled_value:.2f}"


def write_table(path: Path, headers: list[str], rows: list[list]) -> None:
    """Write a LaTeX tabular fragment, treating all cell values as plain text."""
    column_specification = "l" * len(headers)
    lines = [r"\begin{tabular}{" + column_specification + "}", r"\hline"]

    escaped_headers = []
    for value in headers:
        escaped_headers.append(escape_latex(value))
    lines.append(" & ".join(escaped_headers) + r" \\")
    lines.append(r"\hline")

    for row in rows:
        escaped_cells = []
        for value in row:
            escaped_cells.append(escape_latex(value))
        lines.append(" & ".join(escaped_cells) + r" \\")

    lines.extend([r"\hline", r"\end{tabular}"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
