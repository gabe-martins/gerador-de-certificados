"""Close the two black gaps between the red tip and its white borders.

Only the red polygon on black-belt template pages is changed. The red extends
under the inner half of each white border, which is painted afterwards. This
also avoids dark seams caused by antialiasing at two merely adjacent edges.
"""
import argparse
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import FloatObject, NameObject

RED = (233 / 255, 35 / 255, 37 / 255)


def bounds(points):
    xs, ys = zip(*points)
    return min(xs), min(ys), max(xs), max(ys)


def tip_polygons(operations):
    """Return the red path and the two following white border paths."""
    fill, points, indices = None, [], []
    found = []
    for index, (values, operator) in enumerate(operations):
        if operator == b"rg":
            fill = tuple(map(float, values))
        elif operator == b"m":
            points, indices = [tuple(map(float, values))], [index]
        elif operator == b"l":
            points.append(tuple(map(float, values)))
            indices.append(index)
        elif operator in (b"f", b"f*") and points:
            box = bounds(points)
            if abs(box[1] - 426.897) < .001 and abs(box[3] - 455.215) < .001:
                if not found and fill and all(abs(a - b) < 1e-6 for a, b in zip(fill, RED)):
                    found.append((indices[:], box))
                elif found and fill == (1, 1, 1) and box[2] - box[0] > 6:
                    found.append((indices[:], box))
                    if len(found) == 3:
                        return found
            points, indices = [], []
    raise ValueError("Não foram encontrados a ponteira e os dois limites brancos esperados.")


def repair(assets):
    pdf = assets / "modelos.pdf"
    meta = json.loads((assets / "modelos.json").read_text(encoding="utf-8"))
    reader = PdfReader(pdf)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.pdf_header = reader.pdf_header
    modified = []
    models = [model for model in meta["models"] if model.get("visual", {}).get("color") == "preta"]
    if len(models) != 8:
        raise ValueError("O perfil deve conter os oito modelos de faixa preta esperados.")
    for model in models:
        page = writer.pages[model["page"] - 1]
        content = page.get_contents()
        red, left, right = tip_polygons(content.operations)
        left_edge = (left[1][0] + left[1][2]) / 2
        right_edge = (right[1][0] + right[1][2]) / 2
        old_left, _, old_right, _ = red[1]
        if abs(old_left - left_edge) < 1e-6 and abs(old_right - right_edge) < 1e-6:
            continue
        if abs(old_left - 667.531) > .001 or abs(old_right - 752.542) > .001:
            raise ValueError(f"Geometria inesperada na ponteira de {model['id']}.")
        for index in red[0]:
            values = content.operations[index][0]
            x = float(values[0])
            if abs(x - old_left) < .001:
                values[0] = FloatObject(left_edge)
            elif abs(x - old_right) < .001:
                values[0] = FloatObject(right_edge)
        # Never replace a stream shared with another template page.
        page[NameObject("/Contents")] = writer._add_object(content)
        modified.append(model["id"])
    if modified:
        partial = pdf.with_suffix(".pdf.partial")
        with partial.open("wb") as output:
            writer.write(output)
        partial.replace(pdf)
    return modified


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=Path(__file__).resolve().parents[1] / "assets")
    args = parser.parse_args()
    print(json.dumps({"corrected_models": repair(args.assets)}, ensure_ascii=False))
