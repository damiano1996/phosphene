// Lint for the web client: it catches what no test reaches (a name that does not exist, an unused import). `npx eslint@9 .` from this folder (version 9: 10 needs a newer Node).
const browser = Object.fromEntries(["window", "document", "performance", "requestAnimationFrame", "cancelAnimationFrame", "fetch", "Path2D", "Image", "URL", "Blob", "FileReader", "localStorage", "location", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "addEventListener", "removeEventListener", "createImageBitmap", "devicePixelRatio", "console", "navigator", "AudioContext", "MediaRecorder", "AudioNode", "AudioDestinationNode", "ImageBitmap",
  "HTMLCanvasElement", "OffscreenCanvas", "Event", "CustomEvent", "EventTarget", "PointerEvent", "WheelEvent", "SVGSVGElement", "Float32Array", "TextEncoder", "crypto", "structuredClone", "AbortController", "innerWidth", "innerHeight", "getComputedStyle", "history", "alert", "confirm", "ResizeObserver", "MutationObserver", "matchMedia", "requestIdleCallback", "Node", "Element", "HTMLElement"].map(n => [n, "readonly"]))
export default [
  { files: ["js/**/*.js", "tools/**/*.js", "eslint.config.js"], languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...browser, process: "readonly" } },
    rules: { "no-undef": "error", "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }], "no-dupe-keys": "error", "no-unreachable": "warn", "no-redeclare": "error", "no-const-assign": "error", "no-self-assign": "warn" } },
  { files: ["test/**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { process: "readonly", console: "readonly", URL: "readonly" } }, rules: { "no-undef": "error", "no-unused-vars": ["warn", { args: "none" }] } },
  { ignores: ["vendor/**"] },
]
