#!/usr/bin/env bash
# A real engine on a throwaway data folder, and a request of each kind, with a real model (needs the GPU and SD-Turbo, SD 1.5 + LCM and CLIP tags installed).
# It prints what came back; a line that says 403, 409 or 503 where it should is a pass. usage: scripts/smoke-engine.sh [port]
set -uo pipefail
cd "$(dirname "$0")/.."
P=${1:-8795}; D=$(mktemp -d); B=http://127.0.0.1:$P; J=$D/jar
trap 'curl -s -b $J -X POST $B/quit >/dev/null 2>&1; rm -rf "$D"' EXIT
scripts/web.sh --no-open --port "$P" --data-dir "$D" > "$D/engine.log" 2>&1 &
for _ in $(seq 1 60); do curl -s $B/health >/dev/null && break; sleep 1; done
K=$(cat "$D/web-token"); Z="-1.259,0.478,-1.488,-0.596,-0.133,0.124,0.276,-0.755,2.302,-0.324,-0.427,1.332"
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
phase() { curl -s $B/health | json "d['phase']"; }
wait_ready() { for _ in $(seq 1 120); do [ "$(phase)" = ready ] && return; sleep 2; done; }
echo "health (open):      $(curl -s $B/health | head -c 80)"
echo "models, no key:     $(curl -s -o /dev/null -w %{http_code} $B/models)   (403 expected)"
echo "foreign host:       $(curl -s -o /dev/null -w %{http_code} -H 'Host: evil.example' $B/health)   (403 expected)"
curl -s -c $J -o /dev/null "$B/?t=$K"
echo "page with the key:  $(curl -s -b $J -o /dev/null -w '%{http_code} %{content_type}' $B/)"
echo "test/ and tools/:   $(curl -s -b $J -o /dev/null -w %{http_code} $B/test/learning.test.js) $(curl -s -b $J -o /dev/null -w %{http_code} $B/tools/simulate.js)   (404 404 expected)"
echo "picture, no model:  $(curl -s -b $J -o /dev/null -w %{http_code} "$B/img?z=$Z&seed=1&v=x")   (503 expected)"
curl -s -b $J -X POST "$B/models/activate?id=sd-turbo" >/dev/null; wait_ready
V=$(curl -s $B/health | json "d['key']"); echo "model:              $(phase) $V"
echo "picture:            $(curl -s -b $J -o /dev/null -w '%{http_code} %{size_download} bytes %{time_total}s' "$B/img?z=$Z&seed=5&v=$V&s=512")"
echo "picture, wrong key: $(curl -s -b $J -o /dev/null -w %{http_code} "$B/img?z=$Z&seed=5&v=zzz")   (409 expected)"
S=$(curl -s -b $J -X POST "$B/saved/add?z=$Z&seed=5&v=$V&s=512"); echo "save a picture:     $S"
echo "the saved picture:  $(curl -s -b $J -o /dev/null -w %{http_code} "$B/saved/$(echo "$S" | json "d['id']").jpg")"
curl -s -b $J -X POST "$B/models/activate?id=sd15-lcm" >/dev/null; sleep 2; wait_ready; echo "switch model:       $(curl -s $B/health | json "d['model'], d['phase']")"
echo "reader on:          $(curl -s -b $J -X POST "$B/captioner/activate?id=clip-tags&device=cpu")"
for _ in $(seq 1 60); do [ "$(curl -s -b $J $B/models | json "d['captioner']['phase']")" = ready ] && break; sleep 2; done
V=$(curl -s $B/health | json "d['key']"); curl -s -b $J -o /dev/null "$B/img?z=$Z&seed=9&v=$V&s=512"
echo "reader says:        $(curl -s -b $J "$B/caption?z=$Z&seed=9&v=$V&s=512" | head -c 70)"
echo "tune, in / out of range:  $(curl -s -b $J -X POST -o /dev/null -w %{http_code} "$B/models/params?id=sd15-lcm&steps=5") $(curl -s -b $J -X POST -o /dev/null -w %{http_code} "$B/models/params?id=sd15-lcm&steps=99")   (200 400 expected)"
curl -s -b $J -X POST "$B/models/params?id=sd15-lcm&reset=1" >/dev/null
echo "delete a model in use:    $(curl -s -b $J -X POST -w ' %{http_code}' "$B/models/delete?id=sd15-lcm")   (400 expected)"
