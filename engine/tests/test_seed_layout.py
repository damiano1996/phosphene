"""The layout of a seed is written in src/phosphene_engine/atlas.py; web/test/facets.test.js decodes the same seeds to the same values."""
import pytest

pytest.importorskip("numpy")
from phosphene_engine.atlas import STYLE_BY_SEED, attrs_of, variant_of  # noqa: E402

SEEDS = [
    (0, 0, 0, []),
    (0b101 | (3 << 6) | (6 << 8) | (30 << 17), 5, 3, [5, 29]),
    ((1 << 6) | (96 << 8), 0, 1, [95]),
    ((2 << 6) | (1 << 17) | (7 << 26), 0, 2, [0]),
]


@pytest.mark.parametrize("seed,slot,variant,attrs", SEEDS)
def test_a_seed_is_read_the_way_the_layout_says(seed, slot, variant, attrs):
    assert seed % len(STYLE_BY_SEED) == slot
    assert variant_of(seed, 4) == variant
    assert attrs_of(seed) == attrs


def test_a_model_that_draws_fewer_kinds_folds_the_variant_or_ignores_it():
    assert variant_of(3 << 6, 1) == 0 and variant_of(3 << 6, 2) == 1
