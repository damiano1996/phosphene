"""Readers of pictures: they look at a finished picture and say what it looks like in words (style, light, colour, composition, mood). Two kinds, picked per model by the catalogue's `mode`:
  tags     a CLIP model: the picture is compared with a prompt for each word of the vocabulary (a softmax inside each group), and with the engine's looks one by one
  caption  a small vision-language model writes a sentence, and the vocabulary's words are looked for in it
The models are loaded from the files the model manager installed (never from the network, never custom code), on the graphics card if there is room, otherwise on the processor.
A new kind is a subclass of `Reader` added to `READERS`."""
import io
import os
from abc import ABC, abstractmethod

import torch
from huggingface_hub import try_to_load_from_cache
from PIL import Image

from .util import read_json

PROMPT = "Write a caption for this picture, like a photo agency would: subject, lighting, colors, mood."


def load_vocab(directory):
    groups = read_json(os.path.join(directory, "vocab.json"))["groups"]
    return [dict(t, group=g["group"]) for g in groups for t in g["tags"]]


class Reader(ABC):
    reads_looks = False            # whether it can also say how much a picture shows each of the engine's looks (see set_words)

    def __init__(self, entry, vocab, device):
        self.entry, self.vocab, self.device = entry, vocab, device
        self.dtype = torch.float16 if device == "cuda" else torch.float32
        self.model = self.proc = None

    def _folder(self):
        return os.path.dirname(try_to_load_from_cache(self.entry["repo"], "config.json"))

    @abstractmethod
    def load(self): ...

    @abstractmethod
    def describe(self, jpg) -> dict:
        """-> {"caption": str|None, "tags": [score per vocabulary entry, 0..1], optionally "look": [...]} for a JPEG's bytes."""

    def set_words(self, phrases):
        """The words a picture is also compared with (only for a reader that `reads_looks`)."""

    def unload(self):
        self.model = self.proc = None


class ClipTags(Reader):
    reads_looks = True

    def load(self):
        from transformers import AutoTokenizer, CLIPImageProcessor, CLIPModel
        folder = self._folder()
        self.model = CLIPModel.from_pretrained(folder, local_files_only=True, torch_dtype=self.dtype).to(self.device).eval()
        self.tok = AutoTokenizer.from_pretrained(folder, local_files_only=True); self.proc = CLIPImageProcessor.from_pretrained(folder, local_files_only=True)
        self.text = self._embed([v["prompt"] for v in self.vocab]); self.look_text = None
        self.groups = {}
        for i, v in enumerate(self.vocab): self.groups.setdefault(v["group"], []).append(i)

    @torch.no_grad()
    def _embed(self, phrases):
        t = self.tok(phrases, padding=True, return_tensors="pt").to(self.device)
        f = self.model.get_text_features(**t); f = f if torch.is_tensor(f) else f.pooler_output
        return torch.nn.functional.normalize(f.float(), dim=-1)

    def set_words(self, phrases):
        """The words a picture is also compared with, one by one, to see how much it shows each (the engine's attributes, and the lexicon of looks that could become one)."""
        self.look_text = self._embed(list(phrases)) if phrases else None

    def unload(self):
        super().unload(); self.look_text = None

    @torch.no_grad()
    def describe(self, jpg):
        img = Image.open(io.BytesIO(jpg)).convert("RGB")
        px = self.proc(images=img, return_tensors="pt")["pixel_values"].to(self.device, self.dtype)
        f = self.model.get_image_features(pixel_values=px); f = f if torch.is_tensor(f) else f.pooler_output
        f = torch.nn.functional.normalize(f.float(), dim=-1)
        logits = 100.0 * f @ self.text.T
        scores = [0.0] * len(self.vocab)
        for idx in self.groups.values():
            p = torch.softmax(logits[0, idx], dim=0).tolist()
            for i, v in zip(idx, p, strict=True): scores[i] = round(v, 3)
        out = {"caption": None, "tags": scores}
        if self.look_text is not None:        # how much of each word the picture shows, against the picture's own average over the words (what the subject is says little: what is different about this one says more)
            cos = (f @ self.look_text.T)[0]
            out["look"] = [round(v, 4) for v in (cos - cos.mean()).tolist()]
        return out


class VisionCaption(Reader):
    def load(self):
        from transformers import AutoModelForImageTextToText, AutoProcessor
        folder = self._folder()
        self.proc = AutoProcessor.from_pretrained(folder, local_files_only=True)
        try: self.proc.image_processor.do_image_splitting = False; self.proc.image_processor.size = {"longest_edge": 384}      # one tile: much faster, enough for style and colour
        except Exception: pass
        self.model = AutoModelForImageTextToText.from_pretrained(folder, local_files_only=True, torch_dtype=self.dtype).to(self.device).eval()

    @torch.no_grad()
    def describe(self, jpg):
        img = Image.open(io.BytesIO(jpg)).convert("RGB")
        msgs = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}]
        prompt = self.proc.apply_chat_template(msgs, add_generation_prompt=True)
        inp = self.proc(text=prompt, images=[img], return_tensors="pt").to(self.device)
        if self.device == "cuda": inp = {k: (v.to(self.dtype) if v.is_floating_point() else v) for k, v in inp.items()}
        out = self.model.generate(**inp, max_new_tokens=40, do_sample=False)
        text = self.proc.batch_decode(out[:, inp["input_ids"].shape[1]:], skip_special_tokens=True)[0].strip()
        low = text.lower()
        return {"caption": text, "tags": [1.0 if any(w in low for w in v["words"]) else 0.0 for v in self.vocab]}


READERS = {"tags": ClipTags, "caption": VisionCaption}


def create_reader(entry, vocab, device) -> Reader:
    if entry["mode"] not in READERS: raise ValueError(f"reader '{entry.get('id')}' has no kind '{entry['mode']}'")
    return READERS[entry["mode"]](entry, vocab, device)
