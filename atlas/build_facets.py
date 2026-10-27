"""Writes facets.json: the finer grain below a concept ("snowy mountains" -> the Dolomites, dark granite peaks, green alpine meadows).

A cell has one of VARIANTS variants (0 is the plain concept). Each variant of a concept is a prompt phrase and the attributes it carries; the attributes are shared across all
concepts ("pale rock", "golden hour", "fog"), which is what lets the model carry a liking from one concept to another. A concept without variants of its own gets the generic ones
(light and mood that fit anything). Curated so far: the landscapes, the plants and forests, the sky and weather, and some flowers; the rest use the generic ones.
Run:  python3 atlas/build_facets.py      (needs nothing but the standard library)"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from concepts import CONCEPTS  # noqa: E402

VARIANTS = 4          # per concept, counting the plain one (variant 0)

ATTRIBUTES = [        # id, label, group, the words that go into the prompt (a concept can ask for one or two of them; see engine/attrs.py)
    ("pale-rock", "Pale rock", "terrain", "pale limestone rock"), ("granite", "Dark granite", "terrain", "dark granite rock"), ("green-meadow", "Green meadows", "terrain", "lush green meadows"), ("snow", "Snow", "terrain", "fresh snow"),
    ("water", "Water", "terrain", "water"), ("sand", "Sand", "terrain", "sand"), ("forest", "Forest", "terrain", "dense forest"), ("ice", "Ice", "terrain", "blue ice"), ("volcanic", "Volcanic black", "terrain", "black volcanic rock"),
    ("golden-hour", "Golden hour", "light", "golden hour light"), ("blue-hour", "Blue hour", "light", "blue hour twilight"), ("overcast", "Overcast", "light", "soft overcast light"), ("fog", "Fog and mist", "light", "fog and mist"),
    ("night", "Night", "light", "at night"), ("harsh-sun", "Harsh sun", "light", "harsh bright sunlight"), ("dramatic-sky", "Dramatic sky", "light", "dramatic sky"),
    ("autumn", "Autumn", "season", "autumn colors"), ("winter", "Winter", "season", "winter"), ("spring", "Spring", "season", "spring"), ("storm", "Storm", "season", "stormy weather"),
    ("warm-palette", "Warm palette", "palette", "warm color palette"), ("cool-palette", "Cool palette", "palette", "cool color palette"), ("pastel", "Pastel", "palette", "pastel colors"), ("vivid", "Vivid colour", "palette", "vivid saturated colors"), ("monochrome", "Monochrome", "palette", "monochrome"),
    ("aerial", "From above", "composition", "aerial view from above"), ("wide", "Wide view", "composition", "wide angle view"), ("close-up", "Close-up", "composition", "close-up macro"), ("reflection", "Reflections", "composition", "mirror reflections"), ("minimal", "Minimal", "composition", "minimalist composition"),
]
A = {a[0] for a in ATTRIBUTES}
# the categories where terrain and season words make sense ("a pizza, glacier ice" does not); light, palette and composition fit anything
NATURE = ["landscapes", "plants and forests", "sky and weather", "flowers", "gardens and landscaping", "sea life", "mammals", "birds", "insects and fungi"]

def v(phrase, attrs): return {"phrase": phrase, "attrs": attrs.split()}

CURATED = {
    # landscapes
    "snowy mountains": [v("the Dolomites at sunrise, pale limestone peaks", "pale-rock golden-hour wide"), v("jagged dark granite peaks covered in fresh snow", "granite snow dramatic-sky"), v("green alpine meadows below snowy peaks, spring flowers", "green-meadow snow spring")],
    "desert dunes": [v("red sand dunes at sunset with long shadows", "sand golden-hour warm-palette"), v("pale wind-rippled dunes, minimal and quiet", "sand pastel minimal"), v("desert dunes under a starry night sky", "sand night")],
    "a canyon": [v("a red sandstone slot canyon with a beam of light", "warm-palette harsh-sun"), v("a vast layered canyon seen from above", "aerial wide"), v("a canyon with a green river in autumn", "water autumn")],
    "a volcano": [v("an erupting volcano glowing at night", "night volcanic vivid"), v("a snow-capped volcano above a green lake", "snow water green-meadow"), v("a black volcanic crater in fog", "volcanic fog")],
    "a glacier": [v("a blue ice cave inside a glacier", "ice cool-palette"), v("a glacier meeting the sea with icebergs", "ice water"), v("a glacier seen from above with deep crevasses", "ice aerial")],
    "a waterfall": [v("a tall waterfall in a lush green rainforest", "forest water vivid"), v("a wide waterfall in Iceland with dark basalt cliffs", "volcanic water overcast"), v("a small waterfall over mossy rocks, silky long exposure", "water close-up forest")],
    "a lake at dawn": [v("a mirror-calm mountain lake at dawn with a perfect reflection", "reflection water golden-hour"), v("a misty lake with a wooden pier", "fog water"), v("a turquoise alpine lake surrounded by pines", "water forest vivid")],
    "a beach at sunset": [v("a tropical beach with palm trees at sunset", "sand golden-hour warm-palette"), v("a wild rocky beach with crashing waves under a stormy sky", "storm dramatic-sky water"), v("an empty white sand beach seen from above, turquoise water", "aerial sand pastel")],
    "the northern lights": [v("a green aurora over a snowy forest", "night snow forest"), v("a purple and pink aurora over a frozen lake", "night ice vivid"), v("an aurora above a lone cabin, wide starry sky", "night wide")],
    "rolling green hills": [v("rolling green hills with one lone tree in spring", "green-meadow spring minimal"), v("misty green hills at sunrise", "fog golden-hour green-meadow"), v("Tuscan hills with cypress trees in golden light", "warm-palette golden-hour")],
    "an african savanna": [v("an acacia tree on the savanna at sunset", "golden-hour warm-palette"), v("a dry savanna with a herd of elephants", "harsh-sun warm-palette"), v("a green savanna after rain under dramatic clouds", "green-meadow dramatic-sky storm")],
    "cliffs by the sea": [v("white chalk cliffs above turquoise water", "pale-rock water pastel"), v("dark sea cliffs with waves crashing, stormy sky", "granite storm dramatic-sky"), v("green cliffs with a lighthouse at sunrise", "green-meadow golden-hour")],
    "a salt flat": [v("a mirror salt flat reflecting the sky", "reflection wide minimal"), v("a cracked white salt flat seen from above", "aerial monochrome"), v("a salt flat at sunset under a pink sky", "golden-hour pastel")],
    "a cave": [v("a glowing blue sea cave", "water cool-palette"), v("a cave with stalactites lit by a torch", "warm-palette night"), v("a cave entrance with ferns and beams of light", "forest harsh-sun")],
    "a rainforest river": [v("a winding river through dense rainforest seen from above", "aerial forest water"), v("a misty rainforest river at dawn", "fog forest water"), v("a tropical river with rapids in bright sunlight", "water harsh-sun vivid")],
    "a fjord": [v("a fjord with steep green cliffs and a small boat", "green-meadow water"), v("a snowy fjord in winter at blue hour", "winter snow blue-hour"), v("a misty fjord with a waterfall", "fog water")],
    # plants and forests
    "an old oak tree": [v("a lone old oak tree in a golden field", "golden-hour warm-palette minimal"), v("an old oak tree in autumn with fallen leaves", "autumn warm-palette"), v("a gnarled old oak tree in fog", "fog monochrome")],
    "palm trees": [v("palm trees on a white beach with turquoise water", "sand water vivid"), v("palm trees in silhouette at sunset", "golden-hour warm-palette"), v("palm trees seen from below against a blue sky", "harsh-sun vivid")],
    "a bamboo forest": [v("a bamboo forest path with beams of sunlight", "forest golden-hour"), v("a misty bamboo forest", "fog forest"), v("bamboo seen from below, a green canopy", "forest green-meadow close-up")],
    "ferns": [v("ferns unfurling, a close-up", "close-up forest"), v("a forest floor of ferns in sunbeams", "forest golden-hour"), v("ferns covered in morning dew", "close-up fog")],
    "moss on a rock": [v("moss on a rock in a stream", "water forest"), v("bright green moss, macro", "close-up vivid"), v("moss in a misty forest", "fog forest")],
    "an autumn forest": [v("an autumn forest with red and orange maples", "autumn warm-palette vivid"), v("a golden birch forest in autumn", "autumn golden-hour"), v("an autumn forest path in fog", "autumn fog")],
    "a snowy pine forest": [v("a snowy pine forest at blue hour", "winter snow blue-hour"), v("frosted pine trees in fog", "winter fog monochrome"), v("a pine forest in snow with a golden sunrise glow", "winter snow golden-hour")],
    "mangroves": [v("mangrove roots in clear shallow water", "water forest"), v("mangroves at sunset, reflections", "golden-hour reflection"), v("a mangrove forest seen from above", "aerial forest water")],
    "a baobab tree": [v("a baobab tree at sunset", "golden-hour warm-palette"), v("baobab trees under a starry sky", "night"), v("a baobab avenue in dust and light", "harsh-sun warm-palette")],
    "a tropical jungle": [v("a dense jungle with a hidden waterfall", "forest water vivid"), v("a jungle canopy seen from above in mist", "aerial fog forest"), v("a jungle with golden sunbeams", "forest golden-hour")],
    "a redwood forest": [v("tall redwoods with sunbeams", "forest golden-hour"), v("redwoods in fog, seen from below", "fog forest"), v("a redwood grove with ferns", "forest green-meadow")],
    "a mossy forest in fog": [v("a mossy forest in fog, green and silent", "fog forest green-meadow"), v("a moss-covered fallen tree in a misty forest", "fog close-up"), v("a misty forest with soft golden light", "fog golden-hour")],
    "a weeping willow by a river": [v("a weeping willow by a river at sunrise", "golden-hour water"), v("a weeping willow in spring, soft green", "spring green-meadow pastel"), v("a weeping willow in fog", "fog monochrome")],
    # sky and weather
    "a thunderstorm": [v("a thunderstorm over open fields with lightning", "storm dramatic-sky"), v("a dark storm cloud over the sea", "storm water dramatic-sky"), v("a supercell storm at sunset", "storm golden-hour dramatic-sky")],
    "a sunset sky": [v("a pink and purple sunset sky", "golden-hour pastel vivid"), v("an orange sunset behind mountains", "golden-hour warm-palette"), v("a sunset sky in silhouette, minimal", "golden-hour minimal")],
    "a starry night": [v("the milky way over mountains", "night wide"), v("a starry sky above a lone tree", "night minimal"), v("star trails over a lake", "night water reflection")],
    "a rainbow": [v("a double rainbow over green fields", "green-meadow vivid"), v("a rainbow over the sea after a storm", "water storm vivid"), v("a rainbow in front of dark storm clouds", "dramatic-sky vivid")],
    "fog over a valley": [v("fog filling a valley at sunrise", "fog golden-hour"), v("layers of misty hills in blue tones", "fog cool-palette minimal"), v("fog over a forest valley, seen from above", "fog aerial forest")],
    "snowfall": [v("heavy snowfall in a quiet street at night", "winter night"), v("snowfall in a pine forest", "winter snow forest"), v("soft snowfall in pastel winter light", "winter pastel minimal")],
    "dramatic clouds": [v("dramatic storm clouds with rays of light", "dramatic-sky storm"), v("towering cumulus clouds in a blue sky", "vivid wide"), v("low clouds over mountains at sunrise", "golden-hour fog")],
    "a full moon": [v("a full moon rising over the sea", "night water"), v("a full moon behind bare branches", "night monochrome minimal"), v("a huge golden moon over mountains", "night golden-hour")],
    # flowers
    "a tulip field": [v("rows of red and yellow tulips under a blue sky", "vivid spring harsh-sun"), v("a tulip field at sunrise with mist", "fog golden-hour spring"), v("pastel pink and white tulips, close-up", "pastel close-up spring")],
    "a lavender field": [v("a lavender field in Provence at golden hour", "golden-hour warm-palette"), v("rows of lavender leading to a farmhouse", "wide spring"), v("lavender close-up with a bee", "close-up vivid")],
    "cherry blossom": [v("cherry blossom along a river, pink petals on the water", "spring pastel water"), v("cherry blossom against a blue sky, seen from below", "spring vivid"), v("cherry blossom at night with lanterns", "spring night")],
    "a poppy field": [v("a red poppy field at sunset", "golden-hour warm-palette vivid"), v("poppies and a lone tree in morning mist", "fog spring minimal"), v("poppies close-up with soft light", "close-up pastel")],
    "a sunflower": [v("a field of sunflowers under a blue sky", "vivid harsh-sun wide"), v("a single sunflower close-up with dew", "close-up"), v("sunflowers at sunset, silhouette", "golden-hour warm-palette")],
    "a wildflower meadow": [v("a wildflower meadow with mountains behind", "green-meadow spring wide"), v("a wildflower meadow in soft morning light", "golden-hour pastel"), v("wildflowers close-up, shallow focus", "close-up vivid")],
    "an orchid": [v("a white orchid in soft window light", "pastel minimal close-up"), v("a purple orchid, vivid and glossy", "vivid close-up"), v("orchids in a misty greenhouse", "fog forest")],
    "a red rose": [v("a red rose with dew drops, macro", "close-up vivid"), v("a red rose in dark moody light", "night warm-palette"), v("a garden of red roses in golden light", "golden-hour warm-palette")],
    "a lotus flower": [v("a pink lotus on a still pond at dawn", "water golden-hour pastel reflection"), v("a lotus flower, close-up with soft petals", "close-up pastel"), v("lotus flowers in mist", "fog water")],
    "a peony": [v("a pink peony, soft and full, close-up", "close-up pastel"), v("a bouquet of white peonies in window light", "pastel minimal"), v("a peony garden in bloom", "spring vivid")],
}
GENERIC = [          # fit anything: light and mood
    v("in warm golden light", "golden-hour warm-palette"),
    v("in cool, soft, moody light", "overcast cool-palette"),
    v("in a minimal, pastel, airy composition", "pastel minimal"),
]

def build():
    names = {n for ns in CONCEPTS.values() for n in ns}
    bad = [n for n in CURATED if n not in names]
    assert not bad, f"not concepts of the atlas: {bad}"
    for n, vs in CURATED.items():
        assert len(vs) == VARIANTS - 1, (n, len(vs))
        for x in vs: assert set(x["attrs"]) <= A, (n, x)
    out = {"variants": VARIANTS, "nature": NATURE, "attributes": [{"id": i, "label": l, "group": g, "phrase": ph} for i, l, g, ph in ATTRIBUTES], "curated": CURATED, "generic": GENERIC}
    # the version names the table of prompts the engine caches: only the variants decide it (adding an attribute or a word must not make every model prepare its prompts again)
    out["version"] = int(hashlib.sha1(json.dumps({"variants": VARIANTS, "curated": CURATED, "generic": GENERIC}, sort_keys=True).encode()).hexdigest()[:7], 16)
    json.dump(out, open(os.path.join(HERE, "facets.json"), "w"), indent=1, ensure_ascii=False)
    print(f"facets version {out['version']}: {len(ATTRIBUTES)} attributes, {len(CURATED)} concepts with variants of their own (of {len(names)}), the rest generic")

if __name__ == "__main__":
    build()
