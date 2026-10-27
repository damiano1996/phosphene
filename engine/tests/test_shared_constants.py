"""Numbers that the engine and the web page must agree on: the page reads them from the files, so a change on one side fails here instead of in somebody's browser."""
import re
from pathlib import Path

import pytest

pytest.importorskip("numpy")
from phosphene_engine import atlas, attrs  # noqa: E402

FACETS_JS = (Path(__file__).parent / ".." / ".." / "web" / "js" / "core" / "facets.js").read_text()


def js_const(name):
    return int(re.search(rf"export const (?:[A-Z_0-9, =]*?){name} = (0x[0-9A-Fa-f]+|\d+)", FACETS_JS).group(1), 0)


def test_the_number_of_attribute_slots_is_the_same_on_both_sides():
    assert js_const("CAPACITY") == attrs.CAPACITY


def test_the_seed_fields_are_in_the_same_places():
    shifts = re.search(r"export const VARIANT_SHIFT = (\d+), ATTR1_SHIFT = (\d+), ATTR2_SHIFT = (\d+), ATTR_MASK = (0x[0-9A-F]+)", FACETS_JS).groups()
    assert (int(shifts[0]), int(shifts[1]), int(shifts[2]), int(shifts[3], 16)) == (atlas.VARIANT_SHIFT, atlas.ATTR1_SHIFT, atlas.ATTR2_SHIFT, atlas.ATTR_MASK)
