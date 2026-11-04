"""Regression coverage for black slivers at the red tip's white borders."""
import io

import pytest
from pypdf import PdfReader

from server.pdf_engine import CertificateEngine
from server.profiles import load_profile

PROFILE = load_profile("pagels-jiu-jitsu")
BLACK_MODELS = [model for model in PROFILE.models.values() if model["visual"]["color"] == "preta"]
TIP_RED = (233 / 255, 35 / 255, 37 / 255)


def filled_rectangles(page):
    color, stack, path = (0, 0, 0), [], []
    for values, operator in page.get_contents().operations:
        if operator == b"q":
            stack.append(color)
        elif operator == b"Q":
            color = stack.pop()
        elif operator == b"rg":
            color = tuple(map(float, values))
        elif operator == b"m":
            path = [tuple(map(float, values))]
        elif operator == b"l":
            path.append(tuple(map(float, values)))
        elif operator == b"re":
            x, y, width, height = map(float, values)
            path = [(x, y), (x + width, y), (x + width, y + height), (x, y + height)]
        elif operator in (b"f", b"f*") and path:
            xs, ys = zip(*path)
            if len(set(xs)) <= 3 and len(set(ys)) == 2:
                yield color, (min(xs), min(ys), max(xs), max(ys))
            path = []
        elif operator in (b"n", b"S", b"s"):
            path = []


def color_at(rectangles, x, y):
    result = None
    for color, (left, bottom, right, top) in rectangles:
        if left < x < right and bottom < y < top:
            result = color
    return result


@pytest.mark.parametrize("model", BLACK_MODELS, ids=lambda model: model["id"])
def test_red_tip_has_no_black_gaps_and_keeps_white_borders_and_degrees(model):
    row = {"nome_aluno": "Aluno de Exemplo", "cidade": "São José", "uf": "SC",
           "data": "2026-11-03", "modelo_id": model["id"]}
    original = PdfReader(PROFILE.assets / "modelos.pdf").pages[model["page"] - 1]
    emitted = PdfReader(io.BytesIO(CertificateEngine(PROFILE).generate([row]))).pages[0]
    for page in (original, emitted):
        rectangles = list(filled_rectangles(page))
        # These two positions were black in the broken artwork.
        for x in (666.8, 753.2):
            assert color_at(rectangles, x, 441) == pytest.approx(TIP_RED), f"Black gap at x={x}"
        for x in (662.5, 757.5):
            assert color_at(rectangles, x, 441) == (1, 1, 1)
        for x in (650, 775):
            assert color_at(rectangles, x, 441) == (0, 0, 0)
        white_bands = [box for color, box in rectangles if color == (1, 1, 1)
                       and box[0] > 650 and box[2] < 770
                       and abs(box[1] - 426.897) < .001 and abs(box[3] - 455.215) < .001]
        assert len(white_bands) == 2 + model["degree"]
